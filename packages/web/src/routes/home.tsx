import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { api } from '../api.js';
import { Shell } from '../components/shell.js';
import { ChatList } from '../components/chat-list.js';
import { ChatView } from '../components/chat-view.js';
import { useYankEvents } from '../sse.js';

export function Home() {
  useYankEvents();
  const chats = useQuery({ queryKey: ['chats'], queryFn: api.listChats });
  const navigate = useNavigate();

  useEffect(() => {
    if (chats.data && chats.data.length > 0) {
      navigate({ to: '/c/$chatId', params: { chatId: chats.data[0]!.id }, replace: true });
    }
  }, [chats.data, navigate]);

  return (
    <Shell activeChatId={null}>
      <ChatList activeChatId={null} />
      <main className="pane">
        <div className="topbar">
          <strong>Yank</strong>
        </div>
        <div className="messages">
          {chats.isLoading && <div style={{ color: 'var(--fg-2)' }}>Loading…</div>}
          {chats.data && chats.data.length === 0 && (
            <div style={{ color: 'var(--fg-2)' }}>
              No chats yet. <a href="/setup">Link your WhatsApp</a> to sync history.
            </div>
          )}
        </div>
      </main>
    </Shell>
  );
}

export function ChatRoute() {
  useYankEvents();
  const { chatId } = useParams({ from: '/c/$chatId' });
  return (
    <Shell activeChatId={chatId}>
      <ChatList activeChatId={chatId} />
      <ChatView chatId={chatId} />
    </Shell>
  );
}
