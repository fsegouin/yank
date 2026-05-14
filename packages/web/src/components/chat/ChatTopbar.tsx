import type { Chat } from '@yank/shared';
import { Avatar } from '../primitives/Avatar.js';
import { PinIcon, SearchIcon, ThreadIcon, MoreIcon } from '../icons/index.js';
import styles from './ChatTopbar.module.css';

interface Props {
  chat: Chat;
  threadOpen: boolean;
  onToggleThread: () => void;
}

const WS_COLOR_VAR: Record<Chat['workspace'], string> = {
  work: 'var(--c-work)',
  personal: 'var(--c-personal)',
  triage: 'var(--c-triage)',
  hidden: 'var(--fg-3)',
};

export function ChatTopbar({ chat, threadOpen, onToggleThread }: Props) {
  const title = chat.subject ?? chat.jid;
  const isDm = chat.type === 'dm';
  return (
    <div className={styles.topbar}>
      <div className={styles.left}>
        <Avatar
          seed={chat.id}
          initials={title.slice(0, 2).toUpperCase()}
          size={36}
          square={!isDm}
        />
        <div className={styles.titleBox}>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.sub}>
            <span>{isDm ? 'Direct message' : `${chat.memberCount} members`}</span>
            <span className={styles.sep}>·</span>
            <span className="mono">{chat.jid}</span>
          </div>
        </div>
      </div>
      <div className={styles.actions}>
        <span className={styles.wsPill}>
          <span
            className={styles.wsDot}
            style={{ background: WS_COLOR_VAR[chat.workspace] }}
          />
          {chat.workspace}
        </span>
        <button type="button" className={styles.iconBtn} title="Pinned items">
          <PinIcon size={14} />
        </button>
        <button type="button" className={styles.iconBtn} title="Search this chat · ⌘F">
          <SearchIcon size={15} />
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${threadOpen ? styles.iconBtnActive : ''}`}
          title={threadOpen ? 'Close thread' : 'Threads in this chat'}
          onClick={onToggleThread}
        >
          <ThreadIcon size={15} />
        </button>
        <button type="button" className={styles.iconBtn} title="Details">
          <MoreIcon size={15} />
        </button>
      </div>
    </div>
  );
}
