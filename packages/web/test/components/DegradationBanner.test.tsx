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
      useConnectionStore.setState({ status: 'connecting', everConnected: false });
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

  it('renders soft strip when connecting on first load (never connected)', () => {
    render(<DegradationBanner />);
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });

  it('renders nothing when transiently connecting after a previous connection', () => {
    // Simulate SSE reconnect cycle: was connected, briefly back to connecting
    act(() => { useConnectionStore.getState().setStatus('connected'); });
    act(() => { useConnectionStore.setState({ status: 'connecting' }); });
    const { container } = render(<DegradationBanner />);
    expect(container.firstChild).toBeNull();
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

  it('does not predictively flip connecting to disconnected after any timer elapses', () => {
    render(<DegradationBanner />);
    expect(useConnectionStore.getState().status).toBe('connecting');
    act(() => { vi.advanceTimersByTime(60_000); });
    // No predictive degradation; only daemon-emitted 'disconnected' should flip status.
    expect(useConnectionStore.getState().status).toBe('connecting');
  });
});
