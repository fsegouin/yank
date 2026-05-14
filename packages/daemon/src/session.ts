import Redis from 'ioredis';
import { createDb, type Db } from '@yank/db';
import type { Logger } from '@yank/shared';
import type { Connector } from './connector.js';
import { createEventsBus } from './events-bus.js';
import { attachInbound } from './ingest.js';
import { attachOutbound, handleSendCommand } from './outbound.js';
import { startCommandsConsumer } from './commands-consumer.js';

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
}

export function createSession(deps: SessionDeps): Session {
  const { db, close: closeDb } = createDb({ url: deps.databaseUrl });
  const redis = new Redis(deps.redisUrl);
  const bus = createEventsBus(redis, deps.userId);

  attachInbound({ db, userId: deps.userId, connector: deps.connector, bus });
  attachOutbound({ db, userId: deps.userId, connector: deps.connector, bus });

  let consumerStop: (() => Promise<void>) | null = null;
  deps.connector.on('open', ({ jid, phone }) => {
    void bus.publish({ type: 'connected', userId: deps.userId, jid, phone });
  });
  deps.connector.on('close', ({ reason }) => {
    void bus.publish({ type: 'disconnected', userId: deps.userId, reason });
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
