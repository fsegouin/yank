import type Redis from 'ioredis';
import { DaemonEventSchema, eventsChannel, type DaemonEvent } from '@yank/shared';

export interface EventsBus {
  publish(evt: DaemonEvent): Promise<void>;
}

export function createEventsBus(redis: Redis, userId: string): EventsBus {
  const channel = eventsChannel(userId);
  return {
    async publish(evt) {
      const parsed = DaemonEventSchema.parse(evt);
      await redis.publish(channel, JSON.stringify(parsed));
    },
  };
}
