import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import type { Db } from '@yank/db';
import { and, eq } from 'drizzle-orm';
import { messageMedia, messages } from '@yank/db/schema';
import type { EventsBus } from './events-bus.js';

export interface DownloadDeps {
  db: Db;
  userId: string;
  mediaDir: string;
  bus: EventsBus;
}

interface MediaMetadata {
  directPath?: string;
  mediaKey?: string; // base64
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
  cmd: { messageId: string },
): Promise<void> {
  // Look up the message + media row.
  const rows = await deps.db
    .select({
      mediaMessageId: messageMedia.messageId,
      filePath: messageMedia.filePath,
      mime: messageMedia.mime,
      status: messageMedia.status,
      messageKind: messages.kind,
    })
    .from(messageMedia)
    .innerJoin(messages, eq(messageMedia.messageId, messages.id))
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
    await markFailed(deps, cmd.messageId);
    return;
  }

  // Flip to 'downloading' so concurrent requests don't queue duplicate work.
  await deps.db
    .update(messageMedia)
    .set({ status: 'downloading' })
    .where(eq(messageMedia.messageId, cmd.messageId));

  const baileysType = MEDIA_TYPE_MAP[row.messageKind];
  if (!baileysType) {
    await markFailed(deps, cmd.messageId);
    return;
  }

  try {
    // Baileys' downloadContentFromMessage takes an object with the fields below.
    // It returns a readable stream of the decrypted bytes. The full Baileys
    // message type wants many more fields, but only directPath/mediaKey/url are
    // actually read — hence the `as never` cast.
    const stream = await downloadContentFromMessage(
      {
        directPath: meta.directPath,
        mediaKey: Buffer.from(meta.mediaKey, 'base64'),
        url: '', // ignored when directPath is present
      } as never,
      baileysType,
    );

    // Drain stream to a Buffer.
    const chunks: Buffer[] = [];
    for await (const chunk of stream as Readable) {
      chunks.push(chunk as Buffer);
    }
    const bytes = Buffer.concat(chunks);

    // Write to /<mediaDir>/<userId>/<messageId>.<ext>
    const userDir = join(deps.mediaDir, deps.userId);
    await mkdir(userDir, { recursive: true });
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
  } catch {
    await markFailed(deps, cmd.messageId);
    await deps.bus.publish({
      type: 'media-ready',
      userId: deps.userId,
      messageId: cmd.messageId,
      status: 'failed',
    });
  }
}

async function markFailed(deps: DownloadDeps, messageId: string): Promise<void> {
  await deps.db
    .update(messageMedia)
    .set({ status: 'failed' })
    .where(eq(messageMedia.messageId, messageId));
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
