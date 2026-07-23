import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CanvasElement, GradientFill, Project, SitePage } from '@/types';
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
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // Multi-page (manually-built websites only -- see Project.pages's comment). `pages` is
  // null for every other project, which is the signal every consumer uses to know whether
  // to show page-switching UI at all.
  pages: SitePage[] | null;
  activePageId: string | null;
  currentPage: SitePage | null;
  switchPage: (id: string) => void;
  addPage: (name: string) => void;
  renamePage: (id: string, name: string) => void;
  removePage: (id: string) => void;
  setPageBackground: (id: string, patch: { backgroundColor?: string; backgroundGradient?: GradientFill | null }) => void;
}

// Builds a URL-safe slug from a page name, falling back to a short random suffix if it's
// empty after stripping (e.g. a name that's only emoji/punctuation) and de-duplicating
// against every other page's slug so two pages never collide on the same published path.
function slugifyPageName(name: string, existingSlugs: string[]): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const root = base || `page-${generateId('page').slice(-6)}`;
  if (!existingSlugs.includes(root)) return root;
  let i = 2;
  while (existingSlugs.includes(`${root}-${i}`)) i++;
  return `${root}-${i}`;
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
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real undo/redo -- every mutator below pushes the project's state from just before its
  // change onto `historyRef`, and clears `futureRef` (a fresh edit invalidates whatever redo
  // history existed). `historyVersion` exists purely to force a re-render after a ref
  // mutation, since canUndo/canRedo need to reflect the latest ref contents on every render.
  const historyRef = useRef<Project[]>([]);
  const futureRef = useRef<Project[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const MAX_HISTORY = 50;

  const pushHistory = useCallback((prev: Project) => {
    historyRef.current = [...historyRef.current, prev].slice(-MAX_HISTORY);
    futureRef.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    // A live subscription, not a one-time get(): an AI build can still be writing the
    // finished project (real name + elements) to this doc after this screen has already
    // opened it with the pre-generation placeholder. A one-time fetch could permanently
    // miss that later write and leave the canvas looking stuck on "Generating...".
    const unsubscribe = projectsStore.subscribe(uid, projectId, (p) => setProject(p));
    return unsubscribe;
  }, [uid, projectId]);

  // Keeps activePageId pointed at a real page: picks Home the first time a multi-page
  // project loads, and re-settles onto pages[0] if the previously-active page ever
  // disappears out from under it (e.g. removePage on another device/tab).
  useEffect(() => {
    if (!project?.pages || project.pages.length === 0) {
      if (activePageId !== null) setActivePageId(null);
      return;
    }
    if (!activePageId || !project.pages.some((p) => p.id === activePageId)) {
      setActivePageId(project.pages[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.pages]);

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
        pushHistory(prev);
        const next = { ...prev, ...patch };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave, pushHistory]
  );

  // Central point every element mutator below goes through: applies `updater` to whichever
  // page is currently active (or the flat top-level elements, for every project that isn't
  // a multi-page website) and keeps the legacy top-level `elements`/`backgroundColor`
  // mirrored to Home (pages[0]) either way -- see Project.pages's comment for why.
  const applyElementsUpdate = useCallback(
    (prev: Project, updater: (elements: CanvasElement[]) => CanvasElement[]): Project => {
      if (prev.pages && prev.pages.length > 0) {
        const targetId = prev.pages.some((p) => p.id === activePageId) ? activePageId : prev.pages[0].id;
        const pages = prev.pages.map((p) => (p.id === targetId ? { ...p, elements: updater(p.elements) } : p));
        return { ...prev, pages, elements: pages[0].elements, backgroundColor: pages[0].backgroundColor, backgroundGradient: pages[0].backgroundGradient };
      }
      return { ...prev, elements: updater(prev.elements) };
    },
    [activePageId]
  );

  const addElement = useCallback(
    (el: CanvasElement) => {
      setProject((prev) => {
        if (!prev) return prev;
        pushHistory(prev);
        const next = applyElementsUpdate(prev, (elements) => [...elements, el]);
        scheduleSave(next);
        return next;
      });
      setSelectedId(el.id);
    },
    [scheduleSave, applyElementsUpdate, pushHistory]
  );

  const updateElement = useCallback(
    (id: string, patch: Partial<CanvasElement>) => {
      setProject((prev) => {
        if (!prev) return prev;
        pushHistory(prev);
        const next = applyElementsUpdate(prev, (elements) =>
          elements.map((el) => (el.id === id ? ({ ...el, ...patch } as CanvasElement) : el))
        );
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave, applyElementsUpdate, pushHistory]
  );

  const removeElement = useCallback(
    (id: string) => {
      setProject((prev) => {
        if (!prev) return prev;
        pushHistory(prev);
        const next = applyElementsUpdate(prev, (elements) => elements.filter((el) => el.id !== id));
        scheduleSave(next);
        return next;
      });
      setSelectedId((prev) => (prev === id ? null : prev));
    },
    [scheduleSave, applyElementsUpdate, pushHistory]
  );

  const duplicateElement = useCallback(
    (id: string) => {
      let newId: string | null = null;
      setProject((prev) => {
        if (!prev) return prev;
        pushHistory(prev);
        const next = applyElementsUpdate(prev, (elements) => {
          const source = elements.find((el) => el.id === id);
          if (!source) return elements;
          const maxZ = Math.max(0, ...elements.map((e) => e.zIndex));
          newId = generateId('el');
          const clone = { ...source, id: newId, x: source.x + 16, y: source.y + 16, zIndex: maxZ + 1 } as CanvasElement;
          return [...elements, clone];
        });
        scheduleSave(next);
        return next;
      });
      if (newId) setSelectedId(newId);
    },
    [scheduleSave, applyElementsUpdate, pushHistory]
  );

  // Swaps z-index with the neighboring element in stacking order -- 'up' moves this
  // element in front of (visually over) whatever is currently just above it, 'down' moves
  // it behind whatever is currently just below it. Lets the Layers panel reorder overlaps
  // without needing a drag-to-reorder gesture inside its own list.
  const reorderElement = useCallback(
    (id: string, direction: 'up' | 'down') => {
      setProject((prev) => {
        if (!prev) return prev;
        pushHistory(prev);
        const next = applyElementsUpdate(prev, (elements) => {
          const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
          const index = sorted.findIndex((el) => el.id === id);
          if (index === -1) return elements;
          const swapIndex = direction === 'up' ? index + 1 : index - 1;
          if (swapIndex < 0 || swapIndex >= sorted.length) return elements;
          const a = sorted[index];
          const b = sorted[swapIndex];
          return elements.map((el) => {
            if (el.id === a.id) return { ...el, zIndex: b.zIndex };
            if (el.id === b.id) return { ...el, zIndex: a.zIndex };
            return el;
          });
        });
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave, applyElementsUpdate, pushHistory]
  );

  const bringToFront = useCallback(
    (id: string) => {
      setProject((prev) => {
        if (!prev) return prev;
        pushHistory(prev);
        const next = applyElementsUpdate(prev, (elements) => {
          const maxZ = Math.max(0, ...elements.map((e) => e.zIndex));
          return elements.map((el) => (el.id === id ? { ...el, zIndex: maxZ + 1 } : el));
        });
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave, applyElementsUpdate, pushHistory]
  );

  const switchPage = useCallback((id: string) => {
    setActivePageId(id);
    setSelectedId(null);
  }, []);

  const addPage = useCallback(
    (name: string) => {
      setProject((prev) => {
        if (!prev || !prev.pages) return prev;
        pushHistory(prev);
        const slug = slugifyPageName(name, prev.pages.map((p) => p.slug));
        const newPage: SitePage = {
          id: generateId('page'),
          name: name.trim() || 'Untitled',
          slug,
          elements: [],
          backgroundColor: prev.pages[0]?.backgroundColor ?? prev.backgroundColor,
        };
        const next = { ...prev, pages: [...prev.pages, newPage] };
        scheduleSave(next);
        setActivePageId(newPage.id);
        setSelectedId(null);
        return next;
      });
    },
    [scheduleSave, pushHistory]
  );

  const renamePage = useCallback(
    (id: string, name: string) => {
      setProject((prev) => {
        if (!prev || !prev.pages) return prev;
        const trimmed = name.trim();
        if (!trimmed) return prev;
        pushHistory(prev);
        const pages = prev.pages.map((p) => (p.id === id ? { ...p, name: trimmed } : p));
        const next = { ...prev, pages };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave, pushHistory]
  );

  const removePage = useCallback(
    (id: string) => {
      setProject((prev) => {
        if (!prev || !prev.pages || prev.pages.length <= 1) return prev;
        pushHistory(prev);
        const pages = prev.pages.filter((p) => p.id !== id);
        const next = { ...prev, pages, elements: pages[0].elements, backgroundColor: pages[0].backgroundColor, backgroundGradient: pages[0].backgroundGradient };
        scheduleSave(next);
        setActivePageId((current) => (current === id ? pages[0].id : current));
        return next;
      });
    },
    [scheduleSave, pushHistory]
  );

  const setPageBackground = useCallback(
    (id: string, patch: { backgroundColor?: string; backgroundGradient?: GradientFill | null }) => {
      setProject((prev) => {
        if (!prev || !prev.pages) return prev;
        pushHistory(prev);
        const pages = prev.pages.map((p) => (p.id === id ? { ...p, ...patch } : p));
        const next = { ...prev, pages, backgroundColor: pages[0].backgroundColor, backgroundGradient: pages[0].backgroundGradient };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave, pushHistory]
  );

  // Undo pops the most recent snapshot off history, stashes the current state onto `future`
  // so redo can restore it, and jumps straight there -- no scheduleSave debounce, since an
  // undo/redo should feel instant and is exactly as save-worthy as any other edit.
  const undo = useCallback(() => {
    setProject((prev) => {
      if (!prev || historyRef.current.length === 0) return prev;
      const previousSnapshot = historyRef.current[historyRef.current.length - 1];
      historyRef.current = historyRef.current.slice(0, -1);
      futureRef.current = [...futureRef.current, prev];
      setHistoryVersion((v) => v + 1);
      projectsStore.save(uid, previousSnapshot);
      return previousSnapshot;
    });
  }, [uid]);

  const redo = useCallback(() => {
    setProject((prev) => {
      if (!prev || futureRef.current.length === 0) return prev;
      const nextSnapshot = futureRef.current[futureRef.current.length - 1];
      futureRef.current = futureRef.current.slice(0, -1);
      historyRef.current = [...historyRef.current, prev];
      setHistoryVersion((v) => v + 1);
      projectsStore.save(uid, nextSnapshot);
      return nextSnapshot;
    });
  }, [uid]);

  // historyVersion's only job is to force these to recompute on every ref mutation above --
  // the refs themselves aren't otherwise part of React's render dependency tracking.
  const canUndo = useMemo(() => historyRef.current.length > 0, [historyVersion]);
  const canRedo = useMemo(() => futureRef.current.length > 0, [historyVersion]);

  const currentPage = useMemo(
    () => (project?.pages && project.pages.length > 0 ? project.pages.find((p) => p.id === activePageId) ?? project.pages[0] : null),
    [project, activePageId]
  );

  const selectedElement = useMemo(
    () => (project ? (currentPage ? currentPage.elements : project.elements).find((e) => e.id === selectedId) ?? null : null),
    [project, currentPage, selectedId]
  );

  const value: EditorContextValue = {
    project,
    pages: project?.pages ?? null,
    activePageId,
    currentPage,
    switchPage,
    addPage,
    renamePage,
    removePage,
    setPageBackground,
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
    undo,
    redo,
    canUndo,
    canRedo,
  };

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}
