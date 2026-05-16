import { useNavigate } from '@tanstack/react-router';
import { useConnectionStatus, useEverConnected } from '../../state/connection.js';
import styles from './DegradationBanner.module.css';

export function DegradationBanner() {
  const status = useConnectionStatus();
  const everConnected = useEverConnected();
  const navigate = useNavigate();

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

  // status === 'connecting'
  // Once we've been connected this session, treat brief reconnect cycles as silent —
  // only surface a real 'disconnected' event from the daemon as a visible problem.
  if (everConnected) return null;
  return (
    <div className={`${styles.banner} ${styles.info}`}>
      Connecting…
    </div>
  );
}
