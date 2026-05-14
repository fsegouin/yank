import type { ReactNode } from 'react';
import styles from './RailButton.module.css';

interface RailButtonProps {
  active?: boolean;
  workspace?: 'work' | 'personal' | 'triage';
  count?: number;
  mono?: string;
  glyph?: ReactNode;
  title: string;
  onClick: () => void;
}

export function RailButton({ active, workspace, count, mono, glyph, title, onClick }: RailButtonProps) {
  return (
    <button
      type="button"
      className={
        styles.btn +
        (active ? ' ' + styles.active : '') +
        (workspace ? ' ' + styles[`ws_${workspace}`] : '')
      }
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-current={active ? 'true' : undefined}
    >
      {mono ? <span className={styles.mono}>{mono}</span> : glyph}
      {workspace && <span className={styles.wsDot + ' ' + styles[`wsDot_${workspace}`]} />}
      {count !== undefined && count > 0 && <span className={styles.badge}>{count}</span>}
    </button>
  );
}
