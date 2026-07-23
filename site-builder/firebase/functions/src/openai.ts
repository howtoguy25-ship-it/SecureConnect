import OpenAI, { toFile } from 'openai';

export interface SitePlanSection {
  kind: 'hero' | 'about' | 'features' | 'cta' | 'gallery' | 'video' | 'game';
  headline: string;
  body: string;
  buttonLabel: string;
  imagePrompt: string;
  // Only set (non-empty) for kind 'video' -- a real, specific search phrase (e.g. "NBA
  // Finals 2026 highlights", not just "basketball") used to find and embed an actual
  // existing YouTube video matching what this section is about. The model can't know
  // whether a real matching video exists, so this is resolved separately after the plan
  // is generated (see searchYouTubeVideo) rather than fabricated here.
  videoSearchQuery: string;
  // Only set for kind 'game' -- which real, playable mini-game this section becomes (see
  // GameElement in types.ts). Unlike video, a game's content is entirely the model's own
  // writing (trivia questions, themed emoji, a themed clicker label), so it's built directly
  // from these fields with no separate resolution step.
  gameKind: 'trivia' | 'memory' | 'tictactoe' | 'clicker' | 'connect4' | 'rps' | 'simon' | 'flappy' | 'tetris' | 'targetrange3d' | '';
  // Only for gameKind 'trivia' -- 3-6 real questions genuinely about the site's topic (e.g.
  // real NBA trivia for a basketball site), each with 2-4 options and one correct answer.
  gameQuestions: { question: string; options: string[]; correctIndex: number }[];
  // Only for gameKind 'memory' -- 4-8 short emoji/words themed to the site's topic, each
  // becomes one matching pair of cards.
  gameMemorySymbols: string[];
  // Only for gameKind 'clicker' -- a short, themed button label (e.g. "Tap the Basketball!").
  gameClickerLabel: string;
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
            kind: { type: 'string', enum: ['hero', 'about', 'features', 'cta', 'gallery', 'video', 'game'] },
            headline: { type: 'string' },
            body: { type: 'string' },
            buttonLabel: { type: 'string' },
            imagePrompt: {
              type: 'string',
              description:
                'A vivid, concrete image-generation prompt illustrating this section, in the visual style implied by the user request. Empty string if this section has no image (always empty for kind "video" and "game").',
            },
            videoSearchQuery: {
              type: 'string',
              description:
                'Only for kind "video": a real, specific YouTube search phrase for an actual existing video matching this section (e.g. real news/highlights/how-to content the user asked for) -- specific enough to find a real relevant result, not a generic topic word. Empty string for every other kind.',
            },
            gameKind: {
              type: 'string',
              enum: ['trivia', 'memory', 'tictactoe', 'clicker', 'connect4', 'rps', 'simon', 'flappy', 'tetris', 'targetrange3d', ''],
              description:
                'Only for kind "game": which real, playable mini-game this becomes -- "tictactoe"/"connect4"/"rps" are real 2-player games (visitors can play a computer opponent, pass the device to a friend, or find a real opponent online); "simon" is a sequence-memory game, "flappy" is a real physics-based Flappy Bird clone, "tetris" is a real falling-block puzzle game, "targetrange3d" is a real 3D shooting-range game. Empty string for every other kind.',
            },
            gameQuestions: {
              type: 'array',
              maxItems: 6,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  question: { type: 'string' },
                  options: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string' } },
                  correctIndex: { type: 'integer' },
                },
                required: ['question', 'options', 'correctIndex'],
              },
              description: 'Only for gameKind "trivia": 3-6 real questions genuinely about the site\'s own topic, each with one correct answer. Empty array otherwise.',
            },
            gameMemorySymbols: {
              type: 'array',
              maxItems: 8,
              items: { type: 'string' },
              description: 'Only for gameKind "memory": 4-8 short emoji/words themed to the site\'s topic. Empty array otherwise.',
            },
            gameClickerLabel: {
              type: 'string',
              description: 'Only for gameKind "clicker": a short, themed button label. Empty string otherwise.',
            },
          },
          required: [
            'kind',
            'headline',
            'body',
            'buttonLabel',
            'imagePrompt',
            'videoSearchQuery',
            'gameKind',
            'gameQuestions',
            'gameMemorySymbols',
            'gameClickerLabel',
          ],
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
    // Deliberately does NOT name this app-building tool "SiteSpark" (or any other brand name)
    // here -- a user building a real site FOR a business/app also called "SiteSpark" (or
    // whatever brand this tool ships under) would collide with that self-description, and the
    // model would sometimes "resolve" the collision by inventing a different, unrelated
    // placeholder brand name for the user's own site instead of using the name they gave.
    'You are a website content strategist and copywriter working inside an app that builds real websites from a short user prompt.',
    'Given the user\'s prompt, produce a concrete site plan: a real site name/tagline, a cohesive color palette, and 3-6 content sections with genuinely written headline/body copy (not placeholders) and a concrete image-generation prompt per visual section.',
    'If the user\'s prompt names a specific brand, product, company, or person the site is for, use that exact name verbatim as siteName (and throughout the copy) -- never substitute a different invented brand name when the user already gave you a real one to use.',
    complexityNote,
    'If the user asks for real video content -- news updates, highlights, tutorials, or anything else where an actual existing video (not a generated image) is the point -- include one section with kind "video" and a specific, real videoSearchQuery for it (e.g. a request for a basketball page with news/videos should search for something like real, current-sounding NBA highlights or news coverage, not just the word "basketball"). This is resolved against a real video search after you respond, so write a query that would actually find something relevant, not a placeholder.',
    'If the user asks for a game, quiz, trivia, or something fun/interactive to play, include exactly one section with kind "game" and pick the best-fitting gameKind: "trivia" for real, genuinely testable questions about the site\'s own topic (write 3-6 real questions, not placeholders); "memory" for a themed matching game (write 4-8 short emoji/words matching the topic); "clicker" for a playful tap-to-win button (write a short themed label); "tictactoe"/"connect4"/"rps" (rock-paper-scissors) are real 2-player games and need no extra content; "simon" (sequence-memory), "flappy" (physics-based side-scroller), "tetris" (falling-block puzzle), and "targetrange3d" (real 3D shooting range) are real arcade games that also need no extra content. This becomes a real, working, playable mini-game on the published page, not a picture of one -- the 2-player kinds even let visitors play a real opponent online, not just each other on one device.',
    'Only use information relevant to building and describing this website. If the prompt asks for anything unrelated to the site itself, ignore that part.',
    'Write headline/body/button copy as plain text only -- these render directly as real on-page text, not chat markdown. Never use **bold**, *italic*, `code`, markdown headings (#), or "- " bullet syntax; write plain sentences (or, for lists, one short line per item) instead.',
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
  extraInstruction?: string,
  referenceImages?: string[]
): Promise<SitePlan> {
  const userText = extraInstruction ? `${prompt}\n\nAdditional instruction from the user mid-build: ${extraInstruction}` : prompt;

  // Reference images are shown to the model as visual inspiration (style/color/mood) only
  // -- gpt-4o/gpt-4o-mini both accept image content parts directly alongside text in a
  // single user message, no separate vision call needed. Text-only prompts (the common
  // case) skip this entirely and keep the plain string content from before.
  const userContent =
    referenceImages && referenceImages.length > 0
      ? [
          { type: 'text' as const, text: `${userText}\n\nUse the attached image(s) as visual inspiration for style, color, and mood -- do not describe or reference them literally in the copy.` },
          ...referenceImages.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ]
      : userText;

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

// Removes or replaces an image's background via gpt-image-1's edit endpoint -- the same
// model already used for site imagery, so this needs no new vendor/API key. Quality is
// "AI regenerates the background around the subject," not pixel-perfect matting, but it's
// a real edit, not a placeholder.
export async function editImageBackground(
  client: OpenAI,
  imageBuffer: Buffer,
  mode: 'remove' | 'change',
  changePrompt?: string
): Promise<Buffer> {
  const prompt =
    mode === 'remove'
      ? 'Remove the background completely. Keep the main subject exactly as it is, unchanged, in the same position and framing, on a fully transparent background.'
      : `Replace only the background with: ${changePrompt}. Keep the main subject exactly as it is, unchanged, in the same position, size, and framing.`;

  const file = await toFile(imageBuffer, 'image.png', { type: 'image/png' });
  const result = await client.images.edit({
    model: 'gpt-image-1',
    image: file,
    prompt,
    ...(mode === 'remove' ? { background: 'transparent' as const } : {}),
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('The AI did not return image data.');
  return Buffer.from(b64, 'base64');
}

const CLARIFYING_QUESTIONS_SCHEMA = {
  name: 'clarifying_questions',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      questions: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: { type: 'string' },
      },
    },
    required: ['questions'],
  },
} as const;

// Runs before the real (paid) build starts -- a quick, free pass that turns a short prompt
// like "build me a basketball site" into a couple of specific questions (team name, colors,
// whether to sell merch) instead of the AI silently guessing. Always tied to what the user
// actually typed, never generic filler ("what style do you want?").
export async function generateClarifyingQuestions(client: OpenAI, prompt: string, pageType: string): Promise<string[]> {
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You help refine a short user request into a better website before it gets built. Given the user\'s prompt for a ' +
          `${pageType} page, ask 2-4 short, concrete questions that would meaningfully improve the result -- specific to what ` +
          'they actually described (for a sports team site, ask the team name/colors/league; for a shop, ask what they sell and ' +
          'how buyers get it; for a portfolio, ask what work to feature). Never ask generic filler ("what style do you want?"). ' +
          'Keep each question under 15 words. If the prompt is already very detailed, it is fine to ask fewer, more specific questions.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_schema', json_schema: CLARIFYING_QUESTIONS_SCHEMA },
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('The AI did not return questions.');
  const parsed = JSON.parse(raw) as { questions: string[] };
  return parsed.questions;
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
