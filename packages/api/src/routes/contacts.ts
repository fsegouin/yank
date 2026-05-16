import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { contacts } from '@yank/db/schema';
import { ContactRenameBodySchema } from '@yank/shared';
import type { EventsPublisher } from '../events-publisher.js';

export interface ContactsDeps {
  db: Db;
  userId: string;
  eventsPublisher: EventsPublisher;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerContactsRoutes(app: FastifyInstance<any, any, any, any>, deps: ContactsDeps): void {
  app.patch<{ Params: { contactJid: string } }>(
    '/api/contacts/:contactJid',
    async (req, reply) => {
      const parsed = ContactRenameBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
      }
      const { displayName } = parsed.data;

      // contactJid is URL-encoded by the client (e.g. 447700000001%40s.whatsapp.net)
      const contactJid = decodeURIComponent(req.params.contactJid);

      // Ownership check — confirm the contact exists for this user
      const existing = await deps.db
        .select({ jid: contacts.jid })
        .from(contacts)
        .where(and(eq(contacts.userId, deps.userId), eq(contacts.jid, contactJid)))
        .limit(1);

      if (!existing[0]) {
        return reply.code(404).send({ error: 'not_found' });
      }

      // Update display_name (contacts table has no updated_at column)
      await deps.db
        .update(contacts)
        .set({ displayName })
        .where(and(eq(contacts.userId, deps.userId), eq(contacts.jid, contactJid)));

      // Publish SSE event; updatedAt is the JS server clock (acceptable for v1 single-user)
      const updatedAt = new Date().toISOString();
      await deps.eventsPublisher.publish({
        type: 'contact-update',
        userId: deps.userId,
        contactId: contactJid,
        displayName,
        updatedAt,
      });

      reply.code(204);
      return null;
    },
  );
}
