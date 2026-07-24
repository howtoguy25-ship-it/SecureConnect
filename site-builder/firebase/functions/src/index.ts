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
  CatalogProduct,
  ProductElement,
  ProductVariantOption,
  StoreInventoryItem,
  StoreInventoryVariant,
  StoreOrder,
  StoreOrderItem,
  FulfillmentStatus,
  DiscountCode,
  DiscountKind,
  DiscountType,
  SellerAccount,
  OrderNotice,
  BookingDetails,
  PlanId,
  MenuItem,
  MenuItemTarget,
} from './types';
import { computeBuildCost, FREE_SIGNUP_CREDITS, BACKGROUND_EDIT_CREDIT_COST, CUSTOM_WIDGET_CREDIT_COST, MODEL_FOR_PLAN, WEB_PLAN_PRICES, WEB_CREDIT_PACKS } from './pricing';
import { createOpenAIClient, generateSitePlan, generateImage, editImageBackground as editImageBackgroundWithAI, answerBuildQuestion, generateClarifyingQuestions, generateCustomWidgetCode, SitePlan, SitePlanSection } from './openai';
import { layoutSitePlan, estimatedCanvasHeight, SectionImage, SectionVideo, SectionProductImages, SectionCustomWidget } from './layout';
import { searchYouTubeVideo } from './youtube';
import { chatWithAssistant, AssistantChatMessage, AssistantActionType } from './assistant';
import { isValidCurrency } from './currency';
import {
  renderProjectHtml,
  renderPageNavHtml,
  renderLandingPageHtml,
  renderSuspendedSiteHtml,
  renderPrivacyPolicyHtml,
  renderReturnPolicyHtml,
  renderSupportHtml,
  renderPolicyPageHtml,
  renderPoliciesIndexHtml,
  policyHref,
  POLICIES_INDEX_HREF,
} from './siteHtml';
import { slugify, uniqueSlug } from './publish';
import { createHostingDomain, getHostingDomain, deleteHostingDomain } from './hostingApi';
import {
  checkAvailability,
  getRegistrationPriceUsd,
  registerDomain,
  createTransfer,
  getTransferStatus,
  getRegistrarLock,
  setRegistrarLock,
  RegistrantContact,
} from './namecheapApi';
import { createStripeClient, createCheckoutSession, createSubscriptionCheckoutSession, createOneTimeCheckoutSession } from './stripeApi';
import { ensureExpressAccount, createOnboardingLink, getAccountFlags, createDashboardLoginLink, deleteExpressAccount } from './stripeConnect';
import { sendOrderNotificationEmail, sendContentReportEmail, sendShippingNotificationEmail } from './emailApi';
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
const youtubeApiKey = defineSecret('YOUTUBE_API_KEY');
// Private half of the VAPID keypair used to sign real Web Push deliveries (see
// sendPushNotification in pushApi.ts) -- the public half is safe to hardcode (it's already
// shipped to every client in app.config.js), but this one must never be committed.
const vapidPrivateKey = defineSecret('VAPID_PRIVATE_KEY');

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
// Same pattern, for getProductStock (defined further down) -- baked into every published
// product card so it can show real live stock/in-stock status instead of a stale number
// baked in at publish time (see siteHtml.ts).
const PRODUCT_STOCK_URL = `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/getProductStock`;
// Same pattern, for validateDiscountCode (defined further down) -- baked into every
// published page's cart panel so a buyer gets real feedback ("10% off applied") as soon as
// they type a code, before committing to checkout (see siteHtml.ts).
const DISCOUNT_VALIDATE_URL = `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/validateDiscountCode`;
// Same pattern, for getOrdersByEmail (defined further down) -- baked into every published
// page's "Track your order" widget so a buyer with no account and no order id can list every
// order they've placed at this site using only the email they paid with (see siteHtml.ts).
const ORDERS_BY_EMAIL_URL = `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/getOrdersByEmail`;
// Same pattern, for getActiveDiscountAnnouncement (defined further down) -- polled by every
// published page with products to show a real "code X is live" banner without republishing.
const DISCOUNT_ANNOUNCEMENT_URL = `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/getActiveDiscountAnnouncement`;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// onCall silently replaces any thrown error that isn't already an HttpsError with a
// generic {code:'internal', message:'INTERNAL'} before it reaches the client -- that's why
// a real failure (a bad secret, a third-party API outage, a permissions problem) has
// repeatedly shown up in the app as a bare, undiagnosable "Could not X / INTERNAL" instead
// of a message that says what actually broke. Wrapping every callable's handler with this
// lets the real reason through (still logged server-side either way) instead of requiring
// each function to remember to catch-and-rethrow itself.
function withCallableErrors<Req, Res>(
  name: string,
  handler: (request: import('firebase-functions/v2/https').CallableRequest<Req>) => Promise<Res>
): (request: import('firebase-functions/v2/https').CallableRequest<Req>) => Promise<Res> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (err: any) {
      if (err instanceof HttpsError) throw err;
      console.error(`${name} failed`, err);
      throw new HttpsError('internal', err?.message ?? 'Something went wrong. Please try again.');
    }
  };
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
export const ensureAccount = onCall({ invoker: 'public' }, withCallableErrors('ensureAccount', async (request) => {
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
}));

// Real, server-enforced rewarded-ad credit grant -- the client only ever *reports* that a
// real AdMob rewarded ad finished playing; the 48h cooldown and the actual credit increment
// happen here, inside a transaction, so retrying the client call (or a modified/rooted
// client) can't claim it twice or skip the cooldown.
const AD_REWARD_CREDITS = 15;
const AD_REWARD_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;

export const claimAdReward = onCall({ invoker: 'public' }, withCallableErrors('claimAdReward', async (request) => {
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
}));

// Real account deletion -- required by App Store guideline 5.1.1(v) for any app that lets
// people create an account. Actually removes everything, not just a "deactivated" flag:
// unpublishes every live site first (so no stale published page or connected domain
// survives the account), recursively deletes every Firestore doc under this user, deletes
// their uploaded files from Storage, and finally deletes the real Firebase Auth user record
// -- after this call the uid can never sign back in to find an empty shell of an account.
export const deleteAccount = onCall({ invoker: 'public' }, withCallableErrors('deleteAccount', async (request) => {
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
}));

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
export const suggestClarifyingQuestions = onCall({ secrets: [openaiApiKey], invoker: 'public' }, withCallableErrors('suggestClarifyingQuestions', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { prompt, pageType } = request.data as { prompt: string; pageType: string };
  if (!prompt?.trim()) throw new HttpsError('invalid-argument', 'Missing prompt.');

  const client = createOpenAIClient(openaiApiKey.value());
  const questions = await generateClarifyingQuestions(client, prompt.trim(), pageType || 'website');
  return { questions };
}));

export const startGeneration = onCall(
  { secrets: [openaiApiKey, youtubeApiKey], timeoutSeconds: 540, memory: '512MiB', invoker: 'public' },
  withCallableErrors('startGeneration', async (request) => {
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
    const pushPreview = async (
      currentPlan: SitePlan,
      images: SectionImage[],
      videos: SectionVideo[] = [],
      productImages: SectionProductImages[] = [],
      customWidgets: SectionCustomWidget[] = []
    ) => {
      const { elements: previewElements, productContents } = layoutSitePlan(currentPlan, images, videos, productImages, customWidgets);
      // A ProductElement only ever stores a productId (see the type's own comment) -- an
      // AI-generated product section needs a real catalog doc created for it too, exactly
      // like a human using ProductEditScreen would create one. Plain overwrite (not a
      // stock-preserving merge) is fine here: this doc doesn't exist until the AI build
      // creates it, and every pushPreview call for the same build re-describes the same
      // section, so there's no real seller edit or sale history to protect yet.
      const now = Date.now();
      await Promise.all(
        Object.entries(productContents).map(([productId, content]) =>
          db.collection('users').doc(uid).collection('products').doc(productId).set({ id: productId, ...content, createdAt: now, updatedAt: now })
        )
      );
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
      const sectionsNeedingVideo = plan.sections.filter((s: SitePlanSection) => s.kind === 'video' && s.videoSearchQuery?.trim());
      const sectionVideos: SectionVideo[] = [];
      // Real product photos -- 2-4 high-quality angle shots of the same item, not one
      // decorative hero image, so a "product" section becomes a real sellable listing.
      const sectionsNeedingProductImages = plan.sections.filter((s: SitePlanSection) => s.kind === 'product' && s.productImagePrompts?.length);
      const sectionProductImages: SectionProductImages[] = [];
      // "custom" sections describe a real bespoke interactive widget (game/tool/calculator)
      // the AI writes real HTML/CSS/JS for -- any {{IMAGE_n}} placeholders in that code get
      // real generated images substituted in below, same "on point" quality bar as product
      // photos, never a broken/mismatched stand-in.
      const sectionsNeedingCustomWidget = plan.sections.filter((s: SitePlanSection) => s.kind === 'custom' && s.customDescription?.trim());
      const sectionCustomWidgets: SectionCustomWidget[] = [];

      // Each image is its own slow OpenAI call (often 10-30s) -- generating them one at a
      // time in sequence was the single biggest reason a build could take minutes. Firing
      // them all off together cuts total image time down to roughly the slowest single
      // image instead of the sum of all of them. Each one still pushes its own live-preview
      // update the moment it lands (not waiting for the whole batch), so the progress
      // screen keeps revealing images incrementally rather than all at once at the end.
      // Real video search runs alongside the same batch -- finding an actual matching
      // YouTube video for any section that asked for one (e.g. real basketball news/
      // highlights), never a generated/fake stand-in.
      if (sectionsNeedingVideo.length > 0) {
        await sessionRef.update({ statusMessage: 'Finding real videos for your site...', updatedAt: Date.now() });
      }
      if (sectionsNeedingCustomWidget.length > 0) {
        await sessionRef.update({ statusMessage: 'Building your custom interactive feature...', updatedAt: Date.now() });
      }
      await Promise.all([
        ...sectionsNeedingImages.map(async (section: SitePlanSection) => {
          try {
            const buffer = await generateImage(client, section.imagePrompt);
            const path = `users/${uid}/generated/${sessionId}/${section.kind}-${Date.now()}.png`;
            const file = bucket.file(path);
            await file.save(buffer, { contentType: 'image/png' });
            const [url] = await file.getSignedUrl({ action: 'read', expires: '01-01-2100' });
            sectionImages.push({ section, url });
          } catch (err) {
            // A single section's artwork failing (OpenAI hiccup, a transient Storage error)
            // must never sink the entire build -- the site still finishes, just with that
            // one section falling back to no image instead of throwing away every other
            // section that already generated successfully.
            console.error(`Image generation failed for section "${section.kind}"`, err);
          }
          await pushPreview(plan, sectionImages, sectionVideos, sectionProductImages, sectionCustomWidgets);
        }),
        ...sectionsNeedingVideo.map(async (section: SitePlanSection) => {
          try {
            const result = await searchYouTubeVideo(youtubeApiKey.value(), section.videoSearchQuery);
            sectionVideos.push({ section, videoId: result?.videoId ?? null, title: result?.title ?? null });
          } catch (err) {
            // Same as images -- a failed/quota-exhausted video search must never sink the
            // whole build, just leave that section without a video.
            console.error(`Video search failed for section "${section.kind}"`, err);
            sectionVideos.push({ section, videoId: null, title: null });
          }
          await pushPreview(plan, sectionImages, sectionVideos, sectionProductImages, sectionCustomWidgets);
        }),
        ...sectionsNeedingProductImages.map(async (section: SitePlanSection) => {
          // All of one product's angle-shots generate in parallel too (nested inside the
          // outer per-section Promise.all), same "fire everything off together" reasoning as
          // decorative images -- a 3-photo product listing shouldn't take 3x as long as one.
          const urls = (
            await Promise.all(
              section.productImagePrompts.map(async (prompt, i) => {
                try {
                  const buffer = await generateImage(client, prompt, 'high', '1024x1536');
                  const path = `users/${uid}/generated/${sessionId}/product-${Date.now()}-${i}.png`;
                  const file = bucket.file(path);
                  await file.save(buffer, { contentType: 'image/png' });
                  const [url] = await file.getSignedUrl({ action: 'read', expires: '01-01-2100' });
                  return url;
                } catch (err) {
                  // One angle-shot failing must never sink the whole product (or build) --
                  // the listing still finishes with whichever photos did generate.
                  console.error(`Product image generation failed for "${section.productName}"`, err);
                  return null;
                }
              })
            )
          ).filter((u): u is string => !!u);
          sectionProductImages.push({ section, urls });
          await pushPreview(plan, sectionImages, sectionVideos, sectionProductImages, sectionCustomWidgets);
        }),
        ...sectionsNeedingCustomWidget.map(async (section: SitePlanSection) => {
          try {
            const widget = await generateCustomWidgetCode(
              client,
              model,
              section.customDescription,
              plan.siteName,
              plan.accentColor,
              plan.textColor
            );
            // Same "fire every image off together" reasoning as product photos -- a widget
            // with 2-3 image placeholders shouldn't take 2-3x as long to finish as one.
            let code = widget.html;
            const urls = await Promise.all(
              widget.imagePrompts.map(async (imgPrompt, i) => {
                try {
                  const buffer = await generateImage(client, imgPrompt, 'high');
                  const path = `users/${uid}/generated/${sessionId}/custom-${Date.now()}-${i}.png`;
                  const file = bucket.file(path);
                  await file.save(buffer, { contentType: 'image/png' });
                  const [url] = await file.getSignedUrl({ action: 'read', expires: '01-01-2100' });
                  return url;
                } catch (err) {
                  // One image placeholder failing must never sink the whole widget -- the
                  // <img> tag is stripped below rather than left pointing at a fake/broken URL.
                  console.error(`Custom widget image generation failed for "${section.customDescription}"`, err);
                  return null;
                }
              })
            );
            urls.forEach((url, i) => {
              const placeholder = `{{IMAGE_${i + 1}}}`;
              // A failed image's placeholder is removed entirely (not left as a broken src)
              // so the widget still renders clean without a missing-image icon.
              code = url ? code.split(placeholder).join(url) : code.replace(new RegExp(`<img[^>]*src=["']${placeholder}["'][^>]*>`, 'g'), '');
            });
            sectionCustomWidgets.push({ section, code });
          } catch (err) {
            // A single custom widget failing to generate must never sink the whole build --
            // layout.ts falls back to plain headline/body for that section when code is null.
            console.error(`Custom widget generation failed for "${section.customDescription}"`, err);
            sectionCustomWidgets.push({ section, code: null });
          }
          await pushPreview(plan, sectionImages, sectionVideos, sectionProductImages, sectionCustomWidgets);
        }),
      ]);

      const injected2 = await checkForPause(sessionRef, pausesUsed);
      if (injected2) {
        await sessionRef.update({ statusMessage: 'Applying your last change...', updatedAt: Date.now() });
        // Second pause only adjusts copy at this point (images/videos are already resolved)
        // -- keeps the second pause fast rather than re-running that work too.
        plan = await generateSitePlan(client, model, prompt, complexity, injected2);
        await pushPreview(plan, sectionImages, sectionVideos, sectionProductImages, sectionCustomWidgets);
      }

      await sessionRef.update({ statusMessage: 'Assembling your site...', updatedAt: Date.now() });
      await pushPreview(plan, sectionImages, sectionVideos, sectionProductImages, sectionCustomWidgets);

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
  })
);

export const requestPause = onCall({ invoker: 'public' }, withCallableErrors('requestPause', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { sessionId } = request.data as { sessionId: string };
  const sessionRef = db.collection('users').doc(uid).collection('generationSessions').doc(sessionId);
  const session = (await sessionRef.get()).data() as GenerationSession | undefined;
  if (!session) throw new HttpsError('not-found', 'Session not found.');
  if (session.pausesUsed >= MAX_PAUSES) throw new HttpsError('failed-precondition', 'Pause limit reached for this build.');
  await sessionRef.update({ pauseRequested: true });
  return { ok: true };
}));

export const resumeGeneration = onCall({ invoker: 'public' }, async (request) => {
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
export const cancelGeneration = onCall({ invoker: 'public' }, async (request) => {
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

export const askBuildQuestion = onCall({ secrets: [openaiApiKey], invoker: 'public' }, withCallableErrors('askBuildQuestion', async (request) => {
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
}));

// Persistent, app-wide AI chat assistant -- can hold a normal conversation and also drive
// navigation/build actions for the user (see assistant.ts). Chat history itself lives in
// Firestore under the client's control (users/{uid}/assistantMessages); this function is
// stateless per call and only needs the recent turns the client sends up as `history`.
export const assistantChat = onCall({ secrets: [openaiApiKey], invoker: 'public' }, withCallableErrors('assistantChat', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { message, history, screen, images } = request.data as {
    message: string;
    history?: AssistantChatMessage[];
    screen?: string;
    images?: string[];
  };

  if (!message?.trim()) throw new HttpsError('invalid-argument', 'Missing message.');
  if (wordCount(message) > MAX_ASSISTANT_MESSAGE_WORDS) {
    throw new HttpsError('invalid-argument', `Keep messages under ${MAX_ASSISTANT_MESSAGE_WORDS} words.`);
  }
  if (images && (images.length > 5 || images.some((img) => !img.startsWith('https://')))) {
    throw new HttpsError('invalid-argument', 'Attach up to 5 uploaded images.');
  }

  const userRef = db.collection('users').doc(uid);
  // Real deep-search into this user's own build history, not a guess -- lets Spark answer
  // "is my build still running" from actual Firestore state instead of assuming, since a
  // build keeps generating server-side even after the user has navigated away from the
  // progress screen.
  const [userSnap, projectsSnap, activeSessionsSnap] = await Promise.all([
    userRef.get(),
    userRef.collection('projects').orderBy('updatedAt', 'desc').get(),
    userRef.collection('generationSessions').where('status', 'in', ['starting', 'generating', 'paused']).get(),
  ]);
  const account = userSnap.data() as UserAccount | undefined;
  const activeBuilds = activeSessionsSnap.docs.map((d) => {
    const s = d.data() as GenerationSession;
    return { pageType: s.pageType, status: s.status, statusMessage: s.statusMessage, minutesElapsed: s.minutesElapsed };
  });
  const projects = projectsSnap.docs.map((d) => {
    const p = d.data() as Project;
    return { id: p.id, name: p.name, pageType: p.pageType };
  });

  const client = createOpenAIClient(openaiApiKey.value());
  const model = MODEL_FOR_PLAN[account?.plan ?? 'free'];
  const trimmedHistory = (history ?? []).slice(-MAX_ASSISTANT_HISTORY);

  return chatWithAssistant(
    client,
    model,
    trimmedHistory,
    message.trim(),
    {
      screen: screen || 'Projects',
      credits: account?.credits ?? 0,
      plan: account?.plan ?? 'free',
      activeBuilds,
      projects,
    },
    images
  );
}));

// Mirrors the client's generateId (src/utils/id.ts) for the rare server-created ids
// (assistantExecuteAction creates elements/menu items directly, without a client round-trip).
function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Real cross-project actions Spark can take on the user's behalf (Phase 8) -- deliberately a
// small, fixed set, not free-form site editing via chat. By the time this is called, projectId
// (where relevant) is already a concrete id: either the assistant matched it confidently from
// the project list in its context, or the client asked the user to pick one via a chip picker
// after a null/ambiguous match. createProduct/editProduct are account-wide (no project
// needed) -- editProduct only resolves which product the user means and hands its id back,
// since actually rewriting a product's fields from a chat prompt without the seller seeing the
// before/after first is exactly the kind of blind mutation this feature deliberately avoids.
export const assistantExecuteAction = onCall({ invoker: 'public' }, withCallableErrors('assistantExecuteAction', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { type, projectId, productName, priceUsd, menuLabel, pageName } = request.data as {
    type: AssistantActionType;
    projectId?: string | null;
    productName?: string | null;
    priceUsd?: number | null;
    menuLabel?: string | null;
    pageName?: string | null;
  };

  const productsRef = db.collection('users').doc(uid).collection('products');

  if (type === 'createProduct') {
    const now = Date.now();
    const product: CatalogProduct = {
      id: productsRef.doc().id,
      name: (productName ?? '').trim() || 'New product',
      description: '',
      priceUsd: priceUsd && priceUsd > 0 ? priceUsd : 10,
      compareAtPriceUsd: null,
      costUsd: null,
      images: [],
      trackInventory: false,
      initialStock: null,
      inStock: true,
      saleType: 'product',
      fulfillment: 'pickup',
      serviceDurationMinutes: null,
      variantOptions: [],
      variants: [],
      createdAt: now,
      updatedAt: now,
    };
    await productsRef.doc(product.id).set(product);
    return { ok: true, productId: product.id };
  }

  if (type === 'editProduct') {
    if (!productName?.trim()) throw new HttpsError('invalid-argument', 'Missing productName.');
    const needle = productName.trim().toLowerCase();
    const snap = await productsRef.get();
    const match = snap.docs.map((d) => d.data() as CatalogProduct).find((p) => p.name.toLowerCase().includes(needle));
    if (!match) throw new HttpsError('not-found', `Couldn't find a product matching "${productName}".`);
    return { ok: true, productId: match.id };
  }

  // Every remaining action type mutates a specific project.
  if (!projectId) throw new HttpsError('invalid-argument', 'Missing projectId.');
  const projectRef = db.collection('users').doc(uid).collection('projects').doc(projectId);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) throw new HttpsError('not-found', 'Project not found.');
  const project = projectSnap.data() as Project;

  if (type === 'publishProject') {
    return doPublishProject(uid, projectId);
  }

  if (type === 'insertProductOnPage') {
    if (!productName?.trim()) throw new HttpsError('invalid-argument', 'Missing productName.');
    const needle = productName.trim().toLowerCase();
    const productsSnap = await productsRef.get();
    const product = productsSnap.docs.map((d) => d.data() as CatalogProduct).find((p) => p.name.toLowerCase().includes(needle));
    if (!product) throw new HttpsError('not-found', `Couldn't find a product matching "${productName}".`);

    // Same "stack below the lowest existing element, extending canvas height if needed"
    // placement as the editor's own catalog-insert flow (EditorScreen.tsx) -- so an assistant-
    // inserted product never lands on top of what's already on the page.
    const place = (elements: { x: number; y: number; width: number; height: number }[]) => {
      const width = 180;
      const height = 220;
      const lowestBottom = elements.reduce((max, el) => Math.max(max, el.y + el.height), 0);
      const y = lowestBottom + (elements.length > 0 ? 24 : 32);
      return { width, height, y, requiredHeight: y + height + 40 };
    };

    if (project.pages && project.pages.length > 0) {
      const pageNeedle = pageName?.trim().toLowerCase();
      const targetPage = (pageNeedle ? project.pages.find((p) => p.name.toLowerCase().includes(pageNeedle)) : null) ?? project.pages[0];
      const { width, height, y, requiredHeight } = place(targetPage.elements);
      const newEl: ProductElement = { id: randomId('el'), type: 'product', productId: product.id, x: (project.canvasSize.width - width) / 2, y, width, height, zIndex: 5 };
      const pages = project.pages.map((p) => (p.id === targetPage.id ? { ...p, elements: [...p.elements, newEl] } : p));
      await projectRef.update({
        pages,
        elements: pages[0].elements,
        backgroundColor: pages[0].backgroundColor,
        backgroundGradient: pages[0].backgroundGradient ?? null,
        canvasSize: requiredHeight > project.canvasSize.height ? { ...project.canvasSize, height: requiredHeight } : project.canvasSize,
        updatedAt: Date.now(),
      });
    } else {
      const { width, height, y, requiredHeight } = place(project.elements);
      const newEl: ProductElement = { id: randomId('el'), type: 'product', productId: product.id, x: (project.canvasSize.width - width) / 2, y, width, height, zIndex: 5 };
      await projectRef.update({
        elements: [...project.elements, newEl],
        canvasSize: requiredHeight > project.canvasSize.height ? { ...project.canvasSize, height: requiredHeight } : project.canvasSize,
        updatedAt: Date.now(),
      });
    }
    return { ok: true, projectId, productId: product.id };
  }

  if (type === 'addMenuItem') {
    if (!menuLabel?.trim()) throw new HttpsError('invalid-argument', 'Missing menuLabel.');
    const menu = project.menu ?? { enabled: true, items: [] };
    const pageNeedle = pageName?.trim().toLowerCase();

    let target: MenuItemTarget;
    if (project.pages && project.pages.length > 0) {
      const page = (pageNeedle ? project.pages.find((p) => p.name.toLowerCase().includes(pageNeedle)) : null) ?? project.pages[0];
      target = { type: 'page', pageId: page.id };
    } else {
      const policy = (project.policies ?? []).find((p) => pageNeedle && p.title.toLowerCase().includes(pageNeedle));
      target = policy ? { type: 'policy', policyId: policy.id } : { type: 'url', url: '/' };
    }

    const item: MenuItem = { id: randomId('menu'), label: menuLabel.trim(), target };
    await projectRef.update({ menu: { ...menu, items: [...menu.items, item] }, updatedAt: Date.now() });
    return { ok: true, projectId };
  }

  throw new HttpsError('invalid-argument', 'Unknown action type.');
}));

// Moves a locally-picked photo (only readable by the device, via a file:// URI) into
// Storage so it has a real https:// URL a published static page can actually load. The
// client reads the file itself (Admin SDK can't reach a device's local filesystem) and
// sends the bytes up as base64 -- mirrors the same signed-URL pattern already used for
// AI-generated images in startGeneration above.
export const uploadProjectImage = onCall({ memory: '256MiB', invoker: 'public' }, withCallableErrors('uploadProjectImage', async (request) => {
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
}));

// Removes or replaces an image element's background with AI (see editImageBackground in
// openai.ts) -- reuses the same OpenAI key/model already paying for site imagery, so this
// needs no new vendor integration. Costs a flat, small credit amount (much less than a full
// site build) since it's one image-edit call, refunded automatically if the edit fails.
export const editImageBackground = onCall({ secrets: [openaiApiKey], timeoutSeconds: 120, memory: '512MiB', invoker: 'public' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { base64, mode, prompt } = request.data as { base64: string; mode: 'remove' | 'change'; prompt?: string };
  if (!base64) throw new HttpsError('invalid-argument', 'Missing image data.');
  if (mode !== 'remove' && mode !== 'change') throw new HttpsError('invalid-argument', 'Invalid mode.');
  if (mode === 'change' && !prompt?.trim()) throw new HttpsError('invalid-argument', 'Describe the new background.');

  const inputBuffer = Buffer.from(base64, 'base64');
  if (inputBuffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new HttpsError('invalid-argument', 'Image is too large (max 8MB).');
  }

  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const account = snap.data() as UserAccount | undefined;
    if ((account?.credits ?? 0) < BACKGROUND_EDIT_CREDIT_COST) {
      throw new HttpsError('resource-exhausted', 'needs-subscription');
    }
    tx.update(userRef, { credits: FieldValue.increment(-BACKGROUND_EDIT_CREDIT_COST) });
  });

  let resultBuffer: Buffer;
  try {
    const client = createOpenAIClient(openaiApiKey.value());
    resultBuffer = await editImageBackgroundWithAI(client, inputBuffer, mode, prompt);
  } catch (err) {
    await userRef.update({ credits: FieldValue.increment(BACKGROUND_EDIT_CREDIT_COST) });
    throw new HttpsError('internal', 'Could not edit the image. Try again.');
  }

  const path = `users/${uid}/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-bg.png`;
  const bucket = getStorage().bucket();
  const file = bucket.file(path);
  await file.save(resultBuffer, { contentType: 'image/png' });
  const [url] = await file.getSignedUrl({ action: 'read', expires: '01-01-2100' });

  return { url };
});

// Manual (non-AI-build) path for adding a Custom Widget: the seller types a description
// directly in the inspector and this generates real, bespoke HTML/CSS/JS for it on demand --
// same underlying generateCustomWidgetCode + image-placeholder pipeline startGeneration uses
// for AI-builder "custom" sections, just triggered one widget at a time instead of as part
// of a whole-site build.
export const generateCustomWidget = onCall({ secrets: [openaiApiKey], timeoutSeconds: 180, memory: '512MiB', invoker: 'public' }, withCallableErrors('generateCustomWidget', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { description, siteName, accentColor, textColor } = request.data as {
    description: string;
    siteName?: string;
    accentColor?: string;
    textColor?: string;
  };
  if (!description?.trim()) throw new HttpsError('invalid-argument', 'Describe what you want built.');

  const userRef = db.collection('users').doc(uid);
  const account = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const acc = snap.data() as UserAccount | undefined;
    if ((acc?.credits ?? 0) < CUSTOM_WIDGET_CREDIT_COST) {
      throw new HttpsError('resource-exhausted', 'needs-subscription');
    }
    tx.update(userRef, { credits: FieldValue.increment(-CUSTOM_WIDGET_CREDIT_COST) });
    return acc as UserAccount;
  });

  try {
    const client = createOpenAIClient(openaiApiKey.value());
    const model = MODEL_FOR_PLAN[account.plan];
    const widget = await generateCustomWidgetCode(
      client,
      model,
      description.trim(),
      siteName || 'this site',
      accentColor || '#2563EB',
      textColor || '#0F172A'
    );

    let code = widget.html;
    const bucket = getStorage().bucket();
    const urls = await Promise.all(
      widget.imagePrompts.map(async (imgPrompt, i) => {
        try {
          const buffer = await generateImage(client, imgPrompt, 'high');
          const path = `users/${uid}/generated/manual-widget/${Date.now()}-${i}.png`;
          const file = bucket.file(path);
          await file.save(buffer, { contentType: 'image/png' });
          const [url] = await file.getSignedUrl({ action: 'read', expires: '01-01-2100' });
          return url;
        } catch (err) {
          console.error(`Custom widget image generation failed for "${description}"`, err);
          return null;
        }
      })
    );
    urls.forEach((url, i) => {
      const placeholder = `{{IMAGE_${i + 1}}}`;
      code = url ? code.split(placeholder).join(url) : code.replace(new RegExp(`<img[^>]*src=["']${placeholder}["'][^>]*>`, 'g'), '');
    });

    return { code };
  } catch (err) {
    await userRef.update({ credits: FieldValue.increment(CUSTOM_WIDGET_CREDIT_COST) });
    console.error('generateCustomWidget failed', err);
    throw new HttpsError('internal', 'Could not build that feature. Try again.');
  }
}));

// Video/audio clips are typically far too large for the base64-over-onCall approach
// uploadProjectImage uses above (onCall request bodies are capped well below what even a
// short clip needs) -- instead this hands the client a short-lived signed PUT URL and lets
// it upload the bytes straight to Storage, then returns a long-lived signed GET URL for
// later reference (rendering in the canvas, publishing, etc.).
export const createUploadUrl = onCall({ invoker: 'public' }, withCallableErrors('createUploadUrl', async (request) => {
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
}));

// The real publish logic, factored out so both the publishProject callable and
// assistantExecuteAction's publishProject action (Spark Assistant real actions) share the
// exact same code path instead of the assistant reimplementing/duplicating it.
async function doPublishProject(uid: string, projectId: string): Promise<{ slug: string; url: string }> {
  const projectRef = db.collection('users').doc(uid).collection('projects').doc(projectId);
  const snap = await projectRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Project not found.');
  const project = snap.data() as Project;

  // A manually-built multi-page website's real content lives in `pages`, not the top-level
  // `elements` mirror -- check/publish across every page it actually has.
  const allElementsAcrossPages = project.pages && project.pages.length > 0 ? project.pages.flatMap((p) => p.elements) : project.elements;

  // Product photos no longer need a check here -- ProductEditScreen uploads them immediately
  // (see uploadLocalImage), unlike a canvas element's image/video/slideshow media, which can
  // still be mid-upload at publish time.
  const hasLocalMedia = allElementsAcrossPages.some(
    (el) =>
      (el.type === 'image' && !!el.uri && !el.uri.startsWith('http')) ||
      (el.type === 'slideshow' && el.images.some((u) => !u.startsWith('http'))) ||
      (el.type === 'video' && ((!!el.uri && !el.uri.startsWith('http')) || (!!el.audioUri && !el.audioUri.startsWith('http'))))
  );
  if (hasLocalMedia) {
    throw new HttpsError('failed-precondition', 'Some media is still uploading — try publishing again in a moment.');
  }

  // Pre-fetch every product this project's elements reference, once, so every page render
  // (and syncStoreInventory below) resolves the same live catalog snapshot instead of each
  // doing its own redundant Firestore reads.
  const productElementsForPublish = allElementsAcrossPages.filter((el): el is ProductElement => el.type === 'product');
  const catalogEntries = await Promise.all(
    [...new Map(productElementsForPublish.map((el) => [el.productId, el])).values()].map(async (el) => [el.productId, await resolveCatalogProduct(uid, el)] as const)
  );
  const catalogProducts: Record<string, CatalogProduct> = Object.fromEntries(catalogEntries);

  // A site with product elements can't go live until the seller can actually get paid --
  // buyers would otherwise hit a real checkout that has nowhere to send the money. Building
  // and editing products is always allowed; only *publishing* them is blocked here, and only
  // for projects that actually contain a product element.
  const hasProducts = allElementsAcrossPages.some((el) => el.type === 'product');
  const seller: SellerAccount | undefined = hasProducts ? ((await sellerAccountRef(uid).get()).data() as SellerAccount | undefined) : undefined;
  if (hasProducts && !seller?.chargesEnabled) {
    throw new HttpsError(
      'failed-precondition',
      'Set up payouts before publishing — this site has products for sale, so Stripe payouts must be connected first. Go to Seller Account to connect Stripe.'
    );
  }
  const currency = seller?.currency ?? 'usd';

  const slug = project.publishSlug ?? (await uniqueSlug(db, slugify(project.name)));

  const site: PublishedSite = { uid, projectId, html: '', updatedAt: Date.now() };
  const extraPagesHtml: Record<string, string> = {};
  const policies = project.policies ?? [];
  const headerOpts = { logoUrl: project.logoUrl, logoHeightPx: project.logoHeightPx, logoFit: project.logoFit, headerDividerColor: project.headerDividerColor };
  for (const policy of policies) {
    extraPagesHtml[policyHref(policy.id).replace(/^\//, '')] = renderPolicyPageHtml(project.name, policy, project.menu, project.pages, policies, headerOpts, project.elements);
  }
  if (policies.length > 0) {
    extraPagesHtml[POLICIES_INDEX_HREF.replace(/^\//, '')] = renderPoliciesIndexHtml(project.name, policies, project.menu, project.pages, headerOpts, project.elements);
  }

  if (project.pages && project.pages.length > 0) {
    const pagesHtml: Record<string, string> = { ...extraPagesHtml };
    for (let i = 0; i < project.pages.length; i++) {
      const page = project.pages[i];
      const pageProject: Project = { ...project, elements: page.elements, backgroundColor: page.backgroundColor, backgroundGradient: page.backgroundGradient };
      // "Built by SiteSpark" only ever appears once for the whole site -- on the very last
      // page -- never once per page, so a 3-page site doesn't show it 3 times.
      const isLastPage = i === project.pages.length - 1;
      pagesHtml[page.slug] = renderProjectHtml(
        pageProject,
        slug,
        STORE_CHECKOUT_URL,
        REPORT_SITE_URL,
        PRODUCT_STOCK_URL,
        DISCOUNT_VALIDATE_URL,
        ORDERS_BY_EMAIL_URL,
        DISCOUNT_ANNOUNCEMENT_URL,
        renderPageNavHtml(project.pages, page.slug),
        isLastPage,
        currency,
        catalogProducts
      );
    }
    site.pages = pagesHtml;
    site.html = pagesHtml[project.pages[0].slug];
  } else {
    site.html = renderProjectHtml(project, slug, STORE_CHECKOUT_URL, REPORT_SITE_URL, PRODUCT_STOCK_URL, DISCOUNT_VALIDATE_URL, ORDERS_BY_EMAIL_URL, DISCOUNT_ANNOUNCEMENT_URL, '', true, currency, catalogProducts);
    if (Object.keys(extraPagesHtml).length > 0) site.pages = extraPagesHtml;
  }

  await db.collection('publishedSites').doc(slug).set(site);
  await projectRef.update({ publishSlug: slug, publishedAt: Date.now(), updatedAt: Date.now() });
  await syncStoreInventory(uid, projectId, slug, project, catalogProducts);

  const url = project.customDomain && project.domainStatus === 'active'
    ? `https://${project.customDomain}`
    : `https://${slug}.${PRODUCT_DOMAIN}`;
  return { slug, url };
}

// Publishes a project as a real, publicly-reachable static page -- servePublishedSite
// below answers for it at https://{slug}.buildsitespark.com by default (and at any
// custom domain connected via connectDomain).
export const publishProject = onCall({ invoker: 'public' }, withCallableErrors('publishProject', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { projectId } = request.data as { projectId: string };
  if (!projectId) throw new HttpsError('invalid-argument', 'Missing projectId.');

  return doPublishProject(uid, projectId);
}));

// Mirrors a project's ProductElements into storeInventory/{slug}/products/{productId} --
// the authoritative source createStoreCheckout validates against. Never overwrites
// stockQuantity on an existing doc (only real orders or the seller directly editing it
// change that after the first publish) so republishing a project never silently restocks
// or resets what a seller already sold.
// Mirrors the client's variantLabelFor (src/utils/productVariants.ts) -- e.g. options
// [{name:"Size"},{name:"Color"}] + optionValues ["M","Red"] -> "Size: M, Color: Red".
function variantLabelFor(options: ProductVariantOption[], optionValues: string[]): string {
  return options.map((opt, i) => `${opt.name}: ${optionValues[i]}`).join(', ');
}

// Mirrors the client's resolveProductView (src/utils/resolveProduct.ts): a ProductElement only
// ever stores a productId now, so anything that needs real product content (name/price/images/
// etc.) resolves it against the live catalog doc, falling back to whatever inline fields might
// still be sitting on the element for data stored before the catalog existed.
async function resolveCatalogProduct(uid: string, el: ProductElement): Promise<CatalogProduct> {
  const doc = await db.collection('users').doc(uid).collection('products').doc(el.productId).get();
  if (doc.exists) return doc.data() as CatalogProduct;
  const legacy = el as unknown as Partial<CatalogProduct>;
  return {
    id: el.productId,
    name: legacy.name ?? 'Untitled product',
    description: legacy.description ?? '',
    priceUsd: legacy.priceUsd ?? 0,
    compareAtPriceUsd: legacy.compareAtPriceUsd ?? null,
    costUsd: legacy.costUsd ?? null,
    images: legacy.images ?? [],
    trackInventory: legacy.trackInventory ?? false,
    initialStock: legacy.initialStock ?? null,
    inStock: legacy.inStock ?? true,
    saleType: legacy.saleType ?? 'product',
    fulfillment: legacy.fulfillment ?? 'pickup',
    serviceDurationMinutes: legacy.serviceDurationMinutes ?? null,
    variantOptions: legacy.variantOptions ?? [],
    variants: legacy.variants ?? [],
    createdAt: legacy.createdAt ?? 0,
    updatedAt: legacy.updatedAt ?? 0,
  };
}

// `catalogProducts`, if passed, must already have an entry for every element's productId
// (see publishProject, which pre-fetches the same map for rendering) -- any element whose id
// is missing from it falls back to resolveCatalogProduct's own legacy-element handling.
async function syncStoreInventory(uid: string, projectId: string, slug: string, project: Project, catalogProducts?: Record<string, CatalogProduct>): Promise<void> {
  const allElements = project.pages && project.pages.length > 0 ? project.pages.flatMap((p) => p.elements) : project.elements;
  const productElements = allElements.filter((el): el is ProductElement => el.type === 'product');
  if (productElements.length === 0) return;

  const refs = productElements.map((el) => db.collection('storeInventory').doc(slug).collection('products').doc(el.productId));
  const [existingDocs, products] = await Promise.all([
    Promise.all(refs.map((ref) => ref.get())),
    Promise.all(productElements.map((el) => catalogProducts?.[el.productId] ?? resolveCatalogProduct(uid, el))),
  ]);

  const batch = db.batch();
  productElements.forEach((el, i) => {
    const product = products[i];
    const existing = existingDocs[i];
    const existingItem = existing.exists ? (existing.data() as StoreInventoryItem) : undefined;
    const stockQuantity = existingItem
      ? existingItem.stockQuantity
      : product.trackInventory
        ? (product.initialStock ?? 0)
        : null;

    // Same never-overwritten-by-republish rule as the top-level stockQuantity above, but
    // per variant combination (keyed by ProductVariant.key): a combination that already has
    // an inventory doc keeps its real, possibly-already-sold-against stock count; only a
    // brand new combination (e.g. a seller just added a new Size value) gets seeded from
    // initialStock.
    const existingVariantsByKey = new Map((existingItem?.variants ?? []).map((v) => [v.key, v]));
    const variants = product.variants.map((v) => {
      const prior = existingVariantsByKey.get(v.key);
      return {
        key: v.key,
        optionValues: v.optionValues,
        priceUsd: v.priceUsd,
        sku: v.sku,
        stockQuantity: prior ? prior.stockQuantity : product.trackInventory ? (v.initialStock ?? 0) : null,
      };
    });

    const item: StoreInventoryItem = {
      productId: el.productId,
      sellerUid: uid,
      projectId,
      slug,
      name: product.name,
      description: product.description,
      priceUsd: product.priceUsd,
      images: product.images,
      trackInventory: product.trackInventory,
      stockQuantity,
      inStock: product.inStock,
      saleType: product.saleType,
      fulfillment: product.fulfillment,
      serviceDurationMinutes: product.serviceDurationMinutes,
      variantOptions: product.variantOptions,
      variants,
      updatedAt: Date.now(),
    };
    batch.set(refs[i], item);
  });
  await batch.commit();
}

export const unpublishProject = onCall({ invoker: 'public' }, withCallableErrors('unpublishProject', async (request) => {
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
}));

// Real HTML files for a "download your whole build" ZIP export -- publishedSites is
// Admin-SDK-only (see firestore.rules), so the client can't read it directly even for its
// own project; this callable is the one sanctioned way to hand that content back to its
// owner. Only ever returns a project's OWN rendered output, and only once it's actually
// published (an unpublished project has no rendered HTML to hand back yet).
export const getPublishedSiteExport = onCall({ invoker: 'public' }, withCallableErrors('getPublishedSiteExport', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { projectId } = request.data as { projectId: string };
  if (!projectId) throw new HttpsError('invalid-argument', 'Missing projectId.');

  const projectRef = db.collection('users').doc(uid).collection('projects').doc(projectId);
  const project = (await projectRef.get()).data() as Project | undefined;
  if (!project) throw new HttpsError('not-found', 'Project not found.');
  if (!project.publishSlug) throw new HttpsError('failed-precondition', 'Publish this site before downloading it.');

  const siteDoc = await db.collection('publishedSites').doc(project.publishSlug).get();
  const site = siteDoc.data() as PublishedSite | undefined;
  if (!site) throw new HttpsError('not-found', 'Published site content not found -- try republishing.');

  const pages: Record<string, string> = site.pages ? { ...site.pages } : {};
  if (!pages['']) pages[''] = site.html;

  return { siteName: project.name, slug: project.publishSlug, pages };
}));

// Real, immediate stock/availability update for a product -- separate from just editing it in
// the catalog (which, for a product used across multiple sites, still needs each site's own
// storeInventory doc pushed). This writes the catalog doc (the one place a product's real
// inStock/initialStock live now) AND, if the site is already published, the live storeInventory
// doc buyers are actually checking out against, so a seller flipping "in stock" off or
// correcting a quantity takes effect right away without a full republish.
export const updateProductStock = onCall({ invoker: 'public' }, withCallableErrors('updateProductStock', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { projectId, elementId, inStock, stockQuantity } = request.data as {
    projectId: string;
    elementId: string;
    inStock: boolean;
    stockQuantity: number | null;
  };
  if (!projectId || !elementId) throw new HttpsError('invalid-argument', 'Missing projectId or elementId.');

  const projectRef = db.collection('users').doc(uid).collection('projects').doc(projectId);
  const snap = await projectRef.get();
  const project = snap.data() as Project | undefined;
  if (!project) throw new HttpsError('not-found', 'Project not found.');

  const allElements = project.pages && project.pages.length > 0 ? project.pages.flatMap((p) => p.elements) : project.elements;
  const found = allElements.find((el): el is ProductElement => el.id === elementId && el.type === 'product');
  const productId = found?.productId ?? null;
  if (!productId) throw new HttpsError('not-found', 'Product element not found.');

  await db.collection('users').doc(uid).collection('products').doc(productId)
    .set({ inStock, initialStock: stockQuantity, updatedAt: Date.now() }, { merge: true });

  if (project.publishSlug) {
    const invRef = db.collection('storeInventory').doc(project.publishSlug).collection('products').doc(productId);
    const invDoc = await invRef.get();
    if (invDoc.exists) {
      await invRef.set({ inStock, stockQuantity, updatedAt: Date.now() }, { merge: true });
    }
  }

  return { ok: true };
}));

// Public, unauthenticated, read-only -- lets a published page show the buyer real live
// stock/availability instead of whatever number was baked in at publish time (which goes
// stale the moment an order comes in). Called client-side by a small script in the
// product's rendered HTML (see renderElement's 'product' case in siteHtml.ts).
export const getProductStock = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  const slug = (req.query.slug as string) ?? '';
  const productId = (req.query.productId as string) ?? '';
  if (!slug || !productId) {
    res.status(400).json({ error: 'Missing slug or productId.' });
    return;
  }
  const doc = await db.collection('storeInventory').doc(slug).collection('products').doc(productId).get();
  if (!doc.exists) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  const item = doc.data() as StoreInventoryItem;
  res.set('Cache-Control', 'no-store');

  // Cosmetic fields (name/description/images) are re-fetched live from the seller's catalog doc
  // so an edit made from the standalone Products screen shows up on an already-published page
  // without a republish. Price/stock deliberately stay sourced from this storeInventory
  // snapshot -- checkout validates against this same doc, so pulling price live from the
  // (separately editable) catalog here could show a buyer one price and charge them another.
  let name = item.name;
  let description = item.description;
  let images = item.images;
  const catalogDoc = await db.collection('users').doc(item.sellerUid).collection('products').doc(productId).get();
  if (catalogDoc.exists) {
    const catalogProduct = catalogDoc.data() as CatalogProduct;
    name = catalogProduct.name;
    description = catalogProduct.description;
    images = catalogProduct.images;
  }

  // variants/variantOptions are included wholesale (not just the requested product's overall
  // stock) so the published page can build its size/color picker and show the right
  // price/stock for whichever combination a buyer selects, without a round trip per option.
  res.status(200).json({
    name,
    description,
    images,
    trackInventory: item.trackInventory,
    stockQuantity: item.stockQuantity,
    inStock: item.inStock !== false,
    priceUsd: item.priceUsd,
    variantOptions: item.variantOptions,
    variants: item.variants,
  });
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
export const servePublishedSite = onRequest({ invoker: 'public' }, async (req, res) => {
  const hostname = (req.hostname || '').toLowerCase();
  const isDefaultHostingDomain = hostname === HOSTING_DOMAIN || hostname.endsWith('.web.app') || hostname.endsWith('.firebaseapp.com');
  const isBareProductDomain = hostname === PRODUCT_DOMAIN || hostname === `www.${PRODUCT_DOMAIN}`;

  let slug: string | null = null;
  // The sub-path *within* a resolved site (e.g. "/about") -- distinct from the slug
  // resolution above, since the legacy /s/{slug} form has the page path nested after the
  // slug segment rather than being the whole request path. Used below to pick which of a
  // multi-page website's rendered pages to serve (see Project.pages / publishProject).
  let pagePath = req.path;

  if (hostname.endsWith(`.${PRODUCT_DOMAIN}`) && !isBareProductDomain) {
    slug = hostname.slice(0, hostname.length - PRODUCT_DOMAIN.length - 1);
  } else if (isDefaultHostingDomain && req.path.startsWith('/s/')) {
    const rest = req.path.replace(/^\/s\//, '');
    const slashIndex = rest.indexOf('/');
    if (slashIndex === -1) {
      slug = rest.replace(/\/$/, '') || null;
      pagePath = '/';
    } else {
      slug = rest.slice(0, slashIndex) || null;
      pagePath = rest.slice(slashIndex);
    }
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
  // A manually-built multi-page website keys every real page by its slug segment ('' for
  // Home) in `site.pages`; a single-page project has no `site.pages` entry for Home at all
  // (its Home is just `site.html`), but MAY still have policy/policies-index sub-pages
  // stashed there (see publishProject) -- so a non-root path always checks `site.pages`
  // first regardless of whether this is "really" a multi-page site, and only root falls
  // back to `site.html` when there's no explicit '' entry.
  const pageSlug = pagePath.replace(/^\/|\/$/g, '');
  if (pageSlug) {
    const pageHtml = site.pages?.[pageSlug];
    if (!pageHtml) {
      res.status(404).send('Page not found.');
      return;
    }
    res.status(200).send(pageHtml);
    return;
  }
  if (site.pages && site.pages[''] !== undefined) {
    res.status(200).send(site.pages['']);
    return;
  }
  res.status(200).send(site.html);
});

// Attaches a domain the user already owns to their published project via the real
// Firebase Hosting Domains API (see hostingApi.ts) -- requires the project to already be
// published, and requires the Cloud Functions service account to have the "Firebase
// Hosting Admin" IAM role (see ROADMAP.md).
export const connectDomain = onCall({ invoker: 'public' }, withCallableErrors('connectDomain', async (request) => {
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
}));

export const getDomainStatus = onCall({ invoker: 'public' }, withCallableErrors('getDomainStatus', async (request) => {
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
}));

export const disconnectDomain = onCall({ invoker: 'public' }, withCallableErrors('disconnectDomain', async (request) => {
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
}));

// Real domain search: checks availability across popular TLDs (or the exact domain if the
// query already includes one) and prices each available result via Namecheap's real
// pricing API, marked up by DOMAIN_MARKUP_USD.
export const checkDomainAvailability = onCall(
  { secrets: [namecheapApiUser, namecheapApiKey, namecheapUserName], ...NAMECHEAP_VPC_OPTS, invoker: 'public' },
  withCallableErrors('checkDomainAvailability', async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { query } = request.data as { query: string };
    if (!query?.trim()) throw new HttpsError('invalid-argument', 'Missing search query.');

    const creds = { apiUser: namecheapApiUser.value(), apiKey: namecheapApiKey.value(), userName: namecheapUserName.value() };
    const base = query.trim().toLowerCase().replace(/[^a-z0-9.-]/g, '');
    const candidates = base.includes('.') ? [base] : POPULAR_TLDS.map((tld) => `${base}.${tld}`);

    const availability = await checkAvailability(creds, candidates);
    // Price every candidate, available or not -- pricing is per-TLD (or a real premium quote
    // Namecheap already returned), never dependent on that exact domain being free, so an
    // unavailable result can still show a real (crossed-out) price instead of being dropped
    // silently. Only a genuinely un-priceable TLD falls back to priceUsd: null.
    const priced = await Promise.all(
      availability.map(async (a) => {
        const basePrice = a.isPremium ? a.premiumPriceUsd : await getRegistrationPriceUsd(creds, a.domain);
        return {
          domain: a.domain,
          available: a.available,
          priceUsd: basePrice != null ? Math.round((basePrice + DOMAIN_MARKUP_USD) * 100) / 100 : null,
        };
      })
    );

    return { results: priced };
  })
);

// Creates a real Stripe Checkout session for a domain purchase -- payment happens on
// Stripe's own hosted page (opened in an in-app browser client-side), not native IAP,
// since a registered domain is a real-world service/good, not digital app content.
export const createDomainCheckout = onCall(
  { secrets: [namecheapApiUser, namecheapApiKey, namecheapUserName, stripeSecretKey], ...NAMECHEAP_VPC_OPTS, invoker: 'public' },
  withCallableErrors('createDomainCheckout', async (request) => {
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
  })
);

// Real Stripe billing for the web app -- Apple IAP has no browser-tab equivalent, so
// buying a subscription or credit pack from app.buildsitespark.com goes through Stripe
// Checkout instead. Deliberately only reachable from the web app itself (the native iOS
// app's SubscriptionScreen still only ever calls the Apple IAP path in src/services/iap.ts)
// so this never becomes an App Store Review Guideline 3.1.1 steering concern -- nothing in
// the iOS binary links to or mentions this checkout.
export const createWebBillingCheckout = onCall({ secrets: [stripeSecretKey], invoker: 'public' }, withCallableErrors('createWebBillingCheckout', async (request) => {
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
}));

// A real self-service page (hosted entirely by Stripe) where a web subscriber can update
// their card, view invoices, or cancel -- the honest equivalent of "manage your Apple ID
// subscriptions" for the Stripe billing path, so SiteSpark doesn't need to build its own
// cancel/update-card UI. Only ever has something to open if this account has actually paid
// for a web subscription at least once (see handleWebSubscriptionStarted's stripeCustomerId).
// Lets a signed-in user verify their own push notification setup end-to-end (permission
// grant -> token registration -> Expo's relay -> a real device) without waiting for a real
// order, booking, or billing event to naturally trigger one.
export const sendTestPushNotification = onCall({ secrets: [vapidPrivateKey], invoker: 'public' }, withCallableErrors('sendTestPushNotification', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const tokensSnap = await db.collection('users').doc(uid).collection('pushTokens').get();
  if (tokensSnap.empty) {
    throw new HttpsError(
      'failed-precondition',
      "No push token is registered for this device yet -- make sure you allowed notifications when asked (Settings > SiteSpark > Notifications on iOS), then sign out and back in and try again."
    );
  }

  await sendPushNotification(uid, 'Test notification', 'If you see this, push notifications are working!', { test: true }, vapidPrivateKey.value());
  return { tokenCount: tokensSnap.size };
}));

export const createStripeBillingPortalSession = onCall({ secrets: [stripeSecretKey], invoker: 'public' }, withCallableErrors('createStripeBillingPortalSession', async (request) => {
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
}));

// Public Stripe webhook -- verifies the signature, then (idempotently, since Stripe
// retries webhook deliveries) registers the domain for real via Namecheap once payment
// is confirmed. Registration only ever happens from here, never from the client, so a
// domain can't be registered without payment actually clearing first.
export const stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret, namecheapApiUser, namecheapApiKey, namecheapUserName, resendApiKey, vapidPrivateKey], ...NAMECHEAP_VPC_OPTS, invoker: 'public' },
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
      "We couldn't process your subscription renewal — your site will go offline in a few hours if this isn't resolved.",
      undefined,
      vapidPrivateKey.value()
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
  const shippingFeeUsd = session.metadata?.shippingFeeUsd ? Number(session.metadata.shippingFeeUsd) : 0;
  const currency = session.metadata?.currency || 'usd';
  const discountCode = session.metadata?.discountCode ?? null;
  const discountAmountUsd = session.metadata?.discountAmountUsd ? Number(session.metadata.discountAmountUsd) : 0;
  const discountedTotalUsd = Math.round((subtotalUsd + shippingFeeUsd - discountAmountUsd) * 100) / 100;
  const platformFeeUsd = Math.round(discountedTotalUsd * (PLATFORM_FEE_PERCENT / 100) * 100) / 100;
  const sellerNetUsd = Math.round((discountedTotalUsd - platformFeeUsd) * 100) / 100;

  const inventoryRefs = items.map((item) => db.collection('storeInventory').doc(slug).collection('products').doc(item.productId));
  const discountRef = discountCode ? discountCodeRef(sellerUid, discountCode) : null;
  let projectId = '';
  await db.runTransaction(async (tx) => {
    const docs = await Promise.all(inventoryRefs.map((ref) => tx.get(ref)));
    // Reads must precede writes in a Firestore transaction, so the discount code's current
    // redemptionCount is read here (even though it's only used after the loop below).
    const discountDoc = discountRef ? await tx.get(discountRef) : null;
    docs.forEach((doc, i) => {
      if (!doc.exists) return;
      const data = doc.data() as StoreInventoryItem;
      if (i === 0) projectId = data.projectId;
      if (!data.trackInventory) return;

      const variantKey = items[i].variantKey;
      if (variantKey) {
        // Decrement only the specific combination that was bought -- every other
        // combination's stock is untouched, same as before variants existed.
        const variants = data.variants.map((v) =>
          v.key === variantKey && v.stockQuantity != null
            ? { ...v, stockQuantity: Math.max(0, v.stockQuantity - items[i].quantity) }
            : v
        );
        tx.update(inventoryRefs[i], { variants });
      } else if (data.stockQuantity != null) {
        tx.update(inventoryRefs[i], { stockQuantity: Math.max(0, data.stockQuantity - items[i].quantity) });
      }
    });
    if (discountRef && discountDoc?.exists) {
      tx.update(discountRef, { redemptionCount: FieldValue.increment(1) });
    }
  });

  const order: StoreOrder = {
    id: session.id,
    sellerUid,
    slug,
    projectId,
    buyerEmail: session.customer_details?.email ?? null,
    buyerEmailLower: session.customer_details?.email?.trim().toLowerCase() ?? null,
    buyerName: session.customer_details?.name ?? null,
    items,
    subtotalUsd,
    shippingFeeUsd,
    currency,
    discountCode,
    discountAmountUsd,
    platformFeeUsd,
    sellerNetUsd,
    stripeSessionId: session.id,
    bookingDetails,
    status: 'paid',
    fulfillmentStatus: 'unfulfilled',
    trackingCarrier: null,
    trackingNumber: null,
    trackingUpdatedAt: null,
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
    bookingDetails ? `${bookingDetails.preferredDate} at ${bookingDetails.preferredTime} — $${sellerNetUsd.toFixed(2)} after fees.` : `$${sellerNetUsd.toFixed(2)} after fees.`,
    undefined,
    vapidPrivateKey.value()
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
  { secrets: [namecheapApiUser, namecheapApiKey, namecheapUserName], ...NAMECHEAP_VPC_OPTS, invoker: 'public' },
  withCallableErrors('startDomainTransfer', async (request) => {
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
  })
);

export const getDomainTransferStatus = onCall(
  { secrets: [namecheapApiUser, namecheapApiKey, namecheapUserName], ...NAMECHEAP_VPC_OPTS, invoker: 'public' },
  withCallableErrors('getDomainTransferStatus', async (request) => {
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
  })
);

// Confirms this uid actually owns a domain that was registered THROUGH SiteSpark's own
// Namecheap account before letting them touch its registrar lock -- a domain merely
// "connected" (owned at a different registrar entirely) isn't ours to lock/unlock, and
// Namecheap's lock API would just fail or act on the wrong account otherwise.
async function requireOwnedRegisteredDomain(uid: string, domain: string): Promise<void> {
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('domainPurchases')
    .where('domain', '==', domain)
    .where('status', '==', 'registered')
    .limit(1)
    .get();
  if (snap.empty) {
    throw new HttpsError('permission-denied', 'This domain was not registered through SiteSpark, so its lock cannot be managed here.');
  }
}

// Real registrar-lock status for a domain SiteSpark registered on the user's behalf --
// the first, genuinely working half of moving it to a different registrar later. Getting
// the actual EPP/auth code has no documented self-serve Namecheap API (see namecheapApi.ts)
// -- the client shows honest instructions to contact support for that step instead of a
// fake button.
export const getDomainLockStatus = onCall(
  { secrets: [namecheapApiUser, namecheapApiKey, namecheapUserName], ...NAMECHEAP_VPC_OPTS, invoker: 'public' },
  withCallableErrors('getDomainLockStatus', async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { domain } = request.data as { domain: string };
    if (!domain?.trim()) throw new HttpsError('invalid-argument', 'Missing domain.');

    await requireOwnedRegisteredDomain(uid, domain.trim().toLowerCase());
    const creds = { apiUser: namecheapApiUser.value(), apiKey: namecheapApiKey.value(), userName: namecheapUserName.value() };
    const locked = await getRegistrarLock(creds, domain.trim().toLowerCase());
    return { locked };
  })
);

export const setDomainLockStatus = onCall(
  { secrets: [namecheapApiUser, namecheapApiKey, namecheapUserName], ...NAMECHEAP_VPC_OPTS, invoker: 'public' },
  withCallableErrors('setDomainLockStatus', async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { domain, locked } = request.data as { domain: string; locked: boolean };
    if (!domain?.trim() || typeof locked !== 'boolean') throw new HttpsError('invalid-argument', 'Missing domain or locked flag.');

    await requireOwnedRegisteredDomain(uid, domain.trim().toLowerCase());
    const creds = { apiUser: namecheapApiUser.value(), apiKey: namecheapApiKey.value(), userName: namecheapUserName.value() };
    const success = await setRegistrarLock(creds, domain.trim().toLowerCase(), locked);
    if (!success) throw new HttpsError('internal', 'Namecheap did not confirm the lock change — try again in a moment.');
    return { locked };
  })
);

// Verifies a real StoreKit purchase server-side via Apple's App Store Server API before
// applying its effect (credits, plan, or theme unlock) -- never trusts a client's own
// claim that it paid. Idempotent against Apple redelivering the same transaction (app
// relaunch, retry) via processedAppleTransactions; a subscription renewal is a distinct
// transactionId each period, so each renewal still tops up credits exactly once.
export const verifyApplePurchase = onCall(
  { secrets: [appleIapKeyId, appleIapIssuerId, appleIapPrivateKey], invoker: 'public' },
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
export const appStoreServerNotifications = onRequest({ secrets: [vapidPrivateKey], invoker: 'public' }, async (req, res) => {
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
        "We couldn't process your subscription renewal — your site will go offline in a few hours if this isn't resolved.",
        undefined,
        vapidPrivateKey.value()
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
    await sendPushNotification(uid, 'Payment received', 'Your site is back online.', undefined, vapidPrivateKey.value()).catch((err) =>
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
export const enforceBillingSuspensions = onSchedule({ schedule: 'every 15 minutes', secrets: [vapidPrivateKey] }, async () => {
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

    await sendPushNotification(
      uid,
      'Site suspended',
      'Your site has been taken down over a failed payment — renew to bring it back online.',
      undefined,
      vapidPrivateKey.value()
    ).catch((err) => console.error('Push notification failed', err));

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
export const createSellerOnboardingLink = onCall({ secrets: [stripeSecretKey], invoker: 'public' }, withCallableErrors('createSellerOnboardingLink', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  // Only a plausible ISO 3166-1 alpha-2 code is trusted -- falls back to US (Stripe's own
  // default) for anything else, e.g. an older client build that doesn't send this yet.
  const requestedCountry = (request.data as { country?: string } | undefined)?.country;
  const country = typeof requestedCountry === 'string' && /^[A-Z]{2}$/.test(requestedCountry) ? requestedCountry : 'US';

  const stripe = createStripeClient(stripeSecretKey.value());
  const ref = sellerAccountRef(uid);
  const existing = (await ref.get()).data() as SellerAccount | undefined;

  const accountId = await ensureExpressAccount(stripe, existing?.stripeAccountId ?? null, request.auth?.token?.email as string | undefined, country);

  if (!existing?.stripeAccountId) {
    const seller: SellerAccount = {
      uid,
      stripeAccountId: accountId,
      country,
      onboardingStatus: 'pending',
      chargesEnabled: false,
      payoutsEnabled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await ref.set(seller);
  }

  // Unlike Checkout Sessions (which accept a custom app scheme for success/cancel),
  // Stripe's Account Links API requires real http(s) URLs and rejects anything else with
  // "Not a valid URL" -- so this always has to land on the real web app, on both platforms,
  // whether Stripe redirects here or the user just backs out manually. The app re-checks
  // real status via getSellerAccountStatus rather than trusting this redirect either way.
  const url = await createOnboardingLink(stripe, accountId, `${WEBAPP_URL}/?onboarding=refresh`, `${WEBAPP_URL}/?onboarding=complete`);
  return { url };
}));

// Refreshes this seller's real charges_enabled/payouts_enabled flags from Stripe -- the
// client calls this after returning from onboarding (or pull-to-refresh) rather than
// trusting the redirect URL, since Stripe's own account state is the only source of truth
// for whether this account can actually accept a charge yet.
export const getSellerAccountStatus = onCall({ secrets: [stripeSecretKey], invoker: 'public' }, withCallableErrors('getSellerAccountStatus', async (request) => {
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
}));

// Lets a seller stuck in a broken onboarding (most commonly: their Express account was
// created under the wrong country, which Stripe never allows changing after the fact) start
// over with a fresh account. Only allowed before the account has ever actually gone live --
// once chargesEnabled is true there's a real payout history/balance on that account, and
// deleting it would be destructive, not a fix.
export const resetSellerOnboarding = onCall({ secrets: [stripeSecretKey], invoker: 'public' }, withCallableErrors('resetSellerOnboarding', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const ref = sellerAccountRef(uid);
  const existing = (await ref.get()).data() as SellerAccount | undefined;
  if (!existing?.stripeAccountId) {
    return { ok: true };
  }
  if (existing.chargesEnabled) {
    throw new HttpsError('failed-precondition', 'This account is already active and cannot be reset.');
  }

  const stripe = createStripeClient(stripeSecretKey.value());
  try {
    await deleteExpressAccount(stripe, existing.stripeAccountId);
  } catch {
    // Already deleted, or Stripe otherwise refuses -- either way, clearing our own record
    // below is what lets the seller try again, so a delete failure here isn't fatal.
  }

  await ref.set({
    uid,
    stripeAccountId: null,
    onboardingStatus: 'not_connected',
    chargesEnabled: false,
    payoutsEnabled: false,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  } satisfies SellerAccount);

  return { ok: true };
}));

// A real link into the seller's own Stripe Express dashboard -- their actual balance,
// payout schedule, and payment history, hosted entirely by Stripe. SiteSpark doesn't need
// to build its own payout ledger UI on top of this.
export const createSellerDashboardLink = onCall({ secrets: [stripeSecretKey], invoker: 'public' }, withCallableErrors('createSellerDashboardLink', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const existing = (await sellerAccountRef(uid).get()).data() as SellerAccount | undefined;
  if (!existing?.stripeAccountId) {
    throw new HttpsError('failed-precondition', 'Set up payouts before viewing your Stripe dashboard.');
  }

  const stripe = createStripeClient(stripeSecretKey.value());
  const url = await createDashboardLoginLink(stripe, existing.stripeAccountId);
  return { url };
}));

// Lets a seller set (or clear) a real flat shipping fee, charged at checkout as its own
// Stripe line item whenever the cart needs real shipping -- see createStoreCheckout. Doesn't
// require chargesEnabled/an existing Stripe account since a seller may want to set this
// before finishing payouts setup.
export const setShippingFee = onCall({ invoker: 'public' }, withCallableErrors('setShippingFee', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { shippingFeeUsd } = request.data as { shippingFeeUsd: number | null };
  if (shippingFeeUsd != null && (!Number.isFinite(shippingFeeUsd) || shippingFeeUsd < 0)) {
    throw new HttpsError('invalid-argument', 'Shipping fee must be 0 or greater.');
  }
  await sellerAccountRef(uid).set({ shippingFeeUsd: shippingFeeUsd ?? null, updatedAt: Date.now() }, { merge: true });
  return { ok: true };
}));

// Lets a seller pick which real currency their prices are denominated in and get charged
// through Stripe as -- see currency.ts for the supported list and symbol mapping.
export const setCurrency = onCall({ invoker: 'public' }, withCallableErrors('setCurrency', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { currency } = request.data as { currency: string };
  const normalized = (currency ?? '').toLowerCase();
  if (!isValidCurrency(normalized)) {
    throw new HttpsError('invalid-argument', 'Unsupported currency.');
  }
  await sellerAccountRef(uid).set({ currency: normalized, updatedAt: Date.now() }, { merge: true });
  return { ok: true };
}));

const FULFILLMENT_STATUSES: FulfillmentStatus[] = ['unfulfilled', 'shipped', 'delivered', 'cancelled'];

// Lets a seller move an order through unfulfilled -> shipped -> delivered (or mark it
// cancelled) and attach real carrier/tracking info. Sends the buyer a shipping-notification
// email the moment it's marked 'shipped' with tracking info attached -- the only way a buyer
// finds out, since there's no buyer account/notification system in this app.
export const updateOrderFulfillment = onCall({ secrets: [resendApiKey], invoker: 'public' }, withCallableErrors('updateOrderFulfillment', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { orderId, fulfillmentStatus, trackingCarrier, trackingNumber } = request.data as {
    orderId: string;
    fulfillmentStatus: FulfillmentStatus;
    trackingCarrier?: string | null;
    trackingNumber?: string | null;
  };
  if (!orderId || !FULFILLMENT_STATUSES.includes(fulfillmentStatus)) {
    throw new HttpsError('invalid-argument', 'Missing or invalid orderId/fulfillmentStatus.');
  }

  const orderRef = db.collection('users').doc(uid).collection('orders').doc(orderId);
  const doc = await orderRef.get();
  if (!doc.exists) throw new HttpsError('not-found', 'Order not found.');
  const order = doc.data() as StoreOrder;

  const update = {
    fulfillmentStatus,
    trackingCarrier: trackingCarrier?.trim() || null,
    trackingNumber: trackingNumber?.trim() || null,
    trackingUpdatedAt: Date.now(),
  };
  await orderRef.update(update);

  if (fulfillmentStatus === 'shipped' && order.buyerEmail) {
    try {
      await sendShippingNotificationEmail(resendApiKey.value(), order.buyerEmail, { ...order, ...update }, order.slug);
    } catch (err) {
      // The status update above already succeeded and is what matters most -- a failed
      // notification email (e.g. sending domain not yet verified) shouldn't roll that back
      // or block the seller, just log it for follow-up.
      console.error('sendShippingNotificationEmail failed', err);
    }
  }

  return { ok: true };
}));

// Public, unauthenticated -- lets a buyer (who has no account) check their own order's
// fulfillment/tracking status from the published site using only their order id (shown to
// them right after checkout) and the email they paid with, resolving sellerUid from the
// slug's publishedSites doc the same way validateDiscountCodeForSlug does.
export const getOrderStatus = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  const slug = (req.query.slug as string) ?? '';
  const orderId = (req.query.orderId as string) ?? '';
  const email = ((req.query.email as string) ?? '').trim().toLowerCase();
  if (!slug || !orderId || !email) {
    res.status(400).json({ error: 'Missing slug, orderId, or email.' });
    return;
  }

  const siteDoc = await db.collection('publishedSites').doc(slug).get();
  const sellerUid = (siteDoc.data() as { uid?: string } | undefined)?.uid;
  if (!sellerUid) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  const doc = await db.collection('users').doc(sellerUid).collection('orders').doc(orderId).get();
  if (!doc.exists) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  const order = doc.data() as StoreOrder;
  if (!order.buyerEmail || order.buyerEmail.trim().toLowerCase() !== email) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    fulfillmentStatus: order.fulfillmentStatus,
    trackingCarrier: order.trackingCarrier,
    trackingNumber: order.trackingNumber,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({ name: item.name, quantity: item.quantity, variantLabel: item.variantLabel })),
  });
});

// Public, unauthenticated -- lets a buyer with no account and no order id list every order
// they've placed at this site using only the email they paid with, resolving sellerUid from
// the slug's publishedSites doc the same way getOrderStatus does. Filters on buyerEmailLower
// alone (a single-field query needs no composite index) and narrows to this site's own slug
// and sorts newest-first in memory, since a buyer's own order count is always small.
export const getOrdersByEmail = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  const slug = (req.query.slug as string) ?? '';
  const email = ((req.query.email as string) ?? '').trim().toLowerCase();
  if (!slug || !email) {
    res.status(400).json({ error: 'Missing slug or email.' });
    return;
  }

  const siteDoc = await db.collection('publishedSites').doc(slug).get();
  const sellerUid = (siteDoc.data() as { uid?: string } | undefined)?.uid;
  if (!sellerUid) {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ orders: [] });
    return;
  }

  const snap = await db.collection('users').doc(sellerUid).collection('orders').where('buyerEmailLower', '==', email).get();
  const orders = snap.docs
    .map((doc) => doc.data() as StoreOrder)
    .filter((order) => order.slug === slug)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((order) => ({
      orderId: order.id,
      createdAt: order.createdAt,
      fulfillmentStatus: order.fulfillmentStatus,
      trackingCarrier: order.trackingCarrier,
      trackingNumber: order.trackingNumber,
      itemsSummary: order.items.map((item) => `${item.quantity}× ${item.name}${item.variantLabel ? ' (' + item.variantLabel + ')' : ''}`).join(', '),
    }));

  res.set('Cache-Control', 'no-store');
  res.status(200).json({ orders });
});

const discountCodeRef = (uid: string, code: string) => db.collection('users').doc(uid).collection('discountCodes').doc(code.trim().toUpperCase());

const CODE_PATTERN = /^[A-Z0-9]{3,20}$/;

// A seller's own promo code, created against their own account -- the uppercased code
// itself is the doc id (see discountCodeRef), so createStoreCheckout/validateDiscountCode
// can look one up with a single get once a slug's been resolved to a sellerUid.
// The shortest a real "on-site announcement" is allowed to run -- guards against a seller
// (or a buggy client) submitting 0/negative and the banner never having a real window.
const MIN_ANNOUNCE_DURATION_MS = 1000;

export const createDiscountCode = onCall({ invoker: 'public' }, withCallableErrors('createDiscountCode', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const {
    code,
    kind: rawKind,
    type,
    amount,
    targetProductName,
    bogoBuyQuantity,
    bogoGetQuantity,
    maxRedemptions,
    startsAt,
    expiresAt,
    announceOnSite,
    announceDurationMs,
  } = request.data as {
    code: string;
    kind?: DiscountKind;
    type: 'percent' | 'fixed';
    amount: number;
    targetProductName?: string | null;
    bogoBuyQuantity?: number | null;
    bogoGetQuantity?: number | null;
    maxRedemptions: number | null;
    startsAt?: number | null;
    expiresAt: number | null;
    announceOnSite?: boolean;
    announceDurationMs?: number | null;
  };
  const normalized = (code ?? '').trim().toUpperCase();
  if (!CODE_PATTERN.test(normalized)) {
    throw new HttpsError('invalid-argument', 'Codes must be 3-20 letters/numbers, e.g. SUMMER20.');
  }

  const kind: DiscountKind = rawKind === 'item' || rawKind === 'bogo' || rawKind === 'shipping' ? rawKind : 'order';

  let finalType: DiscountType = 'percent';
  let finalAmount = 100;
  let finalTargetProductName: string | null = null;
  let finalBogoBuy: number | null = null;
  let finalBogoGet: number | null = null;

  if (kind === 'bogo') {
    const buyQty = Math.floor(Number(bogoBuyQuantity));
    const getQty = Math.floor(Number(bogoGetQuantity));
    if (!Number.isFinite(buyQty) || buyQty < 1) throw new HttpsError('invalid-argument', 'Enter how many the buyer must buy, e.g. 2.');
    if (!Number.isFinite(getQty) || getQty < 1) throw new HttpsError('invalid-argument', 'Enter how many the buyer gets free, e.g. 1.');
    if (!targetProductName?.trim()) throw new HttpsError('invalid-argument', 'Enter the exact product name this applies to.');
    finalBogoBuy = buyQty;
    finalBogoGet = getQty;
    finalTargetProductName = targetProductName.trim();
  } else {
    if (type !== 'percent' && type !== 'fixed') throw new HttpsError('invalid-argument', 'Invalid discount type.');
    if (!Number.isFinite(amount) || amount <= 0 || (type === 'percent' && amount > 100)) {
      throw new HttpsError('invalid-argument', type === 'percent' ? 'Percent off must be between 1 and 100.' : 'Amount off must be greater than 0.');
    }
    finalType = type;
    finalAmount = amount;
    if (kind === 'item') {
      if (!targetProductName?.trim()) throw new HttpsError('invalid-argument', 'Enter the exact product name this applies to.');
      finalTargetProductName = targetProductName.trim();
    }
  }

  let finalAnnounceDurationMs: number | null = null;
  if (announceOnSite) {
    const durationMs = Number(announceDurationMs);
    if (!Number.isFinite(durationMs) || durationMs < MIN_ANNOUNCE_DURATION_MS) {
      throw new HttpsError('invalid-argument', 'Pick how long to display the on-site notification.');
    }
    finalAnnounceDurationMs = Math.floor(durationMs);
  }

  const ref = discountCodeRef(uid, normalized);
  if ((await ref.get()).exists) {
    throw new HttpsError('already-exists', `You already have a code called ${normalized}.`);
  }

  const discountCode: DiscountCode = {
    code: normalized,
    sellerUid: uid,
    kind,
    type: finalType,
    amount: finalAmount,
    targetProductName: finalTargetProductName,
    bogoBuyQuantity: finalBogoBuy,
    bogoGetQuantity: finalBogoGet,
    active: true,
    maxRedemptions: maxRedemptions != null && Number.isFinite(maxRedemptions) ? Math.max(1, Math.floor(maxRedemptions)) : null,
    redemptionCount: 0,
    startsAt: startsAt != null && Number.isFinite(startsAt) ? startsAt : null,
    expiresAt: expiresAt != null && Number.isFinite(expiresAt) ? expiresAt : null,
    announceOnSite: !!announceOnSite,
    announceDurationMs: finalAnnounceDurationMs,
    announcedAt: announceOnSite ? Date.now() : null,
    createdAt: Date.now(),
  };
  await ref.set(discountCode);
  return { ok: true };
}));

export const setDiscountCodeActive = onCall({ invoker: 'public' }, withCallableErrors('setDiscountCodeActive', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { code, active } = request.data as { code: string; active: boolean };
  const ref = discountCodeRef(uid, code ?? '');
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'Code not found.');
  await ref.update({ active: !!active });
  return { ok: true };
}));

// Lets a seller turn the on-site announcement banner on/off (or re-trigger it with a fresh
// display window) for a code that already exists, without having to delete and recreate it.
// Re-activating always re-stamps announcedAt to now, so the chosen duration counts from this
// moment -- e.g. re-announcing a "24 hours" code gives it another full 24 hours on-site.
export const setDiscountCodeAnnouncement = onCall({ invoker: 'public' }, withCallableErrors('setDiscountCodeAnnouncement', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { code, announceOnSite, announceDurationMs } = request.data as { code: string; announceOnSite: boolean; announceDurationMs?: number | null };
  const ref = discountCodeRef(uid, code ?? '');
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'Code not found.');

  if (!announceOnSite) {
    await ref.update({ announceOnSite: false });
    return { ok: true };
  }
  const durationMs = Number(announceDurationMs);
  if (!Number.isFinite(durationMs) || durationMs < MIN_ANNOUNCE_DURATION_MS) {
    throw new HttpsError('invalid-argument', 'Pick how long to display the on-site notification.');
  }
  await ref.update({ announceOnSite: true, announceDurationMs: Math.floor(durationMs), announcedAt: Date.now() });
  return { ok: true };
}));

export const deleteDiscountCode = onCall({ invoker: 'public' }, withCallableErrors('deleteDiscountCode', async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { code } = request.data as { code: string };
  await discountCodeRef(uid, code ?? '').delete();
  return { ok: true };
}));

interface DiscountValidation {
  valid: boolean;
  error?: string;
  discount?: DiscountCode;
}

// Shared by validateDiscountCode (a live preview as the buyer types) and createStoreCheckout
// (the real, authoritative check at the moment of payment) -- same rules both times so a
// code that looked valid while typing can't turn out invalid (or vice versa) at checkout.
async function validateDiscountCodeForSeller(sellerUid: string, rawCode: string): Promise<DiscountValidation> {
  const code = (rawCode ?? '').trim().toUpperCase();
  if (!code) return { valid: false, error: 'Enter a code.' };

  const doc = await discountCodeRef(sellerUid, code).get();
  if (!doc.exists) return { valid: false, error: 'Code not found.' };
  const discount = doc.data() as DiscountCode;
  if (!discount.active) return { valid: false, error: 'This code is no longer active.' };
  if (discount.startsAt != null && discount.startsAt > Date.now()) return { valid: false, error: 'This code isn’t active yet.' };
  if (discount.expiresAt != null && discount.expiresAt < Date.now()) return { valid: false, error: 'This code has expired.' };
  if (discount.maxRedemptions != null && discount.redemptionCount >= discount.maxRedemptions) {
    return { valid: false, error: 'This code has already been fully redeemed.' };
  }
  return { valid: true, discount };
}

async function validateDiscountCodeForSlug(slug: string, rawCode: string): Promise<DiscountValidation> {
  const siteDoc = await db.collection('publishedSites').doc(slug).get();
  const sellerUid = (siteDoc.data() as { uid?: string } | undefined)?.uid;
  if (!sellerUid) return { valid: false, error: 'Code not found.' };
  return validateDiscountCodeForSeller(sellerUid, rawCode);
}

// A discount amount is always clamped so it can never exceed whatever it's computed against
// (a $50-off code on a $20 line discounts $20, not into negative territory). What it's
// computed against depends on discount.kind:
//  - 'order' (default, and every pre-kind legacy code): the whole product subtotal.
//  - 'item': just the named product's own line total (quantity x price).
//  - 'bogo': the dollar value of whichever units of the named product are free -- every
//    (bogoBuyQuantity + bogoGetQuantity) units in the cart makes bogoGetQuantity of them free.
//  - 'shipping': the seller's own flat shipping fee, not anything product-related.
// `items` only needs name/priceUsd/quantity -- real StoreOrderItem[] and a lightweight preview
// shape from the buyer's local cart both satisfy that.
function computeDiscountAmount(
  discount: DiscountCode,
  subtotalUsd: number,
  items: { name: string; priceUsd: number; quantity: number }[],
  shippingFeeUsd: number
): number {
  const kind = discount.kind ?? 'order';
  const round2 = (n: number) => Math.round(n * 100) / 100;

  if (kind === 'shipping') {
    if (shippingFeeUsd <= 0) return 0;
    const raw = discount.type === 'percent' ? shippingFeeUsd * (discount.amount / 100) : discount.amount;
    return round2(Math.min(Math.max(raw, 0), shippingFeeUsd));
  }

  if (kind === 'item' || kind === 'bogo') {
    const targetName = (discount.targetProductName ?? '').trim().toLowerCase();
    const target = items.find((i) => i.name.trim().toLowerCase() === targetName);
    if (!target) return 0;
    const lineTotal = target.priceUsd * target.quantity;

    if (kind === 'bogo') {
      if (!discount.bogoBuyQuantity || !discount.bogoGetQuantity) return 0;
      const groupSize = discount.bogoBuyQuantity + discount.bogoGetQuantity;
      const fullGroups = Math.floor(target.quantity / groupSize);
      const remainder = target.quantity % groupSize;
      const freeFromRemainder = Math.max(0, remainder - discount.bogoBuyQuantity);
      const freeUnits = fullGroups * discount.bogoGetQuantity + freeFromRemainder;
      return round2(Math.min(freeUnits * target.priceUsd, lineTotal));
    }

    const raw = discount.type === 'percent' ? lineTotal * (discount.amount / 100) : discount.amount;
    return round2(Math.min(Math.max(raw, 0), lineTotal));
  }

  const raw = discount.type === 'percent' ? subtotalUsd * (discount.amount / 100) : discount.amount;
  return round2(Math.min(Math.max(raw, 0), subtotalUsd));
}

// Public, unauthenticated -- lets the published-site checkout show "10% off applied" (or a
// real error) as soon as a buyer types a code, before they commit to actually checking out.
// `items` (JSON: {name, priceUsd, quantity}[]) is optional and only needed to preview the
// real dollar amount for 'item'/'bogo' codes -- createStoreCheckout re-validates and
// recomputes for real at the moment of payment regardless, so an inexact/missing preview
// here never lets a buyer under-pay.
export const validateDiscountCode = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  const slug = (req.query.slug as string) ?? '';
  const code = (req.query.code as string) ?? '';
  if (!slug || !code) {
    res.status(400).json({ valid: false, error: 'Missing slug or code.' });
    return;
  }
  const result = await validateDiscountCodeForSlug(slug, code);
  res.set('Cache-Control', 'no-store');
  if (!result.valid || !result.discount) {
    res.status(200).json({ valid: false, error: result.error });
    return;
  }
  const discount = result.discount;
  let items: { name: string; priceUsd: number; quantity: number }[] = [];
  try {
    items = req.query.items ? (JSON.parse(req.query.items as string) as typeof items) : [];
  } catch {
    items = [];
  }
  const subtotalUsd = items.reduce((sum, i) => sum + i.priceUsd * i.quantity, 0);
  let shippingFeeUsd = 0;
  if ((discount.kind ?? 'order') === 'shipping') {
    const siteDoc = await db.collection('publishedSites').doc(slug).get();
    const sellerUid = (siteDoc.data() as { uid?: string } | undefined)?.uid;
    const seller = sellerUid ? ((await sellerAccountRef(sellerUid).get()).data() as SellerAccount | undefined) : undefined;
    shippingFeeUsd = seller?.shippingFeeUsd ?? 0;
  }
  res.status(200).json({
    valid: true,
    kind: discount.kind ?? 'order',
    type: discount.type,
    amount: discount.amount,
    targetProductName: discount.targetProductName,
    bogoBuyQuantity: discount.bogoBuyQuantity,
    bogoGetQuantity: discount.bogoGetQuantity,
    previewAmountUsd: items.length > 0 ? computeDiscountAmount(discount, subtotalUsd, items, shippingFeeUsd) : null,
  });
});

// A short buyer-facing description of what a code does, for the on-site announcement
// banner -- never the seller's own internal code metadata beyond the code itself.
function describeDiscountForAnnouncement(discount: DiscountCode): string {
  const kind = discount.kind ?? 'order';
  if (kind === 'bogo') {
    return `Buy ${discount.bogoBuyQuantity} ${discount.targetProductName}, get ${discount.bogoGetQuantity} free`;
  }
  if (kind === 'shipping') {
    return discount.type === 'percent' && discount.amount >= 100 ? 'Free shipping' : `${discount.type === 'percent' ? discount.amount + '%' : '$' + discount.amount.toFixed(2)} off shipping`;
  }
  const amountText = discount.type === 'percent' ? `${discount.amount}% off` : `$${discount.amount.toFixed(2)} off`;
  return kind === 'item' && discount.targetProductName ? `${amountText} ${discount.targetProductName}` : amountText;
}

// Public, unauthenticated -- polled by every published page with products so a discount
// code the seller just turned "announce on site" on for shows up as a real banner, without
// needing to republish the site. Single-field query (announceOnSite) needs no composite
// index; the rest (active, not expired/not-yet-started/not fully redeemed) is filtered in
// memory since a seller only ever has a handful of codes.
//
// announceDurationMs does NOT gate whether the banner shows sitewide -- announceOnSite is
// the seller's real on/off switch for that, and stays on for as long as they leave it (a
// literal "5 seconds" eligibility window would mean almost no real visitor could ever load
// the page fast enough to see it). Instead announceDurationMs is purely how long *each
// individual visitor's* banner stays on screen before it auto-fades -- the client is the one
// that runs that per-visit timer (see renderDiscountAnnouncementScript in siteHtml.ts).
export const getActiveDiscountAnnouncement = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  const slug = (req.query.slug as string) ?? '';
  if (!slug) {
    res.status(400).json({ active: false });
    return;
  }
  res.set('Cache-Control', 'no-store');

  const siteDoc = await db.collection('publishedSites').doc(slug).get();
  const sellerUid = (siteDoc.data() as { uid?: string } | undefined)?.uid;
  if (!sellerUid) {
    res.status(200).json({ active: false });
    return;
  }

  const snap = await db.collection('users').doc(sellerUid).collection('discountCodes').where('announceOnSite', '==', true).get();
  const now = Date.now();
  const candidates = snap.docs
    .map((doc) => doc.data() as DiscountCode)
    .filter(
      (d) =>
        d.active &&
        d.announceDurationMs != null &&
        (d.startsAt == null || d.startsAt <= now) &&
        (d.expiresAt == null || d.expiresAt >= now) &&
        (d.maxRedemptions == null || d.redemptionCount < d.maxRedemptions)
    )
    .sort((a, b) => (b.announcedAt ?? 0) - (a.announcedAt ?? 0));

  const winner = candidates[0];
  if (!winner) {
    res.status(200).json({ active: false });
    return;
  }
  res.status(200).json({
    active: true,
    code: winner.code,
    message: describeDiscountForAnnouncement(winner),
    durationMs: winner.announceDurationMs,
  });
});

// Public webhook (no auth -- a buyer's browser calls this), computes the real order total
// against storeInventory (never trusting whatever price/stock the static page happened to
// have baked in), and creates a real Stripe Checkout Session with the commission split
// baked into the PaymentIntent itself.
export const createStoreCheckout = onRequest({ secrets: [stripeSecretKey], cors: true, invoker: 'public' }, async (req, res) => {
  try {
    const { slug, items, booking, discountCode } = req.body as {
      slug: string;
      items: { productId: string; quantity: number; variantKey?: string }[];
      booking?: { preferredDate?: string; preferredTime?: string; notes?: string };
      discountCode?: string;
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
      if (product.inStock === false) {
        res.status(400).json({
          error: product.saleType === 'service' ? `${product.name} isn't taking bookings right now.` : `${product.name} is currently out of stock.`,
        });
        return;
      }
      // A product with variant options must have one picked -- there's no such thing as
      // ordering "a T-shirt" with no size/color once options exist. A product with no
      // variantOptions ignores whatever variantKey (if any) the client sent.
      let variant: StoreInventoryVariant | undefined;
      if (product.variantOptions.length > 0) {
        variant = product.variants.find((v) => v.key === items[i].variantKey);
        if (!variant) {
          res.status(400).json({ error: `Please select options for ${product.name}.` });
          return;
        }
      }
      const effectivePriceUsd = variant?.priceUsd ?? product.priceUsd;
      const effectiveStockQuantity = variant ? variant.stockQuantity : product.stockQuantity;

      if (product.trackInventory && (effectiveStockQuantity ?? 0) < quantity) {
        res.status(400).json({
          error: product.saleType === 'service' ? `No more bookings available for ${product.name}.` : `Not enough stock left for ${product.name}.`,
        });
        return;
      }
      if (product.saleType === 'service') hasService = true;
      if (product.saleType === 'product' && product.fulfillment !== 'pickup') needsShipping = true;

      const variantLabel = variant ? variantLabelFor(product.variantOptions, variant.optionValues) : null;
      subtotalUsd += effectivePriceUsd * quantity;
      lineItems.push({
        // currency is filled in below once the seller doc (and their real currency) has been
        // fetched -- sellerUid itself isn't known until this loop resolves it from the first
        // product, so it can't be fetched any earlier than this.
        price_data: {
          currency: '',
          product_data: {
            name:
              (product.saleType === 'service' ? `${product.name} (booking)` : product.name) + (variantLabel ? ` (${variantLabel})` : ''),
          },
          unit_amount: Math.round(effectivePriceUsd * 100),
        },
        quantity,
      });
      orderItems.push({
        productId: product.productId,
        name: product.name,
        priceUsd: effectivePriceUsd,
        quantity,
        saleType: product.saleType,
        variantKey: variant?.key ?? null,
        variantLabel,
      });
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
    const currency = seller.currency ?? 'usd';
    for (const li of lineItems) {
      if (li.price_data) li.price_data.currency = currency;
    }

    // A real, seller-set flat fee -- added as its own Stripe line item (not Stripe's separate
    // shipping_options feature) specifically so a 'shipping' discount code can be expressed
    // the same way 'item'/'bogo' codes are: a dollar amount off one identifiable line, folded
    // into the same whole-session coupon below, rather than needing a second discount system.
    const shippingFeeUsd = needsShipping ? (seller.shippingFeeUsd ?? 0) : 0;
    if (shippingFeeUsd > 0) {
      lineItems.push({
        price_data: { currency, product_data: { name: 'Shipping' }, unit_amount: Math.round(shippingFeeUsd * 100) },
        quantity: 1,
      });
    }
    // Re-validated here (never trusting whatever discount amount the page displayed while
    // the buyer was typing) -- redemptionCount itself is only ever incremented once the
    // order actually completes (handleStoreOrderCompleted), same as stock, so an abandoned
    // checkout never uses up a redemption.
    let appliedDiscount: DiscountCode | null = null;
    if (discountCode) {
      const result = await validateDiscountCodeForSeller(sellerUid, discountCode);
      if (!result.valid || !result.discount) {
        res.status(400).json({ error: result.error ?? 'Invalid discount code.' });
        return;
      }
      appliedDiscount = result.discount;
    }
    const discountAmountUsd = appliedDiscount ? computeDiscountAmount(appliedDiscount, subtotalUsd, orderItems, shippingFeeUsd) : 0;
    const discountedTotalUsd = Math.round((subtotalUsd + shippingFeeUsd - discountAmountUsd) * 100) / 100;

    // The platform fee is computed off what the seller actually gets paid on (post-discount,
    // and including the shipping fee since that's real revenue collected too), not the
    // pre-discount product subtotal -- otherwise application_fee_amount could exceed the real
    // charged total once a coupon is applied, which Stripe rejects outright.
    const platformFeeUsd = Math.round(discountedTotalUsd * (PLATFORM_FEE_PERCENT / 100) * 100) / 100;
    const stripe = createStripeClient(stripeSecretKey.value());
    const bookingDetails: BookingDetails | null = hasService
      ? {
          preferredDate: (booking?.preferredDate ?? '').trim().slice(0, 40),
          preferredTime: (booking?.preferredTime ?? '').trim().slice(0, 40),
          notes: (booking?.notes ?? '').trim().slice(0, 500),
        }
      : null;

    // An ad hoc, one-time-use Stripe coupon rather than syncing our own codes into Stripe's
    // own Coupon/PromotionCode objects -- our DiscountCode is the single source of truth
    // (active flag, expiry, redemption limit), this just makes Stripe's own Checkout Session
    // total reflect it. percent_off is only correct for an 'order'-kind code (a straight
    // percentage of the whole session) -- 'item'/'bogo'/'shipping' codes have already computed
    // a real dollar amount off one specific part of the order, so they always use amount_off
    // even when the seller picked "percent" as the code's own type.
    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
    if (appliedDiscount && discountAmountUsd > 0) {
      const isWholeOrderPercent = (appliedDiscount.kind ?? 'order') === 'order' && appliedDiscount.type === 'percent';
      const coupon = await stripe.coupons.create(
        isWholeOrderPercent
          ? { percent_off: appliedDiscount.amount, duration: 'once', name: appliedDiscount.code }
          : { amount_off: Math.round(discountAmountUsd * 100), currency, duration: 'once', name: appliedDiscount.code }
      );
      discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment', // always a single real one-time charge -- never a subscription, booking or not
      payment_method_types: ['card'],
      line_items: lineItems,
      ...(discounts ? { discounts } : {}),
      ...(needsShipping ? { shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU', 'NZ'] as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] } } : {}),
      // Stripe substitutes the literal {CHECKOUT_SESSION_ID} placeholder with the real
      // session id (== this order's real id, see handleStoreOrderCompleted) -- that's what
      // lets the success banner show a real order number and pre-fill the track-order
      // widget, since there's no buyer account to look orders up through otherwise.
      success_url: `https://${slug}.${PRODUCT_DOMAIN}/?order=success&session_id={CHECKOUT_SESSION_ID}`,
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
        shippingFeeUsd: String(shippingFeeUsd),
        currency,
        ...(bookingDetails ? { booking: JSON.stringify(bookingDetails) } : {}),
        ...(appliedDiscount ? { discountCode: appliedDiscount.code, discountAmountUsd: String(discountAmountUsd) } : {}),
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
export const reportPublishedSite = onRequest({ secrets: [resendApiKey], cors: true, invoker: 'public' }, async (req, res) => {
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
