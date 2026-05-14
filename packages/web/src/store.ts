import { create } from 'zustand';

interface UiState {
  activeChat: string | null;
  drafts: Record<string, string>;
  setActiveChat: (id: string | null) => void;
  setDraft: (chatId: string, text: string) => void;
  clearDraft: (chatId: string) => void;
}

export const useUi = create<UiState>((set) => ({
  activeChat: null,
  drafts: {},
  setActiveChat: (id) => set({ activeChat: id }),
  setDraft: (chatId, text) => set((s) => ({ drafts: { ...s.drafts, [chatId]: text } })),
  clearDraft: (chatId) =>
    set((s) => {
      const { [chatId]: _omit, ...rest } = s.drafts;
      return { drafts: rest };
    }),
}));
