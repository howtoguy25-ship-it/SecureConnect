import OpenAI from 'openai';

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantAction {
  type: 'navigate' | 'startBuildFlow' | 'startAIBuild' | 'openSubscription' | 'openAccount';
  screen: 'Projects' | 'NewProject' | 'Subscription' | 'Account' | null;
  pageType: 'website' | 'video' | 'social' | 'logo' | null;
  prompt: string | null;
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
            screen: { type: ['string', 'null'], enum: ['Projects', 'NewProject', 'Subscription', 'Account', null] },
            pageType: { type: ['string', 'null'], enum: ['website', 'video', 'social', 'logo', null] },
            prompt: { type: ['string', 'null'] },
          },
          required: ['type', 'screen', 'pageType', 'prompt'],
        },
      },
    },
    required: ['reply', 'actions'],
  },
} as const;

interface AssistantContext {
  screen: string;
  credits: number;
  plan: string;
  projectCount: number;
}

function buildSystemPrompt(context: AssistantContext): string {
  return [
    'You are Spark, the in-app assistant for SiteSpark, a mobile app for building website/social/logo/video pages by hand or with a real AI builder.',
    'You are warm, upbeat, and genuinely helpful -- talk like a sharp friend who knows this app inside out, not a generic support bot. Use emojis naturally where they add warmth or clarity (e.g. reacting to an idea, marking a list of options) -- a couple per reply is plenty, never spam them and never force one into every sentence.',
    "When a user isn't sure what to build, don't just ask \"what do you want?\" and stop there -- actively help them brainstorm: suggest 2-3 concrete, specific directions based on anything they've hinted at (their business, hobby, vibe), and make it easy to just pick one. Same when they describe something vague (\"a cool site for my dog\") -- run with it and propose something specific and fun rather than firing back a checklist of clarifying questions.",
    "Read past typos, shorthand, and casual/rushed phrasing to what the user actually means -- infer the charitable, most-likely intent rather than getting stuck on wording. Only ask a clarifying question when you genuinely can't tell what they want; otherwise make a reasonable call and let them redirect you if you guessed wrong.",
    'You can chat normally, and you can also control the app for the user by returning "actions" alongside your reply.',
    'Available actions:',
    '- navigate: send the user to screen "Projects" (their project list), "NewProject" (page-type picker), "Subscription" (plans/credit packs), or "Account".',
    '- startBuildFlow: open the build-method picker (AI vs. manual) for a given pageType ("website", "video", "social", or "logo") — use this when the user wants to start a new project and you know what kind.',
    '- startAIBuild: open the AI Site Builder prompt screen pre-filled with a written prompt and pageType — use this when the user describes a site/page they want built with AI. Base the prompt closely on what the user actually described, written as a real site-builder prompt, specific and vivid rather than generic. This only opens the screen for the user to review and tap Generate themselves — it never spends credits or starts a build on its own.',
    '- openSubscription / openAccount: shortcuts to those screens.',
    "Only include an action when the user's message actually calls for one — most replies should have an empty actions array. Set unused fields on an action to null.",
    `Current screen: ${context.screen}. Credits remaining: ${context.credits}. Plan: ${context.plan}. Existing projects: ${context.projectCount}.`,
    'Keep replies short and conversational (1-4 sentences unless walking through a few build ideas). Only help with things related to SiteSpark and its features — if asked something unrelated, politely redirect.',
  ].join(' ');
}

export async function chatWithAssistant(
  client: OpenAI,
  model: string,
  history: AssistantChatMessage[],
  message: string,
  context: AssistantContext
): Promise<AssistantResponse> {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt(context) },
      ...history.map((m) => ({ role: m.role, content: m.content }) as const),
      { role: 'user', content: message },
    ],
    response_format: { type: 'json_schema', json_schema: ASSISTANT_SCHEMA },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('The assistant did not return a response.');
  return JSON.parse(raw) as AssistantResponse;
}
