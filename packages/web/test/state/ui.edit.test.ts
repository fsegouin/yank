import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from '../../src/state/ui.js';

describe('useUiStore editing slice', () => {
  beforeEach(() => {
    useUiStore.setState({ editing: null });
  });

  it('starts with editing = null', () => {
    expect(useUiStore.getState().editing).toBeNull();
  });

  it('setEditing sets the editing state', () => {
    useUiStore.getState().setEditing({
      messageId: 'm1',
      originalText: 'hello',
      chatId: 'c1',
    });
    expect(useUiStore.getState().editing).toEqual({
      messageId: 'm1',
      originalText: 'hello',
      chatId: 'c1',
    });
  });

  it('setEditing(null) clears editing state', () => {
    useUiStore.getState().setEditing({ messageId: 'm1', originalText: 'hi', chatId: 'c1' });
    useUiStore.getState().setEditing(null);
    expect(useUiStore.getState().editing).toBeNull();
  });
});
