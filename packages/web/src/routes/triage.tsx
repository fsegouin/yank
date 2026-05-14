import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/triage')({
  component: () => <main style={{ padding: 24 }}>Triage stub — Group E6 fills it.</main>,
});
