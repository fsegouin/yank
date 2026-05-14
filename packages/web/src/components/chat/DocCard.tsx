import type { Media } from '@yank/shared';
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

export function DocCard({ media, name }: { media: Media; name: string }) {
  return (
    <div className={styles.doc}>
      <div className={styles.ext}>{ext(media.mime)}</div>
      <div>
        <div className={styles.name}>{name}</div>
        <div className={styles.size + ' mono'}>{fmtBytes(media.sizeBytes)}</div>
      </div>
    </div>
  );
}
