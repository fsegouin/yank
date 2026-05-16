import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { chats } from '@yank/db/schema';
import { ChatLocalSubjectBodySchema } from '@yank/shared';
import type { EventsPublisher } from '../events-publisher.js';

export interface ChatLocalSubjectDeps {
  db: Db;
  userId: string;
  eventsPublisher: EventsPublisher;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerChatLocalSubjectRoutes(app: FastifyInstance<any, any, any, any>, deps: ChatLocalSubjectDeps): void {
  app.patch<{ Params: { id: string } }>(
    '/api/chats/:id/local-subject',
    async (req, reply) => {
      const parsed = ChatLocalSubjectBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
      }
      const { localSubject } = parsed.data;
      const chatId = req.params.id;

      const existing = await deps.db
        .select({ id: chats.id })
        .from(chats)
        .where(and(eq(chats.userId, deps.userId), eq(chats.id, chatId)))
        .limit(1);
      if (!existing[0]) {
        return reply.code(404).send({ error: 'not_found' });
      }

      await deps.db
        .update(chats)
        .set({ localSubject })
        .where(and(eq(chats.userId, deps.userId), eq(chats.id, chatId)));

      await deps.eventsPublisher.publish({
        type: 'chat-local-subject-update',
        userId: deps.userId,
        chatId,
        localSubject,
        updatedAt: new Date().toISOString(),
      });

      reply.code(204);
      return null;
    },
  );
}
