import { useState, useRef } from 'react';
import styles from './InlineRename.module.css';

export interface InlineRenameProps {
  initialValue: string;
  onCommit: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
}

export function InlineRename({ initialValue, onCommit, maxLength = 80, placeholder }: InlineRenameProps) {
  const [value, setValue] = useState(initialValue);
  const committed = useRef(false);

  const commit = () => {
    if (committed.current) return;
    const trimmed = value.trim();
    if (!trimmed) {
      // Revert
      setValue(initialValue);
      return;
    }
    committed.current = true;
    onCommit(trimmed);
  };

  return (
    <input
      type="text"
      className={styles.input}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => {
        committed.current = false;
        setValue(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setValue(initialValue);
          committed.current = false;
        }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
