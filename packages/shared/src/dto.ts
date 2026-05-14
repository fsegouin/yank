import { z } from 'zod';

const Uuid = z.string().uuid();
const Iso = z.string().datetime();

export const WorkspaceSchema = z.enum(['work', 'personal', 'triage', 'hidden']);
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const ChatKindSchema = z.enum(['dm', 'group', 'community', 'newsletter']);
export const MessageKindSchema = z.enum([
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'poll',
  'system',
  'call',
]);
export const MessageStatusSchema = z.enum(['pending', 'sent', 'delivered', 'read', 'failed']);

export const ReactionSchema = z.object({
  emoji: z.string(),
  count: z.number().int().nonnegative(),
  mine: z.boolean(),
});
export type Reaction = z.infer<typeof ReactionSchema>;

export const ChatSchema = z.object({
  id: Uuid,
  userId: Uuid,
  jid: z.string(),
  type: ChatKindSchema,
  subject: z.string().nullable(),
  lastMessageAt: Iso.nullable(),
  lastMessagePreview: z.string().nullable(),
  archived: z.boolean(),
  mutedUntil: Iso.nullable(),
  pinned: z.boolean(),
  workspace: WorkspaceSchema,
  memberCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});
export type Chat = z.infer<typeof ChatSchema>;

export const MediaSchema = z.object({
  mime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  url: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  status: z.enum(['queued', 'downloading', 'ready', 'failed']),
});
export type Media = z.infer<typeof MediaSchema>;

export const MessageSchema = z.object({
  id: Uuid,
  userId: Uuid,
  chatId: Uuid,
  waMessageId: z.string().nullable(),
  senderJid: z.string(),
  ts: Iso,
  kind: MessageKindSchema,
  text: z.string().nullable(),
  replyToId: Uuid.nullable(),
  editedAt: Iso.nullable(),
  deletedAt: Iso.nullable(),
  status: MessageStatusSchema,
  reactions: z.array(ReactionSchema).default([]),
  media: MediaSchema.optional(),
  threadCount: z.number().int().nonnegative().optional(),
  starred: z.boolean().optional(),
  senderName: z.string().optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const MessagesPageSchema = z.object({
  messages: z.array(MessageSchema),
  nextCursor: Uuid.nullable(),
});
export type MessagesPage = z.infer<typeof MessagesPageSchema>;

export const ChatMemberSchema = z.object({
  chatId: Uuid,
  jid: z.string(),
  displayName: z.string().nullable(),
  role: z.enum(['member', 'admin', 'superadmin']),
});
export type ChatMember = z.infer<typeof ChatMemberSchema>;

export const SendMessageBodySchema = z.object({
  text: z.string().min(1),
  replyToId: Uuid.optional(),
});
export type SendMessageBody = z.infer<typeof SendMessageBodySchema>;
