import { useEffect } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '../state/ui.js';
import { useMarkRead } from '../lib/mutations.js';
import { queryKeys } from '../lib/queryKeys.js';
import type { MessagesPage } from '@yank/shared';

/**
 * Wires Cmd+K, Cmd+1/2/3, Cmd+Shift+F, Esc. Mount once at the root.
 * The Esc handler runs only when something is open (palette or thread);
 * otherwise it lets the event through to a route-local handler.
 */
export function useKeyboardShortcuts(): void {
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const togglePalette = useUiStore((s) => s.togglePalette);
  const openPalette = useUiStore((s) => s.openPalette);
  const setWorkspace = useUiStore((s) => s.setWorkspace);
  const openThreadId = useUiStore((s) => s.openThreadId);
  const closeThread = useUiStore((s) => s.closeThread);
  const paletteOpen = useUiStore((s) => s.paletteOpen);
  const setChatFilter = useUiStore((s) => s.setChatFilter);
  const currentChatId = useUiStore((s) => s.currentChatId);
  const markRead = useMarkRead(currentChatId ?? '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      const tag = target instanceof HTMLElement ? target.tagName : '';
      const inEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (target instanceof HTMLElement && target.isContentEditable);

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'k' && !e.shiftKey) {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (mod && e.key.toLowerCase() === 't' && !e.shiftKey) {
        e.preventDefault();
        openPalette('chats-only');
        return;
      }
      if (mod && !e.shiftKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault();
        const ws = e.key === '1' ? 'work' : e.key === '2' ? 'personal' : 'triage';
        setWorkspace(ws);
        if (ws === 'triage') {
          void navigate({ to: '/triage' });
        } else {
          void navigate({ to: '/' });
        }
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setChatFilter({ open: true });
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        void navigate({ to: '/search' });
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (!currentChatId) return;
        const data = qc.getQueryData<{ pages: MessagesPage[] }>(
          queryKeys.messages(currentChatId),
        );
        const pages = data?.pages ?? [];
        const allMessages = pages.flatMap((p) => p.messages);
        const last = allMessages[0]; // pages are newest-first (page 0 = newest)
        if (last) markRead.mutate(last.id);
        return;
      }
      if (e.key === 'Escape' && !inEditable) {
        if (paletteOpen) {
          togglePalette(false);
          return;
        }
        if (openThreadId) {
          closeThread();
          // Drop the thread segment by navigating up one level.
          const match = router.state.matches.at(-1);
          if (match?.routeId?.includes('/t/')) {
            void navigate({ to: '..', params: true as never });
          }
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    navigate,
    router,
    qc,
    togglePalette,
    openPalette,
    setWorkspace,
    paletteOpen,
    openThreadId,
    closeThread,
    setChatFilter,
    currentChatId,
    markRead,
  ]);
}
