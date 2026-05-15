import { useState } from 'react';
import type { Chat, Workspace } from '@yank/shared';
import { Avatar } from '../primitives/Avatar.js';
import { PinIcon, SearchIcon, ThreadIcon, MoreIcon } from '../icons/index.js';
import { useAssignWorkspace } from '../../lib/mutations.js';
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

const WORKSPACE_OPTIONS: { value: Workspace; label: string }[] = [
  { value: 'work', label: 'Work' },
  { value: 'personal', label: 'Personal' },
  { value: 'triage', label: 'Triage' },
  { value: 'hidden', label: 'Hidden' },
];

export function ChatTopbar({ chat, threadOpen, onToggleThread }: Props) {
  const title = chat.subject ?? chat.jid;
  const isDm = chat.type === 'dm';
  const [pickerOpen, setPickerOpen] = useState(false);
  const assign = useAssignWorkspace(chat.id);
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
        <div className={styles.wsPillWrap}>
          <button
            type="button"
            className={styles.wsPill}
            onClick={() => setPickerOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={pickerOpen}
            title="Change workspace"
          >
            <span
              className={styles.wsDot}
              style={{ background: WS_COLOR_VAR[chat.workspace] }}
            />
            {chat.workspace}
          </button>
          {pickerOpen && (
            <div
              className={styles.wsMenu}
              role="menu"
              onMouseLeave={() => setPickerOpen(false)}
            >
              {WORKSPACE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitem"
                  className={
                    styles.wsMenuItem +
                    (opt.value === chat.workspace ? ' ' + styles.wsMenuItemActive : '')
                  }
                  onClick={() => {
                    assign.mutate(
                      { workspace: opt.value },
                      { onSuccess: () => setPickerOpen(false) },
                    );
                  }}
                  disabled={assign.isPending}
                >
                  <span
                    className={styles.wsDot}
                    style={{ background: WS_COLOR_VAR[opt.value] }}
                  />
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
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
