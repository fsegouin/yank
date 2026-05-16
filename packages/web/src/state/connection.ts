import { create } from 'zustand';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'linking-required';

interface ConnectionState {
  status: ConnectionStatus;
  /** True once we've observed at least one 'connected' transition this session. Sticky. */
  everConnected: boolean;
  setStatus(s: ConnectionStatus): void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'connecting',
  everConnected: false,
  setStatus: (status) =>
    set((prev) => ({
      status,
      everConnected: prev.everConnected || status === 'connected',
    })),
}));

export function useConnectionStatus(): ConnectionStatus {
  return useConnectionStore((s) => s.status);
}

export function useEverConnected(): boolean {
  return useConnectionStore((s) => s.everConnected);
}
