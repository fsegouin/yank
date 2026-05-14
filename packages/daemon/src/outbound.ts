import { and, eq } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { messages } from '@yank/db/schema';
import type { ApiCommand } from '@yank/shared';
import type { Connector } from './connector.js';
import type { EventsBus } from './events-bus.js';
import { attachSentWaId, setStatusByLocalId, setStatusByWaId } from './repo.js';

export interface OutboundCtx {
  db: Db;
  userId: string;
  connector: Connector;
  bus: EventsBus;
}

export function attachOutbound(ctx: OutboundCtx): void {
  ctx.connector.on('status', (info) => {
    void (async () => {
      try {
        const { waMessageId, status } = info;
        await setStatusByWaId({ db: ctx.db, userId: ctx.userId }, waMessageId, status);
        await ctx.bus.publish({
          type: 'status',
          userId: ctx.userId,
          localId: await resolveLocalId(ctx, waMessageId),
          status,
          waMessageId,
        });
      } catch (err) {
        console.error('[outbound] failed to forward status', err);
      }
    })();
  });
}

async function resolveLocalId(ctx: OutboundCtx, waMessageId: string): Promise<string> {
  const r = await ctx.db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.userId, ctx.userId), eq(messages.waMessageId, waMessageId)))
    .limit(1);
  return r[0]?.id ?? waMessageId;
}

export async function handleSendCommand(
  ctx: OutboundCtx,
  cmd: Extract<ApiCommand, { type: 'send' }>,
): Promise<void> {
  try {
    const result = await ctx.connector.sendText({
      chatJid: cmd.chatJid,
      text: cmd.text,
      quotedWaId: cmd.quotedWaId,
    });
    await attachSentWaId(
      { db: ctx.db, userId: ctx.userId },
      cmd.localId,
      result.waMessageId,
      result.ts,
    );
    await ctx.bus.publish({
      type: 'status',
      userId: ctx.userId,
      localId: cmd.localId,
      status: 'sent',
      waMessageId: result.waMessageId,
    });
  } catch (err) {
    await setStatusByLocalId({ db: ctx.db, userId: ctx.userId }, cmd.localId, 'failed');
    await ctx.bus.publish({
      type: 'status',
      userId: ctx.userId,
      localId: cmd.localId,
      status: 'failed',
    });
    throw err;
  }
}
