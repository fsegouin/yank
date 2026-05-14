import { Outlet, createRootRoute } from '@tanstack/react-router';
import { useEventStream } from '../lib/eventStream.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace.js';
import { useUiStore } from '../state/ui.js';
import { Rail } from '../components/shell/Rail.js';
import { Sidebar } from '../components/shell/Sidebar.js';
import { CommandPalette } from '../components/palette/CommandPalette.js';
import styles from './__root.module.css';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  useEventStream();
  useKeyboardShortcuts();
  useActiveWorkspace();

  const openThreadId = useUiStore((s) => s.openThreadId);
  const paletteOpen = useUiStore((s) => s.paletteOpen);

  return (
    <div
      className={styles.shell + (openThreadId ? ' ' + styles.threadOpen : '')}
      data-thread-open={openThreadId ? 'true' : 'false'}
    >
      <Rail />
      <Sidebar />
      <Outlet />
      {paletteOpen && <CommandPalette />}
    </div>
  );
}
