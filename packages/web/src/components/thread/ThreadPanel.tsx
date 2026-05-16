import { useUiStore } from '../../state/ui.js';
import { useSendMessage } from '../../lib/mutations.js';
import { useThreadReplies, useParentMessage } from '../../lib/queries.threads.js';
import { MessageRow } from '../chat/Message.js';
import { Composer } from '../chat/Composer.js';
import { XIcon } from '../icons/index.js';
import styles from './ThreadPanel.module.css';

interface Props {
  chatId: string;
  parentMessageId: string;
}

export function ThreadPanel({ chatId, parentMessageId }: Props) {
  const closeThread = useUiStore((s) => s.closeThread);
  const myJid = useUiStore((s) => s.currentJid ?? '');
  const { data: parent } = useParentMessage(chatId, parentMessageId);
  const { data: replies = [] } = useThreadReplies(chatId, parentMessageId);
  const send = useSendMessage(chatId);

  return (
    <aside className={styles.panel}>
      <div className={styles.head}>
        <div>
          <h3 className={styles.title}>Thread</h3>
          <div className={styles.sub}>in chat</div>
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={closeThread}
          title="Close · Esc"
          aria-label="Close thread"
        >
          <XIcon size={14} />
        </button>
      </div>

      <div className={styles.body}>
        {parent && (
          <div className={styles.parent}>
            <MessageRow
              message={parent}
              showHead={true}
              senderName={parent.senderJid}
              senderInitials={parent.senderJid.slice(0, 2).toUpperCase()}
              onOpenThread={() => {}}
              inThread={true}
              chatId={chatId}
              myJid={myJid}
            />
          </div>
        )}
        <div className={styles.repliesLabel}>{replies.length} replies</div>
        {replies.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            showHead={true}
            senderName={m.senderJid}
            senderInitials={m.senderJid.slice(0, 2).toUpperCase()}
            onOpenThread={() => {}}
            inThread={true}
            chatId={chatId}
            myJid={myJid}
          />
        ))}
      </div>

      <Composer
        chatId={`${chatId}:thread:${parentMessageId}`}
        inThread
        placeholder="Reply…"
        onSend={(text) => {
          send.mutate({ text, replyToId: parentMessageId });
        }}
      />
    </aside>
  );
}
