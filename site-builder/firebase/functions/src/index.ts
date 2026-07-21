import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as functionsV1 from 'firebase-functions/v1';

import Stripe from 'stripe';
import {
  GenerationSession,
  Project,
  PublishedSite,
  DomainPurchase,
  DomainTransfer,
  UserAccount,
  ProductElement,
  StoreInventoryItem,
  StoreOrder,
  StoreOrderItem,
  SellerAccount,
  OrderNotice,
  BookingDetails,
  PlanId,
} from './types';
import { computeBuildCost, FREE_SIGNUP_CREDITS, MODEL_FOR_PLAN, WEB_PLAN_PRICES, WEB_CREDIT_PACKS } from './pricing';
import { createOpenAIClient, generateSitePlan, generateImage, answerBuildQuestion, generateClarifyingQuestions, SitePlan, SitePlanSection } from './openai';
import { layoutSitePlan, estimatedCanvasHeight, SectionImage } from './layout';
import { chatWithAssistant, AssistantChatMessage } from './assistant';
import {
  renderProjectHtml,
  renderLandingPageHtml,
  renderSuspendedSiteHtml,
  renderPrivacyPolicyHtml,
  renderReturnPolicyHtml,
  renderSupportHtml,
} from './siteHtml';
import { slugify, uniqueSlug } from './publish';
import { createHostingDomain, getHostingDomain, deleteHostingDomain } from './hostingApi';
import {
  checkAvailability,
  getRegistrationPriceUsd,
  registerDomain,
  createTransfer,
  getTransferStatus,
  RegistrantContact,
} from './namecheapApi';
import { createStripeClient, createCheckoutSession, createSubscriptionCheckoutSession, createOneTimeCheckoutSession } from './stripeApi';
import { ensureExpressAccount, createOnboardingLink, getAccountFlags, createDashboardLoginLink } from './stripeConnect';
import { sendOrderNotificationEmail, sendContentReportEmail } from './emailApi';
import { sendPushNotification } from './pushApi';
import { getTransactionInfo } from './appStoreApi';
import { SUBSCRIPTION_PRODUCT_IDS, CREDIT_PACK_PRODUCT_IDS, THEME_IDS_BY_PRODUCT, MONTHLY_CREDITS_FOR_PLAN, APPLE_BUNDLE_ID } from './iapProducts';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { verifyAndClassifyNotification } from './appStoreNotifications';

initializeApp();
const db = getFirestore();
const openaiApiKey = defineSecret('OPENAI_API_KEY');
const namecheapApiUser = defineSecret('NAMECHEAP_API_USER');
const namecheapApiKey = defineSecret('NAMECHEAP_API_KEY');
const namecheapUserName = defineSecret('NAMECHEAP_USERNAME');
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const appleIapKeyId = defineSecret('APPLE_IAP_KEY_ID');
const appleIapIssuerId = defineSecret('APPLE_IAP_ISSUER_ID');
const appleIapPrivateKey = defineSecret('APPLE_IAP_PRIVATE_KEY');
const resendApiKey = defineSecret('RESEND_API_KEY');

// How long a site stays up after the first payment-failure notification before it's
// automatically suspended -- the user asked for "3-5 hours"; 4 hours is the midpoint.
const BILLING_GRACE_PERIOD_MS = 4 * 60 * 60 * 1000;

// SiteSpark's commission on every store sale (Phase 10) -- a business knob, change it here.
// Taken via Stripe's own application_fee_amount at the moment of charge, not a separate
// invoice/transfer SiteSpark has to chase down.
const PLATFORM_FEE_PERCENT = 8;

// Namecheap only accepts API calls from a whitelisted IP -- these functions must route
// egress through the static-IP Cloud NAT set up for this project (see ROADMAP.md Phase 7
// for the exact gcloud commands that created `sitespark-connector`).
const NAMECHEAP_VPC_OPTS = { vpcConnector: 'sitespark-connector', vpcConnectorEgressSettings: 'ALL_TRAFFIC' } as const;

// Where the real web app is hosted (see siteHtml.ts's WEBAPP_URL) -- used as the Stripe
// Checkout success/cancel redirect target for web-only billing (subscriptions and credit
// packs bought from a browser instead of Apple IAP, since a browser tab can't use StoreKit).
const WEBAPP_URL = 'https://app.buildsitespark.com';
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
// The product's own real domain -- every published project gets a free subdomain of
// this by default (https://{slug}.buildsitespark.com), via a wildcard custom domain
// attached to this Hosting site (see ROADMAP.md Phase 7 setup).
const PRODUCT_DOMAIN = 'buildsitespark.com';
// The real, callable URL for createStoreCheckout (defined further down) -- built from the
// live project id rather than hardcoded, since 2nd-gen HTTPS function URLs always follow
// this exact shape. Baked into a published page's cart checkout button (see siteHtml.ts).
const STORE_CHECKOUT_URL = `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/createStoreCheckout`;
// Same pattern, for reportPublishedSite (defined further down) -- baked into every
// published page's "Report this site" link (see siteHtml.ts).
const REPORT_SITE_URL = `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/reportPublishedSite`;

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

// Real, server-enforced rewarded-ad credit grant -- the client only ever *reports* that a
// real AdMob rewarded ad finished playing; the 48h cooldown and the actual credit increment
// happen here, inside a transaction, so retrying the client call (or a modified/rooted
// client) can't claim it twice or skip the cooldown.
const AD_REWARD_CREDITS = 15;
const AD_REWARD_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;

export const claimAdReward = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const userRef = db.collection('users').doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const account = snap.data() as UserAccount | undefined;
    const lastClaim = account?.lastAdRewardClaimedAt ?? null;
    const now = Date.now();
    if (lastClaim && now - lastClaim < AD_REWARD_COOLDOWN_MS) {
      throw new HttpsError('failed-precondition', 'You can watch another ad for credits once the cooldown ends.');
    }
    tx.update(userRef, {
      credits: FieldValue.increment(AD_REWARD_CREDITS),
      lastAdRewardClaimedAt: now,
    });
    return { creditsAwarded: AD_REWARD_CREDITS, claimedAt: now };
  });
});

// Real account deletion -- required by App Store guideline 5.1.1(v) for any app that lets
// people create an account. Actually removes everything, not just a "deactivated" flag:
// unpublishes every live site first (so no stale published page or connected domain
// survives the account), recursively deletes every Firestore doc under this user, deletes
// their uploaded files from Storage, and finally deletes the real Firebase Auth user record
// -- after this call the uid can never sign back in to find an empty shell of an account.
export const deleteAccount = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const sitesSnap = await db.collection('publishedSites').where('uid', '==', uid).get();
  for (const siteDoc of sitesSnap.docs) {
    const site = siteDoc.data() as { customDomain?: string | null };
    if (site.customDomain) {
      await deleteHostingDomain(site.customDomain).catch((err) => console.error('deleteHostingDomain failed', err));
      await db.collection('domainMappings').doc(site.customDomain).delete().catch(() => {});
    }
    await siteDoc.ref.delete();
  }

  await getStorage().bucket().deleteFiles({ prefix: `users/${uid}/` }).catch((err) => console.error('Storage cleanup failed', err));

  // Deletes users/{uid} and every subcollection beneath it (projects, meta,
  // generationSessions, assistantMessages, pushTokens, domainPurchases, domainTransfers,
  // orders) in one call.
  await db.recursiveDelete(db.collection('users').doc(uid));

  await getAuth().deleteUser(uid);

  return { ok: true };
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

// Free (no credit charge) -- a quick pass before the real build to turn a short prompt into
// a couple of concrete questions instead of the AI silently guessing at missing details.
// Purely advisory: the client folds any answers into the prompt text it sends to
// startGeneration, this doesn't touch generationSessions or credits at all.
export const suggestClarifyingQuestions = onCall({ secrets: [openaiApiKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { prompt, pageType } = request.data as { prompt: string; pageType: string };
  if (!prompt?.trim()) throw new HttpsError('invalid-argument', 'Missing prompt.');

  const client = createOpenAIClient(openaiApiKey.value());
  const questions = await generateClarifyingQuestions(client, prompt.trim(), pageType || 'website');
  return { questions };
});

export const startGeneration = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

    const { sessionId, prompt, pageType, complexity, referenceImages } = request.data as {
      sessionId: string;
      prompt: string;
      pageType: Project['pageType'];
      complexity: 'simple' | 'standard' | 'crazy';
      referenceImages?: string[];
    };

    if (!sessionId || !prompt?.trim()) throw new HttpsError('invalid-argument', 'Missing sessionId or prompt.');
    if (wordCount(prompt) > MAX_PROMPT_WORDS) {
      throw new HttpsError('invalid-argument', `Prompt is over the ${MAX_PROMPT_WORDS}-word limit.`);
    }
    if (referenceImages && (referenceImages.length > 3 || referenceImages.some((img) => !img.startsWith('data:image/')))) {
      throw new HttpsError('invalid-argument', 'Reference images must be at most 3 valid images.');
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
        // Known immediately (unlike resultProjectId, which only means "the build finished")
        // so the client can subscribe to the project doc from the very start and show a real
        // live preview of the elements as they're written, not just once the build finishes.
        previewProjectId: projectRef.id,
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
        announcements: { enabled: false, autoSlide: true, intervalMs: 4000, bars: [], popups: [] },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tx.set(projectRef, project);

      return buildCost;
    });

    const startedAt = Date.now();
    const client = createOpenAIClient(openaiApiKey.value());
    const model = MODEL_FOR_PLAN[((await userRef.get()).data() as UserAccount).plan];

    // Writes the site plan assembled so far to the project doc the client is already
    // subscribed to (via previewProjectId) -- called after the plan lands and again after
    // every generated image, so the AI build progress screen's live preview panel shows
    // real text and images appearing incrementally instead of a blank canvas until the end.
    const pushPreview = async (currentPlan: SitePlan, images: SectionImage[]) => {
      const previewElements = layoutSitePlan(currentPlan, images);
      await projectRef.update({
        name: currentPlan.siteName,
        backgroundColor: currentPlan.backgroundColor,
        elements: previewElements,
        canvasSize: { width: 390, height: estimatedCanvasHeight(previewElements), label: 'AI-generated' },
        updatedAt: Date.now(),
      });
    };

    try {
      await sessionRef.update({ status: 'generating', statusMessage: 'Writing your site\'s content...', updatedAt: Date.now() });
      let plan = await generateSitePlan(client, model, prompt, complexity, undefined, referenceImages);
      await pushPreview(plan, []);

      let pausesUsed = 0;
      const injected1 = await checkForPause(sessionRef, pausesUsed);
      if (injected1) {
        pausesUsed += 1;
        await sessionRef.update({ statusMessage: 'Reworking your content with your changes...', updatedAt: Date.now() });
        plan = await generateSitePlan(client, model, prompt, complexity, injected1, referenceImages);
        await pushPreview(plan, []);
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
        await pushPreview(plan, sectionImages);
      }

      const injected2 = await checkForPause(sessionRef, pausesUsed);
      if (injected2) {
        await sessionRef.update({ statusMessage: 'Applying your last change...', updatedAt: Date.now() });
        // Second pause only adjusts copy at this point (images are already generated) --
        // keeps the second pause fast rather than re-running image generation too.
        plan = await generateSitePlan(client, model, prompt, complexity, injected2);
        await pushPreview(plan, sectionImages);
      }

      await sessionRef.update({ statusMessage: 'Assembling your site...', updatedAt: Date.now() });
      await pushPreview(plan, sectionImages);

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

// A real way out of a build that's stuck or just no longer wanted -- startGeneration runs
// the whole pipeline in one long-lived invocation, so if it dies mid-flight (hits its own
// timeoutSeconds, a container recycle, etc.) that's a hard platform-level kill: the
// function's own try/catch never runs, and nothing else was ever going to touch this
// session doc again, so it would otherwise sit at whatever phase it last reached forever.
// This gives the user an immediate exit (and their credits back) instead of waiting on
// enforceGenerationTimeouts' periodic sweep below.
export const cancelGeneration = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { sessionId } = request.data as { sessionId: string };
  if (!sessionId) throw new HttpsError('invalid-argument', 'Missing sessionId.');

  const sessionRef = db.collection('users').doc(uid).collection('generationSessions').doc(sessionId);
  const session = (await sessionRef.get()).data() as GenerationSession | undefined;
  if (!session) throw new HttpsError('not-found', 'Session not found.');
  if (session.status === 'completed' || session.status === 'error' || session.status === 'cancelled') {
    return { ok: true, alreadyDone: true };
  }

  await sessionRef.update({
    status: 'cancelled',
    statusMessage: 'Cancelled.',
    errorMessage: 'Cancelled — your credits have been refunded.',
    updatedAt: Date.now(),
  });
  await db.collection('users').doc(uid).update({ credits: FieldValue.increment(session.creditsUsed) });
  return { ok: true };
});

// Backstop for the case above: if the user isn't there to hit Cancel (they closed the app,
// lost connection, etc.), this catches any session that's been sitting at the same phase for
// too long and fails it the same way -- checked against updatedAt, not createdAt, so a build
// that's still genuinely making progress (each phase transition bumps updatedAt) is never
// mistaken for a stuck one, no matter how long the whole build legitimately takes.
const STUCK_SESSION_MS = 15 * 60 * 1000;
export const enforceGenerationTimeouts = onSchedule('every 5 minutes', async () => {
  const cutoff = Date.now() - STUCK_SESSION_MS;
  const statuses: GenerationSession['status'][] = ['starting', 'generating', 'paused'];

  for (const status of statuses) {
    const snap = await db.collectionGroup('generationSessions').where('status', '==', status).get();
    for (const doc of snap.docs) {
      const session = doc.data() as GenerationSession;
      if (session.updatedAt > cutoff) continue;

      await doc.ref.update({
        status: 'error',
        errorMessage: 'This build took too long and timed out. Your credits have been refunded.',
        updatedAt: Date.now(),
      });
      await db.collection('users').doc(session.uid).update({ credits: FieldValue.increment(session.creditsUsed) });
    }
  }
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

// Video/audio clips are typically far too large for the base64-over-onCall approach
// uploadProjectImage uses above (onCall request bodies are capped well below what even a
// short clip needs) -- instead this hands the client a short-lived signed PUT URL and lets
// it upload the bytes straight to Storage, then returns a long-lived signed GET URL for
// later reference (rendering in the canvas, publishing, etc.).
export const createUploadUrl = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { contentType, extension } = request.data as { contentType: string; extension: string };
  if (!contentType || !extension) throw new HttpsError('invalid-argument', 'Missing contentType or extension.');

  const path = `users/${uid}/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const bucket = getStorage().bucket();
  const file = bucket.file(path);

  const [uploadUrl] = await file.getSignedUrl({
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });
  const [readUrl] = await file.getSignedUrl({ action: 'read', expires: '01-01-2100' });

  return { uploadUrl, readUrl };
});

// Publishes a project as a real, publicly-reachable static page -- servePublishedSite
// below answers for it at https://{slug}.buildsitespark.com by default (and at any
// custom domain connected via connectDomain).
export const publishProject = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { projectId } = request.data as { projectId: string };
  if (!projectId) throw new HttpsError('invalid-argument', 'Missing projectId.');

  const projectRef = db.collection('users').doc(uid).collection('projects').doc(projectId);
  const snap = await projectRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Project not found.');
  const project = snap.data() as Project;

  const hasLocalMedia = project.elements.some(
    (el) =>
      (el.type === 'image' && !!el.uri && !el.uri.startsWith('http')) ||
      (el.type === 'slideshow' && el.images.some((u) => !u.startsWith('http'))) ||
      (el.type === 'video' && ((!!el.uri && !el.uri.startsWith('http')) || (!!el.audioUri && !el.audioUri.startsWith('http')))) ||
      (el.type === 'product' && el.images.some((u) => !u.startsWith('http')))
  );
  if (hasLocalMedia) {
    throw new HttpsError('failed-precondition', 'Some media is still uploading — try publishing again in a moment.');
  }

  const slug = project.publishSlug ?? (await uniqueSlug(db, slugify(project.name)));
  const html = renderProjectHtml(project, slug, STORE_CHECKOUT_URL, REPORT_SITE_URL);

  const site: PublishedSite = { uid, projectId, html, updatedAt: Date.now() };
  await db.collection('publishedSites').doc(slug).set(site);
  await projectRef.update({ publishSlug: slug, publishedAt: Date.now(), updatedAt: Date.now() });
  await syncStoreInventory(uid, projectId, slug, project);

  const url = project.customDomain && project.domainStatus === 'active'
    ? `https://${project.customDomain}`
    : `https://${slug}.${PRODUCT_DOMAIN}`;
  return { slug, url };
});

// Mirrors a project's ProductElements into storeInventory/{slug}/products/{productId} --
// the authoritative source createStoreCheckout validates against. Never overwrites
// stockQuantity on an existing doc (only real orders or the seller directly editing it
// change that after the first publish) so republishing a project never silently restocks
// or resets what a seller already sold.
async function syncStoreInventory(uid: string, projectId: string, slug: string, project: Project): Promise<void> {
  const productElements = project.elements.filter((el): el is ProductElement => el.type === 'product');
  if (productElements.length === 0) return;

  const refs = productElements.map((el) => db.collection('storeInventory').doc(slug).collection('products').doc(el.productId));
  const existingDocs = await Promise.all(refs.map((ref) => ref.get()));

  const batch = db.batch();
  productElements.forEach((el, i) => {
    const existing = existingDocs[i];
    const stockQuantity = existing.exists
      ? (existing.data() as StoreInventoryItem).stockQuantity
      : el.trackInventory
        ? (el.initialStock ?? 0)
        : null;
    const item: StoreInventoryItem = {
      productId: el.productId,
      sellerUid: uid,
      projectId,
      slug,
      name: el.name,
      description: el.description,
      priceUsd: el.priceUsd,
      images: el.images,
      trackInventory: el.trackInventory,
      stockQuantity,
      saleType: el.saleType,
      fulfillment: el.fulfillment,
      serviceDurationMinutes: el.serviceDurationMinutes,
      updatedAt: Date.now(),
    };
    batch.set(refs[i], item);
  });
  await batch.commit();
}

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

// Public, unauthenticated -- every request to this Hosting site (any of its attached
// domains) routes here, since Firebase Hosting can't vary rewrites by Host header (see
// firebase.json's catch-all rewrite). This function decides what to serve based on the
// request's actual hostname:
//   - {slug}.buildsitespark.com  -> that project's published page (the free default URL)
//   - bare buildsitespark.com / www. / the raw *.web.app or *.firebaseapp.com domain
//     with no /s/ path -> the product's own landing page
//   - *.web.app or *.firebaseapp.com with a /s/{slug} path -> legacy URLs from before
//     buildsitespark.com existed, kept working rather than broken
//   - anything else -> a user's own connected custom domain, looked up via domainMappings
export const servePublishedSite = onRequest(async (req, res) => {
  const hostname = (req.hostname || '').toLowerCase();
  const isDefaultHostingDomain = hostname === HOSTING_DOMAIN || hostname.endsWith('.web.app') || hostname.endsWith('.firebaseapp.com');
  const isBareProductDomain = hostname === PRODUCT_DOMAIN || hostname === `www.${PRODUCT_DOMAIN}`;

  let slug: string | null = null;

  if (hostname.endsWith(`.${PRODUCT_DOMAIN}`) && !isBareProductDomain) {
    slug = hostname.slice(0, hostname.length - PRODUCT_DOMAIN.length - 1);
  } else if (isDefaultHostingDomain && req.path.startsWith('/s/')) {
    slug = req.path.replace(/^\/s\//, '').replace(/\/$/, '') || null;
  } else if (!isDefaultHostingDomain && !isBareProductDomain) {
    const mapping = await db.collection('domainMappings').doc(hostname).get();
    slug = (mapping.data()?.slug as string | undefined) ?? null;
  }

  if (!slug) {
    const path = req.path.replace(/\/$/, '') || '/';
    res.set('Cache-Control', 'public, max-age=3600');
    if (path === '/privacy') {
      res.status(200).send(renderPrivacyPolicyHtml());
      return;
    }
    if (path === '/returns') {
      res.status(200).send(renderReturnPolicyHtml());
      return;
    }
    if (path === '/support') {
      res.status(200).send(renderSupportHtml());
      return;
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.status(200).send(renderLandingPageHtml());
    return;
  }

  const doc = await db.collection('publishedSites').doc(slug).get();
  if (!doc.exists) {
    res.status(404).send('Site not found.');
    return;
  }

  const site = doc.data() as PublishedSite;
  if (site.suspended) {
    res.set('Cache-Control', 'no-store');
    res.status(200).send(renderSuspendedSiteHtml());
    return;
  }
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

// Real Stripe billing for the web app -- Apple IAP has no browser-tab equivalent, so
// buying a subscription or credit pack from app.buildsitespark.com goes through Stripe
// Checkout instead. Deliberately only reachable from the web app itself (the native iOS
// app's SubscriptionScreen still only ever calls the Apple IAP path in src/services/iap.ts)
// so this never becomes an App Store Review Guideline 3.1.1 steering concern -- nothing in
// the iOS binary links to or mentions this checkout.
export const createWebBillingCheckout = onCall({ secrets: [stripeSecretKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { kind, id } = request.data as { kind: 'subscription' | 'creditpack'; id: string };

  const stripe = createStripeClient(stripeSecretKey.value());
  const successUrl = `${WEBAPP_URL}/?checkout=success`;
  const cancelUrl = `${WEBAPP_URL}/?checkout=cancelled`;

  if (kind === 'subscription') {
    const planId = id as Exclude<PlanId, 'free'>;
    const plan = WEB_PLAN_PRICES[planId];
    if (!plan) throw new HttpsError('invalid-argument', 'Unknown plan.');
    const session = await createSubscriptionCheckoutSession(stripe, {
      planName: plan.name,
      priceUsd: plan.priceUsd,
      successUrl,
      cancelUrl,
      metadata: { uid, kind: 'web_subscription', planId },
    });
    return { url: session.url };
  }

  if (kind === 'creditpack') {
    const pack = WEB_CREDIT_PACKS[id];
    if (!pack) throw new HttpsError('invalid-argument', 'Unknown credit pack.');
    const session = await createOneTimeCheckoutSession(stripe, {
      name: `SiteSpark ${pack.credits}-credit pack`,
      priceUsd: pack.priceUsd,
      successUrl,
      cancelUrl,
      metadata: { uid, kind: 'web_creditpack', packCredits: String(pack.credits) },
    });
    return { url: session.url };
  }

  throw new HttpsError('invalid-argument', 'Unknown kind.');
});

// A real self-service page (hosted entirely by Stripe) where a web subscriber can update
// their card, view invoices, or cancel -- the honest equivalent of "manage your Apple ID
// subscriptions" for the Stripe billing path, so SiteSpark doesn't need to build its own
// cancel/update-card UI. Only ever has something to open if this account has actually paid
// for a web subscription at least once (see handleWebSubscriptionStarted's stripeCustomerId).
export const createStripeBillingPortalSession = onCall({ secrets: [stripeSecretKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const account = (await db.collection('users').doc(uid).get()).data() as UserAccount | undefined;
  if (!account?.stripeCustomerId) {
    throw new HttpsError('failed-precondition', "You don't have a web subscription to manage yet.");
  }

  const stripe = createStripeClient(stripeSecretKey.value());
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: `${WEBAPP_URL}/`,
  });
  return { url: portalSession.url };
});

// Public Stripe webhook -- verifies the signature, then (idempotently, since Stripe
// retries webhook deliveries) registers the domain for real via Namecheap once payment
// is confirmed. Registration only ever happens from here, never from the client, so a
// domain can't be registered without payment actually clearing first.
export const stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret, namecheapApiUser, namecheapApiKey, namecheapUserName, resendApiKey], ...NAMECHEAP_VPC_OPTS },
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

    // Stripe redelivers events that don't get a fast 2xx response -- without this guard a
    // redelivered `checkout.session.completed` would double-grant credits/a subscription,
    // same reasoning as processedAppleTransactions on the Apple IAP side.
    const processedRef = db.collection('processedStripeEvents').doc(event.id);
    if ((await processedRef.get()).exists) {
      res.status(200).send('ok');
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
      } else if (session.metadata?.kind === 'store_order') {
        await handleStoreOrderCompleted(session, resendApiKey.value());
      } else if (session.metadata?.kind === 'web_subscription') {
        await handleWebSubscriptionStarted(session);
      } else if (session.metadata?.kind === 'web_creditpack') {
        await handleWebCreditPackCompleted(session);
      }
    } else if (event.type === 'invoice.paid') {
      await handleWebSubscriptionRenewed(event.data.object as Stripe.Invoice);
    } else if (event.type === 'invoice.payment_failed') {
      await handleWebSubscriptionPaymentFailed(event.data.object as Stripe.Invoice);
    }

    await processedRef.set({ type: event.type, processedAt: Date.now() });
    res.status(200).send('ok');
  }
);

// First payment of a new web subscription -- grants this billing period's credits and
// records a uid mapping for the subscription id (Stripe's own subscription/invoice events
// only ever carry the subscription id, never our uid, so later renewal/failure webhooks
// need this to know whose account to touch). Mirrors verifyApplePurchase's subscription
// branch so the client-side credits/plan display doesn't care which platform paid for it.
async function handleWebSubscriptionStarted(session: Stripe.Checkout.Session): Promise<void> {
  const uid = session.metadata?.uid;
  const planId = session.metadata?.planId as Exclude<PlanId, 'free'> | undefined;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (!uid || !planId || !subscriptionId) return;

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

  await db.collection('stripeSubscriptions').doc(subscriptionId).set({ uid, planId, updatedAt: Date.now() });
  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        plan: planId,
        credits: FieldValue.increment(MONTHLY_CREDITS_FOR_PLAN[planId]),
        billingStatus: 'active',
        paymentFailedAt: null,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
      },
      { merge: true }
    );
  await unsuspendUserSites(uid);
}

// One-time credit pack bought from the web app.
async function handleWebCreditPackCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const uid = session.metadata?.uid;
  const credits = Number(session.metadata?.packCredits);
  if (!uid || !credits) return;
  await db.collection('users').doc(uid).set({ credits: FieldValue.increment(credits) }, { merge: true });
}

// A recurring renewal invoice (not the first one -- that's handleWebSubscriptionStarted,
// triggered by checkout.session.completed instead). `billing_reason` is Stripe's own
// distinction between the two, same idea as Apple's DID_RENEW vs SUBSCRIBED notification types.
async function handleWebSubscriptionRenewed(invoice: Stripe.Invoice): Promise<void> {
  if (invoice.billing_reason !== 'subscription_cycle') return;
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) return;

  const mapping = (await db.collection('stripeSubscriptions').doc(subscriptionId).get()).data() as
    | { uid: string; planId: Exclude<PlanId, 'free'> }
    | undefined;
  if (!mapping) return;

  const periodEnd = invoice.lines.data[0]?.period?.end;
  await db
    .collection('users')
    .doc(mapping.uid)
    .set(
      {
        credits: FieldValue.increment(MONTHLY_CREDITS_FOR_PLAN[mapping.planId]),
        planRenewsAt: periodEnd ? periodEnd * 1000 : null,
        billingStatus: 'active',
        paymentFailedAt: null,
      },
      { merge: true }
    );
}

// Mirrors the Apple 'payment_failed' branch in appStoreServerNotifications below -- same
// past_due status, grace period, and enforceBillingSuspensions sweep apply regardless of
// which platform's billing actually failed.
async function handleWebSubscriptionPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) return;
  const mapping = (await db.collection('stripeSubscriptions').doc(subscriptionId).get()).data() as { uid: string } | undefined;
  if (!mapping) return;

  const userRef = db.collection('users').doc(mapping.uid);
  const existing = (await userRef.get()).data() as UserAccount | undefined;
  if (existing?.billingStatus === 'active' || !existing?.billingStatus) {
    await userRef.set(
      {
        billingStatus: 'past_due',
        paymentFailedAt: Date.now(),
        billingNotice: {
          type: 'payment_failed',
          message:
            "Payment failed. We couldn't process your subscription renewal — please update your payment method. Your site will be taken offline automatically if this isn't resolved within a few hours.",
          createdAt: Date.now(),
        },
      },
      { merge: true }
    );
    await sendPushNotification(
      mapping.uid,
      'Payment failed',
      "We couldn't process your subscription renewal — your site will go offline in a few hours if this isn't resolved."
    ).catch((err) => console.error('Push notification failed', err));
  }
}

// Idempotent against Stripe's webhook retries -- keyed by the Checkout Session's own id, so
// a redelivered event never double-counts an order or double-decrements stock. Runs the
// stock decrement inside a transaction so two near-simultaneous orders for the last unit of
// something can't both succeed.
async function handleStoreOrderCompleted(session: Stripe.Checkout.Session, resendKey: string): Promise<void> {
  const sellerUid = session.metadata?.sellerUid;
  const slug = session.metadata?.slug;
  const itemsJson = session.metadata?.items;
  if (!sellerUid || !slug || !itemsJson) return;

  const orderRef = db.collection('users').doc(sellerUid).collection('orders').doc(session.id);
  if ((await orderRef.get()).exists) return;

  const items = JSON.parse(itemsJson) as StoreOrderItem[];
  const bookingDetails: BookingDetails | null = session.metadata?.booking ? (JSON.parse(session.metadata.booking) as BookingDetails) : null;
  const subtotalUsd = items.reduce((sum, item) => sum + item.priceUsd * item.quantity, 0);
  const platformFeeUsd = Math.round(subtotalUsd * (PLATFORM_FEE_PERCENT / 100) * 100) / 100;
  const sellerNetUsd = Math.round((subtotalUsd - platformFeeUsd) * 100) / 100;

  const inventoryRefs = items.map((item) => db.collection('storeInventory').doc(slug).collection('products').doc(item.productId));
  let projectId = '';
  await db.runTransaction(async (tx) => {
    const docs = await Promise.all(inventoryRefs.map((ref) => tx.get(ref)));
    docs.forEach((doc, i) => {
      if (!doc.exists) return;
      const data = doc.data() as StoreInventoryItem;
      if (i === 0) projectId = data.projectId;
      if (data.trackInventory && data.stockQuantity != null) {
        tx.update(inventoryRefs[i], { stockQuantity: Math.max(0, data.stockQuantity - items[i].quantity) });
      }
    });
  });

  const order: StoreOrder = {
    id: session.id,
    sellerUid,
    slug,
    projectId,
    buyerEmail: session.customer_details?.email ?? null,
    buyerName: session.customer_details?.name ?? null,
    items,
    subtotalUsd,
    platformFeeUsd,
    sellerNetUsd,
    stripeSessionId: session.id,
    bookingDetails,
    status: 'paid',
    createdAt: Date.now(),
  };
  await orderRef.set(order);

  const notice: OrderNotice = {
    orderId: session.id,
    message: bookingDetails
      ? `New booking for ${bookingDetails.preferredDate} at ${bookingDetails.preferredTime} — $${sellerNetUsd.toFixed(2)} after fees.`
      : `New order — $${sellerNetUsd.toFixed(2)} after fees.`,
    createdAt: Date.now(),
  };
  await db.collection('users').doc(sellerUid).set({ lastOrderNotice: notice }, { merge: true });

  await sendPushNotification(
    sellerUid,
    bookingDetails ? 'New booking' : 'New order',
    bookingDetails ? `${bookingDetails.preferredDate} at ${bookingDetails.preferredTime} — $${sellerNetUsd.toFixed(2)} after fees.` : `$${sellerNetUsd.toFixed(2)} after fees.`
  ).catch((err) => console.error('Push notification failed', err));

  try {
    const sellerAuthRecord = await getAuth().getUser(sellerUid);
    if (sellerAuthRecord.email) {
      await sendOrderNotificationEmail(resendKey, sellerAuthRecord.email, order);
    }
  } catch (err) {
    // Never fails the order itself over an email hiccup -- the order and payout already
    // succeeded via Stripe regardless of whether this notification goes out.
    console.error('Order notification email failed', err);
  }
}

// Inbound domain transfer -- brings a domain the user already owns at a different
// registrar into this Namecheap account. Requires the domain to already be unlocked at
// its current registrar and a valid EPP/auth code from them (the user gets that from
// their current registrar's dashboard/support -- outside this app). Not charged via
// Stripe (see ROADMAP.md Phase 7c) -- the cost is absorbed on the product's own Namecheap
// balance for now.
export const startDomainTransfer = onCall(
  { secrets: [namecheapApiUser, namecheapApiKey, namecheapUserName], ...NAMECHEAP_VPC_OPTS },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { domain, eppCode, registrant } = request.data as { domain: string; eppCode: string; registrant: RegistrantContact };
    if (!domain?.trim() || !eppCode?.trim() || !registrant) {
      throw new HttpsError('invalid-argument', 'Missing domain, EPP code, or registrant contact.');
    }

    const creds = { apiUser: namecheapApiUser.value(), apiKey: namecheapApiKey.value(), userName: namecheapUserName.value() };
    const result = await createTransfer(creds, domain.trim().toLowerCase(), eppCode.trim(), registrant);

    const transferRef = db.collection('users').doc(uid).collection('domainTransfers').doc();
    const transfer: DomainTransfer = {
      id: transferRef.id,
      uid,
      domain: result.domain,
      transferId: result.transferId,
      status: 'submitted',
      statusDescription: result.statusDescription,
      errorMessage: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await transferRef.set(transfer);
    return transfer;
  }
);

export const getDomainTransferStatus = onCall(
  { secrets: [namecheapApiUser, namecheapApiKey, namecheapUserName], ...NAMECHEAP_VPC_OPTS },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { transferDocId } = request.data as { transferDocId: string };
    const transferRef = db.collection('users').doc(uid).collection('domainTransfers').doc(transferDocId);
    const transfer = (await transferRef.get()).data() as DomainTransfer | undefined;
    if (!transfer) throw new HttpsError('not-found', 'Transfer not found.');

    const creds = { apiUser: namecheapApiUser.value(), apiKey: namecheapApiKey.value(), userName: namecheapUserName.value() };
    const status = await getTransferStatus(creds, transfer.transferId);
    await transferRef.update({
      status: status.status,
      statusDescription: status.statusDescription,
      updatedAt: Date.now(),
    });
    return { ...transfer, status: status.status, statusDescription: status.statusDescription };
  }
);

// Verifies a real StoreKit purchase server-side via Apple's App Store Server API before
// applying its effect (credits, plan, or theme unlock) -- never trusts a client's own
// claim that it paid. Idempotent against Apple redelivering the same transaction (app
// relaunch, retry) via processedAppleTransactions; a subscription renewal is a distinct
// transactionId each period, so each renewal still tops up credits exactly once.
export const verifyApplePurchase = onCall(
  { secrets: [appleIapKeyId, appleIapIssuerId, appleIapPrivateKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { transactionId } = request.data as { transactionId: string };
    if (!transactionId) throw new HttpsError('invalid-argument', 'Missing transactionId.');

    try {
      const processedRef = db.collection('processedAppleTransactions').doc(transactionId);
      if ((await processedRef.get()).exists) {
        return { alreadyProcessed: true };
      }

      const creds = {
        keyId: appleIapKeyId.value(),
        issuerId: appleIapIssuerId.value(),
        privateKey: appleIapPrivateKey.value(),
        bundleId: APPLE_BUNDLE_ID,
      };
      const info = await getTransactionInfo(creds, transactionId);
      if (info.bundleId !== APPLE_BUNDLE_ID) {
        throw new HttpsError('failed-precondition', 'Transaction does not belong to this app.');
      }

      const userRef = db.collection('users').doc(uid);

      if (SUBSCRIPTION_PRODUCT_IDS[info.productId]) {
        const planId = SUBSCRIPTION_PRODUCT_IDS[info.productId];
        await userRef.set(
          {
            plan: planId,
            planRenewsAt: info.expiresDate,
            credits: FieldValue.increment(MONTHLY_CREDITS_FOR_PLAN[planId]),
            billingStatus: 'active',
            paymentFailedAt: null,
          },
          { merge: true }
        );
        // Lets appStoreServerNotifications map a future renewal-failure webhook (which only
        // carries Apple's own transaction IDs, never our uid) back to this account.
        await db
          .collection('appleOriginalTransactions')
          .doc(info.originalTransactionId)
          .set({ uid, updatedAt: Date.now() });
        await unsuspendUserSites(uid);
      } else if (CREDIT_PACK_PRODUCT_IDS[info.productId] != null) {
        await userRef.set({ credits: FieldValue.increment(CREDIT_PACK_PRODUCT_IDS[info.productId]) }, { merge: true });
      } else if (THEME_IDS_BY_PRODUCT[info.productId]) {
        await userRef
          .collection('meta')
          .doc('unlockedThemes')
          .set({ themeIds: FieldValue.arrayUnion(...THEME_IDS_BY_PRODUCT[info.productId]) }, { merge: true });
      } else {
        throw new HttpsError('invalid-argument', `Unknown product: ${info.productId}`);
      }

      await processedRef.set({
        uid,
        productId: info.productId,
        transactionId: info.transactionId,
        environment: info.environment,
        processedAt: Date.now(),
      });

      return { productId: info.productId, environment: info.environment };
    } catch (err: any) {
      // onCall silently replaces any thrown error that isn't already an HttpsError with a
      // generic {code:'internal', message:'INTERNAL'} before it reaches the client -- that's
      // exactly why a real failure here (a malformed IAP private key secret, Apple's API
      // being briefly unreachable, etc.) shows up in the app as a bare, undiagnosable
      // "Purchase failed / INTERNAL" instead of a message that says what actually broke.
      // Re-throwing as HttpsError lets the real reason through while still logging the full
      // error server-side via Cloud Functions' default error logging.
      if (err instanceof HttpsError) throw err;
      console.error('verifyApplePurchase failed', err);
      throw new HttpsError('internal', err?.message ?? 'Purchase verification failed. Please try again.');
    }
  }
);

// -- Billing failure notifications & site suspension --
//
// "Monthly bill payment" maps to the real recurring payment in this app: the
// beginner/middle/advanced subscription plan (there's no separate "hosting fee" product).
// When Apple reports a renewal failure, the account is marked "past_due" and a banner shows
// in the app (see BillingBanner.tsx) -- the site itself stays up. If the failure isn't
// resolved within BILLING_GRACE_PERIOD_MS, enforceBillingSuspensions takes every published
// site for that account down and shows a "temporarily unavailable" page instead (see
// servePublishedSite's `suspended` check). The moment Apple reports a successful renewal (or
// the user buys/restores the subscription again from inside the app), the account and every
// suspended site are restored automatically.
//
// Deliberately scoped to payment *failure*, not the full subscription lifecycle: a voluntary
// cancellation (Subtype.VOLUNTARY) is not treated as a billing failure and does not suspend
// anything -- the user keeps their site through the period they already paid for, same as
// Apple's own model. What happens to their plan/credits after that period fully lapses is a
// separate "downgrade to free" feature, not built here (see ROADMAP.md).

async function unsuspendUserSites(uid: string): Promise<void> {
  const sitesSnap = await db.collection('publishedSites').where('uid', '==', uid).where('suspended', '==', true).get();
  if (sitesSnap.empty) return;
  const batch = db.batch();
  sitesSnap.forEach((d) => batch.update(d.ref, { suspended: false }));
  await batch.commit();
}

// Public webhook Apple calls on every subscription lifecycle event -- configure its URL as
// this function's URL in App Store Connect -> your app -> App Store Server Notifications (see
// ROADMAP.md Phase 9 setup steps). Every payload is verified against Apple's real root CA
// (see appStoreNotifications.ts) before anything in it is trusted, since this is a public URL
// anyone could otherwise POST a forged "payment failed"/"payment succeeded" event to.
export const appStoreServerNotifications = onRequest(async (req, res) => {
  const signedPayload = (req.body as { signedPayload?: string } | undefined)?.signedPayload;
  if (!signedPayload) {
    res.status(400).send('Missing signedPayload.');
    return;
  }

  let event;
  try {
    event = await verifyAndClassifyNotification(signedPayload);
  } catch (err) {
    console.error('Rejected App Store Server Notification: failed verification', err);
    res.status(200).send('ignored'); // 200 so Apple doesn't treat this as a delivery failure and keep retrying
    return;
  }

  if (event.kind === 'ignored' || !event.originalTransactionId) {
    res.status(200).send('ok');
    return;
  }

  const mappingSnap = await db.collection('appleOriginalTransactions').doc(event.originalTransactionId).get();
  const uid = mappingSnap.data()?.uid as string | undefined;
  if (!uid) {
    // A notification (often a sandbox test one) for a subscription we haven't seen a
    // verifyApplePurchase call for yet -- nothing in our data to update.
    res.status(200).send('ok');
    return;
  }

  const userRef = db.collection('users').doc(uid);

  if (event.kind === 'payment_failed') {
    const existing = (await userRef.get()).data() as UserAccount | undefined;
    if (existing?.billingStatus === 'active' || !existing?.billingStatus) {
      await userRef.set(
        {
          billingStatus: 'past_due',
          paymentFailedAt: Date.now(),
          billingNotice: {
            type: 'payment_failed',
            message:
              "Payment failed. We couldn't process your subscription renewal — please update your payment method. Your site will be taken offline automatically if this isn't resolved within a few hours.",
            createdAt: Date.now(),
          },
        },
        { merge: true }
      );
      await sendPushNotification(
        uid,
        'Payment failed',
        "We couldn't process your subscription renewal — your site will go offline in a few hours if this isn't resolved."
      ).catch((err) => console.error('Push notification failed', err));
    }
    // Already past_due or suspended -- Apple's own billing retries continue in the
    // background for weeks; don't reset our grace-period clock or re-notify on each one.
  } else if (event.kind === 'payment_resolved') {
    await userRef.set(
      {
        billingStatus: 'active',
        paymentFailedAt: null,
        billingNotice: {
          type: 'resolved',
          message: 'Your payment went through — your site is back online.',
          createdAt: Date.now(),
        },
      },
      { merge: true }
    );
    await unsuspendUserSites(uid);
    await sendPushNotification(uid, 'Payment received', 'Your site is back online.').catch((err) =>
      console.error('Push notification failed', err)
    );
  }

  res.status(200).send('ok');
});

// Runs every 15 minutes: any account that's been "past_due" for longer than the grace period
// gets every one of its published sites suspended. Split from the webhook handler above
// because the grace period (hours) is independent of whenever Apple happens to deliver
// notifications, and because this is also what recovers from a GRACE_PERIOD_EXPIRED webhook
// arriving before this sweep would otherwise have caught it.
export const enforceBillingSuspensions = onSchedule('every 15 minutes', async () => {
  const cutoff = Date.now() - BILLING_GRACE_PERIOD_MS;
  const pastDueSnap = await db.collection('users').where('billingStatus', '==', 'past_due').get();

  for (const userDoc of pastDueSnap.docs) {
    const account = userDoc.data() as UserAccount;
    if (!account.paymentFailedAt || account.paymentFailedAt > cutoff) continue;

    const uid = userDoc.id;
    await userDoc.ref.set(
      {
        billingStatus: 'suspended',
        billingNotice: {
          type: 'suspended',
          message:
            'Your site has been taken down because your subscription payment could not be processed. Renew your subscription to bring it back online.',
          createdAt: Date.now(),
        },
      },
      { merge: true }
    );

    await sendPushNotification(uid, 'Site suspended', 'Your site has been taken down over a failed payment — renew to bring it back online.').catch(
      (err) => console.error('Push notification failed', err)
    );

    const sitesSnap = await db.collection('publishedSites').where('uid', '==', uid).get();
    if (!sitesSnap.empty) {
      const batch = db.batch();
      sitesSnap.forEach((d) => batch.update(d.ref, { suspended: true }));
      await batch.commit();
    }
  }
});

// -- Storefront: selling products from a published site, with real payouts (Phase 10) --
//
// Money never sits in SiteSpark's own Stripe balance -- every store charge is split at the
// moment it's created (application_fee_amount + transfer_data.destination on the
// PaymentIntent, see createStoreCheckout below), so a seller's share lands directly in
// their own Stripe Express connected account, on Stripe's own payout schedule. SiteSpark's
// cut (PLATFORM_FEE_PERCENT) is Stripe's application fee, not a manual transfer.

const sellerAccountRef = (uid: string) => db.collection('users').doc(uid).collection('meta').doc('sellerAccount');

// Creates (or reuses) a real Stripe Express connected account for this seller and returns
// a one-time hosted onboarding link (identity, bank details, tax info -- all handled by
// Stripe directly, never touching SiteSpark's own servers).
export const createSellerOnboardingLink = onCall({ secrets: [stripeSecretKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const stripe = createStripeClient(stripeSecretKey.value());
  const ref = sellerAccountRef(uid);
  const existing = (await ref.get()).data() as SellerAccount | undefined;

  const accountId = await ensureExpressAccount(stripe, existing?.stripeAccountId ?? null, request.auth?.token?.email as string | undefined);

  if (!existing?.stripeAccountId) {
    const seller: SellerAccount = {
      uid,
      stripeAccountId: accountId,
      onboardingStatus: 'pending',
      chargesEnabled: false,
      payoutsEnabled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await ref.set(seller);
  }

  // Custom URL scheme, same pattern as createDomainCheckout's success/cancel URLs -- the
  // in-app browser closes and control returns to the app (registered scheme, see
  // app.config.js) whether Stripe redirects here or the user just backs out manually; the
  // app re-checks real status via getSellerAccountStatus rather than trusting this redirect.
  const url = await createOnboardingLink(stripe, accountId, 'sitespark://seller-onboarding-refresh', 'sitespark://seller-onboarding-complete');
  return { url };
});

// Refreshes this seller's real charges_enabled/payouts_enabled flags from Stripe -- the
// client calls this after returning from onboarding (or pull-to-refresh) rather than
// trusting the redirect URL, since Stripe's own account state is the only source of truth
// for whether this account can actually accept a charge yet.
export const getSellerAccountStatus = onCall({ secrets: [stripeSecretKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const ref = sellerAccountRef(uid);
  const existing = (await ref.get()).data() as SellerAccount | undefined;
  if (!existing?.stripeAccountId) {
    return { onboardingStatus: 'not_connected', chargesEnabled: false, payoutsEnabled: false };
  }

  const stripe = createStripeClient(stripeSecretKey.value());
  const flags = await getAccountFlags(stripe, existing.stripeAccountId);
  const onboardingStatus: SellerAccount['onboardingStatus'] = flags.chargesEnabled ? 'active' : 'pending';

  await ref.set(
    { onboardingStatus, chargesEnabled: flags.chargesEnabled, payoutsEnabled: flags.payoutsEnabled, updatedAt: Date.now() },
    { merge: true }
  );

  return { onboardingStatus, chargesEnabled: flags.chargesEnabled, payoutsEnabled: flags.payoutsEnabled };
});

// A real link into the seller's own Stripe Express dashboard -- their actual balance,
// payout schedule, and payment history, hosted entirely by Stripe. SiteSpark doesn't need
// to build its own payout ledger UI on top of this.
export const createSellerDashboardLink = onCall({ secrets: [stripeSecretKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const existing = (await sellerAccountRef(uid).get()).data() as SellerAccount | undefined;
  if (!existing?.stripeAccountId) {
    throw new HttpsError('failed-precondition', 'Set up payouts before viewing your Stripe dashboard.');
  }

  const stripe = createStripeClient(stripeSecretKey.value());
  const url = await createDashboardLoginLink(stripe, existing.stripeAccountId);
  return { url };
});

// Public webhook (no auth -- a buyer's browser calls this), computes the real order total
// against storeInventory (never trusting whatever price/stock the static page happened to
// have baked in), and creates a real Stripe Checkout Session with the commission split
// baked into the PaymentIntent itself.
export const createStoreCheckout = onRequest({ secrets: [stripeSecretKey], cors: true }, async (req, res) => {
  try {
    const { slug, items, booking } = req.body as {
      slug: string;
      items: { productId: string; quantity: number }[];
      booking?: { preferredDate?: string; preferredTime?: string; notes?: string };
    };
    if (!slug || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Missing slug or items.' });
      return;
    }

    const inventoryDocs = await Promise.all(
      items.map((item) => db.collection('storeInventory').doc(slug).collection('products').doc(item.productId).get())
    );

    let sellerUid: string | null = null;
    let subtotalUsd = 0;
    let hasService = false;
    let needsShipping = false;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    const orderItems: StoreOrderItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const doc = inventoryDocs[i];
      const quantity = Math.max(1, Math.floor(items[i].quantity));
      if (!doc.exists) {
        res.status(400).json({ error: `Product ${items[i].productId} is no longer available.` });
        return;
      }
      const product = doc.data() as StoreInventoryItem;
      if (sellerUid && product.sellerUid !== sellerUid) {
        // Every product on a single published project belongs to the same seller, so this
        // never happens in practice -- guarded anyway since checkout only ever pays out to
        // one connected account per Checkout Session.
        res.status(400).json({ error: 'All items in an order must be from the same site.' });
        return;
      }
      sellerUid = product.sellerUid;
      if (product.trackInventory && (product.stockQuantity ?? 0) < quantity) {
        res.status(400).json({
          error: product.saleType === 'service' ? `No more bookings available for ${product.name}.` : `Not enough stock left for ${product.name}.`,
        });
        return;
      }
      if (product.saleType === 'service') hasService = true;
      if (product.saleType === 'product' && product.fulfillment !== 'pickup') needsShipping = true;

      subtotalUsd += product.priceUsd * quantity;
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: product.saleType === 'service' ? `${product.name} (booking)` : product.name },
          unit_amount: Math.round(product.priceUsd * 100),
        },
        quantity,
      });
      orderItems.push({ productId: product.productId, name: product.name, priceUsd: product.priceUsd, quantity, saleType: product.saleType });
    }

    if (!sellerUid) {
      res.status(400).json({ error: 'No valid items.' });
      return;
    }

    // A booking needs a real preferred date/time -- this is what makes it a real
    // reservation record instead of just an anonymous charge (see BookingDetails).
    if (hasService && (!booking?.preferredDate?.trim() || !booking?.preferredTime?.trim())) {
      res.status(400).json({ error: 'Please provide a preferred date and time for your booking.' });
      return;
    }

    const seller = (await sellerAccountRef(sellerUid).get()).data() as SellerAccount | undefined;
    if (!seller?.stripeAccountId || !seller.chargesEnabled) {
      res.status(400).json({ error: 'This store cannot accept payments yet.' });
      return;
    }

    const platformFeeUsd = Math.round(subtotalUsd * (PLATFORM_FEE_PERCENT / 100) * 100) / 100;
    const stripe = createStripeClient(stripeSecretKey.value());
    const bookingDetails: BookingDetails | null = hasService
      ? {
          preferredDate: (booking?.preferredDate ?? '').trim().slice(0, 40),
          preferredTime: (booking?.preferredTime ?? '').trim().slice(0, 40),
          notes: (booking?.notes ?? '').trim().slice(0, 500),
        }
      : null;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment', // always a single real one-time charge -- never a subscription, booking or not
      payment_method_types: ['card'],
      line_items: lineItems,
      ...(needsShipping ? { shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU', 'NZ'] as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] } } : {}),
      success_url: `https://${slug}.${PRODUCT_DOMAIN}/?order=success`,
      cancel_url: `https://${slug}.${PRODUCT_DOMAIN}/?order=cancelled`,
      payment_intent_data: {
        application_fee_amount: Math.round(platformFeeUsd * 100),
        transfer_data: { destination: seller.stripeAccountId },
      },
      metadata: {
        kind: 'store_order',
        slug,
        sellerUid,
        items: JSON.stringify(orderItems),
        ...(bookingDetails ? { booking: JSON.stringify(bookingDetails) } : {}),
      },
    });

    res.status(200).json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('createStoreCheckout failed', err);
    res.status(500).json({ error: 'Could not start checkout.' });
  }
});

const CONTENT_REPORT_REASONS = [
  'Spam or scam',
  'Offensive or abusive content',
  'Copyright or trademark infringement',
  'Impersonation',
  'Other',
];

// Public, unauthenticated -- anyone viewing a published site can report it, same as the
// "Report this site" link baked into every published page (see siteHtml.ts). Required by
// App Store Review Guideline 1.2 for apps that let users publish content publicly. Stores
// the report and emails the team directly rather than just writing to a collection nobody
// watches -- see sendContentReportEmail.
export const reportPublishedSite = onRequest({ secrets: [resendApiKey], cors: true }, async (req, res) => {
  try {
    const { slug, reason, message, pageUrl } = req.body as {
      slug?: string;
      reason?: string;
      message?: string;
      pageUrl?: string;
    };
    if (!slug || !reason || !CONTENT_REPORT_REASONS.includes(reason)) {
      res.status(400).json({ error: 'Missing or invalid report reason.' });
      return;
    }

    const siteDoc = await db.collection('publishedSites').doc(slug).get();
    if (!siteDoc.exists) {
      res.status(400).json({ error: 'This site could not be found.' });
      return;
    }
    const site = siteDoc.data() as PublishedSite;

    await db.collection('contentReports').add({
      slug,
      reportedUid: site.uid,
      reason,
      message: (message ?? '').slice(0, 2000),
      pageUrl: pageUrl ?? `https://${slug}.${PRODUCT_DOMAIN}`,
      createdAt: Date.now(),
    });

    await sendContentReportEmail(resendApiKey.value(), {
      slug,
      reason,
      message: (message ?? '').slice(0, 2000),
      pageUrl: pageUrl ?? `https://${slug}.${PRODUCT_DOMAIN}`,
    }).catch((err) => console.error('sendContentReportEmail failed', err));

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('reportPublishedSite failed', err);
    res.status(500).json({ error: 'Could not send report.' });
  }
});
