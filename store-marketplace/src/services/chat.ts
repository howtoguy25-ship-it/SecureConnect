import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { toMillis } from "@/utils/firestoreTime";
import type { ChatMessage } from "@/types";

function chatCol(businessId: string) {
  return collection(db, "businesses", businessId, "chatMessages");
}

export interface SendChatMessageInput {
  senderId: string;
  senderName: string;
  isStaff: boolean;
  text: string;
}

/** Requires the business's chatEnabled to be on and the sender to be an active follower or
 * active team member -- both enforced server-side in firestore.rules, not just here. */
export async function sendChatMessage(businessId: string, input: SendChatMessageInput): Promise<void> {
  await addDoc(chatCol(businessId), {
    businessId,
    ...input,
    createdAt: serverTimestamp(),
  });
}

export async function deleteChatMessage(businessId: string, messageId: string): Promise<void> {
  await deleteDoc(doc(db, "businesses", businessId, "chatMessages", messageId));
}

/** Real-time feed, oldest-first, capped to the most recent `max` messages so a long-running
 * store chat doesn't load its entire history on every open. */
export function watchChatMessages(
  businessId: string,
  onChange: (messages: ChatMessage[]) => void,
  max = 200
): Unsubscribe {
  const q = query(chatCol(businessId), orderBy("createdAt", "desc"), fsLimit(max));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => {
      const data = d.data();
      return {
        ...(data as Omit<ChatMessage, "id">),
        id: d.id,
        createdAt: toMillis(data.createdAt),
      };
    });
    onChange(messages.reverse());
  });
}
