import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { useAssignWorkspace } from '../../src/lib/mutations.js';
import { queryKeys } from '../../src/lib/queryKeys.js';
import { useToastStore } from '../../src/state/toast.js';

const CHAT_ID = 'b1ee0d52-2c8e-7e7a-a4cf-000000000001';
const USER_ID = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';

const baseChat = {
  id: CHAT_ID,
  userId: USER_ID,
  jid: 'x@g.us',
  type: 'group' as const,
  subject: 'Alpha',
  lastMessageAt: null,
  lastMessagePreview: null,
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage' as const,
  memberCount: 2,
  unreadCount: 0,
  lastReadMessageId: null,
  lastReadTs: null,
};

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  useToastStore.setState({ toast: null });
});
afterAll(() => server.close());

function wrap(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useAssignWorkspace', () => {
  it('optimistically patches the chat workspace in cache', async () => {
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, () => new HttpResponse(null, { status: 204 })),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [baseChat]);

    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });

    await act(async () => {
      result.current.mutate({ workspace: 'work', suppressUndo: false });
    });

    // Optimistic update is synchronous (runs in onMutate before mutationFn resolves).
    const cached = qc.getQueryData<typeof baseChat[]>(queryKeys.chats());
    expect(cached?.[0]?.workspace).toBe('work');
  });

  it('shows undo toast (unless suppressUndo is true)', async () => {
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, () => new HttpResponse(null, { status: 204 })),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [baseChat]);

    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });
    await act(async () => {
      result.current.mutate({ workspace: 'personal', suppressUndo: false });
    });
    expect(useToastStore.getState().toast?.label).toBe('Moved to Personal');
  });

  it('suppresses toast when suppressUndo is true', async () => {
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, () => new HttpResponse(null, { status: 204 })),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [baseChat]);

    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });
    await act(async () => {
      result.current.mutate({ workspace: 'work', suppressUndo: true });
    });
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('rolls back on network error', async () => {
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, () =>
        HttpResponse.json({ error: 'server_error' }, { status: 500 }),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [baseChat]);

    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });
    await act(async () => {
      result.current.mutate({ workspace: 'work', suppressUndo: false });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = qc.getQueryData<typeof baseChat[]>(queryKeys.chats());
    expect(cached?.[0]?.workspace).toBe('triage');
  });

  it('undo callback mutates back to previous workspace with suppressUndo=true', async () => {
    const calls: string[] = [];
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, async ({ request }) => {
        const body = (await request.json()) as { workspace: string };
        calls.push(body.workspace);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [baseChat]);

    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });
    await act(async () => {
      result.current.mutate({ workspace: 'work', suppressUndo: false });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Trigger undo via toast callback.
    const onUndo = useToastStore.getState().toast?.onUndo;
    expect(onUndo).toBeDefined();
    await act(async () => {
      onUndo?.();
    });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toBe('triage');
  });
});
