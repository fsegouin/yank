import { createFileRoute } from '@tanstack/react-router';
import { TriageView } from '../components/triage/TriageView.js';

export const Route = createFileRoute('/triage')({
  component: TriageView,
});
