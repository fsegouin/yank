import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { DaemonEvent, Message } from '@yank/shared';
import { queryKeys } from '../../src/lib/queryKeys.js';
import { useEventStream } from '../../src/lib/eventStream.js';

class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  constructor(public url: string) {
    MockEventSource.instances.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners[type] ??= [];
    this.listeners[type]!.push(fn);
  }
  close() {}
  dispatch(type: string, data: unknown) {
    for (const fn of this.listeners[type] ?? []) {
      fn({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}
vi.stubGlobal('EventSource', MockEventSource);

const CHAT_ID = 'c1';
const USER_ID = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';
const MESSAGE_ID = 'b1ee0d52-2c8e-7e7a-a4cf-000000000001';
const NOW = new Date().toISOString();
const makeMsg = (overrides: Partial<Message> = {}): Message => ({
  id: MESSAGE_ID, userId: USER_ID, chatId: CHAT_ID, waMessageId: 'WA-1', senderJid: 'me',
  ts: NOW, kind: 'text', text: 'original', replyToId: null, editedAt: null,
  deletedAt: null, status: 'sent', reactions: [], ...overrides,
});

describe('eventStream message-edit handler', () => {
  beforeEach(() => { MockEventSource.instances = []; });

  it('patches message text + editedAt in useMessages cache on message-edit', async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.messages(CHAT_ID), {
      pages: [{ messages: [makeMsg()], nextCursor: null }],
      pageParams: [null],
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(() => useEventStream({}), { wrapper });
    await new Promise((r) => setTimeout(r, 10));

    const es = MockEventSource.instances[0]!;
    const editedAt = new Date().toISOString();
    const evt: DaemonEvent = {
      type: 'message-edit', userId: USER_ID,
      messageId: MESSAGE_ID, text: 'canonical', editedAt,
    };
    es.dispatch('message-edit', evt);
    await new Promise((r) => setTimeout(r, 10));

    const data = qc.getQueryData<{ pages: Array<{ messages: Message[] }> }>(
      queryKeys.messages(CHAT_ID),
    );
    const msg = data?.pages[0]?.messages[0];
    expect(msg?.text).toBe('canonical');
    expect(msg?.editedAt).toBe(editedAt);
  });
});
