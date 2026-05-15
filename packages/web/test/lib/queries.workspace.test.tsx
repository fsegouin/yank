import { describe, expect, it, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useChatsForWorkspace,
  useTriageChats,
  useTriageCount,
} from '../../src/lib/queries.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const USER = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';

function makeChat(id: string, workspace: string, subject: string) {
  return {
    id,
    userId: USER,
    jid: `${id}@g.us`,
    type: 'group' as const,
    subject,
    lastMessageAt: null,
    lastMessagePreview: null,
    archived: false,
    mutedUntil: null,
    pinned: false,
    workspace,
    memberCount: 1,
    unreadCount: 0,
    lastReadMessageId: null,
    lastReadTs: null,
  };
}

function wrap(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const allChats = [
  makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'work', 'Work Chat'),
  makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000002', 'personal', 'Personal Chat'),
  makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000003', 'triage', 'Triage A'),
  makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000004', 'triage', 'Triage B'),
  makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000005', 'hidden', 'Hidden Chat'),
];

beforeEach(() => {
  server.use(http.get('/api/chats', () => HttpResponse.json(allChats)));
});

describe('useChatsForWorkspace', () => {
  it('returns only work chats', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useChatsForWorkspace('work'), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.length).toBe(1));
    expect(result.current[0]?.subject).toBe('Work Chat');
  });

  it('returns only triage chats', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useChatsForWorkspace('triage'), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.length).toBe(2));
  });

  it('can return hidden chats when asked', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useChatsForWorkspace('hidden'), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.length).toBe(1));
    expect(result.current[0]?.subject).toBe('Hidden Chat');
  });
});

describe('useTriageChats', () => {
  it('returns triage chats', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTriageChats(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.length).toBe(2));
    const subjects = result.current.map((c) => c.subject);
    expect(subjects).toContain('Triage A');
    expect(subjects).toContain('Triage B');
  });
});

describe('useTriageCount', () => {
  it('returns the number of triage chats', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTriageCount(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current).toBe(2));
  });

  it('returns 0 when no triage chats', async () => {
    server.resetHandlers();
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'work', 'W')]),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTriageCount(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current).toBe(0));
  });
});
