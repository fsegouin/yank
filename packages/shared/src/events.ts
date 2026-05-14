import { z } from 'zod';

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

export const DaemonEventSchema = z.discriminatedUnion('type', [
  QrEvent,
  PairCodeEvent,
  ConnectedEvent,
  DisconnectedEvent,
  SyncProgressEvent,
  SyncCompleteEvent,
  MessageEvent,
  MessageStatusEvent,
]);

export type DaemonEvent = z.infer<typeof DaemonEventSchema>;

// Commands: api → Redis stream `commands:user:<userId>` → daemon → WhatsApp

export const PairCommand = Base.extend({
  type: z.literal('pair'),
  method: z.enum(['qr', 'code']),
  phoneNumber: z.string().regex(/^\d{6,15}$/).optional(),
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

export const ApiCommandSchema = z.discriminatedUnion('type', [
  PairCommand,
  SendCommand,
  ReactCommand,
  MarkReadCommand,
  TypingCommand,
]);

export type ApiCommand = z.infer<typeof ApiCommandSchema>;

// Redis channel helpers — single source of truth for channel naming.
export const eventsChannel = (userId: string) => `events:user:${userId}`;
export const commandsStream = (userId: string) => `commands:user:${userId}`;
