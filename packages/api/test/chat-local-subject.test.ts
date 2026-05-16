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
import { eventsChannel } from '@yank/shared';
import { ensureSingleUser } from '../src/bootstrap.js';
import { createEventsBus } from '../src/events-bus.js';
import { createEventsPublisher } from '../src/events-publisher.js';
import { registerEventsRoute } from '../src/routes/events.js';
import { registerChatsRoutes } from '../src/routes/chats.js';
import { registerChatLocalSubjectRoutes } from '../src/routes/chat-local-subject.js';
import { chats } from '@yank/db/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', '..', 'db', 'drizzle');
const USER = '0193fe00-0000-7000-8000-0000000000a1';
const CHAT_ID = '0193fe00-0000-7000-8000-0000000000a2';
const CHAT_JID = '120363000000000000@g.us';

describe('chat local-subject', () => {
  let pg: StartedPostgreSqlContainer;
  let redisC: StartedRedisContainer;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let redis: Redis;
  let subscriber: Redis;
  let app: ReturnType<typeof Fastify>;
  let baseUrl: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    redisC = await new RedisContainer('redis:7-alpine').start();
    client = postgres(pg.getConnectionUri(), { max: 5 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await ensureSingleUser(db, USER, 'Rename Test');

    // Seed a group chat row with a canonical WA subject
    await db.insert(chats).values({
      id: CHAT_ID,
      userId: USER,
      jid: CHAT_JID,
      type: 'group',
      subject: 'WA Subject',
    });

    redis = new Redis(redisC.getConnectionUrl());
    subscriber = new Redis(redisC.getConnectionUrl());
    const eventsBus = createEventsBus(subscriber, USER);
    await eventsBus.start();
    const eventsPublisher = createEventsPublisher(redis, USER);

    app = Fastify({ logger: false });
    registerEventsRoute(app, { bus: eventsBus });
    registerChatsRoutes(app, { db, userId: USER });
    registerChatLocalSubjectRoutes(app, { db, userId: USER, eventsPublisher });
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

  it('happy path: 204 + GET /api/chats surfaces the local subject + event published', async () => {
    const received: string[] = [];
    const sub = new Redis(redisC.getConnectionUrl());
    await sub.subscribe(eventsChannel(USER));
    sub.on('message', (_ch, payload) => received.push(payload));

    const res = await fetch(`${baseUrl}/api/chats/${CHAT_ID}/local-subject`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ localSubject: 'My Team' }),
    });
    expect(res.status).toBe(204);

    const list = await fetch(`${baseUrl}/api/chats`).then((r) => r.json() as Promise<{ id: string; subject: string | null }[]>);
    const row = list.find((c) => c.id === CHAT_ID);
    expect(row?.subject).toBe('My Team');

    await new Promise((r) => setTimeout(r, 300));
    expect(received.some((p) => {
      try {
        const evt = JSON.parse(p) as { type: string; chatId: string; localSubject: string | null };
        return evt.type === 'chat-local-subject-update' && evt.chatId === CHAT_ID && evt.localSubject === 'My Team';
      } catch { return false; }
    })).toBe(true);

    await sub.quit();
  });

  it('null clears the override — WA subject re-surfaces', async () => {
    await fetch(`${baseUrl}/api/chats/${CHAT_ID}/local-subject`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ localSubject: 'Temporary' }),
    });

    const res = await fetch(`${baseUrl}/api/chats/${CHAT_ID}/local-subject`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ localSubject: null }),
    });
    expect(res.status).toBe(204);

    const list = await fetch(`${baseUrl}/api/chats`).then((r) => r.json() as Promise<{ id: string; subject: string | null }[]>);
    const row = list.find((c) => c.id === CHAT_ID);
    expect(row?.subject).toBe('WA Subject');
  });

  it('400 — empty localSubject', async () => {
    const res = await fetch(`${baseUrl}/api/chats/${CHAT_ID}/local-subject`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ localSubject: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 — localSubject too long', async () => {
    const res = await fetch(`${baseUrl}/api/chats/${CHAT_ID}/local-subject`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ localSubject: 'a'.repeat(81) }),
    });
    expect(res.status).toBe(400);
  });

  it('404 — unknown chatId', async () => {
    const res = await fetch(`${baseUrl}/api/chats/00000000-0000-0000-0000-0000000000ff/local-subject`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ localSubject: 'X' }),
    });
    expect(res.status).toBe(404);
  });
});
