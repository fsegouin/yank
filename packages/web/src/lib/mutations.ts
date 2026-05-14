import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSchema, type Message, type SendMessageBody, type Workspace } from '@yank/shared';
import { apiFetch } from './api.js';
import { queryKeys } from './queryKeys.js';

export function useSendMessage(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SendMessageBody): Promise<Message> => {
      const raw = await apiFetch<unknown>(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        body,
      });
      return MessageSchema.parse(raw);
    },
    onSuccess: () => {
      // Server-state cache is patched by the SSE handler when the daemon emits
      // status/message events; we just kick a refetch of the chats list so
      // last_message_preview updates immediately.
      qc.invalidateQueries({ queryKey: queryKeys.chats() });
    },
  });
}

export function useMarkRead(chatId: string) {
  return useMutation({
    mutationFn: (messageId: string) =>
      apiFetch<void>(`/api/chats/${chatId}/read`, { method: 'POST', body: { messageId } }),
  });
}

export function useReact() {
  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string | null }) =>
      apiFetch<void>(`/api/messages/${messageId}/reactions`, { method: 'POST', body: { emoji } }),
  });
}

export function useStar() {
  return useMutation({
    mutationFn: ({ messageId, starred }: { messageId: string; starred: boolean }) =>
      apiFetch<void>(`/api/messages/${messageId}/star`, { method: 'POST', body: { starred } }),
  });
}

export function useAssignWorkspace(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspace: Exclude<Workspace, 'triage'>) =>
      apiFetch<void>(`/api/chats/${chatId}/assignment`, {
        method: 'POST',
        body: { workspace },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.chats() }),
  });
}
