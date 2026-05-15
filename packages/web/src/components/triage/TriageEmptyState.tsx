import styles from './TriageEmptyState.module.css';

export function TriageEmptyState() {
  return (
    <div className={styles.wrap}>
      <div className={styles.glyph} data-glyph="check">✓</div>
      <h2 className={styles.heading}>Triage clear</h2>
      <p className={styles.sub}>All new chats have a home. New ones will appear here.</p>
    </div>
  );
}
