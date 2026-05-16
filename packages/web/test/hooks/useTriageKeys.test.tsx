import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { useTriageKeys } from '../../src/hooks/useTriageKeys.js';
import { queryKeys } from '../../src/lib/queryKeys.js';
import { useToastStore } from '../../src/state/toast.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); useToastStore.setState({ toast: null }); });
afterAll(() => server.close());

const USER = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';
function makeTriageChat(id: string, subject: string) {
  return {
    id,
    userId: USER,
    jid: `${id}@s.whatsapp.net`,
    type: 'dm' as const,
    subject,
    lastMessageAt: '2026-05-15T10:00:00.000Z',
    lastMessagePreview: 'msg',
    archived: false,
    mutedUntil: null,
    pinned: false,
    workspace: 'triage' as const,
    memberCount: 0,
    unreadCount: 0,
    lastReadMessageId: null,
    lastReadTs: null,
  };
}

const chat1 = makeTriageChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'Alice');
const chat2 = makeTriageChat('b1ee0d52-2c8e-7e7a-a4cf-000000000002', 'Bob');

function wrap(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useTriageKeys', () => {
  beforeEach(() => {
    server.use(http.post(/\/api\/chats\/.*\/assignment/, () => new HttpResponse(null, { status: 204 })));
  });

  it('initialises focusedIdx at 0', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    const { result } = renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    expect(result.current.focusedIdx).toBe(0);
  });

  it('j moves focus down', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    const { result } = renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    expect(result.current.focusedIdx).toBe(1);
  });

  it('k moves focus up (clamped at 0)', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    const { result } = renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    });
    expect(result.current.focusedIdx).toBe(0);
  });

  it('ArrowDown moves focus down', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    const { result } = renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    });
    expect(result.current.focusedIdx).toBe(1);
  });

  it('1 triggers assignment of focused chat to work', async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    });
    // Optimistic patch removes the chat from triage
    const cached = qc.getQueryData<typeof chat1[]>(queryKeys.chats());
    expect(cached?.find((c) => c.id === chat1.id)?.workspace).toBe('work');
  });

  it('2 triggers assignment of focused chat to personal', async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    });
    const cached = qc.getQueryData<typeof chat1[]>(queryKeys.chats());
    expect(cached?.find((c) => c.id === chat1.id)?.workspace).toBe('personal');
  });

  it('3 triggers assignment of focused chat to hidden', async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    });
    const cached = qc.getQueryData<typeof chat1[]>(queryKeys.chats());
    expect(cached?.find((c) => c.id === chat1.id)?.workspace).toBe('hidden');
  });

  it('does nothing when chats list is empty', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), []);
    const { result } = renderHook(() => useTriageKeys([]), { wrapper: wrap(qc) });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    });
    expect(result.current.focusedIdx).toBe(0);
  });
});
