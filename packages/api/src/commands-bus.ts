import type Redis from 'ioredis';
import { ApiCommandSchema, commandsStream, type ApiCommand } from '@yank/shared';

export interface CommandsBus {
  publish(cmd: ApiCommand): Promise<string>;
}

export function createCommandsBus(redis: Redis, userId: string): CommandsBus {
  const stream = commandsStream(userId);
  return {
    async publish(cmd) {
      const parsed = ApiCommandSchema.parse(cmd);
      return redis.xadd(stream, '*', 'payload', JSON.stringify(parsed)) as Promise<string>;
    },
  };
}
