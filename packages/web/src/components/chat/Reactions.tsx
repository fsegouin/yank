import { EmojiIcon } from '../icons/index.js';
import styles from './Reactions.module.css';
import type { Reaction } from '@yank/shared';

interface Props {
  reactions: Reaction[];
  onAdd?: () => void;
}

export function Reactions({ reactions, onAdd }: Props) {
  if (reactions.length === 0) return null;
  return (
    <div className={styles.reactions}>
      {reactions.map((r) => (
        <button
          type="button"
          key={r.emoji}
          className={`${styles.reaction} ${r.mine ? styles.mine : ''}`}
        >
          <span>{r.emoji}</span>
          <span className={styles.count}>{r.count}</span>
        </button>
      ))}
      {onAdd && (
        <button
          type="button"
          className={`${styles.reaction} ${styles.add}`}
          onClick={onAdd}
          title="Add reaction"
        >
          <EmojiIcon size={11} />
        </button>
      )}
    </div>
  );
}
