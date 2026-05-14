import Redis from 'ioredis';
import { sql } from 'drizzle-orm';
import { createDb } from '@yank/db';
import { loadEnv, createLogger } from '@yank/shared';

const env = loadEnv();
const log = createLogger({
  service: 'media-worker',
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV !== 'production',
});

const { db, close: closeDb } = createDb({ url: env.DATABASE_URL });
const redis = new Redis(env.REDIS_URL);

await db.execute(sql`SELECT 1`);
await redis.ping();
log.info('media-worker shell up — media download arrives in M6');

const shutdown = async () => {
  await redis.quit();
  await closeDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

setInterval(() => log.debug('heartbeat'), 60_000);
