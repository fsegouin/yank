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
import { createLogger } from '@yank/shared';
import { ensureSingleUser } from '../src/bootstrap.js';
import { createCommandsBus } from '../src/commands-bus.js';
import { createEventsBus } from '../src/events-bus.js';
import { registerEventsRoute } from '../src/routes/events.js';
import { registerSetupRoutes } from '../src/routes/setup.js';
import { registerChatsRoutes } from '../src/routes/chats.js';
import { registerMessagesRoutes } from '../src/routes/messages.js';
import { FakeConnector } from '../../daemon/src/connector-fake.js';
import { createSession } from '../../daemon/src/session.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', '..', 'db', 'drizzle');
const USER = '0193fe00-0000-7000-8000-000000000099';

describe('M2 roundtrip', () => {
  let pg: StartedPostgreSqlContainer;
  let redisC: StartedRedisContainer;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let redis: Redis;
  let subscriber: Redis;
  let app: ReturnType<typeof Fastify>;
  let session: ReturnType<typeof createSession>;
  let baseUrl: string;
  const connector = new FakeConnector();

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    redisC = await new RedisContainer('redis:7-alpine').start();
    client = postgres(pg.getConnectionUri(), { max: 5 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await ensureSingleUser(db, USER, 'Roundtrip');

    redis = new Redis(redisC.getConnectionUrl());
    subscriber = new Redis(redisC.getConnectionUrl());
    const eventsBus = createEventsBus(subscriber, USER);
    await eventsBus.start();
    const commandsBus = createCommandsBus(redis, USER);

    const log = createLogger({ service: 'roundtrip-test', level: 'warn' });
    session = createSession({
      userId: USER,
      databaseUrl: pg.getConnectionUri(),
      redisUrl: redisC.getConnectionUrl(),
      log,
      connector,
    });
    await session.start();

    app = Fastify({ logger: false });
    registerEventsRoute(app, { bus: eventsBus });
    registerSetupRoutes(app, { db, userId: USER, commands: commandsBus });
    registerChatsRoutes(app, { db, userId: USER });
    registerMessagesRoutes(app, { db, userId: USER, commands: commandsBus });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 120_000);

  afterAll(async () => {
    await session?.stop();
    await app?.close();
    await subscriber?.quit();
    await redis?.quit();
    await client?.end();
    await pg?.stop();
    await redisC?.stop();
  });

  it('inbound: simulated WhatsApp message appears via GET /api/chats and /messages', async () => {
    connector.pushMessage(
      {
        waMessageId: 'WA-RT-1',
        chatJid: '4477@s.whatsapp.net',
        senderJid: '4477@s.whatsapp.net',
        fromMe: false,
        ts: new Date(),
        kind: 'text',
        text: 'incoming',
      },
      { jid: '4477@s.whatsapp.net', type: 'dm' },
      { jid: '4477@s.whatsapp.net', pushName: 'Roundtrip' },
    );
    await new Promise((r) => setTimeout(r, 200));

    const chatsRes = await fetch(`${baseUrl}/api/chats`);
    const chats = (await chatsRes.json()) as Array<{ id: string }>;
    expect(chats.length).toBeGreaterThan(0);
    const chatId = chats[0]!.id;

    const msgsRes = await fetch(`${baseUrl}/api/chats/${chatId}/messages`);
    const msgsBody = (await msgsRes.json()) as {
      messages: Array<{ text: string; status: string }>;
      nextCursor: string | null;
    };
    expect(msgsBody.messages.find((m) => m.text === 'incoming')).toBeTruthy();
  });

  it('outbound: POST /messages routes through daemon and flips status to sent', async () => {
    const chats = (await (await fetch(`${baseUrl}/api/chats`)).json()) as Array<{ id: string }>;
    const chatId = chats[0]!.id;

    const postRes = await fetch(`${baseUrl}/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'outbound from roundtrip' }),
    });
    expect(postRes.status).toBe(202);
    const created = (await postRes.json()) as { id: string };

    let final: { status?: string } = {};
    for (let i = 0; i < 30; i++) {
      const body = (await (
        await fetch(`${baseUrl}/api/chats/${chatId}/messages`)
      ).json()) as {
        messages: Array<{ id: string; status: string }>;
        nextCursor: string | null;
      };
      const row = body.messages.find((m) => m.id === created.id);
      if (row?.status === 'sent') {
        final = row;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(final.status).toBe('sent');

    expect(connector.sent.find((s) => s.text === 'outbound from roundtrip')).toBeTruthy();
  });

  it(
    'SSE: subscribers receive message events when a new inbound arrives',
    async () => {
      const seen: string[] = [];
      const controller = new AbortController();
      const res = await fetch(`${baseUrl}/api/events`, { signal: controller.signal });

      // SSE handler is fully wired (headers + attach) by the time fetch resolves with headers.
      // Wait a tick to be sure, then push.
      setTimeout(() => {
        connector.pushMessage(
          {
            waMessageId: 'WA-RT-SSE',
            chatJid: '4477@s.whatsapp.net',
            senderJid: '4477@s.whatsapp.net',
            fromMe: false,
            ts: new Date(),
            kind: 'text',
            text: 'sse-test',
          },
          { jid: '4477@s.whatsapp.net', type: 'dm' },
          { jid: '4477@s.whatsapp.net' },
        );
      }, 200);

      const decoder = new TextDecoder();
      const stream = res.body!.getReader();
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const { value, done } = await stream.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('event:')) seen.push(line.slice(6).trim());
        }
        if (seen.includes('message')) break;
      }
      controller.abort();
      expect(seen).toContain('message');
    },
    15_000,
  );
});
