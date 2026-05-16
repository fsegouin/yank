import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UndoToast } from '../../src/components/primitives/UndoToast.js';
import { useToastStore } from '../../src/state/toast.js';

beforeEach(() => {
  useToastStore.setState({ toast: null });
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  useToastStore.setState({ toast: null });
});

describe('UndoToast', () => {
  it('renders nothing when toast is null', () => {
    const { container } = render(<UndoToast />);
    expect(container.firstChild).toBeNull();
  });

  it('renders label when toast is set', () => {
    act(() => {
      useToastStore.getState().showUndoToast({ label: 'Moved to Work', onUndo: vi.fn() });
    });
    render(<UndoToast />);
    expect(screen.getByText('Moved to Work')).toBeInTheDocument();
  });

  it('clicking Undo calls onUndo and clears the toast', async () => {
    const onUndo = vi.fn();
    act(() => {
      useToastStore.getState().showUndoToast({ label: 'Moved to Personal', onUndo });
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    render(<UndoToast />);
    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('Cmd-Z triggers onUndo globally', async () => {
    const onUndo = vi.fn();
    act(() => {
      useToastStore.getState().showUndoToast({ label: 'Moved to Hidden', onUndo });
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    render(<UndoToast />);
    await user.keyboard('{Meta>}z{/Meta}');
    expect(onUndo).toHaveBeenCalledOnce();
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('toast disappears after durationMs', () => {
    act(() => {
      useToastStore.getState().showUndoToast({ label: 'Bye', onUndo: vi.fn(), durationMs: 3000 });
    });
    render(<UndoToast />);
    expect(screen.getByText('Bye')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('Bye')).not.toBeInTheDocument();
  });
});
