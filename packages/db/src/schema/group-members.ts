import { pgTable, uuid, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { chats } from './chats.js';

export const groupMembers = pgTable(
  'group_members',
  {
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    jid: text('jid').notNull(),
    role: text('role', { enum: ['member', 'admin', 'superadmin'] })
      .notNull()
      .default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chatId, t.jid] }),
  }),
);

export type GroupMember = typeof groupMembers.$inferSelect;
