// packages/daemon/src/circuit-breaker.ts
export type BreakerState = 'closed' | 'open' | 'half-open';

export interface BreakerOpts {
  /** Number of failures in `windowMs` that trips the breaker. */
  threshold: number;
  /** Sliding window duration in milliseconds. */
  windowMs: number;
  /** Initial (and reset) cooldown before the first probe. */
  baseCooldownMs: number;
  /** Maximum cooldown after repeated probe failures. */
  maxCooldownMs: number;
  onStateChange?: (state: BreakerState, retryAt?: Date) => void;
}

export interface BreakerHandle {
  /** Returns true if the caller should skip the operation. */
  shouldBlock(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
  getState(): { state: BreakerState; retryAt: Date | null };
}

export function createBreaker(opts: BreakerOpts): BreakerHandle {
  const { threshold, windowMs, baseCooldownMs, maxCooldownMs, onStateChange } = opts;

  let state: BreakerState = 'closed';
  let retryAt: Date | null = null;
  let currentCooldownMs = baseCooldownMs;
  let probeConsumed = false;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;

  // Sliding window: array of failure timestamps.
  const failureTs: number[] = [];

  function evictOld(): void {
    const cutoff = Date.now() - windowMs;
    while (failureTs.length > 0 && (failureTs[0] ?? 0) < cutoff) {
      failureTs.shift();
    }
  }

  function scheduleProbe(delayMs: number): void {
    if (probeTimer) clearTimeout(probeTimer);
    probeTimer = setTimeout(() => {
      state = 'half-open';
      probeConsumed = false;
      onStateChange?.(state);
    }, delayMs);
  }

  function open(cooldownMs: number): void {
    state = 'open';
    probeConsumed = false;
    retryAt = new Date(Date.now() + cooldownMs);
    onStateChange?.(state, retryAt);
    scheduleProbe(cooldownMs);
  }

  return {
    shouldBlock(): boolean {
      if (state === 'closed') return false;
      if (state === 'open') return true;
      // half-open: allow exactly one probe
      if (!probeConsumed) {
        probeConsumed = true;
        return false;
      }
      return true;
    },

    recordSuccess(): void {
      if (state === 'closed') return;
      if (probeTimer) { clearTimeout(probeTimer); probeTimer = null; }
      state = 'closed';
      retryAt = null;
      currentCooldownMs = baseCooldownMs;
      failureTs.length = 0;
      onStateChange?.(state);
    },

    recordFailure(): void {
      if (state === 'half-open') {
        // Probe failed — re-open with doubled cooldown.
        currentCooldownMs = Math.min(currentCooldownMs * 2, maxCooldownMs);
        open(currentCooldownMs);
        return;
      }
      evictOld();
      failureTs.push(Date.now());
      if (state === 'closed' && failureTs.length >= threshold) {
        currentCooldownMs = baseCooldownMs;
        open(currentCooldownMs);
      }
    },

    getState(): { state: BreakerState; retryAt: Date | null } {
      return { state, retryAt };
    },
  };
}
