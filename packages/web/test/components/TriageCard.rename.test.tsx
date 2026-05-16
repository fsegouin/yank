import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Chat } from '@yank/shared';
import { TriageCard } from '../../src/components/triage/TriageCard.js';

// Mock the mutation so we don't need a real API
vi.mock('../../src/lib/mutations.js', () => ({
  useUpdateContactName: vi.fn(() => ({ mutate: vi.fn() })),
  useAssignWorkspace: vi.fn(() => ({ mutate: vi.fn() })),
}));

const makeDmChat = (overrides: Partial<Chat> = {}): Chat => ({
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  jid: '447700000001@s.whatsapp.net',
  type: 'dm',
  subject: 'Alice',
  lastMessageAt: new Date().toISOString(),
  lastMessagePreview: 'Hello',
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage',
  memberCount: 0,
  unreadCount: 1,
  lastReadMessageId: null,
  lastReadTs: null,
  ...overrides,
});

const makeGroupChat = (overrides: Partial<Chat> = {}): Chat => ({
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  jid: '447700000001@g.us',
  type: 'group',
  subject: 'Family Group',
  lastMessageAt: new Date().toISOString(),
  lastMessagePreview: 'Hello',
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage',
  memberCount: 5,
  unreadCount: 0,
  lastReadMessageId: null,
  lastReadTs: null,
  ...overrides,
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('TriageCard rename', () => {
  it('renders InlineRename input for DM chat', () => {
    render(<TriageCard chat={makeDmChat()} isFocused={false} onAssign={vi.fn()} />, { wrapper });
    // Should have an input element for the name
    const input = screen.getByRole('textbox');
    expect((input as HTMLInputElement).value).toBe('Alice');
  });

  it('calls updateContactName.mutate on blur commit', async () => {
    const { useUpdateContactName } = await import('../../src/lib/mutations.js');
    const mockMutate = vi.fn();
    vi.mocked(useUpdateContactName).mockReturnValue({ mutate: mockMutate } as unknown as ReturnType<typeof useUpdateContactName>);

    render(<TriageCard chat={makeDmChat()} isFocused={false} onAssign={vi.fn()} />, { wrapper });
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Alice New');
    fireEvent.blur(input);
    expect(mockMutate).toHaveBeenCalledWith({ displayName: 'Alice New' });
  });

  it('does not render InlineRename for group chat — shows plain text', () => {
    render(<TriageCard chat={makeGroupChat()} isFocused={false} onAssign={vi.fn()} />, { wrapper });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Family Group')).toBeTruthy();
  });

  it('Escape reverts input without calling mutate', async () => {
    const { useUpdateContactName } = await import('../../src/lib/mutations.js');
    const mockMutate = vi.fn();
    vi.mocked(useUpdateContactName).mockReturnValue({ mutate: mockMutate } as unknown as ReturnType<typeof useUpdateContactName>);

    render(<TriageCard chat={makeDmChat()} isFocused={false} onAssign={vi.fn()} />, { wrapper });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, ' Extra');
    await userEvent.keyboard('{Escape}');
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
