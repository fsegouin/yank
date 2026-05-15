import { useEffect } from 'react';
import { useToastStore } from '../../state/toast.js';
import styles from './UndoToast.module.css';

export function UndoToast() {
  const toast = useToastStore((s) => s.toast);
  const clear = useToastStore((s) => s.clear);

  useEffect(() => {
    if (!toast) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toast.onUndo();
        clear();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toast, clear]);

  if (!toast) return null;

  const handleUndo = () => {
    toast.onUndo();
    clear();
  };

  return (
    <div data-testid="undo-toast" className={styles.pill} role="status" aria-live="polite">
      <span className={styles.label}>{toast.label}</span>
      <button type="button" className={styles.undoBtn} onClick={handleUndo}>
        Undo
      </button>
    </div>
  );
}
