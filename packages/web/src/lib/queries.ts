import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ChatSchema,
  ChatMemberSchema,
  MessagesPageSchema,
  type Chat,
  type ChatMember,
  type MessagesPage,
  type Workspace,
} from '@yank/shared';
import { z } from 'zod';
import { apiFetch } from './api.js';
import { queryKeys } from './queryKeys.js';

const ChatListSchema = z.array(ChatSchema);
const ChatMemberListSchema = z.array(ChatMemberSchema);

export function useChats() {
  return useQuery({
    queryKey: queryKeys.chats(),
    queryFn: async (): Promise<Chat[]> => {
      const raw = await apiFetch<unknown>('/api/chats');
      return ChatListSchema.parse(raw);
    },
  });
}

export function useChat(chatId: string) {
  return useQuery({
    queryKey: queryKeys.chat(chatId),
    queryFn: async (): Promise<Chat> => {
      const raw = await apiFetch<unknown>(`/api/chats/${chatId}`);
      return ChatSchema.parse(raw);
    },
  });
}

export function useMessages(chatId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.messages(chatId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<MessagesPage> => {
      const qs = pageParam ? `?before=${pageParam}&limit=50` : '?limit=50';
      const raw = await apiFetch<unknown>(`/api/chats/${chatId}/messages${qs}`);
      return MessagesPageSchema.parse(raw);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useChatMembers(chatId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.chatMembers(chatId),
    enabled,
    queryFn: async (): Promise<ChatMember[]> => {
      const raw = await apiFetch<unknown>(`/api/chats/${chatId}/members`);
      return ChatMemberListSchema.parse(raw);
    },
  });
}

export function useChatsForWorkspace(workspace: Workspace): Chat[] {
  const { data: chats = [] } = useChats();
  return chats.filter((c) => c.workspace === workspace);
}

export function useTriageChats(): Chat[] {
  return useChatsForWorkspace('triage');
}

export function useTriageCount(): number {
  return useTriageChats().length;
}
