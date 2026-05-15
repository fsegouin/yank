import { useEffect, useMemo } from 'react';
import type { Message } from '@yank/shared';
import { MessageRow } from './Message.js';
import { useAutoScroll } from '../../hooks/useAutoScroll.js';
import { useMessages, useChat, useChatMembers } from '../../lib/queries.js';
import styles from './MessageList.module.css';

interface Props {
  chatId: string;
  onOpenThread: (messageId: string) => void;
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export function MessageList({ chatId, onOpenThread }: Props) {
  const { data, fetchNextPage, hasNextPage, isFetching } = useMessages(chatId);
  const { data: chat } = useChat(chatId);
  const { data: members } = useChatMembers(chatId, chat?.type !== 'dm');

  // Flatten and reverse pages so oldest-first appears at top.
  const messages = useMemo<Message[]>(() => {
    if (!data) return [];
    const all = data.pages.flatMap((p) => p.messages);
    return [...all].reverse();
  }, [data]);

  // jid → display name lookup. Empty for DMs (members is undefined when disabled).
  const nameByJid = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members ?? []) map.set(m.jid, m.displayName ?? m.jid);
    return map;
  }, [members]);

  const ref = useAutoScroll<HTMLDivElement>(chatId, messages.length);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop < 80 && hasNextPage && !isFetching) {
        void fetchNextPage();
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref, hasNextPage, isFetching, fetchNextPage]);

  return (
    <div className={styles.list} ref={ref}>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay =
          !prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString();
        const showHead =
          newDay ||
          !prev ||
          prev.senderJid !== m.senderJid ||
          new Date(m.ts).getTime() - new Date(prev.ts).getTime() > 4 * 60_000;
        const displayName = m.senderName ?? nameByJid.get(m.senderJid) ?? m.senderJid;
        return (
          <div key={m.id}>
            {newDay && (
              <div className={styles.divider}>
                <span className={styles.pill}>{fmtDay(m.ts)}</span>
              </div>
            )}
            <MessageRow
              message={m}
              showHead={showHead}
              senderName={displayName}
              senderInitials={displayName.slice(0, 2).toUpperCase()}
              onOpenThread={() => onOpenThread(m.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
