import type { Media } from '@yank/shared';
import styles from './MediaImage.module.css';

export function MediaImage({ media }: { media: Media }) {
  const aspect = media.width && media.height ? `${media.width} / ${media.height}` : '4 / 3';
  return (
    <div className={styles.grid}>
      <div className={styles.tile} style={{ aspectRatio: aspect }}>
        {media.thumbnailUrl ? (
          <img src={media.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <span className={styles.placeholder}>image · {media.status}</span>
        )}
      </div>
    </div>
  );
}
