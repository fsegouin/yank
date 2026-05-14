import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDraftsStore } from '../state/drafts.js';
import { api, type Message } from '../api.js';
import { MessageRow } from './message-row.js';
import { Composer } from './composer.js';

export function ChatView({ chatId }: { chatId: string }) {
  const qc = useQueryClient();
  const messages = useQuery({
    queryKey: ['messages', chatId],
    queryFn: () => api.listMessages(chatId),
  });
  const chat = useQuery({ queryKey: ['chat', chatId], queryFn: () => api.getChat(chatId) });
  const draft = useDraftsStore((s) => s.drafts[chatId] ?? '');
  const setDraft = useDraftsStore((s) => s.setDraft);
  const clearDraft = useDraftsStore((s) => s.clearDraft);

  const send = useMutation({
    mutationFn: () => api.sendMessage(chatId, draft.trim()),
    onSuccess: (created) => {
      qc.setQueryData<Message[]>(['messages', chatId], (prev) => [...(prev ?? []), created]);
      clearDraft(chatId);
    },
  });

  return (
    <main className="pane">
      <div className="topbar">
        <div>
          <strong>{chat.data?.subject ?? chat.data?.jid ?? '…'}</strong>
        </div>
        <div
          style={{ color: 'var(--fg-2)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
        >
          {chat.data?.jid}
        </div>
      </div>
      <div className="messages">
        {messages.data?.map((m) => <MessageRow key={m.id} m={m} />)}
      </div>
      <Composer
        draft={draft}
        onChange={(v) => setDraft(chatId, v)}
        onSend={() => send.mutate()}
        disabled={send.isPending}
      />
    </main>
  );
}
