import type Redis from 'ioredis';
import { DaemonEventSchema, eventsChannel, type DaemonEvent } from '@yank/shared';

export interface EventsPublisher {
  publish(evt: DaemonEvent): Promise<void>;
}

export function createEventsPublisher(redis: Redis, userId: string): EventsPublisher {
  const channel = eventsChannel(userId);
  return {
    async publish(evt) {
      const parsed = DaemonEventSchema.parse(evt);
      await redis.publish(channel, JSON.stringify(parsed));
    },
  };
}
