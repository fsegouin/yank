import { describe, expect, it, beforeAll, afterEach, afterAll } from 'vitest';
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
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { waitFor } from '@testing-library/react';
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
      {/* The Register module augmentation pins router types to the main app
          router; cast to bypass that for the locally-scoped test router. */}
      <RouterProvider router={router as never} />
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

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Rail triage count indicator', () => {
  it('shows a red dot when triage count > 0', async () => {
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000020',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: 'x@g.us',
            type: 'group',
            subject: 'Triage One',
            lastMessageAt: null,
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: false,
            workspace: 'triage',
            memberCount: 1,
            unreadCount: 0,
            lastReadMessageId: null,
            lastReadTs: null,
          },
        ]),
      ),
    );
    renderRail();
    await waitFor(() => {
      expect(document.querySelector('[data-triage-dot]')).toBeInTheDocument();
    });
  });

  it('hides the red dot when triage count is 0', async () => {
    server.use(http.get('/api/chats', () => HttpResponse.json([])));
    renderRail();
    await waitFor(() => {
      expect(document.querySelector('[data-triage-dot]')).not.toBeInTheDocument();
    });
  });
});
