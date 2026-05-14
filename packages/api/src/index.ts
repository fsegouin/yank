import Fastify from 'fastify';
import Redis from 'ioredis';
import { createDb } from '@yank/db';
import { loadEnv, createLogger } from '@yank/shared';
import { registerHealthz } from './healthz.js';

const env = loadEnv();
const log = createLogger({
  service: 'api',
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV !== 'production',
});

const { db, close: closeDb } = createDb({ url: env.DATABASE_URL });
const redis = new Redis(env.REDIS_URL);

const app = Fastify({ loggerInstance: log });
registerHealthz(app, { db, redis });

const port = Number(process.env.PORT ?? 3001);
try {
  await app.listen({ host: '0.0.0.0', port });
  log.info({ port }, 'api listening');
} catch (err) {
  log.error({ err }, 'failed to start');
  process.exit(1);
}

const shutdown = async () => {
  log.info('shutting down');
  await app.close();
  await redis.quit();
  await closeDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
