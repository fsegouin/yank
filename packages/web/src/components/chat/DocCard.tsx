import type { Media } from '@yank/shared';
import { useMediaLoad } from '../../hooks/useMediaLoad.js';
import { MediaPausedChip } from './MediaPausedChip.js';
import styles from './DocCard.module.css';

function ext(mime: string): string {
  const m = /([a-z0-9]+)$/i.exec(mime);
  return (m?.[1] ?? 'FILE').toUpperCase().slice(0, 4);
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  messageId: string;
  media: Media;
  name: string;
}

export function DocCard({ messageId, media, name }: Props) {
  const isExpired = media.status === 'failed' && media.failureReason === 'expired';
  const { triggered, trigger } = useMediaLoad(messageId, media.status);

  if (media.status === 'ready' && media.url) {
    return (
      <a
        href={media.url}
        target="_blank"
        rel="noopener noreferrer"
        download={name}
        className={styles.doc}
      >
        <div className={styles.ext}>{ext(media.mime)}</div>
        <div>
          <div className={styles.name}>{name}</div>
          <div className={styles.size + ' mono'}>{fmtBytes(media.sizeBytes)}</div>
        </div>
      </a>
    );
  }

  // Permanently-expired: render as a non-interactive placeholder so a tap
  // doesn't fire another doomed fetch.
  if (isExpired) {
    return (
      <div className={styles.doc} aria-disabled="true">
        <div className={styles.ext}>{ext(media.mime)}</div>
        <div>
          <div className={styles.name}>{name}</div>
          <div className={styles.size + ' mono'}>
            {fmtBytes(media.sizeBytes)} · not available
          </div>
        </div>
      </div>
    );
  }

  const busy = triggered || media.status === 'downloading';

  return (
    <button type="button" className={styles.doc} onClick={trigger} disabled={busy}>
      <div className={styles.ext}>{ext(media.mime)}</div>
      <div>
        <div className={styles.name}>{name}</div>
        <div className={styles.size + ' mono'}>
          {fmtBytes(media.sizeBytes)}
          {busy
            ? ' · downloading…'
            : media.status === 'failed'
              ? ' · failed (tap to retry)'
              : ' · tap to download'}
          <MediaPausedChip />
        </div>
      </div>
    </button>
  );
}
