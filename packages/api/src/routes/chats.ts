import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@yank/db';
import {
  chats,
  chatAssignments,
  contacts,
  groupMembers,
  messages,
  readState,
} from '@yank/db/schema';

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
        contactDisplayName: contacts.displayName,
        contactPushName: contacts.pushName,
        contactBusinessName: contacts.businessName,
        lastReadMessageId: readState.lastReadMessageId,
        lastReadTs: readState.lastReadTs,
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
      .leftJoin(
        contacts,
        and(eq(contacts.userId, chats.userId), eq(contacts.jid, chats.jid)),
      )
      .leftJoin(
        readState,
        and(eq(readState.userId, chats.userId), eq(readState.chatId, chats.id)),
      )
      .where(eq(chats.userId, deps.userId))
      .orderBy(desc(chats.lastMessageAt));

    return rows.map((r) => {
      const subject =
        r.subject ??
        (r.type === 'dm'
          ? r.contactDisplayName ?? r.contactPushName ?? r.contactBusinessName ?? null
          : null);
      return {
        id: r.id,
        userId: r.userId,
        jid: r.jid,
        type: r.type,
        subject,
        lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt).toISOString() : null,
        lastMessagePreview: r.lastMessagePreview,
        archived: r.archived,
        mutedUntil: r.mutedUntil ? new Date(r.mutedUntil).toISOString() : null,
        pinned: r.pinned,
        workspace: r.workspace ?? 'triage',
        memberCount: r.memberCount,
        unreadCount: r.unreadCount,
        lastReadMessageId: r.lastReadMessageId ?? null,
        lastReadTs: r.lastReadTs ? new Date(r.lastReadTs).toISOString() : null,
      };
    });
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
        contactDisplayName: contacts.displayName,
        contactPushName: contacts.pushName,
        contactBusinessName: contacts.businessName,
        lastReadMessageId: readState.lastReadMessageId,
        lastReadTs: readState.lastReadTs,
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
      .leftJoin(
        contacts,
        and(eq(contacts.userId, chats.userId), eq(contacts.jid, chats.jid)),
      )
      .leftJoin(
        readState,
        and(eq(readState.userId, chats.userId), eq(readState.chatId, chats.id)),
      )
      .where(and(eq(chats.userId, deps.userId), eq(chats.id, req.params.id)))
      .limit(1);

    const r = rows[0];
    if (!r) return reply.code(404).send({ error: 'not_found' });
    const subject =
      r.subject ??
      (r.type === 'dm'
        ? r.contactDisplayName ?? r.contactPushName ?? r.contactBusinessName ?? null
        : null);
    return {
      id: r.id,
      userId: r.userId,
      jid: r.jid,
      type: r.type,
      subject,
      lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt).toISOString() : null,
      lastMessagePreview: r.lastMessagePreview,
      archived: r.archived,
      mutedUntil: r.mutedUntil ? new Date(r.mutedUntil).toISOString() : null,
      pinned: r.pinned,
      workspace: r.workspace ?? 'triage',
      memberCount: r.memberCount,
      unreadCount: r.unreadCount,
      lastReadMessageId: r.lastReadMessageId ?? null,
      lastReadTs: r.lastReadTs ? new Date(r.lastReadTs).toISOString() : null,
    };
  });

  app.post<{
    Params: { id: string };
    Body: { workspace: 'work' | 'personal' | 'triage' | 'hidden' };
  }>('/api/chats/:id/assignment', async (req, reply) => {
    const allowed = new Set(['work', 'personal', 'triage', 'hidden']);
    const workspace = req.body?.workspace;
    if (!workspace || !allowed.has(workspace)) {
      return reply.code(400).send({ error: 'invalid_workspace' });
    }
    // Verify the chat belongs to this user.
    const chat = await deps.db
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.userId, deps.userId), eq(chats.id, req.params.id)))
      .limit(1);
    if (!chat[0]) return reply.code(404).send({ error: 'not_found' });

    await deps.db
      .insert(chatAssignments)
      .values({ chatId: chat[0].id, workspace })
      .onConflictDoUpdate({
        target: chatAssignments.chatId,
        set: { workspace, assignedAt: new Date() },
      });

    reply.code(204);
    return null;
  });

  app.post<{
    Params: { id: string };
    Body: { messageId: string };
  }>('/api/chats/:id/read', async (req, reply) => {
    const messageId = req.body?.messageId;
    if (typeof messageId !== 'string' || messageId.length === 0) {
      return reply.code(400).send({ error: 'invalid_message_id' });
    }

    // Look up the message and verify it belongs to this user + chat.
    const msgRows = await deps.db
      .select({ id: messages.id, ts: messages.ts })
      .from(messages)
      .where(
        and(
          eq(messages.userId, deps.userId),
          eq(messages.id, messageId),
          eq(messages.chatId, req.params.id),
        ),
      )
      .limit(1);

    const msg = msgRows[0];
    if (!msg) return reply.code(404).send({ error: 'not_found' });

    // Monotonic upsert — only advance, never regress.
    await deps.db
      .insert(readState)
      .values({
        userId: deps.userId,
        chatId: req.params.id,
        lastReadMessageId: msg.id,
        lastReadTs: msg.ts,
      })
      .onConflictDoUpdate({
        target: [readState.userId, readState.chatId],
        set: {
          lastReadMessageId: msg.id,
          lastReadTs: msg.ts,
        },
        setWhere: sql`${readState.lastReadTs} < ${msg.ts.toISOString()} OR ${readState.lastReadTs} IS NULL`,
      });

    reply.code(204);
    return null;
  });
}
