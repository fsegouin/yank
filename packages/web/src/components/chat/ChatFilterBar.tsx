import { useRef, useEffect } from 'react';
import type { Message } from '@yank/shared';
import { useUiStore } from '../../state/ui.js';
import { useChatFilter } from '../../hooks/useChatFilter.js';
import { XIcon } from '../icons/index.js';
import styles from './ChatFilterBar.module.css';

interface Props {
  chatId: string;
  messages: Message[];
}

export function ChatFilterBar({ chatId: _chatId, messages }: Props) {
  const chatFilter = useUiStore((s) => s.chatFilter);
  const setChatFilter = useUiStore((s) => s.setChatFilter);
  const inputRef = useRef<HTMLInputElement>(null);

  const { hits } = useChatFilter(chatFilter.query, messages, chatFilter.hitIndex);
  const safeIndex = hits.length > 0 ? chatFilter.hitIndex % hits.length : 0;
  const displayIndex = hits.length > 0 ? safeIndex + 1 : 0;

  useEffect(() => {
    if (chatFilter.open) inputRef.current?.focus();
  }, [chatFilter.open]);

  if (!chatFilter.open) return null;

  const advance = () => {
    if (hits.length === 0) return;
    setChatFilter({ hitIndex: (safeIndex + 1) % hits.length });
  };

  const retreat = () => {
    if (hits.length === 0) return;
    setChatFilter({ hitIndex: (safeIndex - 1 + hits.length) % hits.length });
  };

  const close = () => {
    setChatFilter({ open: false, query: '', hitIndex: 0 });
  };

  return (
    <div className={styles.bar} role="search">
      <input
        ref={inputRef}
        className={styles.input}
        placeholder="Search messages…"
        value={chatFilter.query}
        onChange={(e) => setChatFilter({ query: e.target.value, hitIndex: 0 })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); advance(); }
          if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); retreat(); }
          if (e.key === 'Escape') { e.preventDefault(); close(); }
        }}
      />
      <span className={styles.count}>
        {displayIndex} of {hits.length}
      </span>
      <button
        type="button"
        className={styles.navBtn}
        title="Previous match · Shift-Enter"
        onClick={retreat}
      >
        &lt;
      </button>
      <button
        type="button"
        className={styles.navBtn}
        title="Next match · Enter"
        onClick={advance}
      >
        &gt;
      </button>
      <button
        type="button"
        className={styles.closeBtn}
        title="Close · Esc"
        onClick={close}
        aria-label="Close filter bar"
      >
        <XIcon size={12} />
      </button>
    </div>
  );
}
