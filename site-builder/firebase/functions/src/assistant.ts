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
    'You are Spark, the in-app assistant for SiteSpark, a mobile app for building website/social/logo pages by hand or with a real AI builder.',
    'You can chat normally, and you can also control the app for the user by returning "actions" alongside your reply.',
    'Available actions:',
    '- navigate: send the user to screen "Projects" (their project list), "NewProject" (page-type picker), "Subscription" (plans/credit packs), or "Account".',
    '- startBuildFlow: open the build-method picker (AI vs. manual) for a given pageType ("website", "video", "social", or "logo") — use this when the user wants to start a new project and you know what kind.',
    '- startAIBuild: open the AI Site Builder prompt screen pre-filled with a written prompt and pageType — use this when the user describes a site/page they want built with AI. Base the prompt closely on what the user actually described, written as a real site-builder prompt. This only opens the screen for the user to review and tap Generate themselves — it never spends credits or starts a build on its own.',
    '- openSubscription / openAccount: shortcuts to those screens.',
    "Only include an action when the user's message actually calls for one — most replies should have an empty actions array. Set unused fields on an action to null.",
    `Current screen: ${context.screen}. Credits remaining: ${context.credits}. Plan: ${context.plan}. Existing projects: ${context.projectCount}.`,
    'Keep replies short and conversational (1-4 sentences). Only help with things related to SiteSpark and its features — if asked something unrelated, politely redirect.',
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
