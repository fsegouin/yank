import styles from './Quote.module.css';
import type { Message } from '@yank/shared';

interface Props {
  reply: Pick<Message, 'id' | 'text'> & { senderName: string };
}

export function Quote({ reply }: Props) {
  return (
    <div className={styles.quote}>
      <span className={styles.author}>{reply.senderName}</span>
      <span className={styles.text}>{reply.text ?? ''}</span>
    </div>
  );
}
