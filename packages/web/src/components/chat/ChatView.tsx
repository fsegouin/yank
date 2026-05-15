import { useChat } from '../../lib/queries.js';
import { useSendMessage } from '../../lib/mutations.js';
import { useUiStore } from '../../state/ui.js';
import { ChatTopbar } from './ChatTopbar.js';
import { MessageList } from './MessageList.js';
import { Composer } from './Composer.js';
import { ThreadPanel } from '../thread/ThreadPanel.js';
import styles from './ChatView.module.css';

export function ChatView({ chatId }: { chatId: string }) {
  const { data: chat } = useChat(chatId);
  const openThread = useUiStore((s) => s.openThread);
  const closeThread = useUiStore((s) => s.closeThread);
  const openThreadId = useUiStore((s) => s.openThreadId);
  const send = useSendMessage(chatId);

  if (!chat) {
    return (
      <main className={styles.pane}>
        <div className={styles.loading}>Loading…</div>
      </main>
    );
  }

  return (
    <>
      <main className={styles.pane}>
        <ChatTopbar
          chat={chat}
          threadOpen={!!openThreadId}
          onToggleThread={() => (openThreadId ? closeThread() : openThread(''))}
        />
        <MessageList chatId={chatId} onOpenThread={(id) => openThread(id)} />
        <Composer
          chatId={chatId}
          placeholder={`Message ${chat.subject ?? chat.jid}`}
          onSend={(text, mentions) => {
            send.mutate({ text, mentions });
          }}
        />
      </main>
      {openThreadId && <ThreadPanel chatId={chatId} parentMessageId={openThreadId} />}
    </>
  );
}
