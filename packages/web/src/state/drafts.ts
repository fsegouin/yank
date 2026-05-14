import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface DraftsState {
  drafts: Record<string, string>;
  setDraft: (chatId: string, text: string) => void;
  clearDraft: (chatId: string) => void;
}

export const useDraftsStore = create<DraftsState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (chatId, text) =>
        set((s) => ({ drafts: { ...s.drafts, [chatId]: text } })),
      clearDraft: (chatId) =>
        set((s) => {
          const next = { ...s.drafts };
          delete next[chatId];
          return { drafts: next };
        }),
    }),
    {
      name: 'yank:drafts',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
