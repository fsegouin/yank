import type Redis from 'ioredis';
import { DaemonEventSchema, eventsChannel, type DaemonEvent } from '@yank/shared';

export type EventListener = (e: DaemonEvent) => void;

export interface EventsBus {
  attach(listener: EventListener): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createEventsBus(subscriber: Redis, userId: string): EventsBus {
  const listeners = new Set<EventListener>();
  const channel = eventsChannel(userId);

  const onMessage = (ch: string, payload: string) => {
    if (ch !== channel) return;
    let parsed: DaemonEvent;
    try {
      parsed = DaemonEventSchema.parse(JSON.parse(payload));
    } catch {
      return;
    }
    for (const l of listeners) l(parsed);
  };

  return {
    attach(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async start() {
      subscriber.on('message', onMessage);
      await subscriber.subscribe(channel);
    },
    async stop() {
      subscriber.off('message', onMessage);
      await subscriber.unsubscribe(channel);
    },
  };
}
