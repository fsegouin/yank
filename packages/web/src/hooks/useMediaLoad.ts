import { useCallback, useRef, useState } from 'react';

export interface UseMediaLoadResult {
  triggered: boolean;
  trigger: () => void;
}

/**
 * Coordinates a one-shot fetch to `/api/media/<messageId>` to enqueue the
 * daemon download. The fetch response is discarded — completion is delivered
 * via SSE `media-ready` → cache invalidation → message refetch.
 *
 * `currentStatus` is the message_media row's current status from the api.
 * If `ready` or `failed`, the hook is a no-op.
 */
export function useMediaLoad(
  messageId: string,
  currentStatus: string | null | undefined,
): UseMediaLoadResult {
  const fired = useRef(false);
  const [triggered, setTriggered] = useState(false);

  const trigger = useCallback(() => {
    if (fired.current) return;
    if (currentStatus === 'ready' || currentStatus === 'failed') return;
    fired.current = true;
    setTriggered(true);
    // Fire-and-forget; the api enqueues, the daemon downloads, the SSE event
    // tells us when to refetch.
    void fetch(`/api/media/${messageId}`, { credentials: 'same-origin' }).catch(() => {
      // Network errors are silent here; user can retry by remounting / re-clicking.
      fired.current = false;
      setTriggered(false);
    });
  }, [messageId, currentStatus]);

  return { triggered, trigger };
}
