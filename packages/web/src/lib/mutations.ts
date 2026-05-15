import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSchema,
  type Chat,
  type Message,
  type SendMessageBody,
  type Workspace,
} from '@yank/shared';
import { apiFetch } from './api.js';
import { queryKeys } from './queryKeys.js';
import { useToastStore } from '../state/toast.js';

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) =>
      apiFetch<void>(`/api/chats/${chatId}/read`, { method: 'POST', body: { messageId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.chats() });
      qc.invalidateQueries({ queryKey: queryKeys.chat(chatId) });
    },
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

const WORKSPACE_LABELS: Record<string, string> = {
  work: 'Work',
  personal: 'Personal',
  hidden: 'Hidden',
  triage: 'Triage',
};

export function useAssignWorkspace(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workspace }: { workspace: Workspace; suppressUndo?: boolean }) =>
      apiFetch<void>(`/api/chats/${chatId}/assignment`, {
        method: 'POST',
        body: { workspace },
      }),
    onMutate: ({ workspace, suppressUndo = false }) => {
      const snapshot = qc.getQueryData<Chat[]>(queryKeys.chats());
      const previousWorkspace = snapshot?.find((c) => c.id === chatId)?.workspace ?? 'triage';

      qc.setQueryData<Chat[]>(queryKeys.chats(), (old) =>
        old?.map((c) => (c.id === chatId ? { ...c, workspace } : c)),
      );

      if (!suppressUndo) {
        const label = `Moved to ${WORKSPACE_LABELS[workspace] ?? workspace}`;
        useToastStore.getState().showUndoToast({
          label,
          onUndo: () => {
            qc.setQueryData<Chat[]>(queryKeys.chats(), (old) =>
              old?.map((c) => (c.id === chatId ? { ...c, workspace: previousWorkspace } : c)),
            );
            apiFetch<void>(`/api/chats/${chatId}/assignment`, {
              method: 'POST',
              body: { workspace: previousWorkspace },
            }).catch(() => {
              // undo failed silently; SSE will reconcile
            });
            useToastStore.getState().clear();
          },
        });
      }

      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot !== undefined) {
        qc.setQueryData<Chat[]>(queryKeys.chats(), context.snapshot);
      }
    },
    // onSettled deliberately omitted: SSE chat-assignment reconciles the cache.
  });
}
