import { useEffect, useRef } from 'react';

/**
 * Auto-scroll behaviour for chat message lists.
 *
 * - When `scrollKey` changes (e.g. user switched chats), the list is marked
 *   "needs bottom landing". Every subsequent render/content change pins to
 *   the bottom until the content has actually grown past the viewport — only
 *   then is the flag cleared. This handles the case where the first render
 *   for a new chat has empty content (data still loading).
 * - Once landed for the current `scrollKey`, switches to "sticky bottom":
 *   only auto-scroll on new content if the user is within 100px of the
 *   bottom. If they scrolled up to read history, their position is preserved.
 */
export function useAutoScroll<T extends HTMLElement>(
  scrollKey: string,
  contentTrigger: unknown,
) {
  const ref = useRef<T>(null);
  const lastKey = useRef<string | null>(null);
  const landed = useRef(false);

  // Detect chat switch synchronously so the effect on this same render sees it.
  if (lastKey.current !== scrollKey) {
    lastKey.current = scrollKey;
    landed.current = false;
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!landed.current) {
      // Pin to bottom. If content hasn't filled the viewport yet (scrollHeight
      // <= clientHeight), the assignment is a no-op visually and we leave the
      // flag set so the next content change retries. Otherwise we've landed.
      el.scrollTop = el.scrollHeight;
      if (el.scrollHeight > el.clientHeight) {
        landed.current = true;
      }
      return;
    }

    // Sticky-bottom mode: only auto-scroll if user is near the bottom.
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 100) {
      el.scrollTop = el.scrollHeight;
    }
  }, [scrollKey, contentTrigger]);

  return ref;
}
