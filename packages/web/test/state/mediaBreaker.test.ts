import { describe, expect, it, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useMediaBreakerStore } from '../../src/state/mediaBreaker.js';

describe('useMediaBreakerStore', () => {
  beforeEach(() => {
    act(() => {
      useMediaBreakerStore.setState({ state: 'closed', retryAt: null });
    });
  });

  it('starts with closed state and null retryAt', () => {
    const s = useMediaBreakerStore.getState();
    expect(s.state).toBe('closed');
    expect(s.retryAt).toBeNull();
  });

  it('setBreakerState updates state and retryAt', () => {
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({
        state: 'open',
        retryAt: '2026-05-15T12:05:00.000Z',
      });
    });
    const s = useMediaBreakerStore.getState();
    expect(s.state).toBe('open');
    expect(s.retryAt).toBe('2026-05-15T12:05:00.000Z');
  });

  it('setBreakerState with closed clears retryAt', () => {
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({ state: 'closed', retryAt: undefined });
    });
    expect(useMediaBreakerStore.getState().retryAt).toBeNull();
  });
});
