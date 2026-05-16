import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useConnectionStore } from '../../src/state/connection.js';
import { DegradationBanner } from '../../src/components/shell/DegradationBanner.js';

// Mock TanStack Router navigate
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

describe('DegradationBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    act(() => {
      useConnectionStore.setState({ status: 'connecting' });
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when connected', () => {
    act(() => { useConnectionStore.getState().setStatus('connected'); });
    const { container } = render(<DegradationBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders soft strip when connecting', () => {
    render(<DegradationBanner />);
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });

  it('renders warning strip when disconnected', () => {
    act(() => { useConnectionStore.getState().setStatus('disconnected'); });
    render(<DegradationBanner />);
    expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
  });

  it('renders clickable accent strip when linking-required', () => {
    act(() => { useConnectionStore.getState().setStatus('linking-required'); });
    render(<DegradationBanner />);
    expect(screen.getByRole('button', { name: /linking required/i })).toBeInTheDocument();
  });

  it('grace timer: after 10s without connected event, flips to disconnected', () => {
    // Start as connecting (default); after 10 s should flip to disconnected
    render(<DegradationBanner graceMs={10_000} />);
    expect(useConnectionStore.getState().status).toBe('connecting');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(useConnectionStore.getState().status).toBe('disconnected');
  });

  it('grace timer: cleared when connected event arrives before 10s', () => {
    render(<DegradationBanner graceMs={10_000} />);
    act(() => { useConnectionStore.getState().setStatus('connected'); });
    act(() => { vi.advanceTimersByTime(10_000); });
    // Should still be connected, not flipped to disconnected
    expect(useConnectionStore.getState().status).toBe('connected');
  });
});
