import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
} from '@tanstack/react-router';
import React from 'react';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts.js';
import { useUiStore } from '../../src/state/ui.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: () => <>{children}</> });
  const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const router = createRouter({
    routeTree: root.addChildren([idx]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return (
    <QueryClientProvider client={qc}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>
  );
}

describe('useKeyboardShortcuts — Cmd-T', () => {
  beforeEach(() => {
    useUiStore.setState({ paletteOpen: false, paletteMode: null });
  });

  it('Cmd-T opens palette in chats-only mode', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });
    const event = new KeyboardEvent('keydown', { key: 't', metaKey: true, bubbles: true });
    window.dispatchEvent(event);
    const state = useUiStore.getState();
    expect(state.paletteOpen).toBe(true);
    expect(state.paletteMode).toBe('chats-only');
  });

  it('Cmd-K opens palette in default mode', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
    window.dispatchEvent(event);
    const state = useUiStore.getState();
    expect(state.paletteOpen).toBe(true);
    expect(state.paletteMode).toBeNull();
  });
});
