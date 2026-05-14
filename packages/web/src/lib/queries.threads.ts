import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { MessageSchema, type Message } from '@yank/shared';
import { apiFetch } from './api.js';

const ListSchema = z.array(MessageSchema);

export function useThreadReplies(chatId: string, parentMessageId: string) {
  return useQuery({
    queryKey: ['thread', chatId, parentMessageId],
    enabled: Boolean(parentMessageId),
    queryFn: async (): Promise<Message[]> => {
      const raw = await apiFetch<unknown>(
        `/api/chats/${chatId}/messages?replyTo=${parentMessageId}&limit=200`,
      );
      return ListSchema.parse(raw);
    },
  });
}

export function useParentMessage(chatId: string, messageId: string) {
  return useQuery({
    queryKey: ['message', chatId, messageId],
    enabled: Boolean(messageId),
    queryFn: async (): Promise<Message> => {
      const raw = await apiFetch<unknown>(`/api/chats/${chatId}/messages/${messageId}`);
      return MessageSchema.parse(raw);
    },
  });
}
