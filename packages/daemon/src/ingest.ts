import type { Db } from '@yank/db';
import type {
  Connector,
  InboundChat,
  InboundContact,
  InboundGroupMember,
  InboundMessage,
  InboundPresence,
  InboundReaction,
  InboundReceipt,
} from './connector.js';
import type { EventsBus } from './events-bus.js';
import {
  applyReceipt,
  insertInbound,
  insertMessageMedia,
  syncGroupMembers,
  updatePresence,
  upsertChat,
  upsertContact,
  upsertReaction,
} from './repo.js';

export interface AttachInboundOpts {
  db: Db;
  userId: string;
  connector: Connector;
  bus: EventsBus;
}

export function attachInbound({ db, userId, connector, bus }: AttachInboundOpts): void {
  const ctx = { db, userId };

  connector.on('message', (msg: InboundMessage, chat: InboundChat, contact: InboundContact) => {
    void (async () => {
      try {
        await upsertContact(ctx, contact);
        const chatRow = await upsertChat(ctx, chat);
        const { message, duplicate } = await insertInbound(ctx, chatRow.id, msg);
        if (duplicate) return;
        if (msg.media) {
          await insertMessageMedia(ctx, message.id, msg.media);
        }
        await bus.publish({
          type: 'message',
          userId,
          chatId: chatRow.id,
          messageId: message.id,
        });
      } catch (err) {
        console.error('[ingest] failed to persist inbound', err);
      }
    })();
  });

  connector.on('chat', (chat) => {
    void (async () => {
      try {
        await upsertChat(ctx, chat);
      } catch (err) {
        console.error('[ingest] failed to upsert chat metadata', err);
      }
    })();
  });

  connector.on('contact', (contact) => {
    void (async () => {
      try {
        await upsertContact(ctx, contact);
      } catch (err) {
        console.error('[ingest] failed to upsert contact metadata', err);
      }
    })();
  });

  connector.on('reaction', (reaction: InboundReaction) => {
    void (async () => {
      try {
        const target = await upsertReaction(ctx, reaction);
        if (!target) return;
        // Coarse invalidation — a `message` event tells the client to refetch the
        // affected message/page. Surgical patches can land in M4.
        await bus.publish({
          type: 'message',
          userId,
          chatId: target.chatId,
          messageId: target.id,
        });
      } catch (err) {
        console.error('[ingest] failed to persist reaction', err);
      }
    })();
  });

  connector.on('presence', (p: InboundPresence) => {
    void (async () => {
      try {
        await updatePresence(ctx, p.jid, p.status, p.lastSeen);
      } catch (err) {
        console.error('[ingest] failed to persist presence', err);
      }
    })();
  });

  connector.on('group-members', (chatJid: string, members: InboundGroupMember[]) => {
    void (async () => {
      try {
        await syncGroupMembers(ctx, chatJid, members);
      } catch (err) {
        console.error('[ingest] failed to sync group members', err);
      }
    })();
  });

  connector.on('receipt', (receipt: InboundReceipt) => {
    void (async () => {
      try {
        const result = await applyReceipt(ctx, receipt);
        if (!result) return;
        await bus.publish({
          type: 'status',
          userId,
          localId: result.messageId,
          status: result.status,
          waMessageId: receipt.waMessageId,
        });
      } catch (err) {
        console.error('[ingest] failed to apply receipt', err);
      }
    })();
  });

  connector.on('history-progress', ({ synced, total }) => {
    void bus.publish({ type: 'sync-progress', userId, synced, total });
  });
  connector.on('history-complete', () => {
    void bus.publish({ type: 'sync-complete', userId });
  });
}
