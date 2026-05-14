import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import Redis from 'ioredis';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { users, chats, messages, chatAssignments } from '@yank/db/schema';
import { eventsChannel, newId, type DaemonEvent } from '@yank/shared';
import { FakeConnector } from '../src/connector-fake.js';
import { createEventsBus } from '../src/events-bus.js';
import { attachOutbound, handleSendCommand } from '../src/outbound.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', '..', 'db', 'drizzle');
const USER = '0193fe00-0000-7000-8000-000000000002';

describe('outbound pipeline', () => {
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

  it('handleSendCommand: inserts pending row, calls connector, attaches waId, emits sent', async () => {
    const connector = new FakeConnector();
    const bus = createEventsBus(redis, USER);
    attachOutbound({ db, userId: USER, connector, bus });

    const chatId = newId();
    await db.insert(chats).values({
      id: chatId,
      userId: USER,
      jid: '4477@s.whatsapp.net',
      type: 'dm',
    });
    await db.insert(chatAssignments).values({ chatId, workspace: 'personal' });

    const before = received.length;
    const localId = newId();
    await db.insert(messages).values({
      id: localId,
      userId: USER,
      chatId,
      senderJid: 'me',
      ts: new Date(),
      kind: 'text',
      text: 'pong',
      status: 'pending',
    });
    await handleSendCommand(
      { db, userId: USER, connector, bus },
      { type: 'send', userId: USER, localId, chatJid: '4477@s.whatsapp.net', text: 'pong' },
    );

    const row = await db
      .select()
      .from(messages)
      .where(and(eq(messages.userId, USER), eq(messages.id, localId)))
      .limit(1);
    expect(row[0]?.status).toBe('sent');
    expect(row[0]?.waMessageId).toMatch(/^fake-/);

    const after = received.slice(before);
    expect(after.find((e) => e.type === 'status' && e.status === 'sent')).toBeTruthy();
  });

  it('attachOutbound forwards delivered/read connector events as status events', async () => {
    const connector = new FakeConnector();
    const bus = createEventsBus(redis, USER);
    attachOutbound({ db, userId: USER, connector, bus });

    const chatId = (await db.select().from(chats).limit(1))[0]!.id;
    const localId = newId();
    await db.insert(messages).values({
      id: localId,
      userId: USER,
      chatId,
      waMessageId: 'WA-OUT-1',
      senderJid: 'me',
      ts: new Date(),
      kind: 'text',
      text: 'hi',
      status: 'sent',
    });

    const before = received.length;
    connector.simulateStatus({ waMessageId: 'WA-OUT-1', status: 'delivered' });
    connector.simulateStatus({ waMessageId: 'WA-OUT-1', status: 'read' });
    await new Promise((r) => setTimeout(r, 100));

    const row = (await db
      .select()
      .from(messages)
      .where(eq(messages.waMessageId, 'WA-OUT-1')))[0];
    expect(row?.status).toBe('read');

    const after = received.slice(before).filter((e) => e.type === 'status');
    expect(after.map((e) => ('status' in e ? e.status : null))).toEqual(['delivered', 'read']);
  });

  it('handleSendCommand marks failed when the connector throws', async () => {
    const connector = new FakeConnector();
    connector.sendText = async () => {
      throw new Error('boom');
    };
    const bus = createEventsBus(redis, USER);
    attachOutbound({ db, userId: USER, connector, bus });

    const chatId = (await db.select().from(chats).limit(1))[0]!.id;
    const localId = newId();
    await db.insert(messages).values({
      id: localId,
      userId: USER,
      chatId,
      senderJid: 'me',
      ts: new Date(),
      kind: 'text',
      text: 'doomed',
      status: 'pending',
    });

    const before = received.length;
    await expect(
      handleSendCommand(
        { db, userId: USER, connector, bus },
        { type: 'send', userId: USER, localId, chatJid: '4477@s.whatsapp.net', text: 'doomed' },
      ),
    ).rejects.toThrow(/boom/);

    const row = (await db.select().from(messages).where(eq(messages.id, localId)))[0];
    expect(row?.status).toBe('failed');

    const after = received.slice(before);
    expect(after.find((e) => e.type === 'status' && e.status === 'failed')).toBeTruthy();
  });
});
