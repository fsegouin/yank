import type { Message } from '../api.js';

const statusGlyph: Record<Message['status'], string> = {
  pending: '…',
  sent: '✓',
  delivered: '✓✓',
  read: '✓✓',
  failed: '!',
};

export function MessageRow({ m }: { m: Message }) {
  return (
    <div className={'msg ' + m.status} data-msg-id={m.id}>
      <div className="meta">
        <span>{m.senderJid === 'me' ? 'You' : m.senderJid}</span>{' '}
        <span>{new Date(m.ts).toLocaleTimeString()}</span>{' '}
        {m.senderJid === 'me' && (
          <span className={'status ' + m.status} aria-label={`status: ${m.status}`}>
            {statusGlyph[m.status]}
          </span>
        )}
      </div>
      <div className="body">{m.text}</div>
    </div>
  );
}
