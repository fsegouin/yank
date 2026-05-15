import { create } from 'zustand';

export type BreakerState = 'closed' | 'open' | 'half-open';

interface MediaBreakerState {
  state: BreakerState;
  retryAt: string | null;
  setBreakerState(payload: { state: BreakerState; retryAt?: string | null }): void;
}

export const useMediaBreakerStore = create<MediaBreakerState>((set) => ({
  state: 'closed',
  retryAt: null,
  setBreakerState({ state, retryAt }) {
    set({ state, retryAt: retryAt ?? null });
  },
}));

export function useMediaBreakerState(): { state: BreakerState; retryAt: string | null } {
  return useMediaBreakerStore((s) => ({ state: s.state, retryAt: s.retryAt }));
}
