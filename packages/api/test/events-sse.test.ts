import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import Redis from 'ioredis';
import { eventsChannel, type DaemonEvent } from '@yank/shared';
import { createEventsBus } from '../src/events-bus.js';

const USER = '0193fe00-0000-7000-8000-0000000000aa';

describe('api events-bus', () => {
  let redisC: StartedRedisContainer;
  let pub: Redis;
  let sub: Redis;

  beforeAll(async () => {
    redisC = await new RedisContainer('redis:7-alpine').start();
    pub = new Redis(redisC.getConnectionUrl());
    sub = new Redis(redisC.getConnectionUrl());
  }, 60_000);

  afterAll(async () => {
    await pub?.quit();
    await sub?.quit();
    await redisC?.stop();
  });

  it('fans out a published event to every attached listener', async () => {
    const bus = createEventsBus(sub, USER);
    await bus.start();
    const seenA: DaemonEvent[] = [];
    const seenB: DaemonEvent[] = [];
    bus.attach((e) => seenA.push(e));
    bus.attach((e) => seenB.push(e));

    await pub.publish(
      eventsChannel(USER),
      JSON.stringify({ type: 'connected', userId: USER, jid: 'j', phone: '+0' }),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(seenA).toHaveLength(1);
    expect(seenB).toHaveLength(1);
    await bus.stop();
  });

  it('ignores malformed payloads', async () => {
    const bus = createEventsBus(sub, USER);
    await bus.start();
    const seen: DaemonEvent[] = [];
    bus.attach((e) => seen.push(e));
    await pub.publish(eventsChannel(USER), 'not-json');
    await pub.publish(eventsChannel(USER), JSON.stringify({ type: 'nope' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toHaveLength(0);
    await bus.stop();
  });
});
