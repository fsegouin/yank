import { create } from 'zustand';

export interface ToastPayload {
  label: string;
  onUndo: () => void;
  durationMs?: number;
}

interface ToastState {
  toast: ToastPayload | null;
  showUndoToast: (payload: ToastPayload) => void;
  clear: () => void;
}

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,

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

  clear() {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    set({ toast: null });
  },
}));
