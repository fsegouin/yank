import styles from './TriageProgressBar.module.css';

interface TriageProgressBarProps {
  assigned: number;
  total: number;
}

export function TriageProgressBar({ assigned, total }: TriageProgressBarProps) {
  const pct = total === 0 ? 100 : Math.min(100, Math.round((assigned / total) * 100));

  return (
    <div className={styles.bar}>
      <span>{assigned}/{total} cleared</span>
      <div className={styles.track}>
        <div
          className={styles.fill}
          data-fill
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={styles.hint}>
        {pct}% · ↑ ↓ navigate · 1 work · 2 personal · 3 hide
      </span>
    </div>
  );
}
