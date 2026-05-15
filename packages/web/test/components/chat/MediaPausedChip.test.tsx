import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useMediaBreakerStore } from '../../../src/state/mediaBreaker.js';
import { MediaPausedChip } from '../../../src/components/chat/MediaPausedChip.js';

describe('MediaPausedChip', () => {
  beforeEach(() => {
    act(() => {
      useMediaBreakerStore.setState({ state: 'closed', retryAt: null });
    });
  });

  it('renders nothing when breaker is closed', () => {
    const { container } = render(<MediaPausedChip />);
    expect(container.firstChild).toBeNull();
  });

  it('renders paused pill when breaker is open', () => {
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({ state: 'open', retryAt: null });
    });
    render(<MediaPausedChip />);
    expect(screen.getByText(/downloads paused/i)).toBeInTheDocument();
  });

  it('shows countdown when retryAt is in the future', () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({ state: 'open', retryAt: future });
    });
    render(<MediaPausedChip />);
    // Should show some "Xm" text
    expect(screen.getByText(/\dm/i)).toBeInTheDocument();
  });

  it('renders nothing when breaker is half-open', () => {
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({ state: 'half-open', retryAt: null });
    });
    const { container } = render(<MediaPausedChip />);
    expect(container.firstChild).toBeNull();
  });
});
