import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUpdateChatLocalSubject } from '../../src/lib/mutations.js';

vi.mock('../../src/lib/api.js', () => ({
  apiFetch: vi.fn().mockResolvedValue(undefined),
  ApiError: class ApiError extends Error {},
}));

const CHAT_ID = '00000000-0000-0000-0000-0000000000a2';

describe('useUpdateChatLocalSubject', () => {
  it('PATCHes /api/chats/:id/local-subject with the new value', async () => {
    const { apiFetch } = await import('../../src/lib/api.js');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateChatLocalSubject(CHAT_ID), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ localSubject: 'My Team' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiFetch).toHaveBeenCalledWith(`/api/chats/${CHAT_ID}/local-subject`, {
      method: 'PATCH',
      body: { localSubject: 'My Team' },
    });
  });

  it('forwards null to clear the override', async () => {
    const { apiFetch } = await import('../../src/lib/api.js');
    vi.mocked(apiFetch).mockClear();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateChatLocalSubject(CHAT_ID), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ localSubject: null });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiFetch).toHaveBeenCalledWith(`/api/chats/${CHAT_ID}/local-subject`, {
      method: 'PATCH',
      body: { localSubject: null },
    });
  });
});
