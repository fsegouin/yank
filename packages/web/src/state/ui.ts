import { create } from 'zustand';

// TODO(M3-D1): replace with `import type { Workspace } from '@yank/shared'` once C1 lands.
type Workspace = 'work' | 'personal' | 'triage' | 'hidden';

// Workspace selection in the UI is one of work/personal/triage (not 'hidden').
export type ActiveWorkspace = Exclude<Workspace, 'hidden'>;

interface UiState {
  workspace: ActiveWorkspace;
  paletteOpen: boolean;
  openThreadId: string | null;

  setWorkspace: (w: ActiveWorkspace) => void;
  togglePalette: (open?: boolean) => void;
  openThread: (messageId: string) => void;
  closeThread: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  workspace: 'work',
  paletteOpen: false,
  openThreadId: null,

  setWorkspace: (workspace) => set({ workspace }),
  togglePalette: (open) => set((s) => ({ paletteOpen: open ?? !s.paletteOpen })),
  openThread: (openThreadId) => set({ openThreadId }),
  closeThread: () => set({ openThreadId: null }),
}));
