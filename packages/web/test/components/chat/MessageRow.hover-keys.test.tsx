import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
} from '@tanstack/react-router';
import { MessageRow } from '../../../src/components/chat/Message.js';
import type { Message } from '@yank/shared';

const server = setupServer(
  http.post('/api/messages/:id/star', () => HttpResponse.json({}, { status: 200 })),
);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const msg: Message = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000050',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  waMessageId: 'ABC',
  senderJid: 'other@s.whatsapp.net',
  ts: '2026-05-14T09:14:00.000Z',
  kind: 'text',
  text: 'Hello',
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  status: 'sent',
  reactions: [],
  starred: false,
};

function renderRow() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const navigateSpy = vi.fn();
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={qc}>
        <MessageRow
          message={msg}
          showHead={true}
          senderName="Other"
          senderInitials="OT"
          onOpenThread={() => {}}
          chatId="chat-1"
          myJid="me@s.whatsapp.net"
        />
      </QueryClientProvider>
    ),
  });
  const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const thread = createRoute({
    getParentRoute: () => root,
    path: '/c/$chatId/t/$messageId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([idx, thread]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return { rendered: render(<RouterProvider router={router as never} />), navigateSpy };
}

describe('MessageRow hover keys', () => {
  it('pressing s while hovering over row calls star mutation', async () => {
    let starCalled = false;
    server.use(
      http.post('/api/messages/:id/star', () => {
        starCalled = true;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    const { rendered } = renderRow();
    const row = rendered.container.querySelector('[data-testid="message-row"]') as HTMLElement;
    expect(row).toBeTruthy();

    fireEvent.mouseEnter(row);
    fireEvent.keyDown(document, { key: 's' });
    await new Promise((r) => setTimeout(r, 50));
    expect(starCalled).toBe(true);
  });

  it('does not fire hover keys when an input is focused', async () => {
    let starCalled = false;
    server.use(
      http.post('/api/messages/:id/star', () => {
        starCalled = true;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    const { rendered } = renderRow();
    const row = rendered.container.querySelector('[data-testid="message-row"]') as HTMLElement;
    fireEvent.mouseEnter(row);

    // Simulate an input being focused
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(document, { key: 's' });
    await new Promise((r) => setTimeout(r, 50));
    expect(starCalled).toBe(false);
    document.body.removeChild(input);
  });

  it('removes keydown listener on mouseLeave', async () => {
    let starCalled = false;
    server.use(
      http.post('/api/messages/:id/star', () => {
        starCalled = true;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    const { rendered } = renderRow();
    const row = rendered.container.querySelector('[data-testid="message-row"]') as HTMLElement;

    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);
    fireEvent.keyDown(document, { key: 's' });
    await new Promise((r) => setTimeout(r, 50));
    expect(starCalled).toBe(false);
  });
});
