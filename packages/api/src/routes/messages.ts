import type { FastifyInstance } from 'fastify';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { chats, messages } from '@yank/db/schema';
import { newId } from '@yank/shared';
import type { CommandsBus } from '../commands-bus.js';

export interface MessagesDeps {
  db: Db;
  userId: string;
  commands: CommandsBus;
}

export function registerMessagesRoutes(app: FastifyInstance, deps: MessagesDeps): void {
  app.get<{ Params: { id: string }; Querystring: { after?: string; limit?: string } }>(
    '/api/chats/:id/messages',
    async (req, reply) => {
      const chat = await deps.db
        .select()
        .from(chats)
        .where(and(eq(chats.userId, deps.userId), eq(chats.id, req.params.id)))
        .limit(1);
      if (!chat[0]) return reply.code(404).send({ error: 'not_found' });

      const limit = Math.min(Number(req.query.limit ?? 100), 500);
      const afterTs = req.query.after ? new Date(req.query.after) : null;

      const rows = await deps.db
        .select()
        .from(messages)
        .where(
          afterTs
            ? and(
                eq(messages.userId, deps.userId),
                eq(messages.chatId, req.params.id),
                gt(messages.ts, afterTs),
              )
            : and(eq(messages.userId, deps.userId), eq(messages.chatId, req.params.id)),
        )
        .orderBy(asc(messages.ts))
        .limit(limit);

      return rows;
    },
  );

  app.post<{ Params: { id: string }; Body: { text: string; quotedWaId?: string } }>(
    '/api/chats/:id/messages',
    async (req, reply) => {
      const text = (req.body?.text ?? '').trim();
      if (!text) return reply.code(400).send({ error: 'empty_text' });

      const chat = await deps.db
        .select()
        .from(chats)
        .where(and(eq(chats.userId, deps.userId), eq(chats.id, req.params.id)))
        .limit(1);
      if (!chat[0]) return reply.code(404).send({ error: 'not_found' });

      const localId = newId();
      const ts = new Date();
      const inserted = await deps.db
        .insert(messages)
        .values({
          id: localId,
          userId: deps.userId,
          chatId: chat[0].id,
          senderJid: 'me',
          ts,
          kind: 'text',
          text,
          status: 'pending',
        })
        .returning();

      await deps.commands.publish({
        type: 'send',
        userId: deps.userId,
        localId,
        chatJid: chat[0].jid,
        text,
        quotedWaId: req.body?.quotedWaId,
      });

      reply.code(202);
      return inserted[0];
    },
  );
}
