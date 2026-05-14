import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
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
import { CommandPalette } from '../../../src/components/palette/CommandPalette.js';
import { useUiStore } from '../../../src/state/ui.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPalette() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: () => <CommandPalette /> });
  const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const chat = createRoute({
    getParentRoute: () => root,
    path: '/c/$chatId',
    component: () => null,
  });
  const triage = createRoute({
    getParentRoute: () => root,
    path: '/triage',
    component: () => null,
  });
  const search = createRoute({
    getParentRoute: () => root,
    path: '/search',
    component: () => null,
  });
  const diag = createRoute({
    getParentRoute: () => root,
    path: '/diagnostics',
    component: () => null,
  });
  const settings = createRoute({
    getParentRoute: () => root,
    path: '/settings',
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([idx, chat, triage, search, diag, settings]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      {/* The Register module augmentation pins router types to the main app
          router; cast to bypass that for the locally-scoped test router. */}
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

describe('CommandPalette', () => {
  it('lists chats in the Jump to section', async () => {
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: 'a@g.us',
            type: 'group',
            subject: 'Q3 Brief',
            lastMessageAt: null,
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: false,
            workspace: 'work',
            memberCount: 3,
            unreadCount: 0,
          },
        ]),
      ),
    );
    useUiStore.setState({ paletteOpen: true });
    renderPalette();
    expect(await screen.findByText('Q3 Brief')).toBeInTheDocument();
  });

  it('Escape closes the palette', async () => {
    server.use(http.get('/api/chats', () => HttpResponse.json([])));
    useUiStore.setState({ paletteOpen: true });
    const user = userEvent.setup();
    renderPalette();
    await user.keyboard('{Escape}');
    expect(useUiStore.getState().paletteOpen).toBe(false);
  });

  it('filters by query string', async () => {
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: 'a@g.us',
            type: 'group',
            subject: 'Brock&Co',
            lastMessageAt: null,
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: false,
            workspace: 'work',
            memberCount: 3,
            unreadCount: 0,
          },
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: 'b@g.us',
            type: 'group',
            subject: 'Studio',
            lastMessageAt: null,
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: false,
            workspace: 'work',
            memberCount: 3,
            unreadCount: 0,
          },
        ]),
      ),
    );
    useUiStore.setState({ paletteOpen: true });
    const user = userEvent.setup();
    renderPalette();
    await screen.findByText('Brock&Co');
    await user.type(screen.getByPlaceholderText(/jump to/i), 'stu');
    expect(screen.queryByText('Brock&Co')).not.toBeInTheDocument();
    expect(screen.getByText('Studio')).toBeInTheDocument();
  });
});
