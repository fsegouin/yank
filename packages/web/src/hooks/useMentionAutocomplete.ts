import { useState, useCallback } from 'react';
import type { ChatMember, Mention } from '@yank/shared';

// Matches @ preceded by start-of-string or whitespace, followed by word chars up to caret.
// Returns the query string (possibly empty) or null if not in a mention context.
function detectMentionAt(text: string, caret: number): { query: string; atIdx: number } | null {
  const before = text.slice(0, caret);
  // Walk backward from caret to find the most recent @
  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return null;
  // The character before @ must be a space, newline, or the start of the string
  if (atIdx > 0) {
    const charBefore = before[atIdx - 1];
    if (charBefore !== ' ' && charBefore !== '\n') return null;
  }
  const fragment = before.slice(atIdx + 1);
  // Only match word chars (letters, digits, underscores, spaces allowed in display names)
  if (!/^[\w\s]*$/.test(fragment)) return null;
  return { query: fragment, atIdx };
}

export interface MentionAutocompleteState {
  query: string | null;
  selectedIndex: number;
  mentions: Mention[];
  filteredMembers: ChatMember[];
  onTextChange(text: string, caretPos: number): { text: string; caret: number; mentions: Mention[] };
  selectNext(): void;
  selectPrev(): void;
  commit(member: ChatMember): { text: string; caret: number };
  dismiss(): void;
  reset(): void;
}

export function useMentionAutocomplete(members: ChatMember[]): MentionAutocompleteState {
  const [query, setQuery] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentions, setMentions] = useState<Mention[]>([]);
  // The position in the textarea where the current @ token started (index of @)
  const [atStart, setAtStart] = useState<number>(0);
  // Track the current text so commit() can do the replacement
  const [currentText, setCurrentText] = useState('');

  const filteredMembers: ChatMember[] =
    query === null
      ? []
      : members
          .filter((m) => {
            if (query === '') return true;
            const name = m.displayName ?? '';
            return name.toLowerCase().includes(query.toLowerCase());
          })
          .slice(0, 8);

  const onTextChange = useCallback(
    (text: string, caretPos: number): { text: string; caret: number; mentions: Mention[] } => {
      setCurrentText(text);
      const detected = detectMentionAt(text, caretPos);
      if (detected === null) {
        setQuery(null);
        setSelectedIndex(0);
        return { text, caret: caretPos, mentions };
      }
      setAtStart(detected.atIdx);
      setQuery(detected.query);
      setSelectedIndex(0);
      return { text, caret: caretPos, mentions };
    },
    [mentions],
  );

  const commit = useCallback(
    (member: ChatMember): { text: string; caret: number } => {
      const displayLabel = member.displayName ?? 'Unknown (lid)';
      const insertText = `@${displayLabel} `;
      // Replace from atStart through atStart+1+query.length
      const q = query ?? '';
      const replaceEnd = atStart + 1 + q.length;
      const before = currentText.slice(0, atStart);
      const after = currentText.slice(replaceEnd);
      const newText = before + insertText + after;
      const newCaret = atStart + insertText.length;
      const mention: Mention = {
        start: atStart,
        end: atStart + insertText.length - 1, // excludes trailing space
        jid: member.jid,
      };
      setMentions((prev) => [...prev, mention]);
      setQuery(null);
      setSelectedIndex(0);
      setCurrentText(newText);
      return { text: newText, caret: newCaret };
    },
    [currentText, atStart, query],
  );

  const selectNext = useCallback(() => {
    setSelectedIndex((i) => Math.min(i + 1, filteredMembers.length - 1));
  }, [filteredMembers.length]);

  const selectPrev = useCallback(() => {
    setSelectedIndex((i) => Math.max(i - 1, 0));
  }, []);

  const dismiss = useCallback(() => {
    setQuery(null);
    setSelectedIndex(0);
  }, []);

  const reset = useCallback(() => {
    setMentions([]);
    setQuery(null);
    setSelectedIndex(0);
    setCurrentText('');
  }, []);

  return {
    query,
    selectedIndex,
    mentions,
    filteredMembers,
    onTextChange,
    selectNext,
    selectPrev,
    commit,
    dismiss,
    reset,
  };
}
