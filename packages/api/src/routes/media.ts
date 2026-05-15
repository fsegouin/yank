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
  failureReason?: 'expired' | 'transient' | 'unknown';
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

    // For failed: inspect the recorded failureReason. WA's CDN-expired media
    // ("Failed to re-upload media") can never be recovered — return 410 so the
    // client stops the IO-driven re-enqueue cascade. Transient/unknown errors
    // get reset to 'queued' and re-enqueued.
    if (row.status === 'failed') {
      if (meta.failureReason === 'expired') {
        return reply
          .code(410)
          .send({ error: 'expired', reason: 'WhatsApp no longer has this media.' });
      }
      await deps.db
        .update(messageMedia)
        .set({ status: 'queued' })
        .where(eq(messageMedia.messageId, req.params.messageId));
      await deps.commands.publish({
        type: 'download-media',
        userId: deps.userId,
        messageId: req.params.messageId,
      });
      return reply.code(202).send({ status: 'queued' });
    }

    // 'queued': re-publish the command (idempotent on the daemon side).
    if (row.status === 'queued') {
      await deps.commands.publish({
        type: 'download-media',
        userId: deps.userId,
        messageId: req.params.messageId,
      });
    }

    return reply.code(202).send({ status: row.status });
  });
}
