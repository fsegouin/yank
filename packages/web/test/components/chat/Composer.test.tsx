import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { Composer } from '../../../src/components/chat/Composer.js';
import { useDraftsStore } from '../../../src/state/drafts.js';

beforeEach(() => {
  localStorage.clear();
  useDraftsStore.setState({ drafts: {} });
});

function renderWithQuery(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Composer', () => {
  it('calls onSend when Enter is pressed with content', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<Composer chatId="c1" onSend={onSend} placeholder="Message" />);
    const ta = screen.getByPlaceholderText('Message');
    await user.type(ta, 'hi{Enter}');
    expect(onSend).toHaveBeenCalledWith('hi');
  });

  it('does NOT call onSend on Shift+Enter', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<Composer chatId="c1" onSend={onSend} placeholder="Message" />);
    const ta = screen.getByPlaceholderText('Message');
    await user.type(ta, 'a{Shift>}{Enter}{/Shift}b');
    expect(onSend).not.toHaveBeenCalled();
    expect((ta as HTMLTextAreaElement).value).toContain('\n');
  });

  it('does not call onSend when content is whitespace-only', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<Composer chatId="c1" onSend={onSend} placeholder="Message" />);
    await user.type(screen.getByPlaceholderText('Message'), '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('persists the draft to the drafts store', async () => {
    const user = userEvent.setup();
    renderWithQuery(<Composer chatId="c1" onSend={() => {}} placeholder="Message" />);
    await user.type(screen.getByPlaceholderText('Message'), 'draft');
    expect(useDraftsStore.getState().drafts['c1']).toBe('draft');
  });

  it('clears the draft after a successful send', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<Composer chatId="c1" onSend={onSend} placeholder="Message" />);
    await user.type(screen.getByPlaceholderText('Message'), 'hi{Enter}');
    expect(useDraftsStore.getState().drafts['c1']).toBeUndefined();
  });
});
