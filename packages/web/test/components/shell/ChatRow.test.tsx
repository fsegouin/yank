import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatRow } from '../../../src/components/shell/ChatRow.js';
import type { Chat } from '@yank/shared';

const baseChat: Chat = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  jid: 'x@g.us',
  type: 'group',
  subject: 'Brief',
  lastMessageAt: '2026-05-14T13:02:00.000Z',
  lastMessagePreview: null,
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'work',
  memberCount: 7,
  unreadCount: 0,
};

describe('ChatRow', () => {
  it('renders the chat subject', () => {
    render(<ChatRow chat={baseChat} active={false} onClick={() => {}} />);
    expect(screen.getByText('Brief')).toBeInTheDocument();
  });

  it('shows the unread badge when unread > 0', () => {
    render(<ChatRow chat={{ ...baseChat, unreadCount: 4 }} active={false} onClick={() => {}} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('hides the unread badge when unread is 0', () => {
    render(<ChatRow chat={baseChat} active={false} onClick={() => {}} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('calls onClick when the row is activated', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<ChatRow chat={baseChat} active={false} onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('marks the row as current when active=true', () => {
    render(<ChatRow chat={baseChat} active={true} onClick={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-current', 'true');
  });
});
