import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { chats } from './chats.js';

export const chatAssignments = pgTable('chat_assignments', {
  chatId: uuid('chat_id')
    .primaryKey()
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  workspace: text('workspace', { enum: ['work', 'personal', 'triage', 'hidden'] })
    .notNull()
    .default('triage'),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ChatAssignment = typeof chatAssignments.$inferSelect;
