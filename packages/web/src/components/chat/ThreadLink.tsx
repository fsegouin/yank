import styles from './ThreadLink.module.css';
import { Avatar } from '../primitives/Avatar.js';

interface Props {
  threadCount: number;
  threadPeople: { jid: string; initials: string }[];
  lastReplyRelative: string;
  onClick: () => void;
}

export function ThreadLink({ threadCount, threadPeople, lastReplyRelative, onClick }: Props) {
  return (
    <button type="button" className={styles.link} onClick={onClick}>
      <span className={styles.avs}>
        {threadPeople.slice(0, 3).map((p) => (
          <span key={p.jid} className={styles.avSlot}>
            <Avatar seed={p.jid} initials={p.initials} size={18} />
          </span>
        ))}
      </span>
      <span>{threadCount} replies</span>
      <span className={styles.meta}>· last reply {lastReplyRelative}</span>
    </button>
  );
}
