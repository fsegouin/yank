import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TriageCard } from '../../../src/components/triage/TriageCard.js';
import type { Chat } from '@yank/shared';

// Wrap every render in a QueryClientProvider — TriageCard calls useUpdateContactName
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const baseChat: Chat = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  jid: '4477@s.whatsapp.net',
  type: 'dm',
  subject: 'Alice Smith',
  lastMessageAt: '2026-05-15T10:00:00.000Z',
  lastMessagePreview: 'Hey, how are you?',
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage',
  memberCount: 0,
  unreadCount: 2,
  lastReadMessageId: null,
  lastReadTs: null,
};

describe('TriageCard', () => {
  it('renders the chat subject', () => {
    render(<TriageCard chat={baseChat} focused={false} onAssign={vi.fn()} />, { wrapper });
    // DM chats render the name in an InlineRename input
    expect(screen.getByDisplayValue('Alice Smith')).toBeInTheDocument();
  });

  it('renders the last-message preview', () => {
    render(<TriageCard chat={baseChat} focused={false} onAssign={vi.fn()} />, { wrapper });
    expect(screen.getByText('Hey, how are you?')).toBeInTheDocument();
  });

  it('renders Work, Personal, and Hide action buttons', () => {
    render(<TriageCard chat={baseChat} focused={false} onAssign={vi.fn()} />, { wrapper });
    expect(screen.getByRole('button', { name: /work/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /personal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide/i })).toBeInTheDocument();
  });

  it('calls onAssign("work") when Work button is clicked', async () => {
    const onAssign = vi.fn();
    const user = userEvent.setup();
    render(<TriageCard chat={baseChat} focused={false} onAssign={onAssign} />, { wrapper });
    await user.click(screen.getByRole('button', { name: /work/i }));
    expect(onAssign).toHaveBeenCalledWith('work');
  });

  it('calls onAssign("personal") when Personal button is clicked', async () => {
    const onAssign = vi.fn();
    const user = userEvent.setup();
    render(<TriageCard chat={baseChat} focused={false} onAssign={onAssign} />, { wrapper });
    await user.click(screen.getByRole('button', { name: /personal/i }));
    expect(onAssign).toHaveBeenCalledWith('personal');
  });

  it('calls onAssign("hidden") when Hide button is clicked', async () => {
    const onAssign = vi.fn();
    const user = userEvent.setup();
    render(<TriageCard chat={baseChat} focused={false} onAssign={onAssign} />, { wrapper });
    await user.click(screen.getByRole('button', { name: /hide/i }));
    expect(onAssign).toHaveBeenCalledWith('hidden');
  });

  it('adds focused styling when focused=true', () => {
    const { container } = render(
      <TriageCard chat={baseChat} focused={true} onAssign={vi.fn()} />,
      { wrapper },
    );
    expect(container.firstChild).toHaveAttribute('data-focused', 'true');
  });

  it('does not add focused styling when focused=false', () => {
    const { container } = render(
      <TriageCard chat={baseChat} focused={false} onAssign={vi.fn()} />,
      { wrapper },
    );
    expect(container.firstChild).toHaveAttribute('data-focused', 'false');
  });

  it('renders group chat subject for group type', () => {
    const groupChat: Chat = { ...baseChat, type: 'group', subject: 'Engineering Team' };
    render(<TriageCard chat={groupChat} focused={false} onAssign={vi.fn()} />, { wrapper });
    // Group chats now render the subject in a rename input (local subject override target).
    expect(screen.getByDisplayValue('Engineering Team')).toBeInTheDocument();
  });
});
