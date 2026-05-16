import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { TriageView } from '../../../src/components/triage/TriageView.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const USER = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';

function makeChat(id: string, workspace: string, subject: string) {
  return {
    id,
    userId: USER,
    jid: `${id}@s.whatsapp.net`,
    type: 'dm' as const,
    subject,
    lastMessageAt: '2026-05-15T10:00:00.000Z',
    lastMessagePreview: 'Hey',
    archived: false,
    mutedUntil: null,
    pinned: false,
    workspace,
    memberCount: 0,
    unreadCount: 0,
    lastReadMessageId: null,
    lastReadTs: null,
  };
}

function renderView(chats: ReturnType<typeof makeChat>[]) {
  server.use(http.get('/api/chats', () => HttpResponse.json(chats)));
  server.use(
    http.post(/\/api\/chats\/.*\/assignment/, () => new HttpResponse(null, { status: 204 })),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TriageView />
    </QueryClientProvider>,
  );
}

describe('TriageView', () => {
  it('renders triage cards for chats in triage workspace', async () => {
    renderView([
      makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'triage', 'Alice'),
      makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000002', 'work', 'Bob'),
    ]);
    // DM chats render the name in an InlineRename input — use getByDisplayValue
    await waitFor(() => screen.getByDisplayValue('Alice'));
    expect(screen.queryByDisplayValue('Bob')).not.toBeInTheDocument();
  });

  it('renders empty state when no triage chats', async () => {
    renderView([makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'work', 'Work Only')]);
    await waitFor(() => screen.getByText('Triage clear'));
  });

  it('renders progress bar when there are triage chats', async () => {
    renderView([makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'triage', 'Alice')]);
    await waitFor(() => screen.getByText(/cleared/));
  });

  it('clicking Work on a card triggers assignment mutation', async () => {
    const user = userEvent.setup();
    renderView([makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'triage', 'Alice')]);
    // DM chats render the name in an InlineRename input — use getByDisplayValue
    await waitFor(() => screen.getByDisplayValue('Alice'));
    await user.click(screen.getByRole('button', { name: /work/i }));
    // Optimistic patch moves chat out of triage — empty state appears
    await waitFor(() => screen.getByText('Triage clear'));
  });
});
