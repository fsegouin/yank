import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import Redis from 'ioredis';
import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { eventsChannel, newId } from '@yank/shared';
import { chats, chatAssignments } from '@yank/db/schema';
import { ensureSingleUser } from '../src/bootstrap.js';
import { createEventsBus } from '../src/events-bus.js';
import { createEventsPublisher } from '../src/events-publisher.js';
import { registerChatsRoutes } from '../src/routes/chats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', '..', 'db', 'drizzle');
const USER = '0193fe00-0000-7000-8000-000000000022';

describe('POST /api/chats/:id/assignment', () => {
  let pg: StartedPostgreSqlContainer;
  let redisC: StartedRedisContainer;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let redis: Redis;
  let subscriber: Redis;
  let app: ReturnType<typeof Fastify>;
  let baseUrl: string;
  let chatId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    redisC = await new RedisContainer('redis:7-alpine').start();
    client = postgres(pg.getConnectionUri(), { max: 5 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await ensureSingleUser(db, USER, 'AssignTest');

    // Seed one chat owned by USER.
    chatId = newId();
    await db.insert(chats).values({
      id: chatId,
      userId: USER,
      jid: '9999@s.whatsapp.net',
      type: 'dm',
    });

    redis = new Redis(redisC.getConnectionUrl());
    subscriber = new Redis(redisC.getConnectionUrl());
    const eventsBus = createEventsBus(subscriber, USER);
    await eventsBus.start();
    const eventsPublisher = createEventsPublisher(redis, USER);

    app = Fastify({ logger: false });
    registerChatsRoutes(app, { db, userId: USER, events: eventsPublisher });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await subscriber?.quit();
    await redis?.quit();
    await client?.end();
    await pg?.stop();
    await redisC?.stop();
  });

  it('happy path: 204 + DB row upserted + event published', async () => {
    const receivedEvents: string[] = [];
    subscriber.on('message', (_ch, msg) => receivedEvents.push(msg));
    await subscriber.subscribe(eventsChannel(USER));

    const res = await fetch(`${baseUrl}/api/chats/${chatId}/assignment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspace: 'work' }),
    });
    expect(res.status).toBe(204);

    const rows = await db.select().from(chatAssignments).where(
      // drizzle eq import is available via the existing chats import pattern
      (await import('drizzle-orm')).eq(chatAssignments.chatId, chatId),
    );
    expect(rows[0]?.workspace).toBe('work');

    await new Promise((r) => setTimeout(r, 100));
    expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
    const evt = JSON.parse(receivedEvents[receivedEvents.length - 1]!) as {
      type: string;
      workspace: string;
      chatId: string;
    };
    expect(evt.type).toBe('chat-assignment');
    expect(evt.workspace).toBe('work');
    expect(evt.chatId).toBe(chatId);
  });

  it('400 on invalid workspace value', async () => {
    const res = await fetch(`${baseUrl}/api/chats/${chatId}/assignment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspace: 'archive' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 when chat is not owned by user', async () => {
    const res = await fetch(
      `${baseUrl}/api/chats/00000000-0000-7000-8000-000000000000/assignment`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspace: 'personal' }),
      },
    );
    expect(res.status).toBe(404);
  });

  it('idempotent repeat: second POST same body returns 204 and advances assigned_at', async () => {
    await fetch(`${baseUrl}/api/chats/${chatId}/assignment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspace: 'personal' }),
    });
    const rowsBefore = await db.select().from(chatAssignments).where(
      (await import('drizzle-orm')).eq(chatAssignments.chatId, chatId),
    );
    const tsBefore = rowsBefore[0]?.assignedAt;

    // Small delay so assigned_at can differ.
    await new Promise((r) => setTimeout(r, 20));

    const res2 = await fetch(`${baseUrl}/api/chats/${chatId}/assignment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspace: 'personal' }),
    });
    expect(res2.status).toBe(204);

    const rowsAfter = await db.select().from(chatAssignments).where(
      (await import('drizzle-orm')).eq(chatAssignments.chatId, chatId),
    );
    expect(rowsAfter[0]?.assignedAt?.getTime()).toBeGreaterThan(tsBefore?.getTime() ?? 0);
  });
});
