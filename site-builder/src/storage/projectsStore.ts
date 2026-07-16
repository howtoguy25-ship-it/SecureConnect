import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { Project } from '@/types';
import { requireDb } from '@/services/requireDb';

function projectsCollection(uid: string) {
  return collection(requireDb(db), 'users', uid, 'projects');
}

export const projectsStore = {
  async list(uid: string): Promise<Project[]> {
    const snapshot = await getDocs(query(projectsCollection(uid), orderBy('updatedAt', 'desc')));
    return snapshot.docs.map((d) => d.data() as Project);
  },

  async get(uid: string, id: string): Promise<Project | null> {
    const snapshot = await getDoc(doc(projectsCollection(uid), id));
    return snapshot.exists() ? (snapshot.data() as Project) : null;
  },

  async save(uid: string, project: Project): Promise<void> {
    const updated: Project = { ...project, updatedAt: Date.now() };
    await setDoc(doc(projectsCollection(uid), project.id), updated);
  },

  async remove(uid: string, id: string): Promise<void> {
    await deleteDoc(doc(projectsCollection(uid), id));
  },

  async rename(uid: string, id: string, name: string): Promise<void> {
    await updateDoc(doc(projectsCollection(uid), id), { name, updatedAt: Date.now() });
  },
};
