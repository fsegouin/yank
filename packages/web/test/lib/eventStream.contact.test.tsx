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

const JID = '447700000001@s.whatsapp.net';
const USER_ID = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';

const makeDmChat = (overrides: Partial<Chat> = {}): Chat => ({
  id: 'chat-1',
  userId: USER_ID,
  jid: JID,
  type: 'dm',
  subject: 'Old Name',
  lastMessageAt: null,
  lastMessagePreview: null,
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage',
  memberCount: 0,
  unreadCount: 0,
  lastReadMessageId: null,
  lastReadTs: null,
  ...overrides,
});

const CONTACT_UPDATE_EVENT = {
  type: 'contact-update' as const,
  userId: USER_ID,
  contactId: JID,
  displayName: 'New Name',
  updatedAt: '2026-05-15T12:00:00.000Z',
};

describe('contact-update SSE handler', () => {
  it('patches chats cache subject for matching DM when contact-update event arrives', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [makeDmChat()]);

    renderHook(() => useEventStream(), { wrapper: wrap(qc) });

    act(() => {
      FakeEventSource.instances[0]?.emit('contact-update', CONTACT_UPDATE_EVENT);
    });

    const chats = qc.getQueryData<Chat[]>(queryKeys.chats());
    expect(chats?.[0]?.subject).toBe('New Name');
  });

  it('patches contact cache displayName when contact-update event arrives', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.contact(JID), { jid: JID, displayName: 'Old Name' });

    renderHook(() => useEventStream(), { wrapper: wrap(qc) });

    act(() => {
      FakeEventSource.instances[0]?.emit('contact-update', CONTACT_UPDATE_EVENT);
    });

    const contact = qc.getQueryData<{ jid: string; displayName: string }>(
      queryKeys.contact(JID),
    );
    expect(contact?.displayName).toBe('New Name');
  });

  it('no-ops chats cache when contact jid does not match any DM', () => {
    const qc = new QueryClient();
    const chat = makeDmChat({ jid: 'other@s.whatsapp.net' });
    qc.setQueryData(queryKeys.chats(), [chat]);

    renderHook(() => useEventStream(), { wrapper: wrap(qc) });

    act(() => {
      FakeEventSource.instances[0]?.emit('contact-update', CONTACT_UPDATE_EVENT);
    });

    const chats = qc.getQueryData<Chat[]>(queryKeys.chats());
    expect(chats?.[0]?.subject).toBe('Old Name');
  });

  it('no-ops contact cache when contact is not present in cache', () => {
    const qc = new QueryClient();
    // Do NOT seed contact cache

    renderHook(() => useEventStream(), { wrapper: wrap(qc) });

    act(() => {
      FakeEventSource.instances[0]?.emit('contact-update', CONTACT_UPDATE_EVENT);
    });

    const contact = qc.getQueryData(queryKeys.contact(JID));
    expect(contact).toBeUndefined();
  });
});
