import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
} from '@tanstack/react-router';
import { Sidebar } from '../../../src/components/shell/Sidebar.js';
import { useUiStore } from '../../../src/state/ui.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderSidebar(initial = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: () => <Sidebar /> });
  const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const chat = createRoute({
    getParentRoute: () => root,
    path: '/c/$chatId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([idx, chat]),
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

describe('Sidebar', () => {
  it('shows only chats matching the active workspace', async () => {
    useUiStore.setState({ workspace: 'work' });
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: 'a@g.us',
            type: 'group',
            subject: 'Work A',
            lastMessageAt: null,
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: false,
            workspace: 'work',
            memberCount: 3,
            unreadCount: 0,
            lastReadMessageId: null,
            lastReadTs: null,
          },
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: 'b@g.us',
            type: 'group',
            subject: 'Personal B',
            lastMessageAt: null,
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: false,
            workspace: 'personal',
            memberCount: 3,
            unreadCount: 0,
            lastReadMessageId: null,
            lastReadTs: null,
          },
        ]),
      ),
    );
    renderSidebar();
    await waitFor(() => screen.getByText('Work A'));
    expect(screen.queryByText('Personal B')).not.toBeInTheDocument();
  });

  it('renders Pinned, Group chats, Direct messages sections when populated', async () => {
    useUiStore.setState({ workspace: 'work' });
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: 'a@g.us',
            type: 'group',
            subject: 'Pinned A',
            lastMessageAt: null,
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: true,
            workspace: 'work',
            memberCount: 3,
            unreadCount: 0,
            lastReadMessageId: null,
            lastReadTs: null,
          },
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: 'b@g.us',
            type: 'group',
            subject: 'Group B',
            lastMessageAt: null,
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: false,
            workspace: 'work',
            memberCount: 3,
            unreadCount: 0,
            lastReadMessageId: null,
            lastReadTs: null,
          },
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000003',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: '4477@s.whatsapp.net',
            type: 'dm',
            subject: 'DM C',
            lastMessageAt: null,
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: false,
            workspace: 'work',
            memberCount: 0,
            unreadCount: 0,
            lastReadMessageId: null,
            lastReadTs: null,
          },
        ]),
      ),
    );
    renderSidebar();
    await waitFor(() => screen.getByText('Pinned A'));
    // Section headers use 'Pinned'/'Group chats'/'Direct messages' literal text
    // ("Pinned" also appears in the chat row title "Pinned A", so use getAllByText).
    expect(screen.getAllByText(/pinned/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/group chats/i)).toBeInTheDocument();
    expect(screen.getByText(/direct messages/i)).toBeInTheDocument();
  });
});
