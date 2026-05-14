import { PlayIcon } from '../icons/index.js';
import type { Media } from '@yank/shared';
import styles from './VoiceNote.module.css';

const BARS = 40;

function fmtDur(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceNote({ media }: { media: Media }) {
  return (
    <div className={styles.voice}>
      <button type="button" className={styles.play}>
        <PlayIcon size={10} />
      </button>
      <div className={styles.wave} aria-hidden="true">
        {Array.from({ length: BARS }).map((_, i) => (
          <span key={i} style={{ height: 5 + Math.abs(Math.sin(i * 1.3)) * 14 }} />
        ))}
      </div>
      <span className={styles.dur + ' mono'}>{fmtDur(media.durationMs ?? 0)}</span>
    </div>
  );
}
