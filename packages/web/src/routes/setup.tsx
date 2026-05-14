import { createFileRoute } from '@tanstack/react-router';
import { SetupView } from '../components/setup/SetupView.js';

export const Route = createFileRoute('/setup')({
  component: SetupView,
});
