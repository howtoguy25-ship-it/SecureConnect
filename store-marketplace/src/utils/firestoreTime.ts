import { Timestamp } from "firebase/firestore";

/** Firestore returns its own Timestamp type for fields written via serverTimestamp()/Timestamp,
 * but our app types model every timestamp field as a plain epoch-millis number for easy display
 * and sorting -- this is the single place that bridges the two. */
export function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return Date.now();
}
