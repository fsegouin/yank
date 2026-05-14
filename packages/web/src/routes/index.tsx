import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { ChatSchema } from '@yank/shared';
import { useUiStore } from '../state/ui.js';
import { apiFetch } from '../lib/api.js';

const ChatListSchema = z.array(ChatSchema);

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const workspace = useUiStore.getState().workspace;
    const raw = await apiFetch<unknown>('/api/chats');
    const chats = ChatListSchema.parse(raw);
    const active = chats
      .filter((c) => c.workspace === workspace)
      .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))[0];
    if (active) throw redirect({ to: '/c/$chatId', params: { chatId: active.id } });
    if (workspace === 'triage') throw redirect({ to: '/triage' });
  },
  component: EmptyState,
});

function EmptyState() {
  const workspace = useUiStore((s) => s.workspace);
  return (
    <main style={{ display: 'grid', placeItems: 'center', color: 'var(--fg-2)' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 16, color: 'var(--fg-0)' }}>No chats in {workspace}</h2>
        <p style={{ fontSize: 13 }}>New chats appear in Triage first.</p>
      </div>
    </main>
  );
}
