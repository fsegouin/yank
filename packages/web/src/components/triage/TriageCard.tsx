import type { Chat, Workspace } from '@yank/shared';
import { avatarGradient } from '../../utils/avatarGradient.js';
import styles from './TriageCard.module.css';

interface TriageCardProps {
  chat: Chat;
  focused: boolean;
  onAssign: (workspace: Workspace) => void;
}

function initials(subject: string | null, jid: string): string {
  const name = subject ?? jid;
  return name.slice(0, 2).toUpperCase();
}

export function TriageCard({ chat, focused, onAssign }: TriageCardProps) {
  const label = chat.subject ?? chat.jid;
  const ts = chat.lastMessageAt
    ? new Date(chat.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      className={styles.card}
      data-focused={focused ? 'true' : 'false'}
      role="article"
      aria-label={label}
    >
      <div className={`${styles.avatar} ${avatarGradient(label)}`}>
        {initials(chat.subject, chat.jid)}
      </div>

      <div className={styles.body}>
        <div className={styles.header}>
          <span className={styles.who}>{label}</span>
          {ts && <span className={styles.whoMeta}>· {ts}</span>}
        </div>
        {chat.lastMessagePreview && (
          <div className={styles.preview}>{chat.lastMessagePreview}</div>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnWork}`}
          onClick={(e) => {
            e.stopPropagation();
            onAssign('work');
          }}
        >
          <span className={styles.dot} style={{ background: 'var(--c-work)' }} />
          Work
          <span className={styles.kbd}>1</span>
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPersonal}`}
          onClick={(e) => {
            e.stopPropagation();
            onAssign('personal');
          }}
        >
          <span className={styles.dot} style={{ background: 'var(--c-personal)' }} />
          Personal
          <span className={styles.kbd}>2</span>
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnHide}`}
          onClick={(e) => {
            e.stopPropagation();
            onAssign('hidden');
          }}
        >
          <span className={styles.dot} style={{ background: 'var(--fg-3)' }} />
          Hide
          <span className={styles.kbd}>3</span>
        </button>
      </div>
    </div>
  );
}
