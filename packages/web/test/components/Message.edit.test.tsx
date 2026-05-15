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

const NOW = new Date().toISOString();
const makeMsg = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1', userId: 'u1', chatId: 'c1', waMessageId: 'WA-1', senderJid: 'me',
  ts: NOW, kind: 'text', text: 'hello world', replyToId: null,
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

describe('MessageRow edited suffix', () => {
  it('does NOT render (edited) when editedAt is null', () => {
    wrapInRouter(
      <MessageRow
        message={makeMsg()}
        showHead={true}
        senderName="You"
        senderInitials="Y"
        onOpenThread={vi.fn()}
      />,
    );
    expect(screen.queryByText('(edited)')).toBeNull();
  });

  it('renders (edited) when editedAt is set', () => {
    wrapInRouter(
      <MessageRow
        message={makeMsg({ editedAt: NOW })}
        showHead={true}
        senderName="You"
        senderInitials="Y"
        onOpenThread={vi.fn()}
      />,
    );
    expect(screen.getByText('(edited)')).toBeTruthy();
  });
});
