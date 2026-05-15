import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useConnectionStatus, useConnectionStore } from '../../state/connection.js';
import styles from './DegradationBanner.module.css';

interface Props {
  /** Duration in ms before treating no-event as disconnected. Default: 10 000. */
  graceMs?: number;
}

export function DegradationBanner({ graceMs = 10_000 }: Props) {
  const status = useConnectionStatus();
  const navigate = useNavigate();
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 10-second grace timer: if no 'connected' event arrives, assume disconnected.
  useEffect(() => {
    if (status === 'connected' || status === 'disconnected' || status === 'linking-required') {
      if (graceTimer.current) {
        clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
      return;
    }
    // status === 'connecting' — start grace timer
    graceTimer.current = setTimeout(() => {
      useConnectionStore.getState().setStatus('disconnected');
    }, graceMs);
    return () => {
      if (graceTimer.current) clearTimeout(graceTimer.current);
    };
  }, [status, graceMs]);

  if (status === 'connected') return null;

  if (status === 'linking-required') {
    return (
      <button
        type="button"
        className={`${styles.banner} ${styles.accent}`}
        onClick={() => void navigate({ to: '/setup' })}
      >
        Linking required — open setup
      </button>
    );
  }

  if (status === 'disconnected') {
    return (
      <div className={`${styles.banner} ${styles.warn}`}>
        Disconnected — reconnecting…
      </div>
    );
  }

  // connecting
  return (
    <div className={`${styles.banner} ${styles.info}`}>
      Connecting…
    </div>
  );
}
