import { create } from 'zustand';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'linking-required';

interface ConnectionState {
  status: ConnectionStatus;
  setStatus(s: ConnectionStatus): void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'connecting',
  setStatus: (status) => set({ status }),
}));

export function useConnectionStatus(): ConnectionStatus {
  return useConnectionStore((s) => s.status);
}
