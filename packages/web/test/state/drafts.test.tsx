import { beforeEach, describe, expect, it } from 'vitest';
import { useDraftsStore } from '../../src/state/drafts.js';

describe('useDraftsStore', () => {
  beforeEach(() => {
    useDraftsStore.setState({ drafts: {} });
    localStorage.clear();
  });

  it('stores a draft per chatId', () => {
    useDraftsStore.getState().setDraft('chat-a', 'hello');
    useDraftsStore.getState().setDraft('chat-b', 'world');
    expect(useDraftsStore.getState().drafts).toEqual({ 'chat-a': 'hello', 'chat-b': 'world' });
  });

  it('clears a single draft', () => {
    useDraftsStore.getState().setDraft('chat-a', 'hello');
    useDraftsStore.getState().clearDraft('chat-a');
    expect(useDraftsStore.getState().drafts['chat-a']).toBeUndefined();
  });

  it('persists drafts to localStorage', () => {
    useDraftsStore.getState().setDraft('chat-a', 'persisted');
    const raw = localStorage.getItem('yank:drafts');
    expect(raw).toBeTruthy();
    expect(raw).toContain('persisted');
  });
});
