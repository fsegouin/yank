import { useEffect } from 'react';
import { useUiStore } from '../state/ui.js';
import { applyAccent, type Accent } from '../lib/theme.js';

/**
 * Subscribes to workspace changes and (re)applies the accent attribute on
 * the document root. Components that just need to read the workspace value
 * should call `useUiStore((s) => s.workspace)` directly.
 *
 * `accent` is a pinned override; pass `'auto'` for workspace-tracking.
 */
export function useActiveWorkspace(accent: Accent = 'auto'): void {
  const workspace = useUiStore((s) => s.workspace);
  useEffect(() => {
    applyAccent(accent, workspace);
  }, [accent, workspace]);
}
