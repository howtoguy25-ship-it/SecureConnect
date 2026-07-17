import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as functionsV1 from 'firebase-functions/v1';

import Stripe from 'stripe';
import { GenerationSession, Project, PublishedSite, DomainPurchase, UserAccount } from './types';
import { computeBuildCost, FREE_SIGNUP_CREDITS, MODEL_FOR_PLAN } from './pricing';
import { createOpenAIClient, generateSitePlan, generateImage, answerBuildQuestion, SitePlanSection } from './openai';
import { layoutSitePlan, estimatedCanvasHeight, SectionImage } from './layout';
import { chatWithAssistant, AssistantChatMessage } from './assistant';
import { renderProjectHtml } from './siteHtml';
import { slugify, uniqueSlug } from './publish';
import { createHostingDomain, getHostingDomain, deleteHostingDomain } from './hostingApi';
import { checkAvailability, getRegistrationPriceUsd, registerDomain, RegistrantContact } from './namecheapApi';
import { createStripeClient, createCheckoutSession } from './stripeApi';

initializeApp();
const db = getFirestore();
const openaiApiKey = defineSecret('OPENAI_API_KEY');
const namecheapApiUser = defineSecret('NAMECHEAP_API_USER');
const namecheapApiKey = defineSecret('NAMECHEAP_API_KEY');
const namecheapUserName = defineSecret('NAMECHEAP_USERNAME');
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

// Namecheap only accepts API calls from a whitelisted IP -- these functions must route
// egress through the static-IP Cloud NAT set up for this project (see ROADMAP.md Phase 7
// for the exact gcloud commands that created `sitespark-connector`).
const NAMECHEAP_VPC_OPTS = { vpcConnector: 'sitespark-connector', vpcConnectorEgressSettings: 'ALL_TRAFFIC' } as const;
const POPULAR_TLDS = ['com', 'net', 'org', 'io', 'co', 'app', 'dev'];
// Flat markup over Namecheap's own registration cost -- adjust as a business decision,
// not a technical one.
const DOMAIN_MARKUP_USD = 5;

const MAX_PROMPT_WORDS = 4000;
const MAX_PAUSES = 2;
const PAUSE_POLL_INTERVAL_MS = 3000;
const PAUSE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_ASSISTANT_MESSAGE_WORDS = 500;
const MAX_ASSISTANT_HISTORY = 20;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const HOSTING_DOMAIN = `${process.env.GCLOUD_PROJECT}.web.app`;

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

// Persistent, app-wide AI chat assistant -- can hold a normal conversation and also drive
// navigation/build actions for the user (see assistant.ts). Chat history itself lives in
// Firestore under the client's control (users/{uid}/assistantMessages); this function is
// stateless per call and only needs the recent turns the client sends up as `history`.
export const assistantChat = onCall({ secrets: [openaiApiKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { message, history, screen } = request.data as {
    message: string;
    history?: AssistantChatMessage[];
    screen?: string;
  };

  if (!message?.trim()) throw new HttpsError('invalid-argument', 'Missing message.');
  if (wordCount(message) > MAX_ASSISTANT_MESSAGE_WORDS) {
    throw new HttpsError('invalid-argument', `Keep messages under ${MAX_ASSISTANT_MESSAGE_WORDS} words.`);
  }

  const userRef = db.collection('users').doc(uid);
  const [userSnap, projectsCount] = await Promise.all([
    userRef.get(),
    userRef.collection('projects').count().get(),
  ]);
  const account = userSnap.data() as UserAccount | undefined;

  const client = createOpenAIClient(openaiApiKey.value());
  const model = MODEL_FOR_PLAN[account?.plan ?? 'free'];
  const trimmedHistory = (history ?? []).slice(-MAX_ASSISTANT_HISTORY);

  return chatWithAssistant(client, model, trimmedHistory, message.trim(), {
    screen: screen || 'Projects',
    credits: account?.credits ?? 0,
    plan: account?.plan ?? 'free',
    projectCount: projectsCount.data().count,
  });
});

// Moves a locally-picked photo (only readable by the device, via a file:// URI) into
// Storage so it has a real https:// URL a published static page can actually load. The
// client reads the file itself (Admin SDK can't reach a device's local filesystem) and
// sends the bytes up as base64 -- mirrors the same signed-URL pattern already used for
// AI-generated images in startGeneration above.
export const uploadProjectImage = onCall({ memory: '256MiB' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { base64, contentType } = request.data as { base64: string; contentType: string };
  if (!base64) throw new HttpsError('invalid-argument', 'Missing image data.');

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new HttpsError('invalid-argument', 'Image is too large (max 8MB).');
  }

  const ext = (contentType || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `users/${uid}/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bucket = getStorage().bucket();
  const file = bucket.file(path);
  await file.save(buffer, { contentType: contentType || 'image/jpeg' });
  const [url] = await file.getSignedUrl({ action: 'read', expires: '01-01-2100' });

  return { url };
});

// Publishes a project as a real, publicly-reachable static page -- servePublishedSite
// below answers for it at https://{HOSTING_DOMAIN}/s/{slug} (and at any custom domain
// connected via connectDomain).
export const publishProject = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { projectId } = request.data as { projectId: string };
  if (!projectId) throw new HttpsError('invalid-argument', 'Missing projectId.');

  const projectRef = db.collection('users').doc(uid).collection('projects').doc(projectId);
  const snap = await projectRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Project not found.');
  const project = snap.data() as Project;

  const hasLocalImage = project.elements.some(
    (el) =>
      (el.type === 'image' && !!el.uri && !el.uri.startsWith('http')) ||
      (el.type === 'slideshow' && el.images.some((u) => !u.startsWith('http')))
  );
  if (hasLocalImage) {
    throw new HttpsError('failed-precondition', 'Some images are still uploading — try publishing again in a moment.');
  }

  const slug = project.publishSlug ?? (await uniqueSlug(db, slugify(project.name)));
  const html = renderProjectHtml(project);

  const site: PublishedSite = { uid, projectId, html, updatedAt: Date.now() };
  await db.collection('publishedSites').doc(slug).set(site);
  await projectRef.update({ publishSlug: slug, publishedAt: Date.now(), updatedAt: Date.now() });

  const url = project.customDomain && project.domainStatus === 'active'
    ? `https://${project.customDomain}`
    : `https://${HOSTING_DOMAIN}/s/${slug}`;
  return { slug, url };
});

export const unpublishProject = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { projectId } = request.data as { projectId: string };
  const projectRef = db.collection('users').doc(uid).collection('projects').doc(projectId);
  const snap = await projectRef.get();
  const project = snap.data() as Project | undefined;
  if (!project?.publishSlug) return { ok: true };

  await db.collection('publishedSites').doc(project.publishSlug).delete();
  await projectRef.update({ publishSlug: null, publishedAt: null, updatedAt: Date.now() });
  return { ok: true };
});

// Public, unauthenticated -- serves whatever was last published, either at
// /s/{slug} on the default Hosting domain, or at a connected custom domain (looked up by
// request hostname via domainMappings). See firebase.json's hosting.rewrites for how
// requests reach this function.
export const servePublishedSite = onRequest(async (req, res) => {
  const hostname = req.hostname;
  let slug: string | null = null;

  if (hostname && hostname !== HOSTING_DOMAIN && !hostname.endsWith('.web.app') && !hostname.endsWith('.firebaseapp.com')) {
    const mapping = await db.collection('domainMappings').doc(hostname).get();
    slug = (mapping.data()?.slug as string | undefined) ?? null;
  } else {
    slug = req.path.replace(/^\/s\//, '').replace(/\/$/, '') || null;
  }

  if (!slug) {
    res.status(404).send('Site not found.');
    return;
  }

  const doc = await db.collection('publishedSites').doc(slug).get();
  if (!doc.exists) {
    res.status(404).send('Site not found.');
    return;
  }

  const site = doc.data() as PublishedSite;
  res.set('Cache-Control', 'public, max-age=60');
  res.status(200).send(site.html);
});

// Attaches a domain the user already owns to their published project via the real
// Firebase Hosting Domains API (see hostingApi.ts) -- requires the project to already be
// published, and requires the Cloud Functions service account to have the "Firebase
// Hosting Admin" IAM role (see ROADMAP.md).
export const connectDomain = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { projectId, domain } = request.data as { projectId: string; domain: string };
  if (!domain?.trim()) throw new HttpsError('invalid-argument', 'Missing domain.');

  const projectRef = db.collection('users').doc(uid).collection('projects').doc(projectId);
  const snap = await projectRef.get();
  const project = snap.data() as Project | undefined;
  if (!project) throw new HttpsError('not-found', 'Project not found.');
  if (!project.publishSlug) {
    throw new HttpsError('failed-precondition', 'Publish your site before connecting a domain.');
  }

  const cleanDomain = domain.trim().toLowerCase();
  const result = await createHostingDomain(cleanDomain);

  await db.collection('domainMappings').doc(cleanDomain).set({ uid, projectId, slug: project.publishSlug });
  await projectRef.update({ customDomain: cleanDomain, domainStatus: 'pending', updatedAt: Date.now() });

  return result;
});

export const getDomainStatus = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { projectId } = request.data as { projectId: string };
  const projectRef = db.collection('users').doc(uid).collection('projects').doc(projectId);
  const project = (await projectRef.get()).data() as Project | undefined;
  if (!project?.customDomain) throw new HttpsError('failed-precondition', 'No domain connected for this project.');

  const result = await getHostingDomain(project.customDomain);
  if (!result) throw new HttpsError('not-found', 'Domain not found on Hosting.');

  const domainStatus: Project['domainStatus'] = result.status === 'DOMAIN_ACTIVE' ? 'active'
    : result.status?.includes('FAILED') ? 'failed'
    : 'pending';
  await projectRef.update({ domainStatus, updatedAt: Date.now() });

  return { ...result, domainStatus };
});

export const disconnectDomain = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { projectId } = request.data as { projectId: string };
  const projectRef = db.collection('users').doc(uid).collection('projects').doc(projectId);
  const project = (await projectRef.get()).data() as Project | undefined;
  if (!project?.customDomain) return { ok: true };

  await deleteHostingDomain(project.customDomain);
  await db.collection('domainMappings').doc(project.customDomain).delete();
  await projectRef.update({ customDomain: null, domainStatus: null, updatedAt: Date.now() });
  return { ok: true };
});

// Real domain search: checks availability across popular TLDs (or the exact domain if the
// query already includes one) and prices each available result via Namecheap's real
// pricing API, marked up by DOMAIN_MARKUP_USD.
export const checkDomainAvailability = onCall(
  { secrets: [namecheapApiUser, namecheapApiKey, namecheapUserName], ...NAMECHEAP_VPC_OPTS },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { query } = request.data as { query: string };
    if (!query?.trim()) throw new HttpsError('invalid-argument', 'Missing search query.');

    const creds = { apiUser: namecheapApiUser.value(), apiKey: namecheapApiKey.value(), userName: namecheapUserName.value() };
    const base = query.trim().toLowerCase().replace(/[^a-z0-9.-]/g, '');
    const candidates = base.includes('.') ? [base] : POPULAR_TLDS.map((tld) => `${base}.${tld}`);

    const availability = await checkAvailability(creds, candidates);
    const priced = await Promise.all(
      availability
        .filter((a) => a.available)
        .map(async (a) => {
          const basePrice = a.isPremium ? a.premiumPriceUsd : await getRegistrationPriceUsd(creds, a.domain);
          return basePrice != null ? { domain: a.domain, priceUsd: Math.round((basePrice + DOMAIN_MARKUP_USD) * 100) / 100 } : null;
        })
    );

    return { results: priced.filter((r): r is { domain: string; priceUsd: number } => r != null) };
  }
);

// Creates a real Stripe Checkout session for a domain purchase -- payment happens on
// Stripe's own hosted page (opened in an in-app browser client-side), not native IAP,
// since a registered domain is a real-world service/good, not digital app content.
export const createDomainCheckout = onCall(
  { secrets: [namecheapApiUser, namecheapApiKey, namecheapUserName, stripeSecretKey], ...NAMECHEAP_VPC_OPTS },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { domain, years, registrant, projectId } = request.data as {
      domain: string;
      years: number;
      registrant: RegistrantContact;
      projectId?: string;
    };
    if (!domain || !years || !registrant) {
      throw new HttpsError('invalid-argument', 'Missing domain, years, or registrant contact.');
    }

    const creds = { apiUser: namecheapApiUser.value(), apiKey: namecheapApiKey.value(), userName: namecheapUserName.value() };
    const availability = await checkAvailability(creds, [domain]);
    const match = availability[0];
    if (!match?.available) throw new HttpsError('failed-precondition', 'That domain is no longer available.');

    const basePrice = match.isPremium ? match.premiumPriceUsd : await getRegistrationPriceUsd(creds, domain);
    if (basePrice == null) throw new HttpsError('failed-precondition', 'Could not price this domain.');
    const priceUsd = Math.round((basePrice + DOMAIN_MARKUP_USD) * 100) / 100;

    const purchaseRef = db.collection('users').doc(uid).collection('domainPurchases').doc();
    const purchase: DomainPurchase = {
      id: purchaseRef.id,
      uid,
      projectId: projectId ?? null,
      domain,
      years,
      priceUsd,
      namecheapChargedUsd: null,
      stripeSessionId: null,
      status: 'pending',
      registrant,
      errorMessage: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await purchaseRef.set(purchase);

    const stripe = createStripeClient(stripeSecretKey.value());
    const session = await createCheckoutSession(stripe, {
      domain,
      priceUsd,
      successUrl: 'sitespark://domain-purchase-complete',
      cancelUrl: 'sitespark://domain-purchase-cancelled',
      metadata: { uid, purchaseId: purchaseRef.id },
    });

    await purchaseRef.update({ stripeSessionId: session.id, updatedAt: Date.now() });
    return { purchaseId: purchaseRef.id, checkoutUrl: session.url };
  }
);

// Public Stripe webhook -- verifies the signature, then (idempotently, since Stripe
// retries webhook deliveries) registers the domain for real via Namecheap once payment
// is confirmed. Registration only ever happens from here, never from the client, so a
// domain can't be registered without payment actually clearing first.
export const stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret, namecheapApiUser, namecheapApiKey, namecheapUserName], ...NAMECHEAP_VPC_OPTS },
  async (req, res) => {
    const stripe = createStripeClient(stripeSecretKey.value());
    const signature = req.headers['stripe-signature'];

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, signature as string, stripeWebhookSecret.value());
    } catch (err) {
      res.status(400).send('Webhook signature verification failed.');
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.metadata?.uid;
      const purchaseId = session.metadata?.purchaseId;

      if (uid && purchaseId) {
        const purchaseRef = db.collection('users').doc(uid).collection('domainPurchases').doc(purchaseId);
        const purchase = (await purchaseRef.get()).data() as DomainPurchase | undefined;

        if (purchase && purchase.status === 'pending') {
          await purchaseRef.update({ status: 'registering', updatedAt: Date.now() });
          try {
            const creds = { apiUser: namecheapApiUser.value(), apiKey: namecheapApiKey.value(), userName: namecheapUserName.value() };
            const result = await registerDomain(creds, purchase.domain, purchase.years, purchase.registrant);
            await purchaseRef.update({
              status: result.registered ? 'registered' : 'failed',
              namecheapChargedUsd: result.chargedAmountUsd,
              errorMessage: result.registered ? null : 'Namecheap did not confirm the registration.',
              updatedAt: Date.now(),
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Domain registration failed.';
            await purchaseRef.update({ status: 'failed', errorMessage: message, updatedAt: Date.now() });
          }
        }
      }
    }

    res.status(200).send('ok');
  }
);
