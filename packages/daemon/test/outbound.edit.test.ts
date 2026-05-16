import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import Redis from 'ioredis';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { newId, eventsChannel } from '@yank/shared';
import { messages, chats } from '@yank/db/schema';
import { FakeConnector } from '../src/connector-fake.js';
import { createEventsBus } from '../src/events-bus.js';
import { handleEditMessageCommand } from '../src/outbound.js';
import type { OutboundCtx } from '../src/outbound.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', '..', 'db', 'drizzle');
const USER = '0193fe00-0000-7000-8000-000000000096';

describe('handleEditMessageCommand', () => {
  let pg: StartedPostgreSqlContainer;
  let redisC: StartedRedisContainer;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let redis: Redis;
  let ctx: OutboundCtx;
  let connector: FakeConnector;
  let chatId: string;
  let messageId: string;
  const waMessageId = 'WA-EDIT-1';
  const chatJid = '447700000003@s.whatsapp.net';

  beforeEach(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    redisC = await new RedisContainer('redis:7-alpine').start();
    client = postgres(pg.getConnectionUri(), { max: 5 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder });

    // Seed user
    const { users } = await import('@yank/db/schema');
    await db.insert(users).values({ id: USER, displayName: 'Edit Test' });

    // Seed chat + message
    chatId = newId();
    await db.insert(chats).values({ id: chatId, userId: USER, jid: chatJid, type: 'dm' });
    messageId = newId();
    await db.insert(messages).values({
      id: messageId,
      userId: USER,
      chatId,
      waMessageId,
      senderJid: 'me',
      ts: new Date(),
      kind: 'text',
      text: 'original',
      status: 'sent',
    });

    redis = new Redis(redisC.getConnectionUrl());
    const bus = createEventsBus(redis, USER);
    connector = new FakeConnector();
    ctx = { db, userId: USER, connector, bus };
  }, 120_000);

  afterEach(async () => {
    await redis?.quit();
    await client?.end();
    await pg?.stop();
    await redisC?.stop();
  });

  it('success: calls connector.editMessage, updates DB, publishes message-edit event', async () => {
    const received: string[] = [];
    const sub = new Redis(redisC.getConnectionUrl());
    await sub.subscribe(eventsChannel(USER));
    sub.on('message', (_ch, p) => received.push(p));

    await handleEditMessageCommand(ctx, {
      type: 'edit-message',
      userId: USER,
      messageId,
      waMessageId,
      chatJid,
      text: 'updated text',
    });

    // Connector received the call
    expect(connector.editCalls).toHaveLength(1);
    expect(connector.editCalls[0]).toMatchObject({ jid: chatJid, waMessageId, text: 'updated text' });

    // DB updated
    const rows = await db.select({ text: messages.text, editedAt: messages.editedAt })
      .from(messages)
      .where((await import('drizzle-orm')).eq(messages.id, messageId));
    expect(rows[0]?.text).toBe('updated text');
    expect(rows[0]?.editedAt).not.toBeNull();

    // Event published
    await new Promise((r) => setTimeout(r, 200));
    expect(received.some((p) => {
      try {
        const evt = JSON.parse(p) as { type: string; messageId: string; text: string };
        return evt.type === 'message-edit' && evt.messageId === messageId && evt.text === 'updated text';
      } catch { return false; }
    })).toBe(true);

    await sub.quit();
  });

  it('network failure: publishes message-edit-failed with reason=network', async () => {
    const received: string[] = [];
    const sub = new Redis(redisC.getConnectionUrl());
    await sub.subscribe(eventsChannel(USER));
    sub.on('message', (_ch, p) => received.push(p));

    connector.editError = new Error('ECONNRESET');

    await handleEditMessageCommand(ctx, {
      type: 'edit-message',
      userId: USER,
      messageId,
      waMessageId,
      chatJid,
      text: 'will fail',
    });

    await new Promise((r) => setTimeout(r, 200));
    expect(received.some((p) => {
      try {
        const evt = JSON.parse(p) as { type: string; messageId: string; reason: string };
        return evt.type === 'message-edit-failed' && evt.messageId === messageId && evt.reason === 'network';
      } catch { return false; }
    })).toBe(true);

    await sub.quit();
  });

  it('too-old failure: publishes message-edit-failed with reason=too-old', async () => {
    const received: string[] = [];
    const sub = new Redis(redisC.getConnectionUrl());
    await sub.subscribe(eventsChannel(USER));
    sub.on('message', (_ch, p) => received.push(p));

    connector.editError = new Error('Message is too old to edit');

    await handleEditMessageCommand(ctx, {
      type: 'edit-message',
      userId: USER,
      messageId,
      waMessageId,
      chatJid,
      text: 'ancient',
    });

    await new Promise((r) => setTimeout(r, 200));
    expect(received.some((p) => {
      try {
        const evt = JSON.parse(p) as { type: string; reason: string };
        return evt.type === 'message-edit-failed' && evt.reason === 'too-old';
      } catch { return false; }
    })).toBe(true);

    await sub.quit();
  });
});
