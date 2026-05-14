import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { api, type Chat } from '../api.js';

export function ChatList({ activeChatId }: { activeChatId: string | null }) {
  const chats = useQuery({ queryKey: ['chats'], queryFn: api.listChats });
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <strong>Chats</strong>
      </div>
      <div className="sidebar-list">
        {chats.data?.map((c: Chat) => (
          <Link
            key={c.id}
            to="/c/$chatId"
            params={{ chatId: c.id }}
            className={'chat-row' + (activeChatId === c.id ? ' active' : '')}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="title">{c.subject ?? c.jid}</div>
              <div className="preview">{c.lastMessagePreview ?? '—'}</div>
            </div>
          </Link>
        ))}
        {chats.data && chats.data.length === 0 && (
          <div style={{ padding: 14, color: 'var(--fg-2)', fontSize: 13 }}>No chats yet.</div>
        )}
      </div>
    </aside>
  );
}
