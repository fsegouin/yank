import type { Message as MessageType } from '@yank/shared';
import { Avatar } from '../primitives/Avatar.js';
import { MessageText } from './MessageText.js';
import { Reactions } from './Reactions.js';
import { StatusGlyph } from './StatusGlyph.js';
import { Quote } from './Quote.js';
import { ThreadLink } from './ThreadLink.js';
import { MediaImage } from './MediaImage.js';
import { DocCard } from './DocCard.js';
import { VoiceNote } from './VoiceNote.js';
import { EmojiIcon, ThreadIcon, StarIcon, MoreIcon } from '../icons/index.js';
import styles from './Message.module.css';

export interface MessageRowProps {
  message: MessageType;
  showHead: boolean;
  senderName: string;
  senderInitials: string;
  onOpenThread: () => void;
  onReact?: (emoji: string) => void;
  onStar?: () => void;
  inThread?: boolean;
  reply?: {
    id: string;
    text: string | null;
    senderName: string;
  };
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

export function MessageRow({
  message,
  showHead,
  senderName,
  senderInitials,
  onOpenThread,
  onReact,
  onStar,
  inThread = false,
  reply,
}: MessageRowProps) {
  if (message.kind === 'system') {
    return (
      <div className={styles.system}>
        <span className={styles.systemPill}>{message.text ?? ''}</span>
      </div>
    );
  }
  const ts = fmtTime(message.ts);
  if (message.deletedAt) {
    return (
      <div className={styles.msg + (showHead ? '' : ' ' + styles.compact)}>
        <div className={styles.avatarSlot}>
          {showHead ? (
            <Avatar seed={message.senderJid} initials={senderInitials} size={36} />
          ) : (
            <div className={styles.hoverTime}>{ts}</div>
          )}
        </div>
        <div className={styles.body}>
          {showHead && (
            <div className={styles.head}>
              <span className={styles.author}>{senderName}</span>
              <span className={styles.time + ' mono'}>{ts}</span>
            </div>
          )}
          <div className={styles.deletedTombstone}>
            <em>This message was deleted</em>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.msg + (showHead ? '' : ' ' + styles.compact)}>
      <div className={styles.avatarSlot}>
        {showHead ? (
          <Avatar seed={message.senderJid} initials={senderInitials} size={36} />
        ) : (
          <div className={styles.hoverTime}>{ts}</div>
        )}
      </div>
      <div className={styles.body}>
        {showHead && (
          <div className={styles.head}>
            <span className={styles.author}>{senderName}</span>
            <span className={styles.time + ' mono'}>{ts}</span>
            <StatusGlyph status={message.status} />
          </div>
        )}
        {reply && (
          <Quote
            reply={{ id: reply.id, text: reply.text, senderName: reply.senderName }}
          />
        )}
        <MessageText text={message.text} />
        {message.editedAt && (
          <span className={styles.editedSuffix}>(edited)</span>
        )}
        {message.media && message.kind === 'image' && (
          <MediaImage messageId={message.id} media={message.media} />
        )}
        {message.media && message.kind === 'document' && (
          <DocCard messageId={message.id} media={message.media} name={message.text ?? 'file'} />
        )}
        {message.media && message.kind === 'audio' && (
          <VoiceNote messageId={message.id} media={message.media} />
        )}
        {message.reactions.length > 0 && (
          <Reactions
            reactions={message.reactions}
            onAdd={onReact ? () => onReact('👍') : undefined}
          />
        )}
        {!inThread && message.threadCount !== undefined && message.threadCount > 0 && (
          <ThreadLink
            threadCount={message.threadCount}
            threadPeople={[]}
            lastReplyRelative="recent"
            onClick={onOpenThread}
          />
        )}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionBtn}
          title="Add reaction"
          onClick={() => onReact?.('👍')}
        >
          <EmojiIcon size={14} />
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          title="Reply in thread"
          onClick={onOpenThread}
        >
          <ThreadIcon size={14} />
        </button>
        <button type="button" className={styles.actionBtn} title="Star" onClick={onStar}>
          <StarIcon size={13} />
        </button>
        <button type="button" className={styles.actionBtn} title="More">
          <MoreIcon size={14} />
        </button>
      </div>
    </div>
  );
}
