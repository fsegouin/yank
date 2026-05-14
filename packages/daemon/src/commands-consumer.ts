import type Redis from 'ioredis';
import { ApiCommandSchema, commandsStream, type ApiCommand } from '@yank/shared';

export interface ConsumerOpts {
  redis: Redis;
  userId: string;
  group?: string;
  consumer?: string;
  blockMs?: number;
  onCommand: (cmd: ApiCommand) => Promise<void>;
  onError: (err: unknown, raw: { id: string; fields: Record<string, string> }) => void;
}

export function startCommandsConsumer(opts: ConsumerOpts): { stop: () => Promise<void> } {
  const group = opts.group ?? 'daemon-1';
  const consumer = opts.consumer ?? 'daemon-1';
  const stream = commandsStream(opts.userId);
  let stopped = false;

  void (async () => {
    try {
      await opts.redis.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
    } catch (err) {
      if (!String(err).includes('BUSYGROUP')) throw err;
    }

    while (!stopped) {
      const res = await opts.redis.xreadgroup(
        'GROUP',
        group,
        consumer,
        'COUNT',
        10,
        'BLOCK',
        opts.blockMs ?? 5_000,
        'STREAMS',
        stream,
        '>',
      );
      if (!res) continue;
      const entries = (res as Array<[string, Array<[string, string[]]>]>)[0]?.[1] ?? [];
      for (const [id, fields] of entries) {
        const fieldMap: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) fieldMap[fields[i]!] = fields[i + 1]!;
        try {
          const payload = JSON.parse(fieldMap.payload ?? '{}');
          const cmd = ApiCommandSchema.parse(payload);
          await opts.onCommand(cmd);
          await opts.redis.xack(stream, group, id);
        } catch (err) {
          opts.onError(err, { id, fields: fieldMap });
        }
      }
    }
  })();

  return {
    stop: async () => {
      stopped = true;
    },
  };
}
