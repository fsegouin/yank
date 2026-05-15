import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatFilterBar } from '../../../src/components/chat/ChatFilterBar.js';
import { useUiStore } from '../../../src/state/ui.js';
import type { Message } from '@yank/shared';

const makeMsg = (id: string, text: string): Message => ({
  id,
  userId: 'u1',
  chatId: 'c1',
  waMessageId: id,
  senderJid: 'a@s.whatsapp.net',
  ts: '2026-05-14T09:00:00.000Z',
  kind: 'text',
  text,
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  status: 'sent',
  reactions: [],
});

const messages: Message[] = [
  makeMsg('m1', 'hello world'),
  makeMsg('m2', 'foo bar'),
  makeMsg('m3', 'hello again'),
];

function setup() {
  useUiStore.setState({
    chatFilter: { open: true, query: '', hitIndex: 0 },
  });
  return render(
    <ChatFilterBar chatId="c1" messages={messages} />,
  );
}

describe('ChatFilterBar', () => {
  it('renders when chatFilter.open is true', () => {
    setup();
    expect(screen.getByPlaceholderText(/search messages/i)).toBeInTheDocument();
  });

  it('does not render when chatFilter.open is false', () => {
    useUiStore.setState({ chatFilter: { open: false, query: '', hitIndex: 0 } });
    render(<ChatFilterBar chatId="c1" messages={messages} />);
    expect(screen.queryByPlaceholderText(/search messages/i)).not.toBeInTheDocument();
  });

  it('shows hit count when query matches', async () => {
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search messages/i), 'hello');
    expect(screen.getByText(/1 of 2/i)).toBeInTheDocument();
  });

  it('shows 0 of 0 when no matches', async () => {
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search messages/i), 'zzzzz');
    expect(screen.getByText(/0 of 0/i)).toBeInTheDocument();
  });

  it('Enter key advances hit index', async () => {
    setup();
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/search messages/i);
    await user.type(input, 'hello');
    expect(useUiStore.getState().chatFilter.hitIndex).toBe(0);
    await user.keyboard('{Enter}');
    expect(useUiStore.getState().chatFilter.hitIndex).toBe(1);
    // wraps around
    await user.keyboard('{Enter}');
    expect(useUiStore.getState().chatFilter.hitIndex).toBe(0);
  });

  it('Shift-Enter retreats hit index', async () => {
    setup();
    useUiStore.setState({ chatFilter: { open: true, query: 'hello', hitIndex: 1 } });
    const user = userEvent.setup();
    // re-render with existing query
    render(<ChatFilterBar chatId="c1" messages={messages} />);
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(useUiStore.getState().chatFilter.hitIndex).toBe(0);
  });

  it('Esc closes the bar', async () => {
    setup();
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(useUiStore.getState().chatFilter.open).toBe(false);
  });

  it('< and > navigation buttons work', async () => {
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search messages/i), 'hello');
    await user.click(screen.getByTitle(/next match/i));
    expect(useUiStore.getState().chatFilter.hitIndex).toBe(1);
    await user.click(screen.getByTitle(/previous match/i));
    expect(useUiStore.getState().chatFilter.hitIndex).toBe(0);
  });
});
