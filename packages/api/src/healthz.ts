import type { FastifyInstance } from 'fastify';
import type { Db } from '@yank/db';
import { sql } from 'drizzle-orm';
import type Redis from 'ioredis';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerHealthz(app: FastifyInstance<any, any, any, any>, deps: { db: Db; redis: Redis }) {
  app.get('/healthz', async () => {
    await deps.db.execute(sql`SELECT 1`);
    const pong = await deps.redis.ping();
    if (pong !== 'PONG') throw new Error('redis unhealthy');
    return { ok: true };
  });
}
