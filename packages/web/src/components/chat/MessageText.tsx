import { parseMessageText } from '../../utils/tokens.js';

interface Props {
  text: string | null;
}

export function MessageText({ text }: Props) {
  if (!text) return null;
  const tokens = parseMessageText(text);
  return (
    <div className="msgText">
      {tokens.map((t, i) => {
        switch (t.kind) {
          case 'mention':
            return (
              <span key={i} className="mention">
                {t.text}
              </span>
            );
          case 'bold':
            return <strong key={i}>{t.text}</strong>;
          case 'code':
            return <code key={i}>{t.text}</code>;
          case 'url':
            return (
              <a key={i} href={t.text} target="_blank" rel="noopener noreferrer">
                {t.text}
              </a>
            );
          case 'text':
            return <span key={i}>{t.text}</span>;
        }
      })}
    </div>
  );
}
