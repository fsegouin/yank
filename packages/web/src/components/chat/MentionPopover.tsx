import type { ChatMember } from '@yank/shared';
import styles from './MentionPopover.module.css';

interface Props {
  members: ChatMember[];
  selectedIndex: number;
  onSelect: (member: ChatMember) => void;
  anchorRect: DOMRect | null;
}

function memberLabel(member: ChatMember): string {
  return member.displayName ?? '@Unknown (lid)';
}

function isLid(member: ChatMember): boolean {
  return member.jid.includes('@lid.');
}

export function MentionPopover({ members, selectedIndex, onSelect, anchorRect }: Props) {
  if (!anchorRect || members.length === 0) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    bottom: `calc(100vh - ${anchorRect.top}px + 4px)`,
    left: `${anchorRect.left}px`,
  };

  return (
    <div className={styles.popover} style={style} role="listbox" aria-label="Mention suggestions">
      {members.map((m, i) => (
        <div
          key={m.jid}
          className={styles.item + (i === selectedIndex ? ' ' + styles.active : '')}
          role="option"
          aria-selected={i === selectedIndex}
          onMouseDown={(e) => {
            // mousedown (not click) so we don't blur the textarea first
            e.preventDefault();
            onSelect(m);
          }}
        >
          <span className={styles.name}>{memberLabel(m)}</span>
          {isLid(m) && <span className={styles.lidTag}>lid</span>}
        </div>
      ))}
    </div>
  );
}
