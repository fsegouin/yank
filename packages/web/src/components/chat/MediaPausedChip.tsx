import { useEffect, useState } from 'react';
import { useMediaBreakerStore } from '../../state/mediaBreaker.js';
import styles from './MediaPausedChip.module.css';

function formatCountdown(retryAt: string | null): string {
  if (!retryAt) return '';
  const diffMs = new Date(retryAt).getTime() - Date.now();
  if (diffMs <= 0) return '';
  const diffMin = Math.ceil(diffMs / 60_000);
  return `, retrying in ${diffMin}m`;
}

export function MediaPausedChip() {
  const state = useMediaBreakerStore((s) => s.state);
  const retryAt = useMediaBreakerStore((s) => s.retryAt);
  const [countdown, setCountdown] = useState(() => formatCountdown(retryAt));

  useEffect(() => {
    if (state !== 'open') return;
    setCountdown(formatCountdown(retryAt));
    const id = setInterval(() => setCountdown(formatCountdown(retryAt)), 30_000);
    return () => clearInterval(id);
  }, [state, retryAt]);

  if (state !== 'open') return null;

  return <span className={styles.chip}>Downloads paused{countdown}</span>;
}
