const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

const VALID_CATEGORIES = [
  "ice_cream_gelato",
  "cafe_coffee",
  "bakery",
  "restaurant",
  "bar_brewery",
  "vape_smoke",
  "retail_fashion",
  "grocery_convenience",
  "other",
];

const SYSTEM_PROMPT = `You are a research assistant helping a small-business owner draft their store profile for a marketplace app. Use the web_search tool to find real, publicly available information about the named business at the given address (its official website, Google/Yelp-style listings, social media). Respond with ONLY a single JSON object, no prose, no markdown fences, matching exactly:
{
  "suggestedDescription": string (2-3 factual sentences, no marketing fluff),
  "suggestedCategoryId": one of ${JSON.stringify(VALID_CATEGORIES)},
  "suggestedItems": [{ "name": string, "price": number|null, "fields": { [key: string]: string } }],
  "sourceNotes": string
}
Rules:
- Never invent items, prices, or details you can't find a real source for. If you find nothing reliable, return an empty suggestedItems array and explain in sourceNotes.
- suggestedItems is capped at 8 entries.
- This draft is shown to the owner to confirm, edit, or discard before anything is published -- accuracy matters far more than completeness.
- Never claim to have uploaded or fetched images; you only propose text fields.`;

/**
 * Callable: asks Claude (with the web_search tool) to research a named business and draft a
 * suggested description/category/starter item list. Always returns a draft for human review --
 * nothing from this function is ever written directly to a business's live stock or profile.
 */
exports.aiDraftStoreProfile = onCall({ secrets: [anthropicApiKey], timeoutSeconds: 60 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const { businessName, address, categoryId } = request.data || {};
  if (!businessName || !address) {
    throw new HttpsError("invalid-argument", "businessName and address are required.");
  }

  const apiKey = anthropicApiKey.value();
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "AI onboarding isn't configured yet -- set ANTHROPIC_API_KEY via `firebase functions:secrets:set ANTHROPIC_API_KEY`."
    );
  }

  const userPrompt = `Business name: ${businessName}\nAddress: ${address}\nOwner-selected category (may be wrong, feel free to correct): ${categoryId || "unknown"}\n\nResearch this business and return the draft JSON described in your instructions.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.AI_ONBOARDING_MODEL || "claude-sonnet-5",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Anthropic API error", res.status, errText);
    throw new HttpsError("internal", "AI research service failed -- try again shortly.");
  }

  const payload = await res.json();
  const textBlock = (payload.content || []).slice().reverse().find((b) => b.type === "text");
  if (!textBlock) {
    throw new HttpsError("internal", "AI response had no text content.");
  }

  let draft;
  try {
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    draft = JSON.parse(jsonMatch ? jsonMatch[0] : textBlock.text);
  } catch (err) {
    console.error("Failed to parse AI draft JSON:", textBlock.text);
    throw new HttpsError("internal", "Couldn't parse the AI draft -- try again.");
  }

  const suggestedItems = Array.isArray(draft.suggestedItems) ? draft.suggestedItems.slice(0, 8) : [];

  return {
    suggestedDescription: typeof draft.suggestedDescription === "string" ? draft.suggestedDescription : "",
    suggestedCategoryId: VALID_CATEGORIES.includes(draft.suggestedCategoryId)
      ? draft.suggestedCategoryId
      : categoryId || "other",
    suggestedItems: suggestedItems.map((item) => ({
      name: String(item.name || ""),
      price: typeof item.price === "number" ? item.price : null,
      fields: typeof item.fields === "object" && item.fields ? item.fields : {},
    })),
    sourceNotes: typeof draft.sourceNotes === "string" ? draft.sourceNotes : "",
    generatedAt: Date.now(),
  };
});
