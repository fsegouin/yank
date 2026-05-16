import { useNavigate } from '@tanstack/react-router';
import type { Message } from '@yank/shared';
import { useUiStore } from '../../state/ui.js';
import { useStar } from '../../lib/mutations.js';
import { EditIcon, ThreadIcon, StarIcon } from '../icons/index.js';
import styles from './MessageRowActions.module.css';

interface Props {
  message: Message;
  chatId: string;
  myJid: string;
}

export function MessageRowActions({ message, chatId, myJid }: Props) {
  const navigate = useNavigate();
  const setEditing = useUiStore((s) => s.setEditing);
  const star = useStar();

  const isOwn = message.senderJid === myJid;

  return (
    <div className={styles.strip}>
      {isOwn && (
        <button
          type="button"
          className={styles.btn}
          title="Edit message"
          aria-label="Edit message"
          onClick={() =>
            setEditing({
              messageId: message.id,
              originalText: message.text ?? '',
              chatId,
            })
          }
        >
          <EditIcon size={13} />
        </button>
      )}
      <button
        type="button"
        className={styles.btn}
        title="Reply in thread · R"
        aria-label="Reply in thread"
        onClick={() =>
          void navigate({
            to: '/c/$chatId/t/$messageId',
            params: { chatId, messageId: message.id },
          })
        }
      >
        <ThreadIcon size={13} />
      </button>
      <button
        type="button"
        className={styles.btn}
        title="Star · S"
        aria-label="Star message"
        onClick={() => star.mutate({ messageId: message.id, starred: !message.starred })}
      >
        <StarIcon size={13} />
      </button>
    </div>
  );
}
