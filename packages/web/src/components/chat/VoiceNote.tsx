import type { Media } from '@yank/shared';
import { useMediaLoad } from '../../hooks/useMediaLoad.js';
import { PlayIcon } from '../icons/index.js';
import styles from './VoiceNote.module.css';

function fmtDur(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  messageId: string;
  media: Media;
}

export function VoiceNote({ messageId, media }: Props) {
  const isExpired = media.status === 'failed' && media.failureReason === 'expired';
  const { triggered, trigger } = useMediaLoad(messageId, media.status);

  if (media.status === 'ready' && media.url) {
    return (
      <div className={styles.voice}>
        <audio src={media.url} controls preload="none" style={{ height: 32 }} />
        <span className={styles.dur + ' mono'}>{fmtDur(media.durationMs ?? 0)}</span>
      </div>
    );
  }

  // Permanently-expired: non-interactive placeholder, no retry fetch.
  if (isExpired) {
    return (
      <div className={styles.voice} aria-disabled="true">
        <span className={styles.play}>
          <PlayIcon size={10} />
        </span>
        <span className={styles.dur + ' mono'}>{fmtDur(media.durationMs ?? 0)}</span>
        <span className={styles.hint}>not available</span>
      </div>
    );
  }

  const busy = triggered || media.status === 'downloading';

  return (
    <button type="button" className={styles.voice} onClick={trigger} disabled={busy}>
      <span className={styles.play}>
        <PlayIcon size={10} />
      </span>
      <span className={styles.dur + ' mono'}>{fmtDur(media.durationMs ?? 0)}</span>
      <span className={styles.hint}>
        {busy ? 'loading…' : media.status === 'failed' ? 'failed (tap to retry)' : 'tap to load'}
      </span>
    </button>
  );
}
