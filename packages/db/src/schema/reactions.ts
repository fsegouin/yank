import { pgTable, uuid, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { messages } from './messages.js';

export const reactions = pgTable(
  'reactions',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    reactorJid: text('reactor_jid').notNull(),
    emoji: text('emoji').notNull(),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.messageId, t.reactorJid] }),
  }),
);

export type Reaction = typeof reactions.$inferSelect;
