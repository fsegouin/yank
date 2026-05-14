import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DaemonEventSchema, type DaemonEvent } from '@yank/shared';
import type { Message } from '@yank/shared';
import { queryKeys } from './queryKeys.js';

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const NAMED_EVENTS = [
  'qr',
  'connected',
  'disconnected',
  'sync-progress',
  'sync-complete',
  'message',
  'status',
] as const;

export interface UseEventStreamOptions {
  url?: string;
  onEvent?: (evt: DaemonEvent) => void;
}

export function useEventStream(opts: UseEventStreamOptions = {}): void {
  const qc = useQueryClient();
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;
  const url = opts.url ?? '/api/events';

  useEffect(() => {
    let backoff = BACKOFF_INITIAL_MS;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const patchCache = (evt: DaemonEvent) => {
      switch (evt.type) {
        case 'message':
          qc.invalidateQueries({ queryKey: queryKeys.messages(evt.chatId) });
          qc.invalidateQueries({ queryKey: queryKeys.chats() });
          return;
        case 'status':
          // Patch the optimistic row in any cached messages list by localId.
          // Done with setQueriesData so the composer's in-flight UI doesn't
          // flash empty during a refetch (the M2 behaviour we keep).
          qc.setQueriesData<Message[]>({ queryKey: ['messages'] }, (prev) =>
            prev?.map((m) =>
              m.id === evt.localId
                ? { ...m, status: evt.status, waMessageId: evt.waMessageId ?? m.waMessageId }
                : m,
            ),
          );
          qc.invalidateQueries({ queryKey: queryKeys.chats() });
          return;
        case 'connected':
        case 'disconnected':
        case 'sync-complete':
          qc.invalidateQueries({ queryKey: queryKeys.chats() });
          qc.invalidateQueries({ queryKey: ['setup-status'] });
          return;
        // qr / sync-progress are consumed via onEvent by the setup screen.
        default:
          return;
      }
    };

    const dispatch = (raw: MessageEvent) => {
      let parsed: DaemonEvent;
      try {
        parsed = DaemonEventSchema.parse(JSON.parse(raw.data as string));
      } catch {
        return;
      }
      patchCache(parsed);
      onEventRef.current?.(parsed);
    };

    const open = () => {
      if (cancelled) return;
      es = new EventSource(url);
      es.onopen = () => {
        backoff = BACKOFF_INITIAL_MS;
      };
      for (const name of NAMED_EVENTS) {
        es.addEventListener(name, dispatch as EventListener);
      }
      es.onerror = () => {
        es?.close();
        es = null;
        if (cancelled) return;
        retryTimer = setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
      };
    };

    open();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [qc, url]);
}
