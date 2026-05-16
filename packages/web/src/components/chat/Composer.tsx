import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Mention, MessagesPage } from '@yank/shared';
import { useDraftsStore } from '../../state/drafts.js';
import { useUiStore } from '../../state/ui.js';
import { useEditMessage } from '../../lib/mutations.js';
import { useChatMembers } from '../../lib/queries.js';
import { useMentionAutocomplete } from '../../hooks/useMentionAutocomplete.js';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys.js';
import { MentionPopover } from './MentionPopover.js';
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
  onSend: (text: string, mentions?: Mention[]) => void;
  placeholder?: string;
  inThread?: boolean;
}

function getCaretRect(textarea: HTMLTextAreaElement): DOMRect | null {
  // Best-effort: use the textarea's bounding rect top-left as anchor.
  // A precise per-character implementation would require a mirror div.
  const r = textarea.getBoundingClientRect();
  return new DOMRect(r.left, r.top, 0, 0);
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
  const editing = useUiStore((s) => s.editing);
  const setEditing = useUiStore((s) => s.setEditing);
  const isEditing = editing !== null && editing.chatId === chatId;
  const editMutation = useEditMessage(chatId, editing?.messageId ?? '');
  const qc = useQueryClient();
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const { data: chatData } = useChatMembers(chatId, !inThread);
  const mention = useMentionAutocomplete(chatData ?? []);

  // When entering edit mode, focus the textarea
  useEffect(() => {
    if (isEditing) ref.current?.focus();
  }, [isEditing, editing?.messageId]);

  useEffect(() => {
    if (!isEditing) ref.current?.focus();
  }, [chatId]);

  const sendNormal = () => {
    const text = draft.trim();
    if (!text) return;
    if (mention.mentions.length > 0) {
      onSend(text, mention.mentions);
    } else {
      onSend(text);
    }
    clearDraft(chatId);
    mention.reset();
    setAnchorRect(null);
  };

  const submitEdit = () => {
    if (!editing) return;
    const text = (ref.current?.value ?? '').trim();
    if (!text) return;
    editMutation.mutate({ text });
    setEditing(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    ref.current?.focus();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isEditing) {
      // In edit mode, update the editing text but don't run mention autocomplete
      if (editing) {
        setEditing({ ...editing, originalText: e.target.value });
      }
      return;
    }

    const { value, selectionStart } = e.target;
    setDraft(chatId, value);
    const result = mention.onTextChange(value, selectionStart ?? value.length);
    if (result.text !== value) {
      // commit() returned a new text (mention inserted)
      setDraft(chatId, result.text);
    }
    if (mention.query !== null && ref.current) {
      setAnchorRect(getCaretRect(ref.current));
    } else {
      setAnchorRect(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isEditing) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitEdit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
      return;
    }

    // Mention popover navigation (only when popover is open)
    if (mention.query !== null) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mention.selectNext();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        mention.selectPrev();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const selected = mention.filteredMembers[mention.selectedIndex];
        if (selected) {
          e.preventDefault();
          const { text, caret } = mention.commit(selected);
          setDraft(chatId, text);
          setAnchorRect(null);
          // Restore caret position after React re-render
          requestAnimationFrame(() => {
            if (ref.current) {
              ref.current.selectionStart = caret;
              ref.current.selectionEnd = caret;
            }
          });
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        mention.dismiss();
        setAnchorRect(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendNormal();
      return;
    }

    // ↑ in empty textarea enters edit mode on last own message
    if (e.key === 'ArrowUp' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const currentValue = (e.target as HTMLTextAreaElement).value;
      if (currentValue.length > 0) return;
      // Find last own outbound message with a waMessageId
      const data = qc.getQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
        queryKeys.messages(chatId),
      );
      if (!data) return;
      const allMessages = data.pages.flatMap((p) => p.messages);
      // Reverse to find the most recent own outbound
      const lastOwn = [...allMessages]
        .reverse()
        .find((m) => m.senderJid === 'me' && m.waMessageId != null && !m.deletedAt);
      if (!lastOwn) return;
      e.preventDefault();
      setEditing({ messageId: lastOwn.id, originalText: lastOwn.text ?? '', chatId });
    }
  };

  const handleSelect = (member: (typeof mention.filteredMembers)[number]) => {
    const { text, caret } = mention.commit(member);
    setDraft(chatId, text);
    setAnchorRect(null);
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.selectionStart = caret;
        ref.current.selectionEnd = caret;
        ref.current.focus();
      }
    });
  };

  return (
    <div className={styles.wrap}>
      {isEditing && (
        <div className={styles.editBanner}>
          <span>Editing — Esc to cancel</span>
        </div>
      )}
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
          placeholder={isEditing ? 'Edit message…' : placeholder}
          value={isEditing ? (editing?.originalText ?? '') : draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
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
            disabled={isEditing ? !(editing?.originalText ?? '').trim() : !draft.trim()}
            onClick={isEditing ? submitEdit : sendNormal}
          >
            <span>{isEditing ? 'Save' : 'Send'}</span>
            <span className={styles.kbd}>↵</span>
          </button>
        </div>
      </div>
      {!inThread && !isEditing && (
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
      <MentionPopover
        members={mention.filteredMembers}
        selectedIndex={mention.selectedIndex}
        onSelect={handleSelect}
        anchorRect={mention.query !== null ? anchorRect : null}
      />
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
