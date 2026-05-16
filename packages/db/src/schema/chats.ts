import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const chats = pgTable(
  'chats',
  {
    id: uuid('id').primaryKey().notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jid: text('jid').notNull(),
    type: text('type', { enum: ['dm', 'group', 'community', 'newsletter'] }).notNull(),
    subject: text('subject'),
    localSubject: text('local_subject'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastMessagePreview: text('last_message_preview'),
    archived: boolean('archived').notNull().default(false),
    mutedUntil: timestamp('muted_until', { withTimezone: true }),
    pinned: boolean('pinned').notNull().default(false),
  },
  (t) => ({
    byUserJid: uniqueIndex('chats_user_jid_uq').on(t.userId, t.jid),
    byUserActivity: index('chats_user_activity_idx').on(t.userId, t.lastMessageAt),
  }),
);

export type Chat = typeof chats.$inferSelect;
