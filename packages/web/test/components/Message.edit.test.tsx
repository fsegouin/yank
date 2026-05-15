import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Message } from '@yank/shared';
import { MessageRow } from '../../src/components/chat/Message.js';

const NOW = new Date().toISOString();
const makeMsg = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1', userId: 'u1', chatId: 'c1', waMessageId: 'WA-1', senderJid: 'me',
  ts: NOW, kind: 'text', text: 'hello world', replyToId: null,
  editedAt: null, deletedAt: null, status: 'sent', reactions: [],
  ...overrides,
});

describe('MessageRow edited suffix', () => {
  it('does NOT render (edited) when editedAt is null', () => {
    render(
      <MessageRow
        message={makeMsg()}
        showHead={true}
        senderName="You"
        senderInitials="Y"
        onOpenThread={vi.fn()}
      />,
    );
    expect(screen.queryByText('(edited)')).toBeNull();
  });

  it('renders (edited) when editedAt is set', () => {
    render(
      <MessageRow
        message={makeMsg({ editedAt: NOW })}
        showHead={true}
        senderName="You"
        senderInitials="Y"
        onOpenThread={vi.fn()}
      />,
    );
    expect(screen.getByText('(edited)')).toBeTruthy();
  });
});
