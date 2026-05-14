import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useDraftsStore } from '../../state/drafts.js';
import {
  BoldIcon,
  ItalicIcon,
  StrikeIcon,
  CodeIcon,
  LinkIcon,
  BlockquoteIcon,
  ListIcon,
  PaperclipIcon,
  EmojiIcon,
  MicIcon,
} from '../icons/index.js';
import styles from './Composer.module.css';

interface ComposerProps {
  chatId: string;
  onSend: (text: string) => void;
  placeholder?: string;
  inThread?: boolean;
}

export function Composer({
  chatId,
  onSend,
  placeholder = 'Message',
  inThread = false,
}: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const draft = useDraftsStore((s) => s.drafts[chatId] ?? '');
  const setDraft = useDraftsStore((s) => s.setDraft);
  const clearDraft = useDraftsStore((s) => s.clearDraft);

  useEffect(() => {
    ref.current?.focus();
  }, [chatId]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    clearDraft(chatId);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.composer}>
        {!inThread && (
          <div className={styles.toolbar}>
            <ToolbarBtn title="Bold · ⌘B">
              <BoldIcon size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Italic · ⌘I">
              <ItalicIcon size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Strikethrough">
              <StrikeIcon size={14} />
            </ToolbarBtn>
            <span className={styles.divider} />
            <ToolbarBtn title="Inline code">
              <CodeIcon size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Link">
              <LinkIcon size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Blockquote">
              <BlockquoteIcon size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="List">
              <ListIcon size={14} />
            </ToolbarBtn>
          </div>
        )}
        <textarea
          ref={ref}
          className={styles.input}
          rows={1}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(chatId, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className={styles.bar}>
          <ToolbarBtn title="Attach file">
            <PaperclipIcon size={15} />
          </ToolbarBtn>
          <ToolbarBtn title="Emoji">
            <EmojiIcon size={15} />
          </ToolbarBtn>
          <ToolbarBtn title="Voice note">
            <MicIcon size={15} />
          </ToolbarBtn>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.sendBtn}
            disabled={!draft.trim()}
            onClick={send}
          >
            <span>Send</span>
            <span className={styles.kbd}>↵</span>
          </button>
        </div>
      </div>
      {!inThread && (
        <div className={styles.hint}>
          <span>
            <span className={styles.kbd}>↵</span> send
          </span>
          <span>
            <span className={styles.kbd}>⇧↵</span> newline
          </span>
          <span>
            <span className={styles.kbd}>↑</span> edit last
          </span>
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <button type="button" className={styles.iconBtn} title={title} aria-label={title}>
      {children}
    </button>
  );
}
