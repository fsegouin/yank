import { create } from 'zustand';

interface EditErrorsState {
  errors: Record<string, number>; // messageId → expiry timestamp (ms)
  setError: (messageId: string) => void;
  clearError: (messageId: string) => void;
  hasError: (messageId: string) => boolean;
}

export const useEditErrorsStore = create<EditErrorsState>((set, get) => ({
  errors: {},
  setError: (messageId) => {
    const expiry = Date.now() + 10_000;
    set((s) => ({ errors: { ...s.errors, [messageId]: expiry } }));
    setTimeout(() => {
      set((s) => {
        const next = { ...s.errors };
        delete next[messageId];
        return { errors: next };
      });
    }, 10_000);
  },
  clearError: (messageId) =>
    set((s) => {
      const next = { ...s.errors };
      delete next[messageId];
      return { errors: next };
    }),
  hasError: (messageId) => {
    const expiry = get().errors[messageId];
    return expiry !== undefined && expiry > Date.now();
  },
}));
