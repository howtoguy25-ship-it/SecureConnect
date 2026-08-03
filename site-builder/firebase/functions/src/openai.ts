import OpenAI, { toFile } from 'openai';

export interface SitePlanSection {
  kind: 'hero' | 'about' | 'features' | 'cta' | 'gallery' | 'video' | 'game' | 'product' | 'widget' | 'custom';
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
  gameKind: 'trivia' | 'memory' | 'tictactoe' | 'clicker' | 'connect4' | 'rps' | 'simon' | 'flappy' | 'tetris' | 'targetrange3d' | 'basketball' | '';
  // Only for gameKind 'trivia' -- 3-6 real questions genuinely about the site's topic (e.g.
  // real NBA trivia for a basketball site), each with 2-4 options and one correct answer.
  gameQuestions: { question: string; options: string[]; correctIndex: number }[];
  // Only for gameKind 'memory' -- 4-8 short emoji/words themed to the site's topic, each
  // becomes one matching pair of cards.
  gameMemorySymbols: string[];
  // Only for gameKind 'clicker' -- a short, themed button label (e.g. "Tap the Basketball!").
  gameClickerLabel: string;
  // Only for kind 'product' -- a real sellable item/service/download, never a plain
  // decorative image standing in for something the user asked to actually be buyable.
  productName: string;
  productDescription: string;
  productPriceUsd: number;
  productSaleType: 'product' | 'service' | 'digital' | '';
  // 2-4 concrete photography prompts, each a different real angle of the *same* physical
  // item (front view, lifestyle/in-context shot, close-up of a material/detail) -- not
  // `imagePrompt` reused, since a real listing needs multiple photos, not one hero shot.
  productImagePrompts: string[];
  // Only for kind 'widget' -- a real, always-live/interactive utility, never a static
  // picture of one.
  widgetKind: 'clock' | 'countdown' | 'stopwatch' | 'calculator' | 'unitconverter' | '';
  // Only for widgetKind 'clock'. One entry = a simple local clock; 2+ = a real world clock.
  // ianaTimezone must be a real IANA zone id (e.g. "America/New_York", "Europe/London",
  // "Asia/Tokyo"), never invented.
  widgetTimezones: { label: string; ianaTimezone: string }[];
  // Only for widgetKind 'countdown' -- a real future ISO 8601 timestamp (e.g.
  // "2026-12-31T00:00:00Z") computed from the actual current date given below, never a
  // vague or past date.
  widgetCountdownTargetIso: string;
  // Only for widgetKind 'countdown' -- what's being counted down to, e.g. "Launch Day" or
  // "New Year 2027".
  widgetCountdownLabel: string;
  // Only for kind 'custom' -- used when the user describes something real/interactive/
  // functional that genuinely doesn't fit any of the other kinds above. A specific,
  // concrete restatement of exactly what to build (e.g. "a BMI calculator with a metric/
  // imperial toggle that shows the real BMI category" or "an interactive chess board a
  // visitor can play against a simple computer opponent") -- resolved into real generated
  // HTML/CSS/JS afterward (see generateCustomWidgetCode), never fabricated here.
  customDescription: string;
  // Only for kind 'features' or 'about' when this section is naturally a real list (a
  // "Why Choose Us" section, "Our Services", a benefits list, etc.) rather than one flowing
  // paragraph: 3-6 real, distinct items, each its own short title + one-sentence
  // description -- rendered as real individual cards (see layout.ts) instead of one plain
  // paragraph of bullet-point text glued into body. Empty array when the section reads
  // better as prose (e.g. a short "About us" story) or for any other kind.
  featureItems: { label: string; description: string }[];
}

export interface SitePlan {
  siteName: string;
  tagline: string;
  backgroundColor: string;
  accentColor: string;
  textColor: string;
  sections: SitePlanSection[];
  // A real, on-topic promo/announcement line for the site's top announcement bar -- only
  // ever used (see startGeneration in index.ts) for the Professional ('standard') and Go
  // All Out ('crazy') complexity tiers, matching a real business site's "prebuilt
  // announcement bar" rather than the Simple tier's bare single page. Empty string for the
  // Simple tier (the model is told not to bother writing one).
  announcementText: string;
  // A second, different announcement line -- only ever used for the Go All Out tier, which
  // gets two rotating bars (the app's own announcement feature already supports up to 2).
  // Empty string for Simple/Professional.
  announcementText2: string;
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
      announcementText: {
        type: 'string',
        description:
          'A short, real, on-brand announcement-bar line for this exact site (e.g. a real-sounding promo, shipping note, or hours notice that fits what the site is about) -- only for the Professional/"standard" and Go All Out/"crazy" complexity tiers (see your instructions for which tier this build is). Empty string for the Simple tier.',
      },
      announcementText2: {
        type: 'string',
        description:
          'A second, different real announcement-bar line -- only for the Go All Out/"crazy" tier, which rotates two bars. Empty string for Simple/Professional.',
      },
      sections: {
        type: 'array',
        // 1 is a real valid plan size, not just a lower bound relaxed for convenience -- a
        // Logo/Video/Social build (see buildSystemPrompt's pageTypeNote) is deliberately a
        // single composition, never a multi-section scrolling page the way a website is.
        minItems: 1,
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['hero', 'about', 'features', 'cta', 'gallery', 'video', 'game', 'product', 'widget', 'custom'] },
            headline: { type: 'string' },
            body: { type: 'string' },
            buttonLabel: { type: 'string' },
            imagePrompt: {
              type: 'string',
              description:
                'A vivid, concrete image-generation prompt illustrating this section, in the visual style implied by the user request. Empty string if this section has no image (always empty for kind "video", "game", "product", and "widget" -- product photos use productImagePrompts instead, and widgets need no image at all).',
            },
            videoSearchQuery: {
              type: 'string',
              description:
                'Only for kind "video": a real, specific YouTube search phrase for an actual existing video matching this section (e.g. real news/highlights/how-to content the user asked for) -- specific enough to find a real relevant result, not a generic topic word. Empty string for every other kind.',
            },
            gameKind: {
              type: 'string',
              enum: ['trivia', 'memory', 'tictactoe', 'clicker', 'connect4', 'rps', 'simon', 'flappy', 'tetris', 'targetrange3d', 'basketball', ''],
              description:
                'Only for kind "game": which real, playable mini-game this becomes -- "tictactoe"/"connect4"/"rps" are real 2-player games (visitors can play a computer opponent, pass the device to a friend, or find a real opponent online); "simon" is a sequence-memory game, "flappy" is a real physics-based Flappy Bird clone, "tetris" is a real falling-block puzzle game, "targetrange3d" is a real 3D shooting-range game, "basketball" is a real 3D physics game where visitors flick/swipe the ball toward the hoop with real gravity, spin, and rim/backboard bounce. Empty string for every other kind.',
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
            productName: {
              type: 'string',
              description: 'Only for kind "product": the real item/service/download\'s name. Empty string otherwise.',
            },
            productDescription: {
              type: 'string',
              description: 'Only for kind "product": real, specific sales copy describing this exact item -- material, size, what\'s included, who it\'s for. Never generic filler. Empty string otherwise.',
            },
            productPriceUsd: {
              type: 'number',
              description: 'Only for kind "product": a real, sensible USD price for this item. 0 otherwise.',
            },
            productSaleType: {
              type: 'string',
              enum: ['product', 'service', 'digital', ''],
              description: 'Only for kind "product": "product" for a physical/shippable good, "service" for a real-life booked service (a haircut, a table), "digital" for a downloadable/electronic good. Empty string otherwise.',
            },
            productImagePrompts: {
              type: 'array',
              minItems: 0,
              maxItems: 4,
              items: { type: 'string' },
              description: 'Only for kind "product": 2-4 vivid, concrete photography prompts, each a different real angle/context of the SAME physical item (e.g. "front view on a clean white background", "in a cozy living room at night", "close-up of the fabric texture/switch") -- never different products. Empty array otherwise.',
            },
            widgetKind: {
              type: 'string',
              enum: ['clock', 'countdown', 'stopwatch', 'calculator', 'unitconverter', ''],
              description:
                'Only for kind "widget": "clock" is a real, always-live ticking clock (or world clock with multiple real timezones); "countdown" is a real live countdown to a specific real date/event; "stopwatch" is a real interactive start/stop/lap timer; "calculator" is a real working arithmetic calculator; "unitconverter" is a real working length/weight/temperature/volume converter. Empty string otherwise.',
            },
            widgetTimezones: {
              type: 'array',
              maxItems: 6,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  label: { type: 'string' },
                  ianaTimezone: { type: 'string' },
                },
                required: ['label', 'ianaTimezone'],
              },
              description: 'Only for widgetKind "clock": one entry for a simple clock, 2+ real IANA timezones (e.g. "America/New_York", "Europe/London", "Asia/Tokyo") for a world clock. Empty array otherwise.',
            },
            widgetCountdownTargetIso: {
              type: 'string',
              description: 'Only for widgetKind "countdown": a real future ISO 8601 timestamp computed from the actual current date given in your instructions. Empty string otherwise.',
            },
            widgetCountdownLabel: {
              type: 'string',
              description: 'Only for widgetKind "countdown": what is being counted down to, e.g. "Launch Day". Empty string otherwise.',
            },
            customDescription: {
              type: 'string',
              description:
                'Only for kind "custom": a specific, concrete restatement of exactly what real interactive thing to build, used only when nothing else above fits (not a product, game, widget, or video) -- e.g. "a BMI calculator with a metric/imperial toggle" or "an interactive chess board playable against a simple computer opponent". Empty string otherwise.',
            },
            featureItems: {
              type: 'array',
              minItems: 0,
              maxItems: 6,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  label: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['label', 'description'],
              },
              description:
                'Only for kind "features" or "about" when this section is a real list (e.g. "Why Choose Us", "Our Services", a benefits list): 3-6 real, distinct items, each a short title (label) and a one-sentence description -- rendered as real individual cards. Empty array when the section is better as flowing prose, or for any other kind.',
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
            'productName',
            'productDescription',
            'productPriceUsd',
            'productSaleType',
            'productImagePrompts',
            'widgetKind',
            'widgetTimezones',
            'widgetCountdownTargetIso',
            'widgetCountdownLabel',
            'customDescription',
            'featureItems',
          ],
        },
      },
    },
    required: ['siteName', 'tagline', 'backgroundColor', 'accentColor', 'textColor', 'announcementText', 'announcementText2', 'sections'],
  },
} as const;

function buildSystemPrompt(
  complexity: 'simple' | 'standard' | 'crazy',
  todayIso: string,
  pageType: 'website' | 'video' | 'social' | 'logo' = 'website',
  existingProductNames: string[] = []
): string {
  // The single biggest fidelity bug this builder had: pageType used to never reach this
  // prompt at all, so a request for a Logo/Video/Social page still always produced the same
  // 3-6 section scrolling website plan below -- a "logo" request would build an actual
  // multi-section site with a hero/about/features/cta, not a real logo. Each non-website
  // type is a single fixed-size composition (see CANVAS_SIZES/layoutSitePlan), never a
  // scrolling multi-section page, so this note OVERRIDES the section-count/complexity
  // instructions entirely for those three types -- checked and enforced again after
  // generation (index.ts trims/whichever) so a model that ignores this can't still slip a
  // multi-section plan through.
  const pageTypeNote =
    pageType === 'logo'
      ? 'This build is for a LOGO page, not a website -- the output is one single square logo graphic, never a multi-section page. Produce EXACTLY 1 section, kind "hero": imagePrompt must describe a real, professional, standalone logo mark/emblem/icon design (not a photo, not a scene, not a mockup -- a clean, iconic graphic suitable for an actual brand logo, on a plain or simple background). Set headline to the brand/business name ONLY if a real text wordmark should appear alongside the mark (keep it to 1-3 words); leave headline as an empty string if the logo image itself already IS the complete wordmark. Leave body and buttonLabel as empty strings. Every section-count and complexity instruction elsewhere in this prompt does not apply here -- ignore it.'
      : pageType === 'video'
        ? 'This build is for a VIDEO page, not a website -- the output is one single vertical video composition, never a multi-section scrolling page. Produce EXACTLY 1 section: use kind "video" with a real, specific videoSearchQuery if the user described real existing video content (news, highlights, a tutorial); otherwise use kind "hero" with one vivid imagePrompt for the page\'s cover art, and a short headline only if the user described real on-screen text/caption. Leave body and buttonLabel empty unless the user specifically described a caption or a real link. Every section-count and complexity instruction elsewhere in this prompt does not apply here -- ignore it.'
        : pageType === 'social'
          ? 'This build is for a SOCIAL page, not a website -- the output is one single vertical social-post graphic, never a multi-section scrolling page. Produce EXACTLY 1 section, kind "hero": one vivid imagePrompt for the entire post design, and a short headline only if the user described real caption/post text (leave it empty otherwise). Leave body and buttonLabel as empty strings. Every section-count and complexity instruction elsewhere in this prompt does not apply here -- ignore it.'
          : '';

  const complexityNote =
    pageType !== 'website'
      ? ''
      : complexity === 'simple'
        ? 'This is the Simple tier: keep it minimal and genuinely easy to build on top of -- exactly 3 sections, short unfussy copy, no more than one image, no announcement bar (leave announcementText and announcementText2 empty strings). A clean, real, working site someone can comfortably keep editing by hand, not a stripped-down placeholder.'
        : complexity === 'crazy'
          ? 'This is the Go All Out tier: the fullest, boldest build this app can produce. Use the full 6 sections, the most vivid and specific copy you can write, a real generated image for every visual section, and lean hard into real interactive elements (product/game/widget/video) wherever the prompt supports one instead of a plain decorative picture. Write BOTH announcementText and announcementText2 as two different real, on-brand lines -- this tier gets a real rotating two-bar announcement bar. A real top navigation bar linking to the site\'s major sections is added automatically after your plan is generated, so write short, distinct section headlines that would also read well as a tab label.'
          : 'This is the Professional tier: a real, polished, full-featured site -- 4-5 sections, clear and confident copy, and a genuine call-to-action (the hero or cta section\'s buttonLabel should read like a real, specific action a visitor would take, not a generic "Learn More"). Write announcementText as one real, on-brand announcement line (leave announcementText2 an empty string -- the second bar is Go All Out only). A real top navigation bar linking to the site\'s major sections is added automatically after your plan is generated, so write short, distinct section headlines that would also read well as a tab label.';

  return [
    pageTypeNote,
    // Deliberately does NOT name this app-building tool "SiteSpark" (or any other brand name)
    // here -- a user building a real site FOR a business/app also called "SiteSpark" (or
    // whatever brand this tool ships under) would collide with that self-description, and the
    // model would sometimes "resolve" the collision by inventing a different, unrelated
    // placeholder brand name for the user's own site instead of using the name they gave.
    'You are a website content strategist and copywriter working inside an app that builds real websites from a short user prompt.',
    'Given the user\'s prompt, produce a concrete site plan: a real site name/tagline, a cohesive color palette, and 3-6 content sections with genuinely written headline/body copy (not placeholders) and a concrete image-generation prompt per visual section.',
    'If the user\'s prompt names a specific brand, product, company, or person the site is for, use that exact name verbatim as siteName (and throughout the copy) -- never substitute a different invented brand name when the user already gave you a real one to use.',
    'Treat every specific section, feature, or piece of content the user names (e.g. "a pricing table", "customer testimonials", "an FAQ", "a contact section", "our team", "a gallery") as a real requirement, not a suggestion -- include one genuinely written section per named item, using that real content (actual prices/plans, real-sounding FAQ questions and answers, etc.), never a generic placeholder section instead of the specific thing they asked for. If the user was specific enough to imply more sections than the complexity tier\'s target count, cover everything they explicitly named rather than silently dropping items to stay under that count -- it is better to run slightly over than to ship a build missing something the user paid for and asked for by name.',
    'Never reuse the same headline/body copy pattern across sections just to fill the section count -- if you cannot write something genuinely new and specific for a section, it is better to write fewer, stronger sections than to pad with repetitive filler.',
    'For a "features"/"about" section that is naturally a real list -- "Our Services", "Why Choose Us", a benefits list, a list of specialties -- write it as featureItems: 3-6 real, distinct items, each with a short title (label) and a genuinely specific one-sentence description, instead of cramming bullet points into one paragraph of body text. This renders as real individual cards, not a wall of text. Leave featureItems empty and write body as normal flowing prose for a section that reads better as a short story or explanation (e.g. a brief "About us" section) rather than a list.',
    complexityNote,
    'If the user asks for real video content -- news updates, highlights, tutorials, or anything else where an actual existing video (not a generated image) is the point -- include one section with kind "video" and a specific, real videoSearchQuery for it (e.g. a request for a basketball page with news/videos should search for something like real, current-sounding NBA highlights or news coverage, not just the word "basketball"). This is resolved against a real video search after you respond, so write a query that would actually find something relevant, not a placeholder.',
    'If the user asks for a game, quiz, trivia, or something fun/interactive to play, include exactly one section with kind "game" and pick the best-fitting gameKind: "trivia" for real, genuinely testable questions about the site\'s own topic (write 3-6 real questions, not placeholders); "memory" for a themed matching game (write 4-8 short emoji/words matching the topic); "clicker" for a playful tap-to-win button (write a short themed label); "tictactoe"/"connect4"/"rps" (rock-paper-scissors) are real 2-player games and need no extra content; "simon" (sequence-memory), "flappy" (physics-based side-scroller), "tetris" (falling-block puzzle), "targetrange3d" (real 3D shooting range), and "basketball" (real 3D physics game -- flick/swipe the ball toward the hoop, with real gravity, spin, and rim/backboard bounce) are real arcade games that also need no extra content. This becomes a real, working, playable mini-game on the published page, not a picture of one -- the 2-player kinds even let visitors play a real opponent online, not just each other on one device.',
    'The single most important rule for every section: if the user describes something that is inherently REAL, functional, purchasable, or interactive -- an item or service for sale, a live clock/timer, a game, a real video -- you must build the real thing, never a decorative picture standing in for it. A generated image is only appropriate for backgrounds, branding, atmosphere, or illustrating an abstract idea (e.g. "a hero image conveying trust") -- never as a substitute for something the user asked to actually work. When in doubt between a plain image section and a richer real element (product/game/widget/video), always pick the richer one that actually does the thing.',
    'If the user asks to sell/buy a physical or digital item, or book a service -- anything with a price -- include one section per distinct item with kind "product": a real name/description/price, 2-4 concrete productImagePrompts (different real angles/contexts of the same item, never different items), and the right productSaleType. This becomes a real sellable listing with live stock and a real checkout, not a picture of the item.',
    'CRITICAL: any request to let customers schedule an appointment, book a service, request a quote, reserve a slot, or pay for a real-life service (a repair call-out, a consultation, a table, a haircut, a cleaning job, anything a business would normally take a booking for) must ALWAYS become a kind "product" section with productSaleType "service" -- NEVER a kind "widget" (especially never widgetKind "calculator", which only does plain arithmetic and has no real booking or payment behind it) and NEVER a kind "custom" bespoke form (which is a static decorative form with no real backend). The "product" kind with productSaleType "service" is the ONLY one of these that becomes a real, working booking flow -- a real date/time/notes picker and a real Stripe checkout that actually charges the customer and pays the business (minus this platform\'s small fee), which is exactly what a service business needs. Reserve widgetKind "calculator" strictly for a genuinely generic, free-standing calculation tool unrelated to booking or paying for anything (e.g. a BMI or tip calculator).',
    ...(existingProductNames.length > 0
      ? [
          `The user already has these real products saved in their own product catalog: ${existingProductNames.map((n) => `"${n}"`).join(', ')}. If the user's prompt asks to add, include, feature, or sell one of these (by its exact name or anything close to it -- a partial name, a typo, different capitalization), set that section's productName to the EXACT name from this list, copied verbatim -- this imports the user's real existing product (its real photos, price, and stock) into the build instead of inventing a new one. Leave productDescription/productPriceUsd/productImagePrompts as empty/zero/empty-array for a matched product -- its real data already exists and must not be overwritten. Only write a new name with real productDescription/productPriceUsd/productImagePrompts when the user is describing an item that is NOT already in this list.`,
        ]
      : []),
    `Today's real date is ${todayIso}. Use this as ground truth for any date math -- e.g. a "countdown" widget's target date must be computed from this real date, never guessed or left in the past.`,
    'If the user asks for a clock, world clock, or similar always-current time display, include one section with kind "widget", widgetKind "clock", and widgetTimezones -- one entry for a simple clock, multiple real IANA timezones (e.g. real zone ids for New York, London, Tokyo) for a "world clock". This becomes a real, ticking, always-current clock on the published site, never a static image of a clock face.',
    'If the user asks for a countdown to a real event/date (a launch, a deadline, a holiday, an anniversary), include one section with kind "widget", widgetKind "countdown", a real future widgetCountdownTargetIso computed from today\'s real date above, and a short widgetCountdownLabel. If the user asks for a stopwatch, lap timer, or "time how long something takes" tool, use widgetKind "stopwatch". If the user asks for a calculator, use widgetKind "calculator". If the user asks to convert units (length, weight, temperature, volume, distance), use widgetKind "unitconverter". Each becomes a real, fully working interactive tool on the published site -- never a static image or description of one.',
    'If the user describes something else that is genuinely real, functional, or interactive -- a game, tool, calculator, or mini-app that doesn\'t match any specific kind above -- include one section with kind "custom" and a specific customDescription stating exactly what real thing to build (what it does, how a visitor interacts with it, what it shows). This gets built into real, working, bespoke HTML/CSS/JS afterward -- so describe the actual functionality precisely, not a vague theme. Only fall back to "custom" when none of the specific kinds above (product/game/widget/video) already cover the request.',
    'Never add a clock, world clock, countdown, stopwatch, calculator, unit converter, or bespoke "custom" section just because a complexity tier calls for more interactivity or engagement, or because the site would look more impressive with an extra novelty feature. Every widget/custom trigger above is gated on the user\'s own prompt actually asking for that specific thing (or naming a real need it genuinely solves) -- a clock on a site about clocks/time zones/scheduling is real, a clock bolted onto an unrelated store or topic (e.g. a Pokémon merchandise site, a bakery, a plumber) is random filler with no connection to what the site is about and must never be added. This applies at every tier including "Go All Out": lean into product/game/video richness the prompt actually supports, never into unrelated gimmick tools.',
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
  referenceImages?: string[],
  pageType: 'website' | 'video' | 'social' | 'logo' = 'website',
  existingProductNames: string[] = []
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
      { role: 'system', content: buildSystemPrompt(complexity, new Date().toISOString(), pageType, existingProductNames) },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_schema', json_schema: SITE_PLAN_SCHEMA },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('The AI did not return a site plan.');
  return JSON.parse(raw) as SitePlan;
}

// `quality: 'high'` (used for real product photography, since a buyer is judging an actual
// item they might purchase) costs more per image than the 'medium' default used for
// decorative hero/gallery art -- gpt-image-1 doesn't produce literal 4K output either way
// (its max is around 1536px on the long edge), so "high-quality generated photos" is the
// honest framing, not "4K".
export async function generateImage(
  client: OpenAI,
  prompt: string,
  quality: 'medium' | 'high' = 'medium',
  size: '1024x1024' | '1024x1536' = '1024x1024'
): Promise<Buffer> {
  const result = await client.images.generate({
    model: 'gpt-image-1',
    prompt,
    size,
    quality,
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

const CUSTOM_WIDGET_SCHEMA = {
  name: 'custom_widget',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      html: {
        type: 'string',
        description:
          'A single complete, self-contained HTML fragment: one wrapping <div>, inline <style> (every selector scoped/prefixed so it can never leak into or be affected by the rest of the page), and inline <script> with real working logic. Vanilla JS only, no external libraries/CDNs, no network requests.',
      },
      imagePrompts: {
        type: 'array',
        maxItems: 4,
        items: { type: 'string' },
        description:
          'One real, vivid, specific image-generation prompt per {{IMAGE_n}} placeholder used in html, in the same order ({{IMAGE_1}} first, etc.). Empty array if the widget uses no images (most calculators/games/converters need none).',
      },
    },
    required: ['html', 'imagePrompts'],
  },
} as const;

export interface CustomWidgetCode {
  html: string;
  imagePrompts: string[];
}

// Generates a real, self-contained interactive mini-app for a request that doesn't fit any
// other real element kind -- see CustomWidgetElement in types.ts. The model writes actual
// working HTML/CSS/JS (not a description of one, not a mockup), using {{IMAGE_1}},
// {{IMAGE_2}}, ... as placeholders anywhere a real photo/illustration genuinely belongs --
// each is paired with its own real image-generation prompt in the returned imagePrompts,
// resolved into a real generated image and substituted in by the caller (see
// generateCustomWidgetImages usage in index.ts) -- never a broken link or invented URL.
export async function generateCustomWidgetCode(
  client: OpenAI,
  model: string,
  description: string,
  siteName: string,
  accentColor: string,
  textColor: string
): Promise<CustomWidgetCode> {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: [
          'You are a senior frontend engineer building one real, fully working, self-contained interactive widget for a website, exactly as described -- not a mockup, not a placeholder, not a description of what it would do.',
          'Output a single complete HTML fragment: one wrapping <div>, inline <style> scoped to that div (prefix every selector so it can never leak into or be affected by the rest of the page), and inline <script> with real working logic (event listeners, real computation, real state) -- vanilla JS only, no external libraries or CDN scripts, no network requests to any domain.',
          `Design it to genuinely match this site's real look: accent colour ${accentColor}, text colour ${textColor}, site name "${siteName}" where relevant. Make it look intentionally designed, not default-browser-styled -- real spacing, rounded corners, a coherent color scheme, legible typography, visible hover/active states on anything clickable.`,
          'If (and only if) the thing being built genuinely calls for a real photo or illustration (a visual reference image, a themed backdrop, an icon a font/emoji genuinely can\'t convey), use an <img> tag with src="{{IMAGE_1}}" (then {{IMAGE_2}}, {{IMAGE_3}}, ... in order for more) as a placeholder -- never invent a real-looking URL yourself. List one real, vivid, specific prompt per placeholder in imagePrompts, in the same order. Most widgets (calculators, games, converters, tools) need zero images -- leave imagePrompts empty rather than forcing one in just to have one.',
          'The whole thing must fit and genuinely work at small mobile widths (assume roughly 340-390px wide) as well as wider -- use relative sizing and flexbox/grid. Before finishing, mentally verify every button actually does something real and any math/logic is actually correct.',
          'Write real, specific content and logic for the exact topic described -- e.g. real chess rules for a chess widget, the real BMI formula and real category thresholds for a BMI calculator -- never placeholder/fake logic standing in for the real thing.',
        ].join(' '),
      },
      { role: 'user', content: description },
    ],
    response_format: { type: 'json_schema', json_schema: CUSTOM_WIDGET_SCHEMA },
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('The AI did not return widget code.');
  return JSON.parse(raw) as CustomWidgetCode;
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
