import { useState } from 'react';
import { InlineRename } from '../primitives/InlineRename.js';
import { useUpdateContactName } from '../../lib/mutations.js';
import styles from './SetNicknameAffordance.module.css';

interface Props {
  senderJid: string;
}

export function SetNicknameAffordance({ senderJid }: Props) {
  const [editing, setEditing] = useState(false);
  const updateContactName = useUpdateContactName(senderJid);

  if (!editing) {
    return (
      <button
        type="button"
        className={styles.btn}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        + Set nickname
      </button>
    );
  }

  return (
    <span
      className={styles.editing}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setEditing(false);
        }
      }}
    >
      <InlineRename
        initialValue=""
        placeholder="Nickname"
        maxLength={80}
        onCommit={(displayName) => {
          updateContactName.mutate({ displayName });
          setEditing(false);
        }}
      />
    </span>
  );
}
