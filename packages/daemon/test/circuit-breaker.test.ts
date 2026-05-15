// packages/daemon/test/circuit-breaker.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createBreaker, type BreakerState } from '../src/circuit-breaker.js';

describe('createBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts closed and does not block', () => {
    const b = createBreaker({ threshold: 3, windowMs: 60_000, baseCooldownMs: 5_000, maxCooldownMs: 30_000 });
    expect(b.shouldBlock()).toBe(false);
    expect(b.getState().state).toBe('closed');
  });

  it('opens after threshold failures within window', () => {
    const changes: BreakerState[] = [];
    const b = createBreaker({
      threshold: 3,
      windowMs: 60_000,
      baseCooldownMs: 5_000,
      maxCooldownMs: 30_000,
      onStateChange: (s) => changes.push(s),
    });
    b.recordFailure();
    b.recordFailure();
    expect(b.shouldBlock()).toBe(false);
    b.recordFailure(); // crosses threshold
    expect(b.shouldBlock()).toBe(true);
    expect(b.getState().state).toBe('open');
    expect(changes).toContain('open');
    expect(b.getState().retryAt).toBeInstanceOf(Date);
  });

  it('slides failures window — old failures do not count', () => {
    const b = createBreaker({ threshold: 3, windowMs: 60_000, baseCooldownMs: 5_000, maxCooldownMs: 30_000 });
    b.recordFailure();
    b.recordFailure();
    vi.advanceTimersByTime(61_000); // slide both out of window
    b.recordFailure(); // only 1 in window — should not open
    expect(b.shouldBlock()).toBe(false);
  });

  it('goes half-open after cooldown', () => {
    const changes: BreakerState[] = [];
    const b = createBreaker({
      threshold: 3,
      windowMs: 60_000,
      baseCooldownMs: 5_000,
      maxCooldownMs: 30_000,
      onStateChange: (s) => changes.push(s),
    });
    b.recordFailure(); b.recordFailure(); b.recordFailure();
    expect(b.getState().state).toBe('open');
    vi.advanceTimersByTime(5_000);
    expect(b.getState().state).toBe('half-open');
    expect(changes).toContain('half-open');
  });

  it('half-open: first shouldBlock() returns false (probe slot), second returns true until settled', () => {
    const b = createBreaker({ threshold: 3, windowMs: 60_000, baseCooldownMs: 5_000, maxCooldownMs: 30_000 });
    b.recordFailure(); b.recordFailure(); b.recordFailure();
    vi.advanceTimersByTime(5_000); // → half-open
    expect(b.shouldBlock()).toBe(false); // probe allowed
    expect(b.shouldBlock()).toBe(true);  // subsequent callers blocked until probe settles
  });

  it('probe success: closes breaker and resets cooldown', () => {
    const changes: BreakerState[] = [];
    const b = createBreaker({
      threshold: 3,
      windowMs: 60_000,
      baseCooldownMs: 5_000,
      maxCooldownMs: 30_000,
      onStateChange: (s) => changes.push(s),
    });
    b.recordFailure(); b.recordFailure(); b.recordFailure();
    vi.advanceTimersByTime(5_000);
    b.shouldBlock(); // consume probe slot
    b.recordSuccess();
    expect(b.getState().state).toBe('closed');
    expect(b.shouldBlock()).toBe(false);
    expect(changes.at(-1)).toBe('closed');
  });

  it('probe failure: re-opens with doubled cooldown', () => {
    const b = createBreaker({ threshold: 3, windowMs: 60_000, baseCooldownMs: 5_000, maxCooldownMs: 30_000 });
    b.recordFailure(); b.recordFailure(); b.recordFailure();
    vi.advanceTimersByTime(5_000); // → half-open
    b.shouldBlock(); // consume probe slot
    b.recordFailure(); // probe failed → re-open, cooldown × 2 = 10 000
    expect(b.getState().state).toBe('open');
    // Should not be half-open yet at 5 s
    vi.advanceTimersByTime(5_000);
    expect(b.getState().state).toBe('open');
    vi.advanceTimersByTime(5_000); // total 10 s
    expect(b.getState().state).toBe('half-open');
  });

  it('cooldown caps at maxCooldownMs', () => {
    const b = createBreaker({ threshold: 3, windowMs: 60_000, baseCooldownMs: 10_000, maxCooldownMs: 20_000 });
    // Fail to open, re-open twice to drive doubling
    const trip = () => { b.recordFailure(); b.recordFailure(); b.recordFailure(); };
    const probe = () => {
      const s = b.getState();
      const delay = (s.retryAt?.getTime() ?? 0) - Date.now();
      vi.advanceTimersByTime(delay > 0 ? delay : 1);
      b.shouldBlock(); // consume probe
      b.recordFailure(); // fail probe → re-open
    };
    trip();
    probe(); // cooldown 10 000 → 20 000
    probe(); // cooldown would be 40 000 but capped at 20 000
    // Now we're open again; probe fires at 20 s
    const nextRetry = b.getState().retryAt!;
    expect(nextRetry.getTime() - Date.now()).toBeLessThanOrEqual(20_000);
  });
});
