import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useChatsForWorkspace } from '../../lib/queries.js';
import { useUiStore } from '../../state/ui.js';
import { ChatRow } from './ChatRow.js';
import { PhoneStatusFoot } from './PhoneStatusFoot.js';
import { SearchIcon, ChevronDownIcon, PlusIcon, MoreIcon } from '../icons/index.js';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const workspace = useUiStore((s) => s.workspace);
  const togglePalette = useUiStore((s) => s.togglePalette);
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { chatId?: string };
  const activeChatId = params.chatId;
  const wsChats = useChatsForWorkspace(workspace);

  const { pinned, groups, dms } = useMemo(
    () => ({
      pinned: wsChats.filter((c) => c.pinned),
      groups: wsChats.filter((c) => !c.pinned && c.type !== 'dm'),
      dms: wsChats.filter((c) => !c.pinned && c.type === 'dm'),
    }),
    [wsChats],
  );

  const title = workspace === 'work' ? 'Work' : workspace === 'personal' ? 'Personal' : 'Triage';

  return (
    <aside className={styles.sidebar}>
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{title}</h2>
          <span className={styles.chev}>
            <ChevronDownIcon size={10} />
          </span>
          <div className={styles.actions}>
            <button type="button" className={styles.iconBtn} title="New message">
              <PlusIcon size={14} />
            </button>
            <button type="button" className={styles.iconBtn} title="More">
              <MoreIcon size={14} />
            </button>
          </div>
        </div>
        <button type="button" className={styles.search} onClick={() => togglePalette(true)}>
          <SearchIcon size={13} />
          <span className={styles.searchPlaceholder}>
            Jump to or search {title.toLowerCase()}…
          </span>
          <span className={styles.kbd}>⌘K</span>
        </button>
      </div>

      <div className={styles.scroll}>
        {pinned.length > 0 && (
          <Section label="Pinned" count={pinned.length}>
            {pinned.map((c) => (
              <ChatRow
                key={c.id}
                chat={c}
                active={c.id === activeChatId}
                onClick={() => void navigate({ to: '/c/$chatId', params: { chatId: c.id } })}
              />
            ))}
          </Section>
        )}
        {groups.length > 0 && (
          <Section label="Group chats" count={groups.length} addable>
            {groups.map((c) => (
              <ChatRow
                key={c.id}
                chat={c}
                active={c.id === activeChatId}
                onClick={() => void navigate({ to: '/c/$chatId', params: { chatId: c.id } })}
              />
            ))}
          </Section>
        )}
        {dms.length > 0 && (
          <Section label="Direct messages" count={dms.length} addable>
            {dms.map((c) => (
              <ChatRow
                key={c.id}
                chat={c}
                active={c.id === activeChatId}
                onClick={() => void navigate({ to: '/c/$chatId', params: { chatId: c.id } })}
              />
            ))}
          </Section>
        )}
      </div>

      <PhoneStatusFoot phoneNumber={null} syncedAgo="—" connected={true} />
    </aside>
  );
}

interface SectionProps {
  label: string;
  count: number;
  addable?: boolean;
  children: ReactNode;
}

function Section({ label, count, addable, children }: SectionProps) {
  return (
    <>
      <div className={styles.section}>
        <span className={styles.sectionChev}>
          <ChevronDownIcon size={9} />
        </span>
        {label}
        <span className={styles.sectionCount}>{count}</span>
        {addable && (
          <button type="button" className={styles.sectionAdd} title={`Add to ${label}`}>
            <PlusIcon size={11} />
          </button>
        )}
      </div>
      <div className={styles.list}>{children}</div>
    </>
  );
}
