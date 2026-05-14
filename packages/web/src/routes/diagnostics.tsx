import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/diagnostics')({
  component: () => (
    <main style={{ padding: 24, color: 'var(--fg-1)' }}>
      <h1 style={{ fontSize: 16, color: 'var(--fg-0)' }}>Diagnostics</h1>
      <p style={{ fontSize: 13 }}>Diagnostics dashboard lands in M4.</p>
    </main>
  ),
});
