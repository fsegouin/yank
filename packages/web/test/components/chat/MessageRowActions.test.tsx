import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { MessageRowActions } from '../../../src/components/chat/MessageRowActions.js';
import { useUiStore } from '../../../src/state/ui.js';
import type { Message } from '@yank/shared';

const server = setupServer(
  http.post('/api/messages/:id/star', () => HttpResponse.json({}, { status: 200 })),
);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const baseMessage: Message = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000050',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  waMessageId: 'ABC',
  senderJid: '4477@s.whatsapp.net',
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

const MY_JID = '4477@s.whatsapp.net'; // same as senderJid → own message

function renderActions(message: Message, chatId = 'chat-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={qc}>
        <MessageRowActions message={message} chatId={chatId} myJid={MY_JID} />
      </QueryClientProvider>
    ),
  });
  const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const chat2 = createRoute({
    getParentRoute: () => root,
    path: '/c/$chatId',
    component: () => null,
  });
  const thread2 = createRoute({
    getParentRoute: () => root,
    path: '/c/$chatId/t/$messageId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([idx, chat2, thread2]),
    history: createMemoryHistory({ initialEntries: [`/c/${chatId}`] }),
  });
  return render(<RouterProvider router={router as never} />);
}

describe('MessageRowActions', () => {
  it('renders Reply and Star buttons for all messages', () => {
    renderActions(baseMessage);
    expect(screen.getByTitle(/reply in thread/i)).toBeInTheDocument();
    expect(screen.getByTitle(/star/i)).toBeInTheDocument();
  });

  it('renders Edit button only for own outbound messages', () => {
    renderActions(baseMessage); // senderJid === MY_JID
    expect(screen.getByTitle(/edit/i)).toBeInTheDocument();
  });

  it('does NOT render Edit button for inbound messages', () => {
    renderActions({ ...baseMessage, senderJid: 'other@s.whatsapp.net' });
    expect(screen.queryByTitle(/edit/i)).not.toBeInTheDocument();
  });

  it('Edit button calls setEditing with correct args', async () => {
    const user = userEvent.setup();
    renderActions(baseMessage);
    await user.click(screen.getByTitle(/edit/i));
    const editing = useUiStore.getState().editing;
    expect(editing).not.toBeNull();
    expect(editing!.messageId).toBe(baseMessage.id);
    expect(editing!.originalText).toBe('Hello');
    expect(editing!.chatId).toBe('chat-1');
  });

  it('Reply button title shows R keybind hint', () => {
    renderActions(baseMessage);
    expect(screen.getByTitle(/reply in thread.*R/i)).toBeInTheDocument();
  });

  it('Star button title shows S keybind hint', () => {
    renderActions(baseMessage);
    expect(screen.getByTitle(/star.*S/i)).toBeInTheDocument();
  });

  it('renders in a thread context (inThread=true)', () => {
    renderActions({ ...baseMessage, senderJid: 'other@s.whatsapp.net' });
    // Should still render reply + star even for inbound in thread
    expect(screen.getByTitle(/reply in thread/i)).toBeInTheDocument();
    expect(screen.getByTitle(/star/i)).toBeInTheDocument();
  });
});
