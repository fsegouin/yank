import Redis from 'ioredis';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from '@yank/db';
import { whatsappSessions } from '@yank/db/schema';
import type { Logger } from '@yank/shared';
import type { Connector } from './connector.js';
import { createEventsBus } from './events-bus.js';
import { attachInbound } from './ingest.js';
import { attachOutbound, handleSendCommand, handleEditMessageCommand } from './outbound.js';
import { startCommandsConsumer } from './commands-consumer.js';
import { handleDownloadCommand } from './download.js';

export interface Session {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export interface SessionDeps {
  userId: string;
  databaseUrl: string;
  redisUrl: string;
  log: Logger;
  connector: Connector;
  mediaDir: string;
}

export function createSession(deps: SessionDeps): Session {
  const { db, close: closeDb } = createDb({ url: deps.databaseUrl });
  const redis = new Redis(deps.redisUrl);
  const bus = createEventsBus(redis, deps.userId);

  attachInbound({ db, userId: deps.userId, connector: deps.connector, bus });
  attachOutbound({ db, userId: deps.userId, connector: deps.connector, bus });

  let consumerStop: (() => Promise<void>) | null = null;
  deps.connector.on('open', ({ jid, phone }) => {
    void (async () => {
      try {
        await db
          .insert(whatsappSessions)
          .values({
            userId: deps.userId,
            jid,
            phoneNumber: phone,
            status: 'connected',
            lastConnectedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: whatsappSessions.userId,
            set: {
              jid,
              phoneNumber: phone,
              status: 'connected',
              lastConnectedAt: new Date(),
            },
          });
      } catch (err) {
        deps.log.error({ err }, 'failed to upsert whatsapp_sessions on open');
      }
      await bus.publish({ type: 'connected', userId: deps.userId, jid, phone });
    })();
  });
  deps.connector.on('close', ({ reason }) => {
    void (async () => {
      try {
        await db
          .update(whatsappSessions)
          .set({ status: 'disconnected' })
          .where(eq(whatsappSessions.userId, deps.userId));
      } catch (err) {
        deps.log.error({ err }, 'failed to update whatsapp_sessions on close');
      }
      await bus.publish({ type: 'disconnected', userId: deps.userId, reason });
    })();
  });
  deps.connector.on('qr', (data) => {
    void bus.publish({ type: 'qr', userId: deps.userId, data });
  });
  deps.connector.on('pairing-code', (code) => {
    void bus.publish({ type: 'pair-code', userId: deps.userId, code });
  });

  return {
    async start() {
      await deps.connector.start();

      // If the device isn't registered (fresh state / creds wiped), reset any stale
      // 'connected' row so the UI shows the QR instead of skipping setup.
      if (!deps.connector.isRegistered()) {
        try {
          await db
            .insert(whatsappSessions)
            .values({
              userId: deps.userId,
              jid: '',
              phoneNumber: null,
              status: 'unlinked',
              lastConnectedAt: null,
            })
            .onConflictDoUpdate({
              target: whatsappSessions.userId,
              set: { status: 'unlinked', jid: '', phoneNumber: null, lastConnectedAt: null },
            });
        } catch (err) {
          deps.log.error({ err }, 'failed to reset whatsapp_sessions on fresh start');
        }
      }

      const { stop } = startCommandsConsumer({
        redis,
        userId: deps.userId,
        onCommand: async (cmd) => {
          if (cmd.type === 'pair') {
            await deps.connector.requestPair(cmd.method, cmd.phoneNumber);
          } else if (cmd.type === 'send') {
            await handleSendCommand(
              { db, userId: deps.userId, connector: deps.connector, bus },
              cmd,
            );
          } else if (cmd.type === 'edit-message') {
            await handleEditMessageCommand(
              { db, userId: deps.userId, connector: deps.connector, bus },
              cmd,
            );
          } else if (cmd.type === 'download-media') {
            await handleDownloadCommand(
              {
                db,
                userId: deps.userId,
                mediaDir: deps.mediaDir,
                bus,
                connector: deps.connector,
                redis,
              },
              cmd,
            );
          } else {
            deps.log.warn({ cmd: cmd.type }, 'command type not implemented in M2; ignoring');
          }
        },
        onError: (err, raw) => deps.log.error({ err, raw }, 'command failed'),
      });
      consumerStop = stop;
    },
    async stop() {
      await consumerStop?.();
      await deps.connector.close();
      await redis.quit();
      await closeDb();
    },
  };
}

export type { Db };
