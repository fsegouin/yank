import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { chats, chatAssignments, groupMembers, messages, readState } from '@yank/db/schema';

export interface ChatsDeps {
  db: Db;
  userId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerChatsRoutes(app: FastifyInstance<any, any, any, any>, deps: ChatsDeps): void {
  app.get('/api/chats', async () => {
    const rows = await deps.db
      .select({
        id: chats.id,
        userId: chats.userId,
        jid: chats.jid,
        type: chats.type,
        subject: chats.subject,
        lastMessageAt: chats.lastMessageAt,
        lastMessagePreview: chats.lastMessagePreview,
        archived: chats.archived,
        mutedUntil: chats.mutedUntil,
        pinned: chats.pinned,
        workspace: chatAssignments.workspace,
        memberCount: sql<number>`(SELECT COUNT(*)::int FROM ${groupMembers} WHERE ${groupMembers.chatId} = ${chats.id})`,
        unreadCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${messages}
          WHERE ${messages.chatId} = ${chats.id}
            AND ${messages.userId} = ${chats.userId}
            AND ${messages.ts} > COALESCE(
              (SELECT ${readState.lastReadTs} FROM ${readState}
                WHERE ${readState.userId} = ${chats.userId}
                  AND ${readState.chatId} = ${chats.id}),
              'epoch'::timestamp
            )
        )`,
      })
      .from(chats)
      .leftJoin(chatAssignments, eq(chatAssignments.chatId, chats.id))
      .where(eq(chats.userId, deps.userId))
      .orderBy(desc(chats.lastMessageAt));

    return rows.map((r) => ({
      ...r,
      workspace: r.workspace ?? 'triage',
      lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt).toISOString() : null,
      mutedUntil: r.mutedUntil ? new Date(r.mutedUntil).toISOString() : null,
    }));
  });

  app.get<{ Params: { id: string } }>('/api/chats/:id', async (req, reply) => {
    const rows = await deps.db
      .select({
        id: chats.id,
        userId: chats.userId,
        jid: chats.jid,
        type: chats.type,
        subject: chats.subject,
        lastMessageAt: chats.lastMessageAt,
        lastMessagePreview: chats.lastMessagePreview,
        archived: chats.archived,
        mutedUntil: chats.mutedUntil,
        pinned: chats.pinned,
        workspace: chatAssignments.workspace,
        memberCount: sql<number>`(SELECT COUNT(*)::int FROM ${groupMembers} WHERE ${groupMembers.chatId} = ${chats.id})`,
        unreadCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${messages}
          WHERE ${messages.chatId} = ${chats.id}
            AND ${messages.userId} = ${chats.userId}
            AND ${messages.ts} > COALESCE(
              (SELECT ${readState.lastReadTs} FROM ${readState}
                WHERE ${readState.userId} = ${chats.userId}
                  AND ${readState.chatId} = ${chats.id}),
              'epoch'::timestamp
            )
        )`,
      })
      .from(chats)
      .leftJoin(chatAssignments, eq(chatAssignments.chatId, chats.id))
      .where(and(eq(chats.userId, deps.userId), eq(chats.id, req.params.id)))
      .limit(1);

    const r = rows[0];
    if (!r) return reply.code(404).send({ error: 'not_found' });
    return {
      ...r,
      workspace: r.workspace ?? 'triage',
      lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt).toISOString() : null,
      mutedUntil: r.mutedUntil ? new Date(r.mutedUntil).toISOString() : null,
    };
  });
}
