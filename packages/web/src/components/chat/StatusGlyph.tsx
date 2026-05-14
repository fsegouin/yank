import { ClockIcon, CheckIcon, DoubleCheckIcon } from '../icons/index.js';
import styles from './StatusGlyph.module.css';
import type { Message } from '@yank/shared';

interface Props {
  status: Message['status'];
}

export function StatusGlyph({ status }: Props) {
  if (status === 'pending') {
    return (
      <span className={styles.glyph} title="Queued">
        <ClockIcon size={11} />
      </span>
    );
  }
  if (status === 'sent') {
    return (
      <span className={styles.glyph} title="Sent">
        <CheckIcon size={12} />
      </span>
    );
  }
  if (status === 'delivered') {
    return (
      <span className={styles.glyph} title="Delivered">
        <DoubleCheckIcon size={13} />
      </span>
    );
  }
  if (status === 'read') {
    return (
      <span className={`${styles.glyph} ${styles.read}`} title="Read">
        <DoubleCheckIcon size={13} />
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className={`${styles.glyph} ${styles.failed}`} title="Failed">
        !
      </span>
    );
  }
  return null;
}
