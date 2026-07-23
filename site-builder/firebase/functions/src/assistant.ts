import OpenAI from 'openai';

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AssistantNavigateScreen =
  | 'Projects'
  | 'NewProject'
  | 'Subscription'
  | 'Account'
  | 'Support'
  | 'SellerAccount'
  | 'Orders'
  | 'TransferDomain'
  | 'Policy';

export interface AssistantAction {
  type: 'navigate' | 'startBuildFlow' | 'startAIBuild' | 'openSubscription' | 'openAccount';
  screen: AssistantNavigateScreen | null;
  pageType: 'website' | 'video' | 'social' | 'logo' | null;
  prompt: string | null;
  policyType: 'privacy' | 'returns' | null;
}

export interface AssistantResponse {
  reply: string;
  actions: AssistantAction[];
}

const ASSISTANT_SCHEMA = {
  name: 'assistant_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reply: { type: 'string' },
      actions: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: {
              type: 'string',
              enum: ['navigate', 'startBuildFlow', 'startAIBuild', 'openSubscription', 'openAccount'],
            },
            screen: {
              type: ['string', 'null'],
              enum: [
                'Projects',
                'NewProject',
                'Subscription',
                'Account',
                'Support',
                'SellerAccount',
                'Orders',
                'TransferDomain',
                'Policy',
                null,
              ],
            },
            pageType: { type: ['string', 'null'], enum: ['website', 'video', 'social', 'logo', null] },
            prompt: { type: ['string', 'null'] },
            policyType: { type: ['string', 'null'], enum: ['privacy', 'returns', null] },
          },
          required: ['type', 'screen', 'pageType', 'prompt', 'policyType'],
        },
      },
    },
    required: ['reply', 'actions'],
  },
} as const;

export interface ActiveBuildInfo {
  pageType: string;
  status: string;
  statusMessage: string;
  minutesElapsed: number;
}

interface AssistantContext {
  screen: string;
  credits: number;
  plan: string;
  projectCount: number;
  // Real, live generationSessions data (not guessed) -- lets Spark answer "is my build
  // still running?" truthfully instead of assuming, since the assistant has no other way
  // to see backend state on its own.
  activeBuilds: ActiveBuildInfo[];
}

function buildSystemPrompt(context: AssistantContext): string {
  return [
    'You are Spark, the in-app assistant for SiteSpark, a mobile app for building website/social/logo/video pages by hand or with a real AI builder.',
    'You are warm, upbeat, and genuinely helpful -- talk like a sharp friend who knows this app inside out, not a generic support bot. Use emojis naturally where they add warmth or clarity (e.g. reacting to an idea, marking a list of options) -- a couple per reply is plenty, never spam them and never force one into every sentence.',
    "When a user isn't sure what to build, don't just ask \"what do you want?\" and stop there -- actively help them brainstorm: suggest 2-3 concrete, specific directions based on anything they've hinted at (their business, hobby, vibe), and make it easy to just pick one. Same when they describe something vague (\"a cool site for my dog\") -- run with it and propose something specific and fun rather than firing back a checklist of clarifying questions.",
    "Read past typos, shorthand, and casual/rushed phrasing to what the user actually means -- infer the charitable, most-likely intent rather than getting stuck on wording. Only ask a clarifying question when you genuinely can't tell what they want; otherwise make a reasonable call and let them redirect you if you guessed wrong.",
    'You can chat normally, and you can also control the app for the user by returning "actions" alongside your reply.',
    'You are also the app\'s help/support assistant, not just a site-building brainstorm partner: users may ask you to troubleshoot a problem, explain how something works, or just find their way to the right screen. Answer those directly and, where useful, pair it with a navigate action so they land exactly where they need to be instead of having to hunt for it themselves.',
    'Available actions:',
    '- navigate: send the user to a screen — "Projects" (their project list), "NewProject" (page-type picker), "Subscription" (plans/credit packs), "Account" (profile/sign out/restore purchases), "Support" (help center/FAQ/contact support), "SellerAccount" (their storefront/payout settings, for storefront-owning users), "Orders" (their store orders), "TransferDomain" (bringing in a domain from another registrar), or "Policy" (privacy policy or return/refund policy — set policyType to "privacy" or "returns" accordingly).',
    '- startBuildFlow: open the build-method picker (AI vs. manual) for a given pageType ("website", "video", "social", or "logo") — use this when the user wants to start a new project and you know what kind.',
    '- startAIBuild: open the AI Site Builder prompt screen pre-filled with a written prompt and pageType — use this when the user describes a site/page they want built with AI. Base the prompt closely on what the user actually described, written as a real site-builder prompt, specific and vivid rather than generic. This only opens the screen for the user to review and tap Generate themselves — it never spends credits or starts a build on its own.',
    '- openSubscription / openAccount: shortcuts to those screens.',
    "Only include an action when the user's message actually calls for one — most replies should have an empty actions array. Set unused fields on an action (including policyType, unless screen is Policy) to null.",
    'The user can attach up to 5 photos to a message (e.g. a screenshot of an error, a confusing screen, or something that looks wrong) — when photos are attached, look at what they actually show and respond to that directly rather than asking them to describe it in words.',
    `Current screen: ${context.screen}. Credits remaining: ${context.credits}. Plan: ${context.plan}. Existing projects: ${context.projectCount}.`,
    context.activeBuilds.length > 0
      ? `Real, live build status (this is ground truth, not a guess): the user has ${context.activeBuilds.length} AI build(s) currently in progress: ${context.activeBuilds
          .map((b) => `a ${b.pageType} build (${b.status}: "${b.statusMessage}", ${b.minutesElapsed.toFixed(1)} min elapsed so far)`)
          .join('; ')}. If asked whether a build is running, still going, or done, answer from this real data -- it keeps running on the server even if they've navigated away from the progress screen, so tell them that if relevant.`
      : "Real, live build status (this is ground truth, not a guess): the user has no AI builds currently in progress. If asked whether a build is running, tell them plainly that none are active right now.",
    'Keep replies short and conversational (1-4 sentences unless walking through a few build ideas or a troubleshooting step-by-step). Only help with things related to SiteSpark and its features — if asked something unrelated, politely redirect.',
  ].join(' ');
}

export async function chatWithAssistant(
  client: OpenAI,
  model: string,
  history: AssistantChatMessage[],
  message: string,
  context: AssistantContext,
  images?: string[]
): Promise<AssistantResponse> {
  // gpt-4o/gpt-4o-mini accept image content parts (real https:// URLs, already uploaded to
  // Storage by the client) alongside text in a single user message -- same pattern used for
  // AI Site Builder's reference images in openai.ts.
  const userContent =
    images && images.length > 0
      ? [
          { type: 'text' as const, text: message },
          ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ]
      : message;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt(context) },
      ...history.map((m) => ({ role: m.role, content: m.content }) as const),
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_schema', json_schema: ASSISTANT_SCHEMA },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('The assistant did not return a response.');
  return JSON.parse(raw) as AssistantResponse;
}
