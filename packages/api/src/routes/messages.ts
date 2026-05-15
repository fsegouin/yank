import type { FastifyInstance } from 'fastify';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { chats, contacts, messages } from '@yank/db/schema';
import { newId, type Reaction } from '@yank/shared';
import type { CommandsBus } from '../commands-bus.js';

export interface MessagesDeps {
  db: Db;
  userId: string;
  commands: CommandsBus;
}

export function registerMessagesRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: FastifyInstance<any, any, any, any>,
  deps: MessagesDeps,
): void {
  app.get<{ Params: { id: string }; Querystring: { before?: string; limit?: string } }>(
    '/api/chats/:id/messages',
    async (req, reply) => {
      const chat = await deps.db
        .select()
        .from(chats)
        .where(and(eq(chats.userId, deps.userId), eq(chats.id, req.params.id)))
        .limit(1);
      if (!chat[0]) return reply.code(404).send({ error: 'not_found' });

      const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
      const beforeId =
        typeof req.query.before === 'string' && req.query.before.length > 0
          ? req.query.before
          : null;

      // For cursor pagination, find the `ts` of the `before` message and return
      // rows strictly earlier. Cursor is the message id (UUIDv7, sortable by ts).
      let beforeTs: Date | null = null;
      if (beforeId) {
        const cursorRow = await deps.db
          .select({ ts: messages.ts })
          .from(messages)
          .where(and(eq(messages.userId, deps.userId), eq(messages.id, beforeId)))
          .limit(1);
        if (cursorRow[0]) beforeTs = cursorRow[0].ts;
      }

      const where = beforeTs
        ? and(
            eq(messages.userId, deps.userId),
            eq(messages.chatId, req.params.id),
            lt(messages.ts, beforeTs),
          )
        : and(eq(messages.userId, deps.userId), eq(messages.chatId, req.params.id));

      // Fetch limit + 1 to detect whether there are more rows.
      const rows = await deps.db
        .select({
          id: messages.id,
          userId: messages.userId,
          chatId: messages.chatId,
          waMessageId: messages.waMessageId,
          senderJid: messages.senderJid,
          ts: messages.ts,
          kind: messages.kind,
          text: messages.text,
          replyToId: messages.replyToId,
          editedAt: messages.editedAt,
          deletedAt: messages.deletedAt,
          status: messages.status,
          senderDisplayName: contacts.displayName,
          senderPushName: contacts.pushName,
          senderBusinessName: contacts.businessName,
          reactions: sql<unknown>`(
            SELECT COALESCE(json_agg(json_build_object(
              'emoji', emoji,
              'count', cnt,
              'mine', mine
            ) ORDER BY last_ts), '[]'::json)
            FROM (
              SELECT
                emoji,
                COUNT(*)::int AS cnt,
                bool_or(reactor_jid = 'me') AS mine,
                MAX(ts) AS last_ts
              FROM reactions
              WHERE reactions.message_id = ${messages.id}
              GROUP BY emoji
            ) AS agg
          )`,
        })
        .from(messages)
        .leftJoin(
          contacts,
          and(eq(contacts.userId, messages.userId), eq(contacts.jid, messages.senderJid)),
        )
        .where(where)
        .orderBy(desc(messages.ts))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? page[page.length - 1]!.id : null;

      return {
        messages: page.map((r) => {
          const { senderDisplayName, senderPushName, senderBusinessName, reactions, ...rest } = r;
          const senderName =
            r.senderJid === 'me'
              ? 'You'
              : (senderDisplayName ?? senderPushName ?? senderBusinessName ?? r.senderJid);
          return {
            ...rest,
            ts: r.ts ? new Date(r.ts).toISOString() : null,
            editedAt: r.editedAt ? new Date(r.editedAt).toISOString() : null,
            deletedAt: r.deletedAt ? new Date(r.deletedAt).toISOString() : null,
            reactions: (reactions ?? []) as unknown as Reaction[],
            senderName,
          };
        }),
        nextCursor,
      };
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
