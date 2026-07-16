import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as functionsV1 from 'firebase-functions/v1';

import { GenerationSession, Project, UserAccount } from './types';
import { computeBuildCost, FREE_SIGNUP_CREDITS, MODEL_FOR_PLAN } from './pricing';
import { createOpenAIClient, generateSitePlan, generateImage, answerBuildQuestion, SitePlanSection } from './openai';
import { layoutSitePlan, estimatedCanvasHeight, SectionImage } from './layout';

initializeApp();
const db = getFirestore();
const openaiApiKey = defineSecret('OPENAI_API_KEY');

const MAX_PROMPT_WORDS = 4000;
const MAX_PAUSES = 2;
const PAUSE_POLL_INTERVAL_MS = 3000;
const PAUSE_TIMEOUT_MS = 5 * 60 * 1000;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Creates the account record (starting credit balance) the moment someone signs up --
// this is the only place `credits` is ever set to a starting value; every later change
// goes through startGeneration's transaction below.
export const onUserCreated = functionsV1.auth.user().onCreate(async (user) => {
  const account: UserAccount = {
    uid: user.uid,
    credits: FREE_SIGNUP_CREDITS,
    plan: 'free',
    planRenewsAt: null,
    createdAt: Date.now(),
  };
  await db.collection('users').doc(user.uid).set(account);
});

// Called once right after sign-in so the credit balance UI has something to show even
// for accounts created before onUserCreated existed, or in the rare race where a client
// reads the account doc before that trigger has finished running.
export const ensureAccount = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    const account: UserAccount = {
      uid,
      credits: FREE_SIGNUP_CREDITS,
      plan: 'free',
      planRenewsAt: null,
      createdAt: Date.now(),
    };
    await userRef.set(account);
    return account;
  }
  return snap.data();
});

async function checkForPause(sessionRef: FirebaseFirestore.DocumentReference, pausesUsed: number): Promise<string | null> {
  const snap = await sessionRef.get();
  const session = snap.data() as GenerationSession | undefined;
  if (!session?.pauseRequested || pausesUsed >= MAX_PAUSES) return null;

  await sessionRef.update({
    status: 'paused',
    statusMessage: 'Paused — add anything else you want before continuing.',
    pausesUsed: pausesUsed + 1,
    pauseRequested: false,
    updatedAt: Date.now(),
  });

  const start = Date.now();
  while (Date.now() - start < PAUSE_TIMEOUT_MS) {
    await sleep(PAUSE_POLL_INTERVAL_MS);
    const check = (await sessionRef.get()).data() as GenerationSession | undefined;
    if (check?.resumeRequested) {
      const message = check.injectedMessage ?? null;
      await sessionRef.update({
        status: 'generating',
        statusMessage: 'Continuing your build...',
        resumeRequested: false,
        updatedAt: Date.now(),
      });
      return message;
    }
  }
  // Timed out waiting -- continue without the injection rather than losing the whole build.
  await sessionRef.update({ status: 'generating', statusMessage: 'Continuing your build...', updatedAt: Date.now() });
  return null;
}

export const startGeneration = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

    const { sessionId, prompt, pageType, complexity } = request.data as {
      sessionId: string;
      prompt: string;
      pageType: Project['pageType'];
      complexity: 'simple' | 'standard' | 'crazy';
    };

    if (!sessionId || !prompt?.trim()) throw new HttpsError('invalid-argument', 'Missing sessionId or prompt.');
    if (wordCount(prompt) > MAX_PROMPT_WORDS) {
      throw new HttpsError('invalid-argument', `Prompt is over the ${MAX_PROMPT_WORDS}-word limit.`);
    }

    const userRef = db.collection('users').doc(uid);
    const sessionRef = userRef.collection('generationSessions').doc(sessionId);
    const projectRef = userRef.collection('projects').doc();

    const cost = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      // Falls back to a fresh free account if the onUserCreated trigger hasn't run for
      // this uid yet (e.g. accounts created before this function existed) -- self-healing
      // rather than leaving existing users permanently unable to build anything.
      const account: UserAccount =
        (userSnap.data() as UserAccount | undefined) ?? {
          uid,
          credits: FREE_SIGNUP_CREDITS,
          plan: 'free',
          planRenewsAt: null,
          createdAt: Date.now(),
        };
      if (!userSnap.exists) tx.set(userRef, account);

      const buildCost = computeBuildCost(account.plan, complexity);
      if (account.credits < buildCost) {
        throw new HttpsError('resource-exhausted', 'needs-subscription');
      }

      tx.update(userRef, { credits: FieldValue.increment(-buildCost) });

      const session: GenerationSession = {
        id: sessionId,
        uid,
        prompt,
        pageType,
        complexity,
        status: 'starting',
        statusMessage: 'Reading your prompt...',
        minutesElapsed: 0,
        creditsUsed: buildCost,
        pausesUsed: 0,
        pauseRequested: false,
        resumeRequested: false,
        injectedMessage: null,
        resultProjectId: null,
        errorMessage: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tx.set(sessionRef, session);

      const project: Project = {
        id: projectRef.id,
        name: 'Generating...',
        pageType,
        themeId: 'blank',
        canvasSize: { width: 390, height: 844, label: 'AI-generated' },
        backgroundColor: '#FFFFFF',
        elements: [],
        announcements: { enabled: false, autoSlide: true, intervalMs: 4000, bars: [] },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tx.set(projectRef, project);

      return buildCost;
    });

    const startedAt = Date.now();
    const client = createOpenAIClient(openaiApiKey.value());
    const model = MODEL_FOR_PLAN[((await userRef.get()).data() as UserAccount).plan];

    try {
      await sessionRef.update({ status: 'generating', statusMessage: 'Writing your site\'s content...', updatedAt: Date.now() });
      let plan = await generateSitePlan(client, model, prompt, complexity);

      let pausesUsed = 0;
      const injected1 = await checkForPause(sessionRef, pausesUsed);
      if (injected1) {
        pausesUsed += 1;
        await sessionRef.update({ statusMessage: 'Reworking your content with your changes...', updatedAt: Date.now() });
        plan = await generateSitePlan(client, model, prompt, complexity, injected1);
      }

      await sessionRef.update({ statusMessage: 'Creating original artwork for your site...', updatedAt: Date.now() });
      const sectionsNeedingImages = plan.sections.filter((s: SitePlanSection) => s.imagePrompt?.trim());
      const sectionImages: SectionImage[] = [];
      const bucket = getStorage().bucket();

      for (const section of sectionsNeedingImages) {
        const buffer = await generateImage(client, section.imagePrompt);
        const path = `users/${uid}/generated/${sessionId}/${section.kind}-${Date.now()}.png`;
        const file = bucket.file(path);
        await file.save(buffer, { contentType: 'image/png' });
        const [url] = await file.getSignedUrl({ action: 'read', expires: '01-01-2100' });
        sectionImages.push({ section, url });
      }

      const injected2 = await checkForPause(sessionRef, pausesUsed);
      if (injected2) {
        await sessionRef.update({ statusMessage: 'Applying your last change...', updatedAt: Date.now() });
        // Second pause only adjusts copy at this point (images are already generated) --
        // keeps the second pause fast rather than re-running image generation too.
        plan = await generateSitePlan(client, model, prompt, complexity, injected2);
      }

      await sessionRef.update({ statusMessage: 'Assembling your site...', updatedAt: Date.now() });
      const elements = layoutSitePlan(plan, sectionImages);
      const canvasHeight = estimatedCanvasHeight(elements);

      await projectRef.update({
        name: plan.siteName,
        backgroundColor: plan.backgroundColor,
        elements,
        canvasSize: { width: 390, height: canvasHeight, label: 'AI-generated' },
        updatedAt: Date.now(),
      });

      const minutesElapsed = Math.round(((Date.now() - startedAt) / 60000) * 10) / 10;
      await sessionRef.update({
        status: 'completed',
        statusMessage: 'Your site is ready!',
        resultProjectId: projectRef.id,
        minutesElapsed,
        updatedAt: Date.now(),
      });

      return { sessionId, projectId: projectRef.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong while building your site.';
      await sessionRef.update({ status: 'error', errorMessage: message, updatedAt: Date.now() });
      // Refund credits on failure -- the user didn't get a working site out of this attempt.
      await userRef.update({ credits: FieldValue.increment(cost) });
      throw new HttpsError('internal', message);
    }
  }
);

export const requestPause = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { sessionId } = request.data as { sessionId: string };
  const sessionRef = db.collection('users').doc(uid).collection('generationSessions').doc(sessionId);
  const session = (await sessionRef.get()).data() as GenerationSession | undefined;
  if (!session) throw new HttpsError('not-found', 'Session not found.');
  if (session.pausesUsed >= MAX_PAUSES) throw new HttpsError('failed-precondition', 'Pause limit reached for this build.');
  await sessionRef.update({ pauseRequested: true });
  return { ok: true };
});

export const resumeGeneration = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { sessionId, message } = request.data as { sessionId: string; message: string };
  const sessionRef = db.collection('users').doc(uid).collection('generationSessions').doc(sessionId);
  await sessionRef.update({ resumeRequested: true, injectedMessage: message?.trim() || null });
  return { ok: true };
});

export const askBuildQuestion = onCall({ secrets: [openaiApiKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { sessionId, question } = request.data as { sessionId: string; question: string };
  const sessionRef = db.collection('users').doc(uid).collection('generationSessions').doc(sessionId);
  const session = (await sessionRef.get()).data() as GenerationSession | undefined;
  if (!session) throw new HttpsError('not-found', 'Session not found.');

  const account = (await db.collection('users').doc(uid).get()).data() as UserAccount;
  const client = createOpenAIClient(openaiApiKey.value());
  const model = MODEL_FOR_PLAN[account.plan];
  // Re-derive a minimal plan-shaped object from the prompt for context; full plan isn't
  // persisted after layout, so this answers from the original prompt + session state.
  const answer = await answerBuildQuestion(
    client,
    model,
    { siteName: '', tagline: '', backgroundColor: '', accentColor: '', textColor: '', sections: [] },
    `${question}\n\n(Original build prompt: ${session.prompt})`
  );
  return { answer };
});
