import { useEffect, useRef, useState } from 'react';
import type { Media } from '@yank/shared';
import { useMediaLoad } from '../../hooks/useMediaLoad.js';
import styles from './MediaImage.module.css';

interface Props {
  messageId: string;
  media: Media;
}

export function MediaImage({ messageId, media }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const isExpired = media.status === 'failed' && media.failureReason === 'expired';
  const { trigger } = useMediaLoad(messageId, media.status);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    // Permanently-expired media must NOT auto-fetch on viewport entry —
    // that's exactly the cascade we're trying to stop.
    if (isExpired) return;
    if (media.status === 'queued') trigger();
  }, [inView, media.status, isExpired, trigger]);

  const aspect = media.width && media.height ? `${media.width} / ${media.height}` : '4 / 3';

  return (
    <div className={styles.grid} ref={ref}>
      <div className={styles.tile} style={{ aspectRatio: aspect }}>
        {media.status === 'ready' && media.url ? (
          <img
            src={media.url}
            alt=""
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
        ) : (
          <span className={styles.placeholder}>
            {media.status === 'downloading' ? 'Loading…' : inView ? 'Queued…' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
