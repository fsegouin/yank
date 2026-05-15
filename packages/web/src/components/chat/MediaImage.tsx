// packages/web/src/components/chat/MediaImage.tsx
import type { Media } from '@yank/shared';
import { useMediaBreakerStore } from '../../state/mediaBreaker.js';
import { useMediaLoad } from '../../hooks/useMediaLoad.js';
import { MediaPausedChip } from './MediaPausedChip.js';
import styles from './MediaImage.module.css';

interface Props {
  messageId: string;
  media: Media;
}

export function MediaImage({ messageId, media }: Props) {
  const breakerState = useMediaBreakerStore((s) => s.state);
  const isExpired = media.status === 'failed' && media.failureReason === 'expired';
  const { triggered, trigger } = useMediaLoad(messageId, media.status);
  const { trigger: triggerBypass } = useMediaLoad(messageId, media.status, true);

  const aspect = media.width && media.height ? `${media.width} / ${media.height}` : '4 / 3';

  return (
    <div className={styles.grid}>
      <div className={styles.tile} style={{ aspectRatio: aspect }}>
        {media.status === 'ready' && media.url ? (
          <img
            src={media.url}
            alt=""
            role="img"
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : isExpired ? (
          <span className={styles.placeholder}>Media no longer available</span>
        ) : media.status === 'failed' ? (
          <div className={styles.placeholder}>
            <span>Image failed</span>
            <button type="button" onClick={trigger} className={styles.retry}>
              Retry
            </button>
          </div>
        ) : media.status === 'downloading' || triggered ? (
          <span className={styles.placeholder}>Loading…</span>
        ) : (
          <div className={styles.placeholder}>
            <MediaPausedChip />
            <button
              type="button"
              onClick={trigger}
              className={styles.retry}
              disabled={breakerState === 'open'}
            >
              Tap to load
            </button>
            {breakerState === 'open' && (
              <button
                type="button"
                onClick={triggerBypass}
                className={styles.retry}
              >
                Retry anyway
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
