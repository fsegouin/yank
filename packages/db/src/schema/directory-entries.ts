import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { chats } from './chats.js';

export const directoryEntries = pgTable('directory_entries', {
  id: uuid('id').primaryKey().notNull(),
  ownerUserId: uuid('user_id_owner')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  visibility: text('visibility', { enum: ['public', 'link-only', 'private'] }).notNull(),
  inviteLink: text('invite_link'),
  description: text('description'),
});

export type DirectoryEntry = typeof directoryEntries.$inferSelect;
