/** Mirrors the web app's utils/navFormat.ts formatArrivalClock -- same wall-clock format
 *  ("3:45 PM") on both surfaces. */
export function formatArrivalClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
