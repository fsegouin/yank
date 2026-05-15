import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import Redis from 'ioredis';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { users, chats, messages } from '@yank/db/schema';
import { eventsChannel, type DaemonEvent } from '@yank/shared';
import { FakeConnector } from '../src/connector-fake.js';
import { createEventsBus } from '../src/events-bus.js';
import { attachInbound } from '../src/ingest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', '..', 'db', 'drizzle');
const USER = '0193fe00-0000-7000-8000-000000000001';

describe('ingest pipeline', () => {
  let pg: StartedPostgreSqlContainer;
  let redisC: StartedRedisContainer;
  let client: ReturnType<typeof postgres>;
  let redis: Redis;
  let pubsub: Redis;
  let db: ReturnType<typeof drizzle>;
  let received: DaemonEvent[];

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    redisC = await new RedisContainer('redis:7-alpine').start();
    client = postgres(pg.getConnectionUri(), { max: 1 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await db.insert(users).values({ id: USER, displayName: 'Test' });

    redis = new Redis(redisC.getConnectionUrl());
    pubsub = new Redis(redisC.getConnectionUrl());
    received = [];
    await pubsub.subscribe(eventsChannel(USER));
    pubsub.on('message', (_ch, payload) => received.push(JSON.parse(payload)));
  }, 90_000);

  afterAll(async () => {
    await redis?.quit();
    await pubsub?.quit();
    await client?.end();
    await pg?.stop();
    await redisC?.stop();
  });

  it('persists an inbound text and publishes a message event', async () => {
    const connector = new FakeConnector();
    const bus = createEventsBus(redis, USER);
    attachInbound({ db, userId: USER, connector, bus });

    const before = received.length;
    connector.pushMessage(
      {
        waMessageId: 'WA-1',
        chatJid: '447@s.whatsapp.net',
        senderJid: '447@s.whatsapp.net',
        fromMe: false,
        ts: new Date('2026-05-14T10:00:00Z'),
        kind: 'text',
        text: 'hello',
      },
      { jid: '447@s.whatsapp.net', type: 'dm' },
      { jid: '447@s.whatsapp.net', pushName: 'Friend' },
    );
    await new Promise((r) => setTimeout(r, 50));

    const chatRows = await db.select().from(chats).where(eq(chats.userId, USER));
    const msgRows = await db.select().from(messages).where(eq(messages.userId, USER));
    expect(chatRows).toHaveLength(1);
    expect(msgRows).toHaveLength(1);
    expect(msgRows[0]?.text).toBe('hello');

    const after = received.slice(before);
    expect(after.filter((e) => e.type === 'message')).toHaveLength(1);
  });

  it('dedupes a second delivery with the same waMessageId', async () => {
    const connector = new FakeConnector();
    const bus = createEventsBus(redis, USER);
    attachInbound({ db, userId: USER, connector, bus });

    connector.pushMessage(
      {
        waMessageId: 'WA-2',
        chatJid: '447@s.whatsapp.net',
        senderJid: '447@s.whatsapp.net',
        fromMe: false,
        ts: new Date('2026-05-14T10:01:00Z'),
        kind: 'text',
        text: 'dup-test',
      },
      { jid: '447@s.whatsapp.net', type: 'dm' },
      { jid: '447@s.whatsapp.net' },
    );
    connector.pushMessage(
      {
        waMessageId: 'WA-2',
        chatJid: '447@s.whatsapp.net',
        senderJid: '447@s.whatsapp.net',
        fromMe: false,
        ts: new Date('2026-05-14T10:01:00Z'),
        kind: 'text',
        text: 'dup-test',
      },
      { jid: '447@s.whatsapp.net', type: 'dm' },
      { jid: '447@s.whatsapp.net' },
    );
    await new Promise((r) => setTimeout(r, 50));

    const dupRows = await db.select().from(messages).where(eq(messages.waMessageId, 'WA-2'));
    expect(dupRows).toHaveLength(1);
  });

  it('forwards history-progress events from the connector', async () => {
    const connector = new FakeConnector();
    const bus = createEventsBus(redis, USER);
    attachInbound({ db, userId: USER, connector, bus });

    const before = received.length;
    connector.simulateHistory(42, 1000);
    connector.completeHistory();
    await new Promise((r) => setTimeout(r, 50));

    const after = received.slice(before);
    const types = after.map((e) => e.type);
    expect(types).toContain('sync-progress');
    expect(types).toContain('sync-complete');
  });
});
