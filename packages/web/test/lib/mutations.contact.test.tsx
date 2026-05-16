import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUpdateContactName } from '../../src/lib/mutations.js';
import { queryKeys } from '../../src/lib/queryKeys.js';
import type { Chat } from '@yank/shared';

// Minimal chat fixture
const CONTACT_JID = '447700000001@s.whatsapp.net';
const makeChat = (overrides: Partial<Chat> = {}): Chat => ({
  id: 'chat-1',
  userId: 'user-1',
  jid: CONTACT_JID,
  type: 'dm',
  subject: 'Alice',
  lastMessageAt: null,
  lastMessagePreview: null,
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'work',
  memberCount: 0,
  unreadCount: 0,
  lastReadMessageId: null,
  lastReadTs: null,
  ...overrides,
});

// Mock apiFetch
vi.mock('../../src/lib/api.js', () => ({
  apiFetch: vi.fn().mockResolvedValue(undefined),
  ApiError: class ApiError extends Error {},
}));

// Mock toast
vi.mock('../../src/state/toast.js', () => ({
  useToastStore: { getState: () => ({ show: vi.fn() }) },
  showErrorToast: vi.fn(),
}));


describe('useUpdateContactName', () => {
  it('optimistically patches useChats() cache where chat.jid === contactJid', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [makeChat()]);

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateContactName(CONTACT_JID), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ displayName: 'Alice Renamed' });
    });

    // Optimistic patch runs in onMutate before mutationFn resolves
    const chats = qc.getQueryData<Chat[]>(queryKeys.chats());
    expect(chats?.[0]?.subject).toBe('Alice Renamed');
  });

  it('rolls back chats cache on error', async () => {
    const { apiFetch } = await import('../../src/lib/api.js');
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('network'));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [makeChat({ subject: 'Original' })]);

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateContactName(CONTACT_JID), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ displayName: 'New Name' });
    });

    await waitFor(() => result.current.isError);

    const chats = qc.getQueryData<Chat[]>(queryKeys.chats());
    expect(chats?.[0]?.subject).toBe('Original');
  });

  it('patches useContact() cache when it exists', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.contact(CONTACT_JID), { jid: CONTACT_JID, displayName: 'Old' });

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateContactName(CONTACT_JID), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ displayName: 'New Name' });
    });

    const contact = qc.getQueryData<{ displayName: string }>(queryKeys.contact(CONTACT_JID));
    expect(contact?.displayName).toBe('New Name');
  });
});
