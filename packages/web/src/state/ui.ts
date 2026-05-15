import { create } from 'zustand';
import type { Workspace } from '@yank/shared';

export type ActiveWorkspace = Exclude<Workspace, 'hidden'>;

export interface EditingState {
  messageId: string;
  originalText: string;
  chatId: string;
}

interface UiState {
  workspace: ActiveWorkspace;
  paletteOpen: boolean;
  paletteMode: 'chats-only' | null;
  openThreadId: string | null;
  editing: EditingState | null;
  currentJid: string | null;
  chatFilter: { open: boolean; query: string; hitIndex: number };

  setWorkspace: (w: ActiveWorkspace) => void;
  togglePalette: (open?: boolean) => void;
  openPalette: (mode?: 'chats-only') => void;
  openThread: (messageId: string) => void;
  closeThread: () => void;
  setEditing: (value: EditingState | null) => void;
  setCurrentJid: (jid: string) => void;
  setChatFilter: (patch: Partial<{ open: boolean; query: string; hitIndex: number }>) => void;
}

export const useUiStore = create<UiState>((set) => ({
  workspace: 'work',
  paletteOpen: false,
  paletteMode: null,
  openThreadId: null,
  editing: null,
  currentJid: null,
  chatFilter: { open: false, query: '', hitIndex: 0 },

  setWorkspace: (workspace) => set({ workspace }),
  togglePalette: (open) =>
    set((s) => {
      const next = open ?? !s.paletteOpen;
      return { paletteOpen: next, paletteMode: next ? s.paletteMode : null };
    }),
  openPalette: (mode) => set({ paletteOpen: true, paletteMode: mode ?? null }),
  openThread: (openThreadId) => set({ openThreadId }),
  closeThread: () => set({ openThreadId: null }),
  setEditing: (editing) => set({ editing }),
  setCurrentJid: (currentJid) => set({ currentJid }),
  setChatFilter: (patch) => set((s) => ({ chatFilter: { ...s.chatFilter, ...patch } })),
}));
