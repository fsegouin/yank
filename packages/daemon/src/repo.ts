import { and, eq } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { newId } from '@yank/shared';
import {
  contacts,
  chats,
  chatAssignments,
  messages,
  type Chat,
  type Message,
} from '@yank/db/schema';
import type { InboundChat, InboundContact, InboundMessage } from './connector.js';

export interface RepoCtx {
  db: Db;
  userId: string;
}

export async function upsertContact(ctx: RepoCtx, c: InboundContact): Promise<void> {
  const set: Record<string, string> = {};
  if (c.pushName !== undefined) set.pushName = c.pushName;
  if (c.businessName !== undefined) set.businessName = c.businessName;

  const insert = ctx.db.insert(contacts).values({
    userId: ctx.userId,
    jid: c.jid,
    pushName: c.pushName,
    businessName: c.businessName,
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
  const rows = await ctx.db
    .insert(chats)
    .values({ id, userId: ctx.userId, jid: c.jid, type: c.type, subject: c.subject })
    .onConflictDoUpdate({
      target: [chats.userId, chats.jid],
      // No-op set just to make Postgres return the existing row via RETURNING.
      set: { jid: c.jid },
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
  const rows = await ctx.db
    .insert(messages)
    .values({
      id,
      userId: ctx.userId,
      chatId,
      waMessageId: m.waMessageId,
      senderJid: m.senderJid,
      ts: m.ts,
      kind: 'text',
      text: m.text,
      status: m.fromMe ? 'sent' : 'delivered',
    })
    .onConflictDoNothing({ target: [messages.userId, messages.waMessageId] })
    .returning();
  if (rows[0]) {
    await ctx.db
      .update(chats)
      .set({ lastMessageAt: m.ts, lastMessagePreview: m.text.slice(0, 140) })
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
