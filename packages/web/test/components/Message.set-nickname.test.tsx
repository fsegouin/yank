import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
} from '@tanstack/react-router';
import type { Message } from '@yank/shared';
import { MessageRow } from '../../src/components/chat/Message.js';

vi.mock('../../src/lib/mutations.js', () => ({
  useUpdateContactName: vi.fn(() => ({ mutate: vi.fn() })),
  useStar: vi.fn(() => ({ mutate: vi.fn() })),
}));

const NOW = new Date().toISOString();
const UNKNOWN_JID = '50264102985962@lid';
const makeMsg = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1', userId: 'u1', chatId: 'c1', waMessageId: 'WA-1', senderJid: UNKNOWN_JID,
  ts: NOW, kind: 'text', text: 'hello', replyToId: null,
  editedAt: null, deletedAt: null, status: 'sent', reactions: [],
  ...overrides,
});

function wrapInRouter(node: React.ReactElement) {
  const root = createRootRoute({ component: () => node });
  const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const chat = createRoute({
    getParentRoute: () => root,
    path: '/c/$chatId/t/$messageId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([idx, chat]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

describe('MessageRow nickname affordance', () => {
  it('renders "Set nickname" affordance when senderName equals senderJid (no name resolved)', () => {
    wrapInRouter(
      <MessageRow
        message={makeMsg()}
        showHead={true}
        senderName={UNKNOWN_JID}
        senderInitials="50"
        onOpenThread={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /set nickname/i })).toBeInTheDocument();
  });

  it('omits the affordance when a real name is resolved', () => {
    wrapInRouter(
      <MessageRow
        message={makeMsg()}
        showHead={true}
        senderName="Bob"
        senderInitials="B"
        onOpenThread={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /set nickname/i })).toBeNull();
  });

  it('omits the affordance when showHead is false (head not rendered)', () => {
    wrapInRouter(
      <MessageRow
        message={makeMsg()}
        showHead={false}
        senderName={UNKNOWN_JID}
        senderInitials="50"
        onOpenThread={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /set nickname/i })).toBeNull();
  });
});
