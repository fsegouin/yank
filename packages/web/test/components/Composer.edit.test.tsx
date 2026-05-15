import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Message } from '@yank/shared';
import { Composer } from '../../src/components/chat/Composer.js';
import { useUiStore } from '../../src/state/ui.js';
import { queryKeys } from '../../src/lib/queryKeys.js';

vi.mock('../../src/lib/mutations.js', () => ({
  useSendMessage: vi.fn(() => ({ mutate: vi.fn() })),
  useEditMessage: vi.fn(() => ({ mutate: vi.fn() })),
}));

const CHAT_ID = 'c1';
const MSG_ID = 'm1';
const NOW = new Date().toISOString();
const makeMsg = (overrides: Partial<Message> = {}): Message => ({
  id: MSG_ID, userId: 'u1', chatId: CHAT_ID, waMessageId: 'WA-1', senderJid: 'me',
  ts: NOW, kind: 'text', text: 'hello', replyToId: null, editedAt: null,
  deletedAt: null, status: 'sent', reactions: [],
  ...overrides,
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  qc.setQueryData(queryKeys.messages(CHAT_ID), {
    pages: [{ messages: [makeMsg()], nextCursor: null }],
    pageParams: [null],
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('Composer edit mode', () => {
  beforeEach(() => {
    useUiStore.setState({ editing: null });
  });

  it('shows edit banner when editing state is set for this chat', () => {
    useUiStore.setState({
      editing: { messageId: MSG_ID, originalText: 'hello', chatId: CHAT_ID },
    });
    render(<Composer chatId={CHAT_ID} onSend={vi.fn()} />, { wrapper });
    expect(screen.getByText(/Editing/)).toBeTruthy();
    expect(screen.getByText(/Esc to cancel/)).toBeTruthy();
  });

  it('pre-fills textarea with originalText in edit mode', () => {
    useUiStore.setState({
      editing: { messageId: MSG_ID, originalText: 'pre-filled text', chatId: CHAT_ID },
    });
    render(<Composer chatId={CHAT_ID} onSend={vi.fn()} />, { wrapper });
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.value).toBe('pre-filled text');
  });

  it('Escape clears editing state', async () => {
    useUiStore.setState({
      editing: { messageId: MSG_ID, originalText: 'hello', chatId: CHAT_ID },
    });
    render(<Composer chatId={CHAT_ID} onSend={vi.fn()} />, { wrapper });
    const ta = screen.getByRole('textbox');
    await userEvent.type(ta, '{Escape}');
    expect(useUiStore.getState().editing).toBeNull();
  });

  it('Enter in edit mode calls useEditMessage.mutate, not onSend', async () => {
    const { useEditMessage } = await import('../../src/lib/mutations.js');
    const mockMutate = vi.fn();
    vi.mocked(useEditMessage).mockReturnValue({ mutate: mockMutate } as unknown as ReturnType<typeof useEditMessage>);

    useUiStore.setState({
      editing: { messageId: MSG_ID, originalText: 'hello', chatId: CHAT_ID },
    });
    const onSend = vi.fn();
    render(<Composer chatId={CHAT_ID} onSend={onSend} />, { wrapper });
    const ta = screen.getByRole('textbox');
    await userEvent.clear(ta);
    await userEvent.type(ta, 'edited content');
    fireEvent.keyDown(ta, { key: 'Enter' });

    expect(mockMutate).toHaveBeenCalledWith({ text: 'edited content' });
    expect(onSend).not.toHaveBeenCalled();
    expect(useUiStore.getState().editing).toBeNull();
  });

  it('ArrowUp in empty textarea enters edit mode for last own message', async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.messages(CHAT_ID), {
      pages: [{ messages: [makeMsg()], nextCursor: null }],
      pageParams: [null],
    });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    render(<Composer chatId={CHAT_ID} onSend={vi.fn()} />, { wrapper: Wrapper });
    const ta = screen.getByRole('textbox');
    // Ensure textarea is empty
    expect((ta as HTMLTextAreaElement).value).toBe('');
    fireEvent.keyDown(ta, { key: 'ArrowUp' });

    expect(useUiStore.getState().editing).toEqual({
      messageId: MSG_ID,
      originalText: 'hello',
      chatId: CHAT_ID,
    });
  });
});
