import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const whatsappSessions = pgTable('whatsapp_sessions', {
  userId: uuid('user_id')
    .primaryKey()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  jid: text('jid'),
  phoneNumber: text('phone_number'),
  status: text('status', { enum: ['unlinked', 'pairing', 'connected', 'disconnected'] })
    .notNull()
    .default('unlinked'),
  lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
});

export type WhatsAppSession = typeof whatsappSessions.$inferSelect;
