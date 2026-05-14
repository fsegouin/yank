import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/saved')({
  component: () => (
    <main style={{ padding: 24, color: 'var(--fg-1)' }}>
      <h1 style={{ fontSize: 16, color: 'var(--fg-0)' }}>Saved messages</h1>
      <p style={{ fontSize: 13 }}>Saved view lands in M4.</p>
    </main>
  ),
});
