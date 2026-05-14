import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEventStream } from '../../src/lib/eventStream.js';
import type { ReactNode } from 'react';
import { createElement } from 'react';

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
  /** Emit a named event (e.g. 'message', 'status'). */
  emit(type: string, data: unknown) {
    const ev = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
  fail() {
    this.onerror?.(new Event('error'));
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

describe('useEventStream', () => {
  it('opens an EventSource on mount and closes on unmount', () => {
    const qc = new QueryClient();
    const { unmount } = renderHook(() => useEventStream(), { wrapper: wrap(qc) });
    expect(FakeEventSource.instances).toHaveLength(1);
    unmount();
    expect(FakeEventSource.instances[0]?.closed).toBe(true);
  });

  it('invalidates messages on a named `message` event', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useEventStream(), { wrapper: wrap(qc) });
    act(() => {
      FakeEventSource.instances[0]?.emit('message', {
        type: 'message',
        userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
        chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
        messageId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000050',
      });
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: ['messages', 'b1ee0d52-2c8e-7e7a-a4cf-000000000001'],
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['chats'] });
  });

  it('opens the stream at /api/events by default', () => {
    const qc = new QueryClient();
    renderHook(() => useEventStream(), { wrapper: wrap(qc) });
    expect(FakeEventSource.instances[0]?.url).toBe('/api/events');
  });

  it('reconnects with backoff on error', () => {
    const qc = new QueryClient();
    renderHook(() => useEventStream(), { wrapper: wrap(qc) });
    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => {
      FakeEventSource.instances[0]?.fail();
    });
    // Initial backoff is 1000ms
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
    act(() => {
      FakeEventSource.instances[1]?.fail();
    });
    // Next backoff is 2000ms (cumulative jitter ignored — exact value)
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it('ignores malformed JSON without crashing', () => {
    const qc = new QueryClient();
    renderHook(() => useEventStream(), { wrapper: wrap(qc) });
    expect(() => {
      act(() => {
        const fn = FakeEventSource.instances[0]?.listeners.get('message')?.[0];
        fn?.(new MessageEvent('message', { data: 'not-json' }));
      });
    }).not.toThrow();
  });
});
