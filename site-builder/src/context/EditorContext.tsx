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
import { generateId } from '@/utils/id';

interface EditorContextValue {
  project: Project | null;
  selectedId: string | null;
  select: (id: string | null) => void;
  addElement: (el: CanvasElement) => void;
  updateElement: (id: string, patch: Partial<CanvasElement>) => void;
  removeElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  bringToFront: (id: string) => void;
  reorderElement: (id: string, direction: 'up' | 'down') => void;
  updateProject: (patch: Partial<Project>) => void;
  selectedElement: CanvasElement | null;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({
  uid,
  projectId,
  children,
}: {
  uid: string;
  projectId: string;
  children: React.ReactNode;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A live subscription, not a one-time get(): an AI build can still be writing the
    // finished project (real name + elements) to this doc after this screen has already
    // opened it with the pre-generation placeholder. A one-time fetch could permanently
    // miss that later write and leave the canvas looking stuck on "Generating...".
    const unsubscribe = projectsStore.subscribe(uid, projectId, (p) => setProject(p));
    return unsubscribe;
  }, [uid, projectId]);

  const scheduleSave = useCallback(
    (next: Project) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        projectsStore.save(uid, next);
      }, 400);
    },
    [uid]
  );

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

  const duplicateElement = useCallback(
    (id: string) => {
      let newId: string | null = null;
      setProject((prev) => {
        if (!prev) return prev;
        const source = prev.elements.find((el) => el.id === id);
        if (!source) return prev;
        const maxZ = Math.max(0, ...prev.elements.map((e) => e.zIndex));
        newId = generateId('el');
        const clone = { ...source, id: newId, x: source.x + 16, y: source.y + 16, zIndex: maxZ + 1 } as CanvasElement;
        const next = { ...prev, elements: [...prev.elements, clone] };
        scheduleSave(next);
        return next;
      });
      if (newId) setSelectedId(newId);
    },
    [scheduleSave]
  );

  // Swaps z-index with the neighboring element in stacking order -- 'up' moves this
  // element in front of (visually over) whatever is currently just above it, 'down' moves
  // it behind whatever is currently just below it. Lets the Layers panel reorder overlaps
  // without needing a drag-to-reorder gesture inside its own list.
  const reorderElement = useCallback(
    (id: string, direction: 'up' | 'down') => {
      setProject((prev) => {
        if (!prev) return prev;
        const sorted = [...prev.elements].sort((a, b) => a.zIndex - b.zIndex);
        const index = sorted.findIndex((el) => el.id === id);
        if (index === -1) return prev;
        const swapIndex = direction === 'up' ? index + 1 : index - 1;
        if (swapIndex < 0 || swapIndex >= sorted.length) return prev;
        const a = sorted[index];
        const b = sorted[swapIndex];
        const next = {
          ...prev,
          elements: prev.elements.map((el) => {
            if (el.id === a.id) return { ...el, zIndex: b.zIndex };
            if (el.id === b.id) return { ...el, zIndex: a.zIndex };
            return el;
          }),
        };
        scheduleSave(next);
        return next;
      });
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
    duplicateElement,
    bringToFront,
    reorderElement,
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
