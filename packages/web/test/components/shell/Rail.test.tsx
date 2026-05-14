import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
} from '@tanstack/react-router';
import { Rail } from '../../../src/components/shell/Rail.js';
import { useUiStore } from '../../../src/state/ui.js';

function renderRail(initial = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => <Rail /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  });
  const triageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/triage',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, triageRoute]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('Rail', () => {
  it('renders the three workspace buttons', () => {
    renderRail();
    expect(screen.getByRole('button', { name: /work/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /personal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /triage/i })).toBeInTheDocument();
  });

  it('clicking Personal updates the workspace in the store', async () => {
    const user = userEvent.setup();
    renderRail();
    await user.click(screen.getByRole('button', { name: /personal/i }));
    expect(useUiStore.getState().workspace).toBe('personal');
  });

  it('shows Work as active by default', () => {
    useUiStore.setState({ workspace: 'work' });
    renderRail();
    const btn = screen.getByRole('button', { name: /work/i });
    expect(btn).toHaveAttribute('aria-current', 'true');
  });
});
