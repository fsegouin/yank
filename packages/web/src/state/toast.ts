import { create } from 'zustand';

export interface ToastPayload {
  label: string;
  onUndo: () => void;
  durationMs?: number;
}

export interface SimpleToastPayload {
  label: string;
  kind: 'error' | 'info' | 'success';
  durationMs?: number;
}

interface ToastState {
  toast: ToastPayload | null;
  simpleToast: SimpleToastPayload | null;
  showUndoToast: (payload: ToastPayload) => void;
  show: (payload: SimpleToastPayload) => void;
  clear: () => void;
}

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  simpleToast: null,

  showUndoToast({ label, onUndo, durationMs = 5000 }) {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    set({ toast: { label, onUndo, durationMs } });
    dismissTimer = setTimeout(() => {
      set({ toast: null });
      dismissTimer = null;
    }, durationMs);
  },

  show({ label, kind, durationMs = 4000 }) {
    set({ simpleToast: { label, kind, durationMs } });
    setTimeout(() => {
      set({ simpleToast: null });
    }, durationMs);
  },

  clear() {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    set({ toast: null });
  },
}));

export function showErrorToast(label: string): void {
  useToastStore.getState().show({ label, kind: 'error' });
}
