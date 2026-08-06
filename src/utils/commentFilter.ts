// Real, enforced word cap for an alert's optional comment -- "up to 7 words," matching the
// explicit request, checked both live (see clampToWordLimit, used on every keystroke) and again
// right before the Firestore write (reportAlert) so a comment can never be saved over the limit
// no matter how it got typed/pasted in.
export const MAX_ALERT_COMMENT_WORDS = 7;

// The exact words/phrases named as not allowed, plus their most obvious everyday inflections
// (e.g. "fuck" without also catching "fucking"/"fucker" would trivially let the same word
// through) -- a small, curated list matching what was actually asked for, not a generic
// thousand-word obscenity library pulled in wholesale. "piggy" is deliberately NOT in this list
// (explicitly allowed) and is never caught by it: matching is whole-word only (\b...\b below), so
// "pig"/"pigs" are blocked but "piggy" -- a different word entirely -- never matches either of
// those two entries.
const BLOCKED_WORDS = [
  "fuck",
  "fucks",
  "fucking",
  "fucken",
  "fucker",
  "cunt",
  "cunts",
  "bitch",
  "bitches",
  "cockhead",
  "cockheads",
  "shit",
  "shits",
  "shitcunt",
  "shitcunts",
  "idiot",
  "idiots",
  "gronk",
  "gronks",
  "dog",
  "dogs",
  "pig",
  "pigs",
];

const BLOCKED_REGEX = new RegExp(`\\b(${BLOCKED_WORDS.join("|")})\\b`, "i");

/** True if `text` contains any of the not-allowed words as a whole word (case-insensitive) --
 *  "piggy" never matches, since it isn't the same word as "pig"/"pigs". */
export function containsBlockedLanguage(text: string): boolean {
  return BLOCKED_REGEX.test(text);
}

/** Trims `text` down to at most `maxWords` whitespace-separated words, leaving everything else
 *  (punctuation, casing) untouched. Used live on every keystroke in the comment field so it's
 *  never possible to type/paste past the limit in the first place. */
export function clampToWordLimit(text: string, maxWords: number = MAX_ALERT_COMMENT_WORDS): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ");
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
