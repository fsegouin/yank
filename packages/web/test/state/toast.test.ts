import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../../src/state/toast.js';

beforeEach(() => {
  useToastStore.setState({ toast: null });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  useToastStore.setState({ toast: null });
});

describe('useToastStore', () => {
  it('showUndoToast sets toast with label and onUndo', () => {
    const onUndo = vi.fn();
    useToastStore.getState().showUndoToast({ label: 'Moved to Work', onUndo, durationMs: 5000 });
    const { toast } = useToastStore.getState();
    expect(toast).not.toBeNull();
    expect(toast?.label).toBe('Moved to Work');
    expect(toast?.onUndo).toBe(onUndo);
  });

  it('auto-dismisses after durationMs', () => {
    useToastStore.getState().showUndoToast({ label: 'Test', onUndo: vi.fn(), durationMs: 3000 });
    expect(useToastStore.getState().toast).not.toBeNull();
    vi.advanceTimersByTime(3000);
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('new toast replaces previous (single slot)', () => {
    const first = vi.fn();
    const second = vi.fn();
    useToastStore.getState().showUndoToast({ label: 'First', onUndo: first, durationMs: 5000 });
    useToastStore.getState().showUndoToast({ label: 'Second', onUndo: second, durationMs: 5000 });
    expect(useToastStore.getState().toast?.label).toBe('Second');
  });

  it('clear() removes the toast immediately', () => {
    useToastStore.getState().showUndoToast({ label: 'X', onUndo: vi.fn(), durationMs: 5000 });
    useToastStore.getState().clear();
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('uses default durationMs of 5000 when not provided', () => {
    useToastStore.getState().showUndoToast({ label: 'Default', onUndo: vi.fn() });
    expect(useToastStore.getState().toast).not.toBeNull();
    vi.advanceTimersByTime(4999);
    expect(useToastStore.getState().toast).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toast).toBeNull();
  });
});
