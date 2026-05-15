import { useEffect, useRef } from 'react';

/**
 * Auto-scroll behaviour for chat message lists.
 *
 * - When `scrollKey` changes (e.g. user switched chats), the list is marked
 *   "needs landing". On initial landing we either scroll to the anchor (if
 *   `anchorElementId` is supplied and the element is in the DOM) or pin to
 *   the bottom. Until content has grown past the viewport, we keep retrying
 *   on each content change.
 * - Once landed for the current `scrollKey`, switches to "sticky bottom":
 *   only auto-scroll on new content if the user is within 100px of the
 *   bottom. If they scrolled up to read history, their position is preserved.
 *
 * The optional `anchorElementId` is the DOM id of an element (e.g. the unread
 * divider) to scroll to instead of the bottom on first landing. When present
 * and resolvable, the anchor is positioned ~80px from the top of the viewport
 * so the user can see it clearly. If the anchor isn't in the DOM yet we fall
 * back to bottom landing.
 */
export function useAutoScroll<T extends HTMLElement>(
  scrollKey: string,
  contentTrigger: unknown,
  anchorElementId?: string | null,
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
      // Try anchor first; fall back to bottom if it isn't present.
      if (anchorElementId) {
        const anchor = document.getElementById(anchorElementId);
        if (anchor) {
          const containerRect = el.getBoundingClientRect();
          const anchorRect = anchor.getBoundingClientRect();
          el.scrollTop += anchorRect.top - containerRect.top - 80;
          landed.current = true;
          return;
        }
      }
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
  }, [scrollKey, contentTrigger, anchorElementId]);

  return ref;
}
