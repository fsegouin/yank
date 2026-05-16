import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import Redis from 'ioredis';
import { createEventsPublisher } from '../src/events-publisher.js';
import { eventsChannel } from '@yank/shared';

const USER = '0193fe00-0000-7000-8000-000000000011';

describe('createEventsPublisher', () => {
  let redisC: StartedRedisContainer;
  let publisher: Redis;
  let subscriber: Redis;

  beforeAll(async () => {
    redisC = await new RedisContainer('redis:7-alpine').start();
    publisher = new Redis(redisC.getConnectionUrl());
    subscriber = new Redis(redisC.getConnectionUrl());
    await subscriber.subscribe(eventsChannel(USER));
  }, 60_000);

  afterAll(async () => {
    await publisher.quit();
    await subscriber.quit();
    await redisC.stop();
  });

  it('publishes a chat-assignment event on the correct channel', async () => {
    const bus = createEventsPublisher(publisher, USER);
    const received: string[] = [];
    subscriber.on('message', (ch, msg) => {
      if (ch === eventsChannel(USER)) received.push(msg);
    });

    await bus.publish({
      type: 'chat-assignment',
      userId: USER,
      chatId: '0193fe00-0000-7000-8000-000000000001',
      workspace: 'personal',
      assignedAt: new Date().toISOString(),
    });

    // Give Redis a tick to deliver.
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(1);
    const parsed = JSON.parse(received[0]!) as { type: string; workspace: string };
    expect(parsed.type).toBe('chat-assignment');
    expect(parsed.workspace).toBe('personal');
  });
});
