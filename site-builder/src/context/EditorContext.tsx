import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CanvasElement, Project } from '@/types';
import { projectsStore } from '@/storage/projectsStore';

interface EditorContextValue {
  project: Project | null;
  selectedId: string | null;
  select: (id: string | null) => void;
  addElement: (el: CanvasElement) => void;
  updateElement: (id: string, patch: Partial<CanvasElement>) => void;
  removeElement: (id: string) => void;
  bringToFront: (id: string) => void;
  updateProject: (patch: Partial<Project>) => void;
  selectedElement: CanvasElement | null;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    projectsStore.get(projectId).then((p) => setProject(p));
  }, [projectId]);

  const scheduleSave = useCallback((next: Project) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      projectsStore.save(next);
    }, 400);
  }, []);

  const updateProject = useCallback(
    (patch: Partial<Project>) => {
      setProject((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const addElement = useCallback(
    (el: CanvasElement) => {
      setProject((prev) => {
        if (!prev) return prev;
        const next = { ...prev, elements: [...prev.elements, el] };
        scheduleSave(next);
        return next;
      });
      setSelectedId(el.id);
    },
    [scheduleSave]
  );

  const updateElement = useCallback(
    (id: string, patch: Partial<CanvasElement>) => {
      setProject((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          elements: prev.elements.map((el) => (el.id === id ? ({ ...el, ...patch } as CanvasElement) : el)),
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const removeElement = useCallback(
    (id: string) => {
      setProject((prev) => {
        if (!prev) return prev;
        const next = { ...prev, elements: prev.elements.filter((el) => el.id !== id) };
        scheduleSave(next);
        return next;
      });
      setSelectedId((prev) => (prev === id ? null : prev));
    },
    [scheduleSave]
  );

  const bringToFront = useCallback(
    (id: string) => {
      setProject((prev) => {
        if (!prev) return prev;
        const maxZ = Math.max(0, ...prev.elements.map((e) => e.zIndex));
        const next = {
          ...prev,
          elements: prev.elements.map((el) => (el.id === id ? { ...el, zIndex: maxZ + 1 } : el)),
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const selectedElement = useMemo(
    () => project?.elements.find((e) => e.id === selectedId) ?? null,
    [project, selectedId]
  );

  const value: EditorContextValue = {
    project,
    selectedId,
    select: setSelectedId,
    addElement,
    updateElement,
    removeElement,
    bringToFront,
    updateProject,
    selectedElement,
  };

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}
