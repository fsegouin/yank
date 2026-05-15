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
  openThreadId: string | null;
  editing: EditingState | null;

  setWorkspace: (w: ActiveWorkspace) => void;
  togglePalette: (open?: boolean) => void;
  openThread: (messageId: string) => void;
  closeThread: () => void;
  setEditing: (value: EditingState | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  workspace: 'work',
  paletteOpen: false,
  openThreadId: null,
  editing: null,

  setWorkspace: (workspace) => set({ workspace }),
  togglePalette: (open) => set((s) => ({ paletteOpen: open ?? !s.paletteOpen })),
  openThread: (openThreadId) => set({ openThreadId }),
  closeThread: () => set({ openThreadId: null }),
  setEditing: (editing) => set({ editing }),
}));
