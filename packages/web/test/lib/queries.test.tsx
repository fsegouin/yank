import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useChats, useMessages } from '../../src/lib/queries.js';
import type { ReactNode } from 'react';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useChats', () => {
  it('fetches and parses chats', async () => {
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: 'x@g.us',
            type: 'group',
            subject: 'Brief',
            lastMessageAt: '2026-05-14T13:02:00.000Z',
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: true,
            workspace: 'work',
            memberCount: 7,
            unreadCount: 4,
          },
        ]),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useChats(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]?.subject).toBe('Brief');
  });

  it('rejects bad shapes via Zod', async () => {
    server.use(http.get('/api/chats', () => HttpResponse.json([{ id: 'not-a-uuid' }])));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useChats(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useMessages', () => {
  it('fetches a page of messages', async () => {
    server.use(
      http.get('/api/chats/:chatId/messages', () =>
        HttpResponse.json({ messages: [], nextCursor: null }),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useMessages('b1ee0d52-2c8e-7e7a-a4cf-000000000001'), {
      wrapper: wrap(qc),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.nextCursor).toBeNull();
  });
});
