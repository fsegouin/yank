import { loadEnv, createLogger } from '@yank/shared';
import { BaileysConnector } from './connector-baileys.js';
import { FakeConnector } from './connector-fake.js';
import { createSession } from './session.js';

const env = loadEnv();
const log = createLogger({
  service: 'daemon',
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV !== 'production',
});

const useFake = process.env.YANK_FAKE_CONNECTOR === '1';
const connector = useFake
  ? new FakeConnector()
  : new BaileysConnector({
      authDir: process.env.YANK_BAILEYS_AUTH_DIR ?? '/app/baileys-auth',
      userId: env.YANK_USER_ID,
      phoneNumber: env.YANK_PHONE_NUMBER,
    });

const session = createSession({
  userId: env.YANK_USER_ID,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  log,
  connector,
});

await session.start();
log.info({ userId: env.YANK_USER_ID, fake: useFake }, 'daemon session started');

const shutdown = async () => {
  log.info('shutting down');
  await session.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
