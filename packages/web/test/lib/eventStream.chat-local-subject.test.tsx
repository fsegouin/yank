import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Chat } from '@yank/shared';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { useEventStream } from '../../src/lib/eventStream.js';
import { queryKeys } from '../../src/lib/queryKeys.js';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readyState = 0;
  url: string;
  onerror: ((e: Event) => void) | null = null;
  onopen: ((e: Event) => void) | null = null;
  closed = false;
  listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    const ev = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function wrap(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

const USER_ID = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';
const CHAT_ID = '00000000-0000-0000-0000-0000000000a2';

const makeGroupChat = (overrides: Partial<Chat> = {}): Chat => ({
  id: CHAT_ID,
  userId: USER_ID,
  jid: '120363@g.us',
  type: 'group',
  subject: 'WA Subject',
  lastMessageAt: null,
  lastMessagePreview: null,
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage',
  memberCount: 3,
  unreadCount: 0,
  lastReadMessageId: null,
  lastReadTs: null,
  ...overrides,
});

describe('chat-local-subject-update SSE handler', () => {
  it('invalidates the chats query when event arrives', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [makeGroupChat()]);
    const spy = vi.spyOn(qc, 'invalidateQueries');

    renderHook(() => useEventStream(), { wrapper: wrap(qc) });

    act(() => {
      FakeEventSource.instances[0]?.emit('chat-local-subject-update', {
        type: 'chat-local-subject-update',
        userId: USER_ID,
        chatId: CHAT_ID,
        localSubject: 'My Team',
        updatedAt: '2026-05-16T12:00:00.000Z',
      });
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.chats() });
  });
});
