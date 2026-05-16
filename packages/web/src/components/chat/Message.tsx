import { useRef, useCallback, useEffect } from 'react';
import type { Message as MessageType } from '@yank/shared';
import { useNavigate } from '@tanstack/react-router';
import { Avatar } from '../primitives/Avatar.js';
import { MessageText } from './MessageText.js';
import { MessageRowActions } from './MessageRowActions.js';
import { Reactions } from './Reactions.js';
import { StatusGlyph } from './StatusGlyph.js';
import { Quote } from './Quote.js';
import { ThreadLink } from './ThreadLink.js';
import { MediaImage } from './MediaImage.js';
import { DocCard } from './DocCard.js';
import { VoiceNote } from './VoiceNote.js';
import { useStar } from '../../lib/mutations.js';
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
  chatId?: string;
  myJid?: string;
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
  onStar: _onStar,
  inThread = false,
  reply,
  chatId = '',
  myJid = '',
}: MessageRowProps) {
  const navigate = useNavigate();
  const star = useStar();
  const rowRef = useRef<HTMLDivElement>(null);

  // Keep a stable ref to the latest handler so add/removeEventListener always
  // operate on the same function identity across re-renders.
  const hoverKeyImplRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  hoverKeyImplRef.current = useCallback(
    (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        const tag = active.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable) return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        void navigate({
          to: '/c/$chatId/t/$messageId',
          params: { chatId, messageId: message.id },
        });
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        star.mutate({ messageId: message.id, starred: !message.starred });
      }
    },
    [chatId, message.id, message.starred, navigate, star],
  );

  // Stable dispatcher that delegates to the latest impl via the ref.
  const stableListener = useRef<(e: KeyboardEvent) => void>(
    (e: KeyboardEvent) => hoverKeyImplRef.current?.(e),
  );

  const onMouseEnter = useCallback(() => {
    document.addEventListener('keydown', stableListener.current);
  }, []);

  const onMouseLeave = useCallback(() => {
    document.removeEventListener('keydown', stableListener.current);
  }, []);

  // Ensure the listener is removed when the component unmounts (e.g. chat navigation).
  useEffect(() => {
    const listener = stableListener.current;
    return () => {
      document.removeEventListener('keydown', listener);
    };
  }, []);

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
      <div data-testid="message-row" className={styles.msg + (showHead ? '' : ' ' + styles.compact)}>
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
    <div
      ref={rowRef}
      className={styles.msg + ' msgGroup' + (showHead ? '' : ' ' + styles.compact)}
      data-testid="message-row"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
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
      <MessageRowActions message={message} chatId={chatId} myJid={myJid} />
    </div>
  );
}
