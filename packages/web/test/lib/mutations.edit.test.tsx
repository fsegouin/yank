import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Message } from '@yank/shared';
import { useEditMessage } from '../../src/lib/mutations.js';
import { queryKeys } from '../../src/lib/queryKeys.js';

vi.mock('../../src/lib/api.js', () => ({
  apiFetch: vi.fn().mockResolvedValue(undefined),
  ApiError: class ApiError extends Error {},
}));

vi.mock('../../src/state/toast.js', () => ({
  useToastStore: { getState: () => ({ show: vi.fn() }) },
  showErrorToast: vi.fn(),
}));

const CHAT_ID = 'chat-edit-1';
const MESSAGE_ID = 'msg-edit-1';
const NOW = new Date().toISOString();

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: MESSAGE_ID,
  userId: 'u1',
  chatId: CHAT_ID,
  waMessageId: 'WA-1',
  senderJid: 'me',
  ts: NOW,
  kind: 'text',
  text: 'original',
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  status: 'sent',
  reactions: [],
  ...overrides,
});

describe('useEditMessage', () => {
  it('optimistically patches text + editedAt in useMessages cache', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.messages(CHAT_ID), {
      pages: [{ messages: [makeMessage()], nextCursor: null }],
      pageParams: [null],
    });

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useEditMessage(CHAT_ID, MESSAGE_ID), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ text: 'edited' });
    });

    // Optimistic patch applied after onMutate resolves
    const data = qc.getQueryData<{ pages: Array<{ messages: Message[] }> }>(
      queryKeys.messages(CHAT_ID),
    );
    const patched = data?.pages[0]?.messages[0];
    expect(patched?.text).toBe('edited');
    expect(patched?.editedAt).not.toBeNull();
  });

  it('rolls back on error', async () => {
    const { apiFetch } = await import('../../src/lib/api.js');
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('500'));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.messages(CHAT_ID), {
      pages: [{ messages: [makeMessage({ text: 'original' })], nextCursor: null }],
      pageParams: [null],
    });

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useEditMessage(CHAT_ID, MESSAGE_ID), { wrapper: Wrapper });

    act(() => { result.current.mutate({ text: 'will fail' }); });
    await waitFor(() => result.current.isError);

    const data = qc.getQueryData<{ pages: Array<{ messages: Message[] }> }>(
      queryKeys.messages(CHAT_ID),
    );
    expect(data?.pages[0]?.messages[0]?.text).toBe('original');
  });
});
