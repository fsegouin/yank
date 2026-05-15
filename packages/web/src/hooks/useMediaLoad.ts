import { useCallback, useEffect, useRef, useState } from 'react';

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
 * If `ready`, the hook is a no-op. If `failed`, a click-triggered retry can
 * re-fire the fetch (the trigger flag is reset whenever we leave the
 * in-flight state).
 */
export function useMediaLoad(
  messageId: string,
  currentStatus: string | null | undefined,
): UseMediaLoadResult {
  const fired = useRef(false);
  const [triggered, setTriggered] = useState(false);

  // Reset the firing flag whenever the status leaves the in-flight state.
  // Lets the user retry after a failure, and re-arm if we ever go back to 'queued'.
  useEffect(() => {
    if (currentStatus === 'failed' || currentStatus === 'queued') {
      fired.current = false;
    }
  }, [currentStatus, messageId]);

  const trigger = useCallback(() => {
    if (fired.current) return;
    if (currentStatus === 'ready') return;
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
