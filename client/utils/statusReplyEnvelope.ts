/**
 * Reply-to-Status envelope — lets a status reply carry a quoted preview of
 * the status being replied to (poster name, caption, media) through the
 * SAME E2EE channel as the reply text itself, mirroring the pattern already
 * used for encrypted-media messages (see encryptedMediaClient.ts).
 *
 * `mediaUrl` is only ever populated for a NON-encrypted (public "everyone")
 * status, where it's a real fetchable network URL both sides can load. For
 * an encrypted (closed-audience) status the replying client only ever holds
 * a locally-decrypted cache file URI, which is meaningless on the
 * recipient's device — so mediaUrl is left null and the quote degrades to
 * caption + poster name + a generic media-type icon rather than leaking or
 * embedding something unusable.
 */

export const STATUS_REPLY_PREFIX = "__SC_STATUS_REPLY_V1__";

export interface StatusReplyQuote {
  statusId: string;
  posterName: string;
  caption: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
}

export function buildStatusReplyEnvelope(quote: StatusReplyQuote, text: string): string {
  return STATUS_REPLY_PREFIX + JSON.stringify(quote) + "\n" + text;
}

export function parseStatusReplyEnvelope(
  body: string | null | undefined,
): { quote: StatusReplyQuote; text: string } | null {
  if (!body || !body.startsWith(STATUS_REPLY_PREFIX)) return null;
  try {
    const rest = body.slice(STATUS_REPLY_PREFIX.length);
    const nl = rest.indexOf("\n");
    if (nl === -1) return null;
    const quote = JSON.parse(rest.slice(0, nl)) as StatusReplyQuote;
    if (typeof quote?.statusId !== "string" || typeof quote?.posterName !== "string") return null;
    return { quote, text: rest.slice(nl + 1) };
  } catch {
    return null;
  }
}
