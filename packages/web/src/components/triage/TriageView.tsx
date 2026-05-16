import { useTriageChats, useChats } from '../../lib/queries.js';
import { useAssignWorkspace } from '../../lib/mutations.js';
import { useTriageKeys } from '../../hooks/useTriageKeys.js';
import { TriageCard } from './TriageCard.js';
import { TriageEmptyState } from './TriageEmptyState.js';
import { TriageProgressBar } from './TriageProgressBar.js';
import type { Chat, Workspace } from '@yank/shared';
import styles from './TriageView.module.css';

export function TriageView() {
  const { data: allChats = [] } = useChats();
  const triageChats = useTriageChats();

  // Progress bar: assigned = non-triage, non-hidden chats; total = remaining triage + assigned.
  const assignedCount = allChats.filter(
    (c) =>
      c.workspace !== 'triage' &&
      c.workspace !== 'hidden',
  ).length;
  const grandTotal = triageChats.length + assignedCount;

  const { focusedIdx, setFocusedIdx } = useTriageKeys(triageChats);

  return (
    <main className={styles.pane}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Triage</h1>
        <p className={styles.sub}>
          {triageChats.length} unassigned · Decide where each one lives. Use{' '}
          <kbd className={styles.kbd}>1</kbd> <kbd className={styles.kbd}>2</kbd>{' '}
          <kbd className={styles.kbd}>3</kbd>.
        </p>
      </div>

      <div className={styles.content}>
        {triageChats.length > 0 && (
          <TriageProgressBar assigned={assignedCount} total={grandTotal} />
        )}

        {triageChats.length === 0 ? (
          <TriageEmptyState />
        ) : (
          triageChats.map((chat, i) => (
            <TriageCardConnected
              key={chat.id}
              chat={chat}
              focused={i === focusedIdx}
              onClick={() => setFocusedIdx(i)}
            />
          ))
        )}
      </div>
    </main>
  );
}

function TriageCardConnected({
  chat,
  focused,
  onClick,
}: {
  chat: Chat;
  focused: boolean;
  onClick: () => void;
}) {
  const assign = useAssignWorkspace(chat.id);
  const handleAssign = (ws: Workspace) => {
    assign.mutate({ workspace: ws, suppressUndo: false });
  };
  return (
    <div onClick={onClick} style={{ display: 'contents' }}>
      <TriageCard chat={chat} focused={focused} onAssign={handleAssign} />
    </div>
  );
}
