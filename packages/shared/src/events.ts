import { z } from 'zod';
import { WorkspaceSchema } from './dto.js';

// Events: daemon → Redis pub/sub `events:user:<userId>` → api → SSE → browser

const Base = z.object({ userId: z.string().uuid() });

export const QrEvent = Base.extend({
  type: z.literal('qr'),
  data: z.string(),
});

export const PairCodeEvent = Base.extend({
  type: z.literal('pair-code'),
  code: z.string(),
});

export const ConnectedEvent = Base.extend({
  type: z.literal('connected'),
  jid: z.string(),
  phone: z.string(),
});

export const DisconnectedEvent = Base.extend({
  type: z.literal('disconnected'),
  reason: z.string().optional(),
});

export const SyncProgressEvent = Base.extend({
  type: z.literal('sync-progress'),
  synced: z.number().int().nonnegative(),
  total: z.number().int().positive().optional(),
});

export const SyncCompleteEvent = Base.extend({
  type: z.literal('sync-complete'),
});

export const MessageEvent = Base.extend({
  type: z.literal('message'),
  chatId: z.string().uuid(),
  messageId: z.string().uuid(),
});

export const MessageStatusEvent = Base.extend({
  type: z.literal('status'),
  localId: z.string().uuid(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  waMessageId: z.string().optional(),
});

export const MediaReadyEvent = Base.extend({
  type: z.literal('media-ready'),
  messageId: z.string().uuid(),
  status: z.enum(['ready', 'failed']),
});

export const ChatAssignmentEvent = Base.extend({
  type: z.literal('chat-assignment'),
  chatId: z.string().uuid(),
  workspace: WorkspaceSchema,
  assignedAt: z.string().datetime(),
});

export const ContactUpdateEvent = Base.extend({
  type: z.literal('contact-update'),
  contactId: z.string().min(1),
  displayName: z.string(),
  updatedAt: z.string().datetime(),
});

export const MessageEditEvent = Base.extend({
  type: z.literal('message-edit'),
  messageId: z.string().uuid(),
  text: z.string(),
  editedAt: z.string().datetime(),
});

export const MessageEditFailedEvent = Base.extend({
  type: z.literal('message-edit-failed'),
  messageId: z.string().uuid(),
  reason: z.enum(['too-old', 'protocol', 'network']),
});

export const MediaBreakerStateEvent = Base.extend({
  type: z.literal('media-breaker-state'),
  state: z.enum(['open', 'closed', 'half-open']),
  retryAt: z.string().datetime().optional(),
});

export const DaemonEventSchema = z.discriminatedUnion('type', [
  QrEvent,
  PairCodeEvent,
  ConnectedEvent,
  DisconnectedEvent,
  SyncProgressEvent,
  SyncCompleteEvent,
  MessageEvent,
  MessageStatusEvent,
  MediaReadyEvent,
  ChatAssignmentEvent,
  ContactUpdateEvent,
  MessageEditEvent,
  MessageEditFailedEvent,
  MediaBreakerStateEvent,
]);

export type DaemonEvent = z.infer<typeof DaemonEventSchema>;

// Commands: api → Redis stream `commands:user:<userId>` → daemon → WhatsApp

export const PairCommand = Base.extend({
  type: z.literal('pair'),
  method: z.enum(['qr', 'code']),
  phoneNumber: z
    .string()
    .regex(/^\d{6,15}$/)
    .optional(),
});

export const SendCommand = Base.extend({
  type: z.literal('send'),
  localId: z.string().uuid(),
  chatJid: z.string(),
  text: z.string(),
  quotedWaId: z.string().optional(),
});

export const ReactCommand = Base.extend({
  type: z.literal('react'),
  chatJid: z.string(),
  waMessageId: z.string(),
  emoji: z.string().nullable(), // null = remove reaction
});

export const MarkReadCommand = Base.extend({
  type: z.literal('mark-read'),
  chatJid: z.string(),
  waMessageId: z.string(),
});

export const TypingCommand = Base.extend({
  type: z.literal('typing'),
  chatJid: z.string(),
  state: z.enum(['composing', 'paused']),
});

export const DownloadMediaCommand = Base.extend({
  type: z.literal('download-media'),
  messageId: z.string().uuid(),
});

export const EditMessageCommand = Base.extend({
  type: z.literal('edit-message'),
  messageId: z.string().uuid(),
  waMessageId: z.string().min(1),
  chatJid: z.string().min(1),
  text: z.string().min(1).max(65000),
});

export const ApiCommandSchema = z.discriminatedUnion('type', [
  PairCommand,
  SendCommand,
  ReactCommand,
  MarkReadCommand,
  TypingCommand,
  DownloadMediaCommand,
  EditMessageCommand,
]);

export type ApiCommand = z.infer<typeof ApiCommandSchema>;

// Redis channel helpers — single source of truth for channel naming.
export const eventsChannel = (userId: string) => `events:user:${userId}`;
export const commandsStream = (userId: string) => `commands:user:${userId}`;
