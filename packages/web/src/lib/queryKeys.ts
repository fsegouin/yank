export const queryKeys = {
  chats: () => ['chats'] as const,
  chat: (chatId: string) => ['chat', chatId] as const,
  messages: (chatId: string) => ['messages', chatId] as const,
  chatMembers: (chatId: string) => ['chat-members', chatId] as const,
} as const;

export type QueryKey =
  | ReturnType<typeof queryKeys.chats>
  | ReturnType<typeof queryKeys.chat>
  | ReturnType<typeof queryKeys.messages>
  | ReturnType<typeof queryKeys.chatMembers>;
