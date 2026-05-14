import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/triage')({
  component: () => (
    <main style={{ padding: 24, color: 'var(--fg-1)' }}>
      <h1 style={{ fontSize: 16, color: 'var(--fg-0)' }}>Triage</h1>
      <p style={{ fontSize: 13 }}>Card grid lands in M4.</p>
    </main>
  ),
});
