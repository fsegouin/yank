export type Token =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'url'; text: string };

const PATTERN = /(@\w+)|(\*\*[^*]+\*\*)|(`[^`]+`)|(https?:\/\/[^\s]+)/g;

export function parseMessageText(input: string): Token[] {
  if (!input) return [];
  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = PATTERN.exec(input)) !== null) {
    if (m.index > last) out.push({ kind: 'text', text: input.slice(last, m.index) });
    if (m[1]) out.push({ kind: 'mention', text: m[1] });
    else if (m[2]) out.push({ kind: 'bold', text: m[2].slice(2, -2) });
    else if (m[3]) out.push({ kind: 'code', text: m[3].slice(1, -1) });
    else if (m[4]) out.push({ kind: 'url', text: m[4] });
    last = PATTERN.lastIndex;
  }
  if (last < input.length) out.push({ kind: 'text', text: input.slice(last) });
  return out;
}
