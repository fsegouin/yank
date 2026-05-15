import { useEffect, useRef } from 'react';

/**
 * Auto-scroll behaviour for chat message lists.
 *
 * - On `scrollKey` change (chat switched), force-scroll to the bottom after
 *   the next paint so the user always lands on the latest message.
 * - On `contentTrigger` change with the same `scrollKey` (new message in the
 *   active chat, or pagination prepended older messages), only scroll-to-bottom
 *   if the user is within 100px of it ("stickiness").
 */
export function useAutoScroll<T extends HTMLElement>(
  scrollKey: string,
  contentTrigger: unknown,
) {
  const ref = useRef<T>(null);
  const lastKey = useRef<string | null>(null);
  const justSwitched = useRef(false);

  // Mark the switch synchronously when scrollKey changes, so the next
  // contentTrigger effect knows to force-bottom.
  if (lastKey.current !== scrollKey) {
    lastKey.current = scrollKey;
    justSwitched.current = true;
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (justSwitched.current) {
      justSwitched.current = false;
      // Defer to next frame so freshly-rendered messages have laid out.
      requestAnimationFrame(() => {
        if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
      });
      return;
    }

    // TODO: when older messages are prepended via pagination, scrollHeight
    // grows but scrollTop is unchanged, causing the visible content to jump
    // upward. Preserving position would require snapshotting scrollHeight
    // before render and adjusting scrollTop after. Out of scope for this fix.
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 100) {
      el.scrollTop = el.scrollHeight;
    }
  }, [scrollKey, contentTrigger]);

  return ref;
}
