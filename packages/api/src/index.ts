import Fastify from 'fastify';
import Redis from 'ioredis';
import { createDb } from '@yank/db';
import { loadEnv, createLogger } from '@yank/shared';
import { registerHealthz } from './healthz.js';
import { ensureSingleUser } from './bootstrap.js';
import { createCommandsBus } from './commands-bus.js';
import { createEventsBus } from './events-bus.js';
import { registerEventsRoute } from './routes/events.js';
import { registerSetupRoutes } from './routes/setup.js';
import { registerChatsRoutes } from './routes/chats.js';
import { registerMessagesRoutes } from './routes/messages.js';

const env = loadEnv();
const log = createLogger({
  service: 'api',
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV !== 'production',
});

const { db, close: closeDb } = createDb({ url: env.DATABASE_URL });
const redis = new Redis(env.REDIS_URL);
const subscriber = new Redis(env.REDIS_URL);

await ensureSingleUser(db, env.YANK_USER_ID);

const eventsBus = createEventsBus(subscriber, env.YANK_USER_ID);
await eventsBus.start();
const commandsBus = createCommandsBus(redis, env.YANK_USER_ID);

const app = Fastify({ loggerInstance: log });
registerHealthz(app, { db, redis });
registerEventsRoute(app, { bus: eventsBus });
registerSetupRoutes(app, { db, userId: env.YANK_USER_ID, commands: commandsBus });
registerChatsRoutes(app, { db, userId: env.YANK_USER_ID });
registerMessagesRoutes(app, { db, userId: env.YANK_USER_ID, commands: commandsBus });

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
  await eventsBus.stop();
  await subscriber.quit();
  await redis.quit();
  await closeDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
