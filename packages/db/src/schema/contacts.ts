import { pgTable, uuid, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const contacts = pgTable(
  'contacts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jid: text('jid').notNull(),
    displayName: text('display_name'),
    pushName: text('push_name'),
    businessName: text('business_name'),
    avatarPath: text('avatar_path'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.jid] }),
  }),
);

export type Contact = typeof contacts.$inferSelect;
