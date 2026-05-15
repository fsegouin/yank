import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DaemonEventSchema, type DaemonEvent, type Chat, type MessagesPage } from '@yank/shared';
import { queryKeys } from './queryKeys.js';
import { useEditErrorsStore } from '../state/editErrors.js';
import { useMediaBreakerStore } from '../state/mediaBreaker.js';

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
  'pair-code',
  'media-ready',
  'chat-assignment',
  'contact-update',
  'message-edit',
  'message-edit-failed',
  'media-breaker-state',
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
          // No client-side optimistic row yet — useSendMessage relies on refetch.
          // Invalidate both messages (status changes) and chats (preview/lastMessageAt).
          qc.invalidateQueries({ queryKey: ['messages'] });
          qc.invalidateQueries({ queryKey: queryKeys.chats() });
          return;
        case 'connected':
        case 'disconnected':
        case 'sync-complete':
          qc.invalidateQueries({ queryKey: queryKeys.chats() });
          qc.invalidateQueries({ queryKey: ['setup-status'] });
          return;
        case 'media-ready':
          // Media bytes are now available; force the messages caches to refetch so
          // the message rows pick up the populated media.url.
          qc.invalidateQueries({ queryKey: ['messages'] });
          return;
        case 'chat-assignment':
          qc.setQueryData<Chat[]>(queryKeys.chats(), (old) =>
            old?.map((c) =>
              c.id === evt.chatId ? { ...c, workspace: evt.workspace } : c,
            ),
          );
          return;
        case 'contact-update': {
          // Patch chats list: update subject for DM chats whose jid matches contactId
          qc.setQueryData<Chat[]>(queryKeys.chats(), (old) =>
            old?.map((c) =>
              c.type === 'dm' && c.jid === evt.contactId
                ? { ...c, subject: evt.displayName }
                : c,
            ),
          );
          // Patch individual contact cache if present
          const prev = qc.getQueryData<{ jid: string; displayName?: string | null }>(
            queryKeys.contact(evt.contactId),
          );
          if (prev !== undefined) {
            qc.setQueryData(queryKeys.contact(evt.contactId), { ...prev, displayName: evt.displayName });
          }
          return;
        }
        case 'message-edit': {
          // Patch all pages of the messages cache for any chat that contains this messageId.
          // Scan all cached message queries and patch in place.
          qc.setQueriesData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
            { queryKey: ['messages'] },
            (old) => {
              if (!old) return old;
              const { messageId, text, editedAt } = evt;
              return {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((m) =>
                    m.id === messageId ? { ...m, text, editedAt } : m,
                  ),
                })),
              };
            },
          );
          return;
        }
        case 'message-edit-failed': {
          // Surface per-row error affordance via editErrors Zustand store
          useEditErrorsStore.getState().setError(evt.messageId);
          return;
        }
        case 'media-breaker-state':
          useMediaBreakerStore.getState().setBreakerState({
            state: evt.state,
            retryAt: evt.retryAt,
          });
          return;
        // qr / sync-progress / pair-code are consumed via onEvent by the setup screen.
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
