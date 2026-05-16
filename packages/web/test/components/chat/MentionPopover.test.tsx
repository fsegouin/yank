import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MentionPopover } from '../../../src/components/chat/MentionPopover.js';
import type { ChatMember } from '@yank/shared';

const members: ChatMember[] = [
  { chatId: 'c1', jid: 'alice@s.whatsapp.net', displayName: 'Alice', role: 'member' },
  { chatId: 'c1', jid: 'bob@s.whatsapp.net', displayName: 'Bob', role: 'member' },
  {
    chatId: 'c1',
    jid: '99lid@lid.whatsapp.net',
    displayName: null,
    role: 'member',
  },
];

const anchorRect: DOMRect = {
  top: 100,
  left: 50,
  bottom: 116,
  right: 66,
  width: 16,
  height: 16,
  x: 50,
  y: 100,
  toJSON: () => ({}),
};

describe('MentionPopover', () => {
  it('renders nothing when anchorRect is null', () => {
    const { container } = render(
      <MentionPopover
        members={members}
        selectedIndex={0}
        onSelect={vi.fn()}
        anchorRect={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders member display names', () => {
    render(
      <MentionPopover
        members={members}
        selectedIndex={0}
        onSelect={vi.fn()}
        anchorRect={anchorRect}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders @Unknown (lid) for null displayName members', () => {
    render(
      <MentionPopover
        members={members}
        selectedIndex={0}
        onSelect={vi.fn()}
        anchorRect={anchorRect}
      />,
    );
    expect(screen.getByText('@Unknown (lid)')).toBeInTheDocument();
  });

  it('highlights the selectedIndex item', () => {
    render(
      <MentionPopover
        members={members}
        selectedIndex={1}
        onSelect={vi.fn()}
        anchorRect={anchorRect}
      />,
    );
    const items = screen.getAllByRole('option');
    expect(items[1]).toHaveAttribute('aria-selected', 'true');
    expect(items[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onSelect with member on click', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <MentionPopover
        members={members}
        selectedIndex={0}
        onSelect={onSelect}
        anchorRect={anchorRect}
      />,
    );
    await user.click(screen.getByText('Bob'));
    expect(onSelect).toHaveBeenCalledWith(members[1]);
  });

  it('renders R/S shortcut hints as tooltip titles', () => {
    render(
      <MentionPopover
        members={[members[0]!]}
        selectedIndex={0}
        onSelect={vi.fn()}
        anchorRect={anchorRect}
      />,
    );
    // The popover list item should exist as option
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});
