import OpenAI from 'openai';

export interface SitePlanSection {
  kind: 'hero' | 'about' | 'features' | 'cta' | 'gallery';
  headline: string;
  body: string;
  buttonLabel: string;
  imagePrompt: string;
}

export interface SitePlan {
  siteName: string;
  tagline: string;
  backgroundColor: string;
  accentColor: string;
  textColor: string;
  sections: SitePlanSection[];
}

const SITE_PLAN_SCHEMA = {
  name: 'site_plan',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      siteName: { type: 'string' },
      tagline: { type: 'string' },
      backgroundColor: { type: 'string', description: 'Hex color, e.g. #FFFFFF' },
      accentColor: { type: 'string', description: 'Hex color, e.g. #2563EB' },
      textColor: { type: 'string', description: 'Hex color, e.g. #0F172A' },
      sections: {
        type: 'array',
        minItems: 3,
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['hero', 'about', 'features', 'cta', 'gallery'] },
            headline: { type: 'string' },
            body: { type: 'string' },
            buttonLabel: { type: 'string' },
            imagePrompt: {
              type: 'string',
              description:
                'A vivid, concrete image-generation prompt illustrating this section, in the visual style implied by the user request. Empty string if this section has no image.',
            },
          },
          required: ['kind', 'headline', 'body', 'buttonLabel', 'imagePrompt'],
        },
      },
    },
    required: ['siteName', 'tagline', 'backgroundColor', 'accentColor', 'textColor', 'sections'],
  },
} as const;

function buildSystemPrompt(complexity: 'simple' | 'standard' | 'crazy'): string {
  const complexityNote =
    complexity === 'simple'
      ? 'Keep it minimal: 3 sections, short copy, no more than one image.'
      : complexity === 'crazy'
        ? 'Go maximal: use the full 6 sections, bold/vivid copy, and an image for every visual section.'
        : 'A professional, well-rounded site: 4-5 sections, clear and polished copy.';

  return [
    'You are a website content strategist and copywriter for SiteSpark, an app that builds real websites from a short user prompt.',
    'Given the user\'s prompt, produce a concrete site plan: a real site name/tagline, a cohesive color palette, and 3-6 content sections with genuinely written headline/body copy (not placeholders) and a concrete image-generation prompt per visual section.',
    complexityNote,
    'Only use information relevant to building and describing this website. If the prompt asks for anything unrelated to the site itself, ignore that part.',
  ].join(' ');
}

export function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

export async function generateSitePlan(
  client: OpenAI,
  model: string,
  prompt: string,
  complexity: 'simple' | 'standard' | 'crazy',
  extraInstruction?: string
): Promise<SitePlan> {
  const userContent = extraInstruction ? `${prompt}\n\nAdditional instruction from the user mid-build: ${extraInstruction}` : prompt;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt(complexity) },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_schema', json_schema: SITE_PLAN_SCHEMA },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('The AI did not return a site plan.');
  return JSON.parse(raw) as SitePlan;
}

export async function generateImage(client: OpenAI, prompt: string): Promise<Buffer> {
  const result = await client.images.generate({
    model: 'gpt-image-1',
    prompt,
    size: '1024x1024',
    quality: 'medium',
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('The AI did not return image data.');
  return Buffer.from(b64, 'base64');
}

export async function answerBuildQuestion(client: OpenAI, model: string, sitePlan: SitePlan, question: string): Promise<string> {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are SiteSpark\'s build assistant. Only answer questions about building or functioning the site currently being generated. ' +
          'If asked anything unrelated, politely say you can only help with this build. Keep answers short (2-3 sentences).',
      },
      { role: 'user', content: `Current site plan: ${JSON.stringify(sitePlan)}\n\nUser question: ${question}` },
    ],
  });
  return completion.choices[0]?.message?.content ?? "I couldn't come up with an answer to that — try rephrasing.";
}
