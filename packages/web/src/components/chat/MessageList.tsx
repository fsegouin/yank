import { useEffect, useMemo, useRef } from 'react';
import type { Message } from '@yank/shared';
import { MessageRow } from './Message.js';
import { useAutoScroll } from '../../hooks/useAutoScroll.js';
import { useMessages, useChat, useChatMembers } from '../../lib/queries.js';
import { useMarkRead } from '../../lib/mutations.js';
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
  const markRead = useMarkRead(chatId);

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

  const lastReadTs = chat?.lastReadTs ?? null;
  const lastReadMessageId = chat?.lastReadMessageId ?? null;

  // Index of the first message after the last-read boundary.
  const firstUnreadIdx = useMemo(() => {
    if (!lastReadTs) return -1;
    const idx = messages.findIndex(
      (m) => m.ts > lastReadTs && m.id !== lastReadMessageId,
    );
    // Suppress the divider when it would land at the very top of the loaded
    // window — it then looks like a "header" rather than a useful boundary.
    // The sidebar unread badge still surfaces that the chat has new messages.
    if (idx === 0) return -1;
    return idx;
  }, [messages, lastReadTs, lastReadMessageId]);
  const unreadCount = firstUnreadIdx >= 0 ? messages.length - firstUnreadIdx : 0;

  const firstUnread = firstUnreadIdx >= 0 ? messages[firstUnreadIdx] : undefined;
  const anchorId = firstUnread ? `unread-divider-${firstUnread.id}` : null;

  const ref = useAutoScroll<HTMLDivElement>(chatId, messages.length, anchorId);

  // Visibility-based mark-read. Track the newest message that becomes visible,
  // debounce 500ms after the last visibility change, then fire mark-read.
  const candidateRef = useRef<{ id: string; ts: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          const id = target.dataset.messageId;
          const ts = target.dataset.ts;
          if (!id || !ts) continue;
          // Only advance past current read state.
          if (lastReadTs && ts <= lastReadTs) continue;
          if (lastReadMessageId === id) continue;
          if (!candidateRef.current || ts > candidateRef.current.ts) {
            candidateRef.current = { id, ts };
          }
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const c = candidateRef.current;
          candidateRef.current = null;
          if (!c) return;
          markRead.mutate(c.id);
        }, 500);
      },
      { root: el, threshold: 0.5 },
    );
    const rows = el.querySelectorAll('[data-message-id]');
    rows.forEach((row) => obs.observe(row));
    return () => {
      obs.disconnect();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // markRead is a stable mutation handle; intentionally include for lint correctness.
  }, [chatId, messages.length, lastReadTs, lastReadMessageId, markRead, ref]);

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
        const isFirstUnread = i === firstUnreadIdx;
        return (
          <div key={m.id}>
            {newDay && (
              <div className={styles.divider}>
                <span className={styles.pill}>{fmtDay(m.ts)}</span>
              </div>
            )}
            {isFirstUnread && (
              <div id={`unread-divider-${m.id}`} className={styles.unreadDivider}>
                <span className={styles.unreadLabel}>
                  {unreadCount} new message{unreadCount === 1 ? '' : 's'}
                </span>
              </div>
            )}
            <div data-message-id={m.id} data-ts={m.ts}>
              <MessageRow
                message={m}
                showHead={showHead}
                senderName={displayName}
                senderInitials={displayName.slice(0, 2).toUpperCase()}
                onOpenThread={() => onOpenThread(m.id)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
