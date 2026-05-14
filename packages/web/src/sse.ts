import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Message } from './api.js';

type DaemonEvent =
  | { type: 'qr'; data: string }
  | { type: 'connected'; jid: string; phone: string }
  | { type: 'disconnected'; reason?: string }
  | { type: 'sync-progress'; synced: number; total?: number }
  | { type: 'sync-complete' }
  | { type: 'message'; chatId: string; messageId: string }
  | { type: 'status'; localId: string; status: Message['status']; waMessageId?: string };

export function useYankEvents(onEvent?: (e: DaemonEvent) => void): void {
  const qc = useQueryClient();
  useEffect(() => {
    const es = new EventSource('/api/events');
    function dispatch(raw: MessageEvent) {
      const evt = JSON.parse(raw.data) as DaemonEvent;
      onEvent?.(evt);
      if (evt.type === 'message') {
        qc.invalidateQueries({ queryKey: ['messages', evt.chatId] });
        qc.invalidateQueries({ queryKey: ['chats'] });
      } else if (evt.type === 'status') {
        qc.setQueriesData<Message[]>({ queryKey: ['messages'] }, (prev) =>
          prev?.map((m) =>
            m.id === evt.localId
              ? { ...m, status: evt.status, waMessageId: evt.waMessageId ?? m.waMessageId }
              : m,
          ),
        );
      } else if (evt.type === 'connected' || evt.type === 'disconnected') {
        qc.invalidateQueries({ queryKey: ['setup-status'] });
      }
    }
    es.addEventListener('qr', dispatch);
    es.addEventListener('connected', dispatch);
    es.addEventListener('disconnected', dispatch);
    es.addEventListener('sync-progress', dispatch);
    es.addEventListener('sync-complete', dispatch);
    es.addEventListener('message', dispatch);
    es.addEventListener('status', dispatch);
    return () => es.close();
  }, [qc, onEvent]);
}

export type { DaemonEvent };
