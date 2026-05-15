import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useUiStore } from '../../state/ui.js';
import { useChats } from '../../lib/queries.js';
import {
  HashIcon,
  AtIcon,
  SearchIcon,
  InboxIcon,
  ActivityIcon,
  SettingsIcon,
} from '../icons/index.js';
import styles from './CommandPalette.module.css';

type Item =
  | {
      kind: 'jump';
      id: string;
      label: string;
      meta: string;
      chatId: string;
      type: 'dm' | 'group' | 'community' | 'newsletter';
    }
  | {
      kind: 'action';
      id: string;
      label: string;
      href: '/triage' | '/search' | '/diagnostics' | '/settings';
      kbd?: string;
    };

interface CommandPaletteProps {
  mode?: 'chats-only';
}

export function CommandPalette({ mode }: CommandPaletteProps = {}) {
  const navigate = useNavigate();
  const togglePalette = useUiStore((s) => s.togglePalette);
  const { data: chats = [] } = useChats();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<Item[]>(() => {
    const jumpItems: Item[] = chats
      .filter((c) => c.workspace !== 'hidden')
      .map((c) => ({
        kind: 'jump',
        id: `j-${c.id}`,
        chatId: c.id,
        type: c.type,
        label: c.subject ?? c.jid,
        meta: `${c.workspace}${c.unreadCount ? ` · ${c.unreadCount} unread` : ''}`,
      }));
    const actions: Item[] =
      mode === 'chats-only'
        ? []
        : [
            { kind: 'action', id: 'a-triage', label: 'Open Triage', href: '/triage', kbd: '⌘3' },
            { kind: 'action', id: 'a-search', label: 'Global search…', href: '/search', kbd: '⌘⇧F' },
            { kind: 'action', id: 'a-diag', label: 'Open diagnostics', href: '/diagnostics' },
            { kind: 'action', id: 'a-settings', label: 'Open settings', href: '/settings' },
          ];
    const lower = q.toLowerCase();
    return [...jumpItems, ...actions].filter((it) => it.label.toLowerCase().includes(lower));
  }, [chats, q, mode]);

  const run = (it: Item) => {
    if (it.kind === 'jump') {
      void navigate({ to: '/c/$chatId', params: { chatId: it.chatId } });
    } else {
      void navigate({ to: it.href });
    }
    togglePalette(false);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      togglePalette(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = items[active];
      if (target) run(target);
    }
  };

  return (
    <div
      className="scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) togglePalette(false);
      }}
    >
      <div className={styles.palette}>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder={mode === 'chats-only' ? 'Jump to chat…' : 'Jump to chat, run command…'}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
        <div className={styles.list} role="listbox">
          {items.length === 0 && <div className={styles.empty}>No matches</div>}
          {items.map((it, i) => (
            <div
              key={it.id}
              className={styles.item + (i === active ? ' ' + styles.active : '')}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(it)}
              role="option"
              aria-selected={i === active}
            >
              <span className={styles.icon}>
                {it.kind === 'jump' &&
                  (it.type === 'dm' ? <AtIcon size={13} /> : <HashIcon size={13} />)}
                {it.kind === 'action' && it.id === 'a-triage' && <InboxIcon size={13} />}
                {it.kind === 'action' && it.id === 'a-search' && <SearchIcon size={13} />}
                {it.kind === 'action' && it.id === 'a-diag' && <ActivityIcon size={13} />}
                {it.kind === 'action' && it.id === 'a-settings' && <SettingsIcon size={13} />}
              </span>
              <span>{it.label}</span>
              {it.kind === 'jump' && <span className={styles.meta}>{it.meta}</span>}
              {it.kind === 'action' && it.kbd && <span className={styles.kbd}>{it.kbd}</span>}
            </div>
          ))}
        </div>
        <div className={styles.foot}>
          <span>
            <span className={styles.kbd}>↑</span> <span className={styles.kbd}>↓</span> navigate
          </span>
          <span>
            <span className={styles.kbd}>↵</span> open
          </span>
          <span>
            <span className={styles.kbd}>esc</span> close
          </span>
        </div>
      </div>
    </div>
  );
}
