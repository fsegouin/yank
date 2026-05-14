import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { chats, chatAssignments } from '@yank/db/schema';

export interface ChatsDeps {
  db: Db;
  userId: string;
}

export function registerChatsRoutes(app: FastifyInstance, deps: ChatsDeps): void {
  app.get('/api/chats', async () => {
    const rows = await deps.db
      .select({
        id: chats.id,
        jid: chats.jid,
        type: chats.type,
        subject: chats.subject,
        lastMessageAt: chats.lastMessageAt,
        lastMessagePreview: chats.lastMessagePreview,
        workspace: chatAssignments.workspace,
      })
      .from(chats)
      .leftJoin(chatAssignments, eq(chatAssignments.chatId, chats.id))
      .where(eq(chats.userId, deps.userId))
      .orderBy(desc(chats.lastMessageAt));
    return rows;
  });

  app.get<{ Params: { id: string } }>('/api/chats/:id', async (req, reply) => {
    const row = await deps.db
      .select()
      .from(chats)
      .where(and(eq(chats.userId, deps.userId), eq(chats.id, req.params.id)))
      .limit(1);
    if (!row[0]) return reply.code(404).send({ error: 'not_found' });
    return row[0];
  });
}
