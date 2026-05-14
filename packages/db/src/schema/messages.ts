import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { chats } from './chats.js';

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    waMessageId: text('wa_message_id'),
    senderJid: text('sender_jid').notNull(),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    kind: text('kind', {
      enum: ['text', 'image', 'video', 'audio', 'document', 'sticker', 'poll', 'system', 'call'],
    }).notNull(),
    text: text('text'),
    replyToId: uuid('reply_to_id').references((): AnyPgColumn => messages.id, {
      onDelete: 'set null',
    }),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    status: text('status', {
      enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    })
      .notNull()
      .default('sent'),
  },
  (t) => ({
    waUq: uniqueIndex('messages_user_wa_uq').on(t.userId, t.waMessageId),
    chatTs: index('messages_chat_ts_idx').on(t.userId, t.chatId, t.ts),
    replyTo: index('messages_reply_to_idx').on(t.userId, t.replyToId),
  }),
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
