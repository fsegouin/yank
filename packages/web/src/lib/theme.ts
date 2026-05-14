export type Theme = 'dark' | 'light';
export type Density = 'compact' | 'comfortable' | 'roomy';
export type Accent = 'auto' | 'work' | 'personal' | 'triage' | 'mono';
export type Workspace = 'work' | 'personal' | 'triage';

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function applyDensity(density: Density): void {
  document.documentElement.dataset.density = density;
}

/**
 * Resolve and apply the accent. When `accent === 'auto'` the accent follows the
 * current workspace (work/personal/triage). Pass the current workspace in to
 * compute the resolved value — accent has no concept of route/view, only of
 * which workspace tint to use.
 */
export function applyAccent(accent: Accent, workspace: Workspace): void {
  const resolved = accent === 'auto' ? workspace : accent;
  document.documentElement.dataset.accent = resolved;
}
