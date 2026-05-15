import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { messageMedia, messages } from '@yank/db/schema';
import type { CommandsBus } from '../commands-bus.js';

export interface MediaDeps {
  db: Db;
  userId: string;
  commands: CommandsBus;
}

interface MediaMetadata {
  directPath?: string;
  mediaKey?: string;
  localPath?: string;
}

export function registerMediaRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: FastifyInstance<any, any, any, any>,
  deps: MediaDeps,
): void {
  app.get<{ Params: { messageId: string } }>('/api/media/:messageId', async (req, reply) => {
    const rows = await deps.db
      .select({
        status: messageMedia.status,
        filePath: messageMedia.filePath,
        mime: messageMedia.mime,
      })
      .from(messageMedia)
      .innerJoin(messages, eq(messageMedia.messageId, messages.id))
      .where(
        and(eq(messages.userId, deps.userId), eq(messageMedia.messageId, req.params.messageId)),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });

    let meta: MediaMetadata = {};
    if (row.filePath) {
      try {
        meta = JSON.parse(row.filePath) as MediaMetadata;
      } catch {
        /* ignore */
      }
    }

    if (row.status === 'ready' && meta.localPath) {
      reply.header('Content-Type', row.mime).header('Cache-Control', 'private, max-age=86400');
      return reply.send(createReadStream(meta.localPath));
    }

    // For queued OR failed: reset to queued (if failed) and enqueue. The daemon's
    // idempotency guard ignores in-flight 'downloading' state but happily retries
    // 'queued' or 'failed'. We flip 'failed' -> 'queued' so subsequent GETs while
    // the download is in flight return 202, not 502.
    if (row.status === 'queued' || row.status === 'failed') {
      if (row.status === 'failed') {
        await deps.db
          .update(messageMedia)
          .set({ status: 'queued' })
          .where(eq(messageMedia.messageId, req.params.messageId));
      }
      await deps.commands.publish({
        type: 'download-media',
        userId: deps.userId,
        messageId: req.params.messageId,
      });
    }

    return reply.code(202).send({ status: row.status });
  });
}
