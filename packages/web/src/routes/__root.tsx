import { Outlet, createRootRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useEventStream } from '../lib/eventStream.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace.js';
import { useUiStore } from '../state/ui.js';
import { useMediaBreakerStore } from '../state/mediaBreaker.js';
import { Rail } from '../components/shell/Rail.js';
import { Sidebar } from '../components/shell/Sidebar.js';
import { CommandPalette } from '../components/palette/CommandPalette.js';
import { UndoToast } from '../components/primitives/UndoToast.js';
import { DegradationBanner } from '../components/shell/DegradationBanner.js';
import styles from './__root.module.css';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  useEventStream();
  useKeyboardShortcuts();
  useActiveWorkspace();

  useEffect(() => {
    void fetch('/api/media/breaker-state', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { state: 'closed' | 'open' | 'half-open'; retryAt: string | null } | null) => {
        if (body) {
          useMediaBreakerStore.getState().setBreakerState({ state: body.state, retryAt: body.retryAt });
        }
      })
      .catch(() => {/* silent — store stays closed */});
  }, []);

  const openThreadId = useUiStore((s) => s.openThreadId);
  const paletteOpen = useUiStore((s) => s.paletteOpen);
  const paletteMode = useUiStore((s) => s.paletteMode);

  return (
    <>
      <DegradationBanner />
      <div
        className={styles.shell + (openThreadId ? ' ' + styles.threadOpen : '')}
        data-thread-open={openThreadId ? 'true' : 'false'}
      >
        <Rail />
        <Sidebar />
        <Outlet />
        {paletteOpen && <CommandPalette mode={paletteMode ?? undefined} />}
        <UndoToast />
      </div>
    </>
  );
}
