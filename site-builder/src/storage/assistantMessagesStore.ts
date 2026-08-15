import { collection, doc, setDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { requireDb } from '@/services/requireDb';
import { AssistantMessage } from '@/types';

const HISTORY_LIMIT = 40;

function messagesCollection(uid: string) {
  return collection(requireDb(db), 'users', uid, 'assistantMessages');
}

export const assistantMessagesStore = {
  // Most recent messages first from Firestore (so `limit` keeps the latest, not the
  // oldest, once history grows past HISTORY_LIMIT), reversed back to chronological order
  // for display.
  async list(uid: string): Promise<AssistantMessage[]> {
    const snapshot = await getDocs(
      query(messagesCollection(uid), orderBy('createdAt', 'desc'), limit(HISTORY_LIMIT))
    );
    return snapshot.docs.map((d) => d.data() as AssistantMessage).reverse();
  },

  async add(uid: string, message: AssistantMessage): Promise<void> {
    await setDoc(doc(messagesCollection(uid), message.id), message);
  },
};
