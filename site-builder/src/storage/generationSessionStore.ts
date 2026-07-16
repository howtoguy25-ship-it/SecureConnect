import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { requireDb } from '@/services/requireDb';
import { GenerationSession } from '@/types';

function sessionDoc(uid: string, sessionId: string) {
  return doc(requireDb(db), 'users', uid, 'generationSessions', sessionId);
}

export const generationSessionStore = {
  subscribe(uid: string, sessionId: string, onChange: (session: GenerationSession | null) => void): () => void {
    return onSnapshot(sessionDoc(uid, sessionId), (snap) => {
      onChange(snap.exists() ? (snap.data() as GenerationSession) : null);
    });
  },
};
