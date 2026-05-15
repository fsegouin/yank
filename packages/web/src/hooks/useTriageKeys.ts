import { useEffect, useState } from 'react';
import type { Chat } from '@yank/shared';
import { useAssignWorkspace } from '../lib/mutations.js';

export interface UseTriageKeysResult {
  focusedIdx: number;
  setFocusedIdx: (idx: number) => void;
}

/**
 * Route-scoped keyboard handler for the Triage view.
 * Accepts the current triage chat list so navigation bounds are always current.
 * The calling component must pass a stable-reference list (e.g. from useTriageChats()).
 *
 * Key bindings:
 *   j / ArrowDown  — move focus down
 *   k / ArrowUp    — move focus up
 *   1              — assign focused to 'work'
 *   2              — assign focused to 'personal'
 *   3              — assign focused to 'hidden'
 *
 * Cmd-Z is handled by <UndoToast> globally — no duplicate binding here.
 */
export function useTriageKeys(chats: Chat[]): UseTriageKeysResult {
  const [focusedIdx, setFocusedIdx] = useState(0);

  // Per-chat assignment mutation. We need a stable function reference that
  // reads the current focused chat's id. Use a synthetic "current chat" id
  // approach: instantiate the hook with the focused chat's id each render.
  // Because hooks can't be called conditionally, we derive the focused chat
  // before calling useAssignWorkspace and use a single mutation instance that
  // we update via the mutate function.
  const focusedChat = chats[focusedIdx] ?? null;
  const assignMutation = useAssignWorkspace(focusedChat?.id ?? '');

  useEffect(() => {
    // Clamp focusedIdx when list shrinks.
    if (chats.length === 0) {
      setFocusedIdx(0);
      return;
    }
    setFocusedIdx((i) => Math.min(i, chats.length - 1));
  }, [chats.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in an input / textarea / contenteditable.
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (chats.length === 0) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(i + 1, chats.length - 1));
        return;
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(i - 1, 0));
        return;
      }

      const focused = chats[focusedIdx];
      if (!focused) return;

      if (e.key === '1') {
        assignMutation.mutate({ workspace: 'work', suppressUndo: false });
        return;
      }
      if (e.key === '2') {
        assignMutation.mutate({ workspace: 'personal', suppressUndo: false });
        return;
      }
      if (e.key === '3') {
        assignMutation.mutate({ workspace: 'hidden', suppressUndo: false });
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [chats, focusedIdx, assignMutation]);

  return { focusedIdx, setFocusedIdx };
}
