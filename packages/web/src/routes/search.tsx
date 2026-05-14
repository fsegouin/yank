import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/search')({
  component: () => (
    <main style={{ padding: 24, color: 'var(--fg-1)' }}>
      <h1 style={{ fontSize: 16, color: 'var(--fg-0)' }}>Search</h1>
      <p style={{ fontSize: 13 }}>Search UI lands in M4.</p>
    </main>
  ),
});
