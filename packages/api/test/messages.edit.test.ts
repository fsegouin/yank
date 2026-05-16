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
import { commandsStream } from '@yank/shared';
import { ensureSingleUser } from '../src/bootstrap.js';
import { createCommandsBus } from '../src/commands-bus.js';
import { createEventsBus } from '../src/events-bus.js';
import { createEventsPublisher } from '../src/events-publisher.js';
import { registerMessagesRoutes } from '../src/routes/messages.js';
import { registerChatsRoutes } from '../src/routes/chats.js';
import { messages, chats } from '@yank/db/schema';
import { newId } from '@yank/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', '..', 'db', 'drizzle');
const USER = '0193fe00-0000-7000-8000-000000000097';

describe('messages edit', () => {
  let pg: StartedPostgreSqlContainer;
  let redisC: StartedRedisContainer;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let redis: Redis;
  let subscriber: Redis;
  let app: ReturnType<typeof Fastify>;
  let baseUrl: string;
  let chatId: string;
  let ownMessageId: string;
  let ownMessageWaId: string;
  let inboundMessageId: string;
  let pendingMessageId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    redisC = await new RedisContainer('redis:7-alpine').start();
    client = postgres(pg.getConnectionUri(), { max: 5 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await ensureSingleUser(db, USER, 'Edit Test');

    // Seed a chat
    chatId = newId();
    await db.insert(chats).values({
      id: chatId,
      userId: USER,
      jid: '447700000002@s.whatsapp.net',
      type: 'dm',
    });

    // Seed an outbound message (senderJid = 'me') with a wa_message_id
    ownMessageId = newId();
    ownMessageWaId = 'WA-EDIT-OWN-1';
    await db.insert(messages).values({
      id: ownMessageId,
      userId: USER,
      chatId,
      waMessageId: ownMessageWaId,
      senderJid: 'me',
      ts: new Date(),
      kind: 'text',
      text: 'original text',
      status: 'sent',
    });

    // Seed an inbound message (senderJid = remote jid)
    inboundMessageId = newId();
    await db.insert(messages).values({
      id: inboundMessageId,
      userId: USER,
      chatId,
      waMessageId: 'WA-EDIT-INBOUND-1',
      senderJid: '447700000002@s.whatsapp.net',
      ts: new Date(),
      kind: 'text',
      text: 'their text',
      status: 'sent',
    });

    // Seed a pending (still-sending) outbound message (waMessageId IS NULL)
    pendingMessageId = newId();
    await db.insert(messages).values({
      id: pendingMessageId,
      userId: USER,
      chatId,
      waMessageId: null,
      senderJid: 'me',
      ts: new Date(),
      kind: 'text',
      text: 'sending...',
      status: 'pending',
    });

    redis = new Redis(redisC.getConnectionUrl());
    subscriber = new Redis(redisC.getConnectionUrl());
    const eventsBus = createEventsBus(subscriber, USER);
    await eventsBus.start();
    const commandsBus = createCommandsBus(redis, USER);
    const eventsPublisher = createEventsPublisher(redis, USER);

    app = Fastify({ logger: false });
    registerChatsRoutes(app, { db, userId: USER });
    registerMessagesRoutes(app, { db, userId: USER, commands: commandsBus, eventsPublisher });
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

  it('happy path: 202 + edit-message command on Redis stream', async () => {
    // Subscribe to the stream before the request
    const streamKey = commandsStream(USER);

    const res = await fetch(`${baseUrl}/api/messages/${ownMessageId}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'edited text' }),
    });
    expect(res.status).toBe(202);

    // Verify command landed on the stream
    const entries = await redis.xrange(streamKey, '-', '+');
    const found = entries.some(([, fields]) => {
      const payloadIdx = fields.indexOf('payload');
      if (payloadIdx === -1) return false;
      const raw = fields[payloadIdx + 1];
      if (!raw) return false;
      try {
        const cmd = JSON.parse(raw) as { type: string; messageId: string; waMessageId: string; text: string };
        return (
          cmd.type === 'edit-message' &&
          cmd.messageId === ownMessageId &&
          cmd.waMessageId === ownMessageWaId &&
          cmd.text === 'edited text'
        );
      } catch { return false; }
    });
    expect(found).toBe(true);
  });

  it('400 — empty text', async () => {
    const res = await fetch(`${baseUrl}/api/messages/${ownMessageId}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 — missing body', async () => {
    const res = await fetch(`${baseUrl}/api/messages/${ownMessageId}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('403 — inbound message (senderJid !== me)', async () => {
    const res = await fetch(`${baseUrl}/api/messages/${inboundMessageId}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'cannot edit yours' }),
    });
    expect(res.status).toBe(403);
  });

  it('404 — message not owned by user', async () => {
    const res = await fetch(`${baseUrl}/api/messages/${newId()}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'ghost' }),
    });
    expect(res.status).toBe(404);
  });

  it('409 — message still sending (waMessageId IS NULL)', async () => {
    const res = await fetch(`${baseUrl}/api/messages/${pendingMessageId}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'too soon' }),
    });
    expect(res.status).toBe(409);
  });
});
