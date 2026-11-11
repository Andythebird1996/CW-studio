import { create } from 'zustand';
import type { Questionnaire, MediaFile, PackageMetadata } from '../types/questionnaire';

export type TabType = 'questionnaire' | 'calculation' | 'translation';

/** Snapshot of the editable parts of a tab (for undo/redo) */
interface TabSnapshot {
  data: Questionnaire | null;
  rapFiles?: Record<string, string>;
  activeRapFileName?: string;
}

export interface EditorTab {
  id: string;
  title: string;
  type: TabType;
  isDirty: boolean;
  data: Questionnaire | null;
  packageCode?: string;
  /** All RAP report templates: fileName → content */
  rapFiles?: Record<string, string>;
  /** Which RAP file is currently open in ReportEditor */
  activeRapFileName?: string;
  mediaFiles?: MediaFile[];
  packageMetadata?: PackageMetadata;
  /** Undo stack — past snapshots, most-recent last */
  _past?: TabSnapshot[];
  /** Redo stack — future snapshots, next-to-restore last */
  _future?: TabSnapshot[];
}

const MAX_HISTORY = 50;
const AUTOSAVE_KEY = 'cw-studio-autosave';
const RECENT_KEY = 'cw-studio-recent';
const MAX_RECENT = 10;

/** Strip undo/redo history from a tab before persisting (too large) */
function stripHistory(tab: EditorTab): Omit<EditorTab, '_past' | '_future'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _past, _future, ...rest } = tab;
  return rest;
}

interface WorkspaceStore {
  tabs: EditorTab[];
  activeTabId: string | null;
  recentFiles: { uid: string; title: string; openedAt: number }[];
  openTab: (tab: EditorTab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  /** Update tab fields. Pass `_pushHistory: true` to snapshot before update (default: true when data/rapFiles change). */
  updateTab: (id: string, patch: Partial<EditorTab> & { _pushHistory?: boolean }) => void;
  markDirty: (id: string) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  canUndo: (id: string) => boolean;
  canRedo: (id: string) => boolean;
  /** Auto-save current tabs to localStorage */
  saveToLocalStorage: () => void;
  /** Load auto-saved session from localStorage */
  loadAutoSave: () => { tabs: EditorTab[]; activeTabId: string | null; savedAt: number } | null;
  /** Clear auto-save from localStorage */
  clearAutoSave: () => void;
  /** Add a file to the recently opened list */
  addRecentFile: (uid: string, title: string) => void;
  /** Load recent files from localStorage into state */
  loadRecentFiles: () => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => {
  // Schedule loadRecentFiles after store is initialized
  window.setTimeout(() => get().loadRecentFiles(), 0);

  return {
    tabs: [],
    activeTabId: null,
    recentFiles: [],

    openTab: (tab) =>
      set((state) => {
        const existing = state.tabs.find((t) => t.id === tab.id);
        if (existing) return { activeTabId: tab.id };
        return { tabs: [...state.tabs, { ...tab, _past: [], _future: [] }], activeTabId: tab.id };
      }),

    closeTab: (id) =>
      set((state) => {
        const idx = state.tabs.findIndex((t) => t.id === id);
        const remaining = state.tabs.filter((t) => t.id !== id);
        const nextActive =
          state.activeTabId === id
            ? remaining[Math.max(0, idx - 1)]?.id ?? null
            : state.activeTabId;
        return { tabs: remaining, activeTabId: nextActive };
      }),

    setActiveTab: (id) => set({ activeTabId: id }),

    updateTab: (id, patch) => {
      set((state) => {
        const { _pushHistory = true, ...rest } = patch;
        return {
          tabs: state.tabs.map((t) => {
            if (t.id !== id) return t;
            const shouldSnapshot = _pushHistory && ('data' in rest || 'rapFiles' in rest);
            const past = shouldSnapshot
              ? [...(t._past ?? []), { data: t.data, rapFiles: t.rapFiles, activeRapFileName: t.activeRapFileName }].slice(-MAX_HISTORY)
              : (t._past ?? []);
            const future = shouldSnapshot ? [] : (t._future ?? []);
            return { ...t, ...rest, _past: past, _future: future };
          }),
        };
      });
      // Persist after state update when data or rapFiles changed
      if ('data' in patch || 'rapFiles' in patch) {
        window.setTimeout(() => get().saveToLocalStorage(), 0);
      }
    },

    markDirty: (id) =>
      set((state) => ({
        tabs: state.tabs.map((t) => (t.id === id ? { ...t, isDirty: true } : t)),
      })),

    undo: (id) => {
      set((state) => ({
        tabs: state.tabs.map((t) => {
          if (t.id !== id) return t;
          const past = t._past ?? [];
          if (past.length === 0) return t;
          const snapshot = past[past.length - 1];
          const newPast = past.slice(0, -1);
          const newFuture = [{ data: t.data, rapFiles: t.rapFiles, activeRapFileName: t.activeRapFileName }, ...(t._future ?? [])];
          return {
            ...t,
            data: snapshot.data,
            rapFiles: snapshot.rapFiles,
            activeRapFileName: snapshot.activeRapFileName,
            title: snapshot.data
              ? (snapshot.data.name[snapshot.data.defaultLanguage] || snapshot.data.code || t.title)
              : t.title,
            isDirty: true,
            _past: newPast,
            _future: newFuture,
          };
        }),
      }));
      window.setTimeout(() => get().saveToLocalStorage(), 0);
    },

    redo: (id) => {
      set((state) => ({
        tabs: state.tabs.map((t) => {
          if (t.id !== id) return t;
          const future = t._future ?? [];
          if (future.length === 0) return t;
          const snapshot = future[0];
          const newFuture = future.slice(1);
          const newPast = [...(t._past ?? []), { data: t.data, rapFiles: t.rapFiles, activeRapFileName: t.activeRapFileName }];
          return {
            ...t,
            data: snapshot.data,
            rapFiles: snapshot.rapFiles,
            activeRapFileName: snapshot.activeRapFileName,
            title: snapshot.data
              ? (snapshot.data.name[snapshot.data.defaultLanguage] || snapshot.data.code || t.title)
              : t.title,
            isDirty: true,
            _past: newPast,
            _future: newFuture,
          };
        }),
      }));
      window.setTimeout(() => get().saveToLocalStorage(), 0);
    },

    canUndo: (id) => (get().tabs.find((t) => t.id === id)?._past?.length ?? 0) > 0,
    canRedo: (id) => (get().tabs.find((t) => t.id === id)?._future?.length ?? 0) > 0,

    saveToLocalStorage: () => {
      const { tabs, activeTabId } = get();
      try {
        const payload = {
          tabs: tabs.map(stripHistory),
          activeTabId,
          savedAt: Date.now(),
        };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
      } catch {
        // Quota exceeded or private browsing — silently ignore
      }
    },

    loadAutoSave: () => {
      try {
        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.tabs)) return null;
        return parsed as { tabs: EditorTab[]; activeTabId: string | null; savedAt: number };
      } catch {
        return null;
      }
    },

    clearAutoSave: () => {
      try {
        localStorage.removeItem(AUTOSAVE_KEY);
      } catch {
        // ignore
      }
    },

    addRecentFile: (uid, title) => {
      set((state) => {
        const filtered = state.recentFiles.filter((r) => r.uid !== uid);
        const updated = [{ uid, title, openedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT);
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
        return { recentFiles: updated };
      });
    },

    loadRecentFiles: () => {
      try {
        const raw = localStorage.getItem(RECENT_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          set({ recentFiles: parsed });
        }
      } catch {
        // ignore
      }
    },
  };
});
