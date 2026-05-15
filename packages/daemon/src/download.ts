import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type Redis from 'ioredis';
import type { Db } from '@yank/db';
import { and, eq } from 'drizzle-orm';
import { chats, messageMedia, messages } from '@yank/db/schema';
import type { Connector } from './connector.js';
import type { EventsBus } from './events-bus.js';
import { createBreaker } from './circuit-breaker.js';
import type { BreakerState } from './circuit-breaker.js';

export interface DownloadDeps {
  db: Db;
  userId: string;
  mediaDir: string;
  bus: EventsBus;
  connector: Connector;
  redis: Redis;
}

// Module-level breaker singleton (one instance per process; reset only in tests).
let breaker = createBreaker({
  threshold: 3,
  windowMs: 60_000,
  baseCooldownMs: 5 * 60_000,
  maxCooldownMs: 30 * 60_000,
});

/** Exposed only for unit tests — resets the singleton. */
export function resetBreakerForTest(): void {
  breaker = createBreaker({
    threshold: 3,
    windowMs: 60_000,
    baseCooldownMs: 5 * 60_000,
    maxCooldownMs: 30 * 60_000,
  });
}

async function publishBreakerState(
  deps: DownloadDeps,
  state: BreakerState,
  retryAt?: Date,
): Promise<void> {
  await deps.bus.publish({
    type: 'media-breaker-state',
    userId: deps.userId,
    state,
    retryAt: retryAt?.toISOString(),
  });
  // Persist to Redis hash so GET /api/media/breaker-state can serve fresh tabs.
  const key = `breaker:user:${deps.userId}`;
  await deps.redis.hset(key, 'state', state, 'retryAt', retryAt?.toISOString() ?? '');
  await deps.redis.expire(key, 3600);
}

interface MediaMetadata {
  directPath?: string;
  mediaKey?: string; // base64
  url?: string;
  fileSha256?: string; // base64
  fileEncSha256?: string; // base64
  localPath?: string;
}

const MEDIA_TYPE_MAP: Record<string, 'image' | 'video' | 'audio' | 'document' | 'sticker'> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  document: 'document',
  sticker: 'sticker',
};

export async function handleDownloadCommand(
  deps: DownloadDeps,
  cmd: { messageId: string; bypassBreaker?: boolean },
): Promise<void> {
  // Look up the message + media row. We also need waMessageId, senderJid and the
  // chat JID so we can hand a reconstructed proto message to Baileys' downloader
  // for URL refresh (reuploadRequest).
  const rows = await deps.db
    .select({
      mediaMessageId: messageMedia.messageId,
      filePath: messageMedia.filePath,
      mime: messageMedia.mime,
      status: messageMedia.status,
      messageKind: messages.kind,
      waMessageId: messages.waMessageId,
      senderJid: messages.senderJid,
      chatJid: chats.jid,
    })
    .from(messageMedia)
    .innerJoin(messages, eq(messageMedia.messageId, messages.id))
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(and(eq(messages.userId, deps.userId), eq(messageMedia.messageId, cmd.messageId)))
    .limit(1);

  const row = rows[0];
  if (!row) return; // unknown message — ignore
  if (row.status === 'ready') return; // already downloaded
  if (row.status === 'downloading') return; // already in-flight (idempotency)

  // Parse the metadata JSON we stored on ingest.
  let meta: MediaMetadata;
  try {
    meta = row.filePath ? (JSON.parse(row.filePath) as MediaMetadata) : {};
  } catch {
    meta = {};
  }

  if (!meta.directPath || !meta.mediaKey) {
    await markFailed(deps, cmd.messageId, new Error('missing directPath or mediaKey'));
    return;
  }

  // Circuit-breaker guard: skip Baileys call when the breaker is open (unless bypassed).
  const bypass = cmd.bypassBreaker === true;
  if (!bypass && breaker.shouldBlock()) {
    await deps.bus.publish({
      type: 'media-ready',
      userId: deps.userId,
      messageId: cmd.messageId,
      status: 'failed',
    });
    return;
  }

  // Flip to 'downloading' so concurrent requests don't queue duplicate work.
  await deps.db
    .update(messageMedia)
    .set({ status: 'downloading' })
    .where(eq(messageMedia.messageId, cmd.messageId));

  const baileysType = MEDIA_TYPE_MAP[row.messageKind];
  if (!baileysType) {
    await markFailed(deps, cmd.messageId, new Error(`unsupported media kind: ${row.messageKind}`));
    return;
  }

  // Ensure the target directory exists BEFORE attempting download, so EACCES
  // (e.g. user can't write the default /var/lib/yank/media path) surfaces with
  // a clear message instead of being swallowed deep inside the stream pipeline.
  const userDir = join(deps.mediaDir, deps.userId);
  try {
    await mkdir(userDir, { recursive: true });
  } catch (err) {
    console.error('[download] cannot create media directory', { userDir, err });
    // Treat directory-create failures as transient (filesystem/permissions issue,
    // not a permanent CDN-expiry) so the user can retry once the env is fixed.
    await markFailed(deps, cmd.messageId);
    await deps.bus.publish({
      type: 'media-ready',
      userId: deps.userId,
      messageId: cmd.messageId,
      status: 'failed',
    });
    return;
  }

  try {
    // Delegate the actual decrypt + URL-refresh to the connector. Baileys'
    // downloadMediaMessage uses sock.updateMediaMessage as the reuploadRequest,
    // so a stale directPath (HTTP 403/410 from WA's CDN) is recovered transparently.
    const bytes = await deps.connector.downloadMedia({
      waMessageId: row.waMessageId ?? '',
      chatJid: row.chatJid,
      fromMe: row.senderJid === 'me',
      kind: baileysType,
      media: {
        mime: row.mime,
        sizeBytes: 0, // not actually used by Baileys; we get the true length below
        directPath: meta.directPath,
        mediaKey: meta.mediaKey,
        url: meta.url,
        fileSha256: meta.fileSha256,
        fileEncSha256: meta.fileEncSha256,
      },
    });

    // Write to /<mediaDir>/<userId>/<messageId>.<ext>
    const ext = guessExt(row.mime);
    const localPath = join(userDir, `${cmd.messageId}${ext}`);
    await writeFile(localPath, bytes);

    // Update the row: status=ready, file_path now holds metadata + localPath.
    const updated: MediaMetadata = { ...meta, localPath };
    await deps.db
      .update(messageMedia)
      .set({ status: 'ready', filePath: JSON.stringify(updated), sizeBytes: bytes.length })
      .where(eq(messageMedia.messageId, cmd.messageId));

    await deps.bus.publish({
      type: 'media-ready',
      userId: deps.userId,
      messageId: cmd.messageId,
      status: 'ready',
    });
    breaker.recordSuccess();
  } catch (err) {
    console.error('[download] media download failed', {
      messageId: cmd.messageId,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    await markFailed(deps, cmd.messageId, err);
    await deps.bus.publish({
      type: 'media-ready',
      userId: deps.userId,
      messageId: cmd.messageId,
      status: 'failed',
    });
    // Only record timed-out / transient failures as breaker failures.
    const reason = classifyError(err);
    if (reason === 'transient') {
      const prevState = breaker.getState().state;
      breaker.recordFailure();
      const next = breaker.getState();
      if (next.state !== prevState) {
        await publishBreakerState(deps, next.state, next.retryAt ?? undefined);
      }
    }
  }
}

async function markFailed(
  deps: DownloadDeps,
  messageId: string,
  err?: unknown,
): Promise<void> {
  const reason = classifyError(err);
  console.error('[download] marking media as failed', { messageId, reason });
  // Read existing metadata so we don't clobber directPath/mediaKey etc — we
  // want the reason recorded alongside the existing fields so the api can
  // distinguish permanently-expired media from transient errors.
  const rows = await deps.db
    .select({ filePath: messageMedia.filePath })
    .from(messageMedia)
    .where(eq(messageMedia.messageId, messageId))
    .limit(1);
  let meta: Record<string, unknown> = {};
  if (rows[0]?.filePath) {
    try {
      meta = JSON.parse(rows[0].filePath) as Record<string, unknown>;
    } catch {
      /* ignore — meta stays as {} */
    }
  }
  meta.failureReason = reason;
  await deps.db
    .update(messageMedia)
    .set({ status: 'failed', filePath: JSON.stringify(meta) })
    .where(eq(messageMedia.messageId, messageId));
}

function classifyError(err: unknown): 'expired' | 'transient' | 'unknown' {
  if (!err) return 'unknown';
  const message = err instanceof Error ? err.message : String(err);
  // Baileys returns "Failed to re-upload media (N)" from sock.updateMediaMessage
  // when WA responds with an error code (N). That means WA's CDN no longer has
  // the bytes — retrying will not succeed.
  if (message.includes('Failed to re-upload media')) return 'expired';
  // Timeouts from our withTimeout wrapper / network slowness are retryable.
  if (message.includes('timed out')) return 'transient';
  return 'transient';
}

function guessExt(mime: string): string {
  if (mime.startsWith('image/jpeg')) return '.jpg';
  if (mime.startsWith('image/png')) return '.png';
  if (mime.startsWith('image/webp')) return '.webp';
  if (mime.startsWith('image/gif')) return '.gif';
  if (mime.startsWith('video/mp4')) return '.mp4';
  if (mime.startsWith('video/')) return '.bin';
  if (mime.startsWith('audio/ogg')) return '.ogg';
  if (mime.startsWith('audio/mpeg')) return '.mp3';
  if (mime.startsWith('audio/')) return '.bin';
  if (mime === 'application/pdf') return '.pdf';
  return '.bin';
}
