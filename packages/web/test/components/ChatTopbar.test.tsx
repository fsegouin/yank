import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Chat } from '@yank/shared';
import { ChatTopbar } from '../../src/components/chat/ChatTopbar.js';

vi.mock('../../src/lib/mutations.js', () => ({
  useAssignWorkspace: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateContactName: vi.fn(() => ({ mutate: vi.fn() })),
  useUpdateChatLocalSubject: vi.fn(() => ({ mutate: vi.fn() })),
}));

const makeDm = (overrides: Partial<Chat> = {}): Chat => ({
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  jid: '447700000001@s.whatsapp.net',
  type: 'dm',
  subject: 'Alice',
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

const makeGroup = (overrides: Partial<Chat> = {}): Chat =>
  makeDm({ id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002', jid: '120363000000000000@g.us', type: 'group', subject: 'Team', memberCount: 5, ...overrides });

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('ChatTopbar — inline title rename', () => {
  it('renders the title as plain text by default', () => {
    render(<ChatTopbar chat={makeGroup()} threadOpen={false} onToggleThread={vi.fn()} />, { wrapper });
    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('clicking the title swaps to an InlineRename input', async () => {
    render(<ChatTopbar chat={makeGroup()} threadOpen={false} onToggleThread={vi.fn()} />, { wrapper });
    await userEvent.click(screen.getByRole('heading', { name: 'Team' }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('committing a rename on a group calls useUpdateChatLocalSubject', async () => {
    const { useUpdateChatLocalSubject } = await import('../../src/lib/mutations.js');
    const mockMutate = vi.fn();
    vi.mocked(useUpdateChatLocalSubject).mockReturnValue({ mutate: mockMutate } as unknown as ReturnType<typeof useUpdateChatLocalSubject>);

    render(<ChatTopbar chat={makeGroup()} threadOpen={false} onToggleThread={vi.fn()} />, { wrapper });
    await userEvent.click(screen.getByRole('heading', { name: 'Team' }));
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'My Team');
    fireEvent.blur(input);

    expect(mockMutate).toHaveBeenCalledWith({ localSubject: 'My Team' });
  });

  it('committing a rename on a DM calls useUpdateContactName', async () => {
    const { useUpdateContactName } = await import('../../src/lib/mutations.js');
    const mockMutate = vi.fn();
    vi.mocked(useUpdateContactName).mockReturnValue({ mutate: mockMutate } as unknown as ReturnType<typeof useUpdateContactName>);

    render(<ChatTopbar chat={makeDm()} threadOpen={false} onToggleThread={vi.fn()} />, { wrapper });
    await userEvent.click(screen.getByRole('heading', { name: 'Alice' }));
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Alice Renamed');
    fireEvent.blur(input);

    expect(mockMutate).toHaveBeenCalledWith({ displayName: 'Alice Renamed' });
  });

  it('falls back to placeholder=jid when subject is null', async () => {
    const chat = makeGroup({ subject: null });
    render(<ChatTopbar chat={chat} threadOpen={false} onToggleThread={vi.fn()} />, { wrapper });
    // Heading shows jid as fallback
    expect(screen.getByRole('heading', { name: chat.jid })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('heading', { name: chat.jid }));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.placeholder).toBe(chat.jid);
  });
});

describe('ChatTopbar — overflow menu', () => {
  it('clicking the More button opens a menu with Rename chat entry', async () => {
    render(<ChatTopbar chat={makeGroup()} threadOpen={false} onToggleThread={vi.fn()} />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menuitem', { name: /rename chat/i })).toBeInTheDocument();
  });

  it('selecting Rename chat opens the inline editor', async () => {
    render(<ChatTopbar chat={makeGroup()} threadOpen={false} onToggleThread={vi.fn()} />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /rename chat/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
