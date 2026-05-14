import type { Chat } from '@yank/shared';
import { avatarGradient } from '../../utils/avatarGradient.js';
import { PinIcon, MutedIcon } from '../icons/index.js';
import styles from './ChatRow.module.css';

interface ChatRowProps {
  chat: Chat;
  active: boolean;
  onClick: () => void;
}

export function ChatRow({ chat, active, onClick }: ChatRowProps) {
  const title = chat.subject ?? chat.jid;
  const seed = chat.type === 'dm' ? title : chat.id;
  const muted = chat.mutedUntil !== null && new Date(chat.mutedUntil) > new Date();
  return (
    <button
      type="button"
      className={
        styles.row +
        (active ? ' ' + styles.active : '') +
        (chat.unreadCount > 0 ? ' ' + styles.unread : '')
      }
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
    >
      <span
        className={`${styles.icon} ${chat.type === 'dm' ? styles.iconDm : ''} ${avatarGradient(seed)}`}
      >
        {title.slice(0, 2).toUpperCase()}
      </span>
      <span className={styles.titleSlot}>
        <span className={styles.title}>{title}</span>
      </span>
      <span className={styles.meta}>
        {chat.pinned && (
          <span className={styles.pin}>
            <PinIcon size={11} />
          </span>
        )}
        {muted && (
          <span className={styles.mute}>
            <MutedIcon size={12} />
          </span>
        )}
        {chat.unreadCount > 0 && (
          <span className={styles.badge + (muted ? ' ' + styles.badgeMuted : '')}>
            {chat.unreadCount}
          </span>
        )}
      </span>
    </button>
  );
}
