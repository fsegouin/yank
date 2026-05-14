import type { Db } from '@yank/db';
import type { Connector, InboundMessage, InboundChat, InboundContact } from './connector.js';
import type { EventsBus } from './events-bus.js';
import { insertInbound, upsertChat, upsertContact } from './repo.js';

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

  connector.on('history-progress', ({ synced, total }) => {
    void bus.publish({ type: 'sync-progress', userId, synced, total });
  });
  connector.on('history-complete', () => {
    void bus.publish({ type: 'sync-complete', userId });
  });
}
