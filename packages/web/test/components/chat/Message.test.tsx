import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
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

const base: Message = {
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
};

describe('MessageRow', () => {
  it('renders the sender name when showHead=true', () => {
    wrapInRouter(
      <MessageRow
        message={base}
        showHead={true}
        senderName="Ash R."
        senderInitials="AR"
        onOpenThread={() => {}}
      />,
    );
    expect(screen.getByText('Ash R.')).toBeInTheDocument();
  });

  it('omits the head when showHead=false', () => {
    wrapInRouter(
      <MessageRow
        message={base}
        showHead={false}
        senderName="Ash R."
        senderInitials="AR"
        onOpenThread={() => {}}
      />,
    );
    expect(screen.queryByText('Ash R.')).not.toBeInTheDocument();
  });

  it('renders a system pill for kind=system', () => {
    wrapInRouter(
      <MessageRow
        message={{ ...base, kind: 'system', text: 'Ash joined' }}
        showHead={false}
        senderName=""
        senderInitials=""
        onOpenThread={() => {}}
      />,
    );
    expect(screen.getByText('Ash joined')).toBeInTheDocument();
  });

  it('shows the thread chip when threadCount > 0 and inThread is false', async () => {
    const onOpenThread = vi.fn();
    const user = userEvent.setup();
    wrapInRouter(
      <MessageRow
        message={{ ...base, threadCount: 3 }}
        showHead={true}
        senderName="Ash"
        senderInitials="A"
        onOpenThread={onOpenThread}
      />,
    );
    const chip = screen.getByRole('button', { name: /3 replies/i });
    await user.click(chip);
    expect(onOpenThread).toHaveBeenCalledOnce();
  });

  it('hides the thread chip when inThread is true', () => {
    wrapInRouter(
      <MessageRow
        message={{ ...base, threadCount: 3 }}
        showHead={true}
        senderName="Ash"
        senderInitials="A"
        onOpenThread={() => {}}
        inThread={true}
      />,
    );
    expect(screen.queryByRole('button', { name: /replies/i })).not.toBeInTheDocument();
  });
});

describe('MessageRow — action strip', () => {
  it('renders the Reply in thread button (action strip present in DOM)', () => {
    wrapInRouter(
      <MessageRow
        message={base}
        showHead={true}
        senderName="Alice"
        senderInitials="AL"
        onOpenThread={() => {}}
        chatId="chat-1"
        myJid="4477@s.whatsapp.net"
      />,
    );
    expect(screen.getByTitle(/reply in thread/i)).toBeInTheDocument();
  });

  it('renders Edit button when message is own outbound', () => {
    wrapInRouter(
      <MessageRow
        message={{ ...base, senderJid: '4477@s.whatsapp.net' }}
        showHead={true}
        senderName="Me"
        senderInitials="ME"
        onOpenThread={() => {}}
        chatId="chat-1"
        myJid="4477@s.whatsapp.net"
      />,
    );
    expect(screen.getByTitle(/edit/i)).toBeInTheDocument();
  });

  it('shows (edited) suffix when editedAt is set', () => {
    wrapInRouter(
      <MessageRow
        message={{ ...base, editedAt: '2026-05-14T10:00:00.000Z' }}
        showHead={true}
        senderName="Alice"
        senderInitials="AL"
        onOpenThread={() => {}}
        chatId="chat-1"
        myJid="other@s.whatsapp.net"
      />,
    );
    expect(screen.getByText('(edited)')).toBeInTheDocument();
  });
});
