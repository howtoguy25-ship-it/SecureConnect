import AsyncStorage from '@react-native-async-storage/async-storage';
import { Project } from '@/types';

const PROJECTS_KEY = 'siteforge:projects';

async function readAll(): Promise<Project[]> {
  const raw = await AsyncStorage.getItem(PROJECTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Project[];
  } catch {
    return [];
  }
}

async function writeAll(projects: Project[]): Promise<void> {
  await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export const projectsStore = {
  async list(): Promise<Project[]> {
    const projects = await readAll();
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async get(id: string): Promise<Project | null> {
    const projects = await readAll();
    return projects.find((p) => p.id === id) ?? null;
  },

  async save(project: Project): Promise<void> {
    const projects = await readAll();
    const idx = projects.findIndex((p) => p.id === project.id);
    const updated = { ...project, updatedAt: Date.now() };
    if (idx >= 0) {
      projects[idx] = updated;
    } else {
      projects.push(updated);
    }
    await writeAll(projects);
  },

  async remove(id: string): Promise<void> {
    const projects = await readAll();
    await writeAll(projects.filter((p) => p.id !== id));
  },

  async rename(id: string, name: string): Promise<void> {
    const projects = await readAll();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx >= 0) {
      projects[idx] = { ...projects[idx], name, updatedAt: Date.now() };
      await writeAll(projects);
    }
  },
};
