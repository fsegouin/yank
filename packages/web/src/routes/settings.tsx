import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  component: () => (
    <main style={{ padding: 24, color: 'var(--fg-1)' }}>
      <h1 style={{ fontSize: 16, color: 'var(--fg-0)' }}>Settings</h1>
      <p style={{ fontSize: 13 }}>Settings UI lands in M4.</p>
    </main>
  ),
});
