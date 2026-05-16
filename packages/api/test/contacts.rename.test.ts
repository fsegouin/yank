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
import { registerContactsRoutes } from '../src/routes/contacts.js';
import { contacts } from '@yank/db/schema';
import { and, eq } from 'drizzle-orm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', '..', 'db', 'drizzle');
const USER = '0193fe00-0000-7000-8000-000000000098';
const CONTACT_JID = '447700000001@s.whatsapp.net';

describe('contacts rename', () => {
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

    // Seed a contact row
    await db.insert(contacts).values({
      userId: USER,
      jid: CONTACT_JID,
      pushName: 'Alice Push',
    });

    redis = new Redis(redisC.getConnectionUrl());
    subscriber = new Redis(redisC.getConnectionUrl());
    const eventsBus = createEventsBus(subscriber, USER);
    await eventsBus.start();
    const eventsPublisher = createEventsPublisher(redis, USER);

    app = Fastify({ logger: false });
    registerEventsRoute(app, { bus: eventsBus });
    registerChatsRoutes(app, { db, userId: USER });
    registerContactsRoutes(app, { db, userId: USER, eventsPublisher });
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

  it('happy path: 204 + DB updated + event published', async () => {
    // Subscribe to events channel before making the request
    const received: string[] = [];
    const sub = new Redis(redisC.getConnectionUrl());
    await sub.subscribe(eventsChannel(USER));
    sub.on('message', (_ch, payload) => received.push(payload));

    const encodedJid = encodeURIComponent(CONTACT_JID);
    const res = await fetch(`${baseUrl}/api/contacts/${encodedJid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Alice Renamed' }),
    });
    expect(res.status).toBe(204);

    // DB updated
    const rows = await db
      .select({ displayName: contacts.displayName })
      .from(contacts)
      .where(and(eq(contacts.userId, USER), eq(contacts.jid, CONTACT_JID)));
    expect(rows[0]?.displayName).toBe('Alice Renamed');

    // Event published within 1s
    await new Promise((r) => setTimeout(r, 300));
    expect(received.some((p) => {
      try {
        const evt = JSON.parse(p) as { type: string; contactId: string; displayName: string };
        return evt.type === 'contact-update' && evt.contactId === CONTACT_JID && evt.displayName === 'Alice Renamed';
      } catch { return false; }
    })).toBe(true);

    await sub.quit();
  });

  it('400 — empty displayName', async () => {
    const encodedJid = encodeURIComponent(CONTACT_JID);
    const res = await fetch(`${baseUrl}/api/contacts/${encodedJid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 — displayName too long (81 chars)', async () => {
    const encodedJid = encodeURIComponent(CONTACT_JID);
    const res = await fetch(`${baseUrl}/api/contacts/${encodedJid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'a'.repeat(81) }),
    });
    expect(res.status).toBe(400);
  });

  it('400 — missing body', async () => {
    const encodedJid = encodeURIComponent(CONTACT_JID);
    const res = await fetch(`${baseUrl}/api/contacts/${encodedJid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('upserts a new contact row for a previously-unknown jid', async () => {
    const unknownJid = '50264102985962@lid';
    const received: string[] = [];
    const sub = new Redis(redisC.getConnectionUrl());
    await sub.subscribe(eventsChannel(USER));
    sub.on('message', (_ch, payload) => received.push(payload));

    const res = await fetch(`${baseUrl}/api/contacts/${encodeURIComponent(unknownJid)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Bob from accounting' }),
    });
    expect(res.status).toBe(204);

    const rows = await db
      .select({ jid: contacts.jid, displayName: contacts.displayName })
      .from(contacts)
      .where(and(eq(contacts.userId, USER), eq(contacts.jid, unknownJid)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.displayName).toBe('Bob from accounting');

    await new Promise((r) => setTimeout(r, 300));
    expect(received.some((p) => {
      try {
        const evt = JSON.parse(p) as { type: string; contactId: string; displayName: string };
        return evt.type === 'contact-update' && evt.contactId === unknownJid && evt.displayName === 'Bob from accounting';
      } catch { return false; }
    })).toBe(true);

    await sub.quit();
  });
});
