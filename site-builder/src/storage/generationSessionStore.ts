import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { requireDb } from '@/services/requireDb';
import { GenerationSession } from '@/types';

function sessionDoc(uid: string, sessionId: string) {
  return doc(requireDb(db), 'users', uid, 'generationSessions', sessionId);
}

function sessionsCollection(uid: string) {
  return collection(requireDb(db), 'users', uid, 'generationSessions');
}

export const generationSessionStore = {
  subscribe(uid: string, sessionId: string, onChange: (session: GenerationSession | null) => void): () => void {
    return onSnapshot(sessionDoc(uid, sessionId), (snap) => {
      onChange(snap.exists() ? (snap.data() as GenerationSession) : null);
    });
  },

  // Real builds still in progress on the server -- lets the Projects screen show which
  // "Generating..." project has an active build behind it (and route back to watching it),
  // since a build keeps running even after the user has navigated away from that screen.
  async listActive(uid: string): Promise<GenerationSession[]> {
    const snap = await getDocs(query(sessionsCollection(uid), where('status', 'in', ['starting', 'generating', 'paused'])));
    return snap.docs.map((d) => d.data() as GenerationSession);
  },
};
