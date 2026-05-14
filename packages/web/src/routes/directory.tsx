import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/directory')({
  component: () => (
    <main style={{ padding: 24, color: 'var(--fg-1)' }}>
      <h1 style={{ fontSize: 16, color: 'var(--fg-0)' }}>Directory</h1>
      <p style={{ fontSize: 13 }}>Directory view lands in phase 2.</p>
    </main>
  ),
});
