import { pgTable, uuid, text, integer } from 'drizzle-orm/pg-core';
import { messages } from './messages.js';

export const messageMedia = pgTable('message_media', {
  messageId: uuid('message_id')
    .primaryKey()
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes'),
  width: integer('width'),
  height: integer('height'),
  durationMs: integer('duration_ms'),
  filePath: text('file_path'),
  thumbnailPath: text('thumbnail_path'),
  status: text('status', { enum: ['queued', 'downloading', 'ready', 'failed'] })
    .notNull()
    .default('queued'),
});

export type MessageMedia = typeof messageMedia.$inferSelect;
