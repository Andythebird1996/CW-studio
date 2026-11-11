import { create } from 'zustand';
import type { Question, Section } from '../types/questionnaire';

type ClipboardItem =
  | { kind: 'question'; data: Question }
  | { kind: 'section'; data: Section };

interface ClipboardStore {
  item: ClipboardItem | null;
  copy: (item: ClipboardItem) => void;
  cut: (item: ClipboardItem) => void;
  isCut: boolean;
  clear: () => void;
}

export const useClipboardStore = create<ClipboardStore>((set) => ({
  item: null,
  isCut: false,
  copy: (item) => set({ item, isCut: false }),
  cut: (item) => set({ item, isCut: true }),
  clear: () => set({ item: null, isCut: false }),
}));
