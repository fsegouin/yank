import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { newId } from '@yank/shared';
import {
  contacts,
  chats,
  chatAssignments,
  groupMembers,
  messageMedia,
  messages,
  reactions,
  type Chat,
  type Message,
} from '@yank/db/schema';
import type {
  InboundChat,
  InboundContact,
  InboundGroupMember,
  InboundMedia,
  InboundMessage,
  InboundReaction,
  InboundReceipt,
  PresenceStatus,
} from './connector.js';

export interface RepoCtx {
  db: Db;
  userId: string;
}

export async function upsertContact(ctx: RepoCtx, c: InboundContact): Promise<void> {
  // Only refresh non-empty values — never clobber existing data with empty strings.
  const set: Record<string, string> = {};
  if (c.pushName !== undefined && c.pushName.length > 0) set.pushName = c.pushName;
  if (c.businessName !== undefined && c.businessName.length > 0) set.businessName = c.businessName;
  if (c.displayName !== undefined && c.displayName.length > 0) set.displayName = c.displayName;

  const insert = ctx.db.insert(contacts).values({
    userId: ctx.userId,
    jid: c.jid,
    pushName: c.pushName,
    businessName: c.businessName,
    displayName: c.displayName,
  });

  if (Object.keys(set).length === 0) {
    await insert.onConflictDoNothing();
  } else {
    await insert.onConflictDoUpdate({
      target: [contacts.userId, contacts.jid],
      set,
    });
  }
}

export async function upsertChat(ctx: RepoCtx, c: InboundChat): Promise<Chat> {
  const id = newId();
  // No-op set on { jid } so Postgres returns the existing row via RETURNING.
  // Only refresh subject when the caller actually carries one — message-driven
  // upserts (no subject) must not clobber a subject set by chat-metadata events.
  const setOnConflict: Record<string, string> = { jid: c.jid };
  if (c.subject !== undefined && c.subject !== null && c.subject.length > 0) {
    setOnConflict.subject = c.subject;
  }
  const rows = await ctx.db
    .insert(chats)
    .values({ id, userId: ctx.userId, jid: c.jid, type: c.type, subject: c.subject })
    .onConflictDoUpdate({
      target: [chats.userId, chats.jid],
      set: setOnConflict,
    })
    .returning();

  const row = rows[0]!;

  // chat_assignments is keyed by chat_id; create one on first insert, ignore otherwise.
  await ctx.db
    .insert(chatAssignments)
    .values({ chatId: row.id, workspace: 'triage' })
    .onConflictDoNothing();

  return row;
}

export interface InsertInboundResult {
  message: Message;
  /** true if a row already existed for this (userId, waMessageId) and no row was inserted */
  duplicate: boolean;
}

export async function insertInbound(
  ctx: RepoCtx,
  chatId: string,
  m: InboundMessage,
): Promise<InsertInboundResult> {
  const id = newId();
  const previewBase = m.text ?? previewForKind(m.kind);
  const rows = await ctx.db
    .insert(messages)
    .values({
      id,
      userId: ctx.userId,
      chatId,
      waMessageId: m.waMessageId,
      senderJid: m.senderJid,
      ts: m.ts,
      kind: m.kind,
      text: m.text,
      deletedAt: m.deletedAt,
      status: m.fromMe ? 'sent' : 'delivered',
    })
    .onConflictDoNothing({ target: [messages.userId, messages.waMessageId] })
    .returning();
  if (rows[0]) {
    await ctx.db
      .update(chats)
      .set({ lastMessageAt: m.ts, lastMessagePreview: previewBase.slice(0, 140) })
      .where(eq(chats.id, chatId));
    return { message: rows[0], duplicate: false };
  }
  const existing = await ctx.db
    .select()
    .from(messages)
    .where(and(eq(messages.userId, ctx.userId), eq(messages.waMessageId, m.waMessageId)))
    .limit(1);
  return { message: existing[0]!, duplicate: true };
}

function previewForKind(kind: InboundMessage['kind']): string {
  switch (kind) {
    case 'image':
      return '[image]';
    case 'video':
      return '[video]';
    case 'audio':
      return '[audio]';
    case 'document':
      return '[document]';
    case 'sticker':
      return '[sticker]';
    case 'system':
      return '';
    default:
      return '';
  }
}

export async function insertMessageMedia(
  ctx: RepoCtx,
  messageId: string,
  media: InboundMedia,
): Promise<void> {
  // The directPath/mediaKey are needed later by media-worker to decrypt + download.
  // M3 only stores metadata; bytes arrive in M6. We park them in file_path as a JSON
  // payload so a future migration can promote them to columns without re-pairing.
  const pointer =
    media.directPath || media.mediaKey
      ? JSON.stringify({ directPath: media.directPath, mediaKey: media.mediaKey })
      : null;
  await ctx.db
    .insert(messageMedia)
    .values({
      messageId,
      mime: media.mime,
      sizeBytes: media.sizeBytes || 0,
      width: media.width ?? null,
      height: media.height ?? null,
      durationMs: media.durationMs ?? null,
      filePath: pointer,
      status: 'queued',
    })
    .onConflictDoNothing({ target: messageMedia.messageId });
}

export interface ReactionTarget {
  id: string;
  chatId: string;
}

export async function upsertReaction(
  ctx: RepoCtx,
  r: InboundReaction,
): Promise<ReactionTarget | null> {
  // Find the parent message by (userId, waMessageId).
  const parent = await ctx.db
    .select({ id: messages.id, chatId: messages.chatId })
    .from(messages)
    .where(and(eq(messages.userId, ctx.userId), eq(messages.waMessageId, r.targetWaMessageId)))
    .limit(1);
  const target = parent[0];
  if (!target) return null;

  if (r.emoji === '') {
    await ctx.db
      .delete(reactions)
      .where(and(eq(reactions.messageId, target.id), eq(reactions.reactorJid, r.reactorJid)));
  } else {
    await ctx.db
      .insert(reactions)
      .values({
        messageId: target.id,
        reactorJid: r.reactorJid,
        emoji: r.emoji,
        ts: r.ts,
      })
      .onConflictDoUpdate({
        target: [reactions.messageId, reactions.reactorJid],
        set: { emoji: r.emoji, ts: r.ts },
      });
  }
  return { id: target.id, chatId: target.chatId };
}

export async function markMessageDeleted(
  ctx: RepoCtx,
  waMessageId: string,
  ts: Date,
): Promise<{ id: string; chatId: string } | null> {
  // Setting text: null prevents the original content from leaking through the
  // API once a message has been revoked. The UI uses deletedAt to render a
  // tombstone in place of the original row.
  const result = await ctx.db
    .update(messages)
    .set({ deletedAt: ts, text: null })
    .where(and(eq(messages.userId, ctx.userId), eq(messages.waMessageId, waMessageId)))
    .returning({ id: messages.id, chatId: messages.chatId });
  return result[0] ?? null;
}

export async function syncGroupMembers(
  ctx: RepoCtx,
  chatJid: string,
  members: InboundGroupMember[],
): Promise<void> {
  const chatRows = await ctx.db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.userId, ctx.userId), eq(chats.jid, chatJid)))
    .limit(1);
  const chatId = chatRows[0]?.id;
  if (!chatId) return;

  await ctx.db.transaction(async (tx) => {
    await tx.delete(groupMembers).where(eq(groupMembers.chatId, chatId));
    if (members.length === 0) return;
    await tx.insert(groupMembers).values(
      members.map((m) => ({
        chatId,
        jid: m.jid,
        role: m.role,
      })),
    );
  });
}

export async function updatePresence(
  ctx: RepoCtx,
  jid: string,
  status: PresenceStatus,
  lastSeen?: Date,
): Promise<void> {
  if (status !== 'unavailable' || !lastSeen) return;
  await ctx.db
    .update(contacts)
    .set({ lastSeenAt: lastSeen })
    .where(and(eq(contacts.userId, ctx.userId), eq(contacts.jid, jid)));
}

const STATUS_RANK: Record<'pending' | 'sent' | 'delivered' | 'read' | 'failed', number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

export interface ApplyReceiptResult {
  messageId: string;
  status: 'delivered' | 'read';
}

export async function applyReceipt(
  ctx: RepoCtx,
  r: InboundReceipt,
): Promise<ApplyReceiptResult | null> {
  // Only promote, never demote: sent → delivered → read.
  const newRank = STATUS_RANK[r.status];
  const rows = await ctx.db
    .update(messages)
    .set({ status: r.status })
    .where(
      and(
        eq(messages.userId, ctx.userId),
        eq(messages.waMessageId, r.waMessageId),
        sql`CASE ${messages.status}
              WHEN 'pending' THEN 0
              WHEN 'sent' THEN 1
              WHEN 'delivered' THEN 2
              WHEN 'read' THEN 3
              WHEN 'failed' THEN 4
            END < ${newRank}`,
      ),
    )
    .returning({ id: messages.id });
  const row = rows[0];
  if (!row) return null;
  return { messageId: row.id, status: r.status };
}

export async function insertPendingOutbound(
  ctx: RepoCtx,
  chatId: string,
  text: string,
  ts: Date,
): Promise<Message> {
  const id = newId();
  const rows = await ctx.db
    .insert(messages)
    .values({
      id,
      userId: ctx.userId,
      chatId,
      senderJid: 'me',
      ts,
      kind: 'text',
      text,
      status: 'pending',
    })
    .returning();
  return rows[0]!;
}

export async function attachSentWaId(
  ctx: RepoCtx,
  localId: string,
  waMessageId: string,
  ts: Date,
): Promise<void> {
  await ctx.db
    .update(messages)
    .set({ waMessageId, status: 'sent', ts })
    .where(and(eq(messages.userId, ctx.userId), eq(messages.id, localId)));
}

export async function setStatusByWaId(
  ctx: RepoCtx,
  waMessageId: string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
): Promise<Message | undefined> {
  const rows = await ctx.db
    .update(messages)
    .set({ status })
    .where(and(eq(messages.userId, ctx.userId), eq(messages.waMessageId, waMessageId)))
    .returning();
  return rows[0];
}

export async function setStatusByLocalId(
  ctx: RepoCtx,
  localId: string,
  status: 'failed',
): Promise<void> {
  await ctx.db
    .update(messages)
    .set({ status })
    .where(and(eq(messages.userId, ctx.userId), eq(messages.id, localId)));
}
