import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageRow } from '../../../src/components/chat/Message.js';
import type { Message } from '@yank/shared';

const base: Message = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000050',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  waMessageId: 'ABC',
  senderJid: '4477@s.whatsapp.net',
  ts: '2026-05-14T09:14:00.000Z',
  kind: 'text',
  text: 'Hello',
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  status: 'sent',
  reactions: [],
};

describe('MessageRow', () => {
  it('renders the sender name when showHead=true', () => {
    render(
      <MessageRow
        message={base}
        showHead={true}
        senderName="Ash R."
        senderInitials="AR"
        onOpenThread={() => {}}
      />,
    );
    expect(screen.getByText('Ash R.')).toBeInTheDocument();
  });

  it('omits the head when showHead=false', () => {
    render(
      <MessageRow
        message={base}
        showHead={false}
        senderName="Ash R."
        senderInitials="AR"
        onOpenThread={() => {}}
      />,
    );
    expect(screen.queryByText('Ash R.')).not.toBeInTheDocument();
  });

  it('renders a system pill for kind=system', () => {
    render(
      <MessageRow
        message={{ ...base, kind: 'system', text: 'Ash joined' }}
        showHead={false}
        senderName=""
        senderInitials=""
        onOpenThread={() => {}}
      />,
    );
    expect(screen.getByText('Ash joined')).toBeInTheDocument();
  });

  it('shows the thread chip when threadCount > 0 and inThread is false', async () => {
    const onOpenThread = vi.fn();
    const user = userEvent.setup();
    render(
      <MessageRow
        message={{ ...base, threadCount: 3 }}
        showHead={true}
        senderName="Ash"
        senderInitials="A"
        onOpenThread={onOpenThread}
      />,
    );
    const chip = screen.getByRole('button', { name: /3 replies/i });
    await user.click(chip);
    expect(onOpenThread).toHaveBeenCalledOnce();
  });

  it('hides the thread chip when inThread is true', () => {
    render(
      <MessageRow
        message={{ ...base, threadCount: 3 }}
        showHead={true}
        senderName="Ash"
        senderInitials="A"
        onOpenThread={() => {}}
        inThread={true}
      />,
    );
    expect(screen.queryByRole('button', { name: /replies/i })).not.toBeInTheDocument();
  });
});
