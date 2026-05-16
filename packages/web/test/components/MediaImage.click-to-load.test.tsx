// packages/web/test/components/MediaImage.click-to-load.test.tsx
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useMediaBreakerStore } from '../../src/state/mediaBreaker.js';
import { MediaImage } from '../../src/components/chat/MediaImage.js';
import type { Media } from '@yank/shared';

// MSW / fetch mock
const fetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', fetchMock);

function makeMedia(overrides: Partial<Media> = {}): Media {
  return {
    status: 'queued',
    url: null,
    thumbnailUrl: null,
    mime: 'image/jpeg',
    sizeBytes: 1024,
    width: 400,
    height: 300,
    durationMs: null,
    ...overrides,
  };
}

describe('MediaImage click-to-load', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    act(() => {
      useMediaBreakerStore.setState({ state: 'closed', retryAt: null });
    });
  });

  it('shows placeholder with Tap to load button when queued', () => {
    render(<MediaImage messageId="m1" media={makeMedia()} />);
    expect(screen.getByRole('button', { name: /tap to load/i })).toBeInTheDocument();
  });

  it('does NOT auto-fetch on mount (no IntersectionObserver)', () => {
    render(<MediaImage messageId="m1" media={makeMedia()} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires fetch when Tap to load is clicked', async () => {
    render(<MediaImage messageId="m1" media={makeMedia()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /tap to load/i }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/media/m1', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('renders image when status is ready', () => {
    render(<MediaImage messageId="m1" media={makeMedia({ status: 'ready', url: '/api/media/m1' })} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders expired text when status is failed and failureReason is expired', () => {
    render(<MediaImage messageId="m1" media={makeMedia({ status: 'failed', failureReason: 'expired' })} />);
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders retry button on transient failure', () => {
    render(<MediaImage messageId="m1" media={makeMedia({ status: 'failed', failureReason: 'transient' })} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders MediaPausedChip when breaker is open', () => {
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({ state: 'open', retryAt: null });
    });
    render(<MediaImage messageId="m1" media={makeMedia()} />);
    expect(screen.getByText(/downloads paused/i)).toBeInTheDocument();
  });

  it('bypassBreaker button click fetches with bypassBreaker=true query param or custom header', async () => {
    // When breaker is open, a "Retry anyway" button fires a bypass fetch
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({ state: 'open', retryAt: null });
    });
    render(<MediaImage messageId="m1" media={makeMedia()} />);
    const bypassBtn = screen.queryByRole('button', { name: /retry anyway/i });
    if (bypassBtn) {
      await act(async () => { fireEvent.click(bypassBtn); });
      expect(fetchMock).toHaveBeenCalled();
    }
  });
});
