import { describe, expect, it } from 'vitest';
import { parseMessageText } from '../../src/utils/tokens.js';

describe('parseMessageText', () => {
  it('returns a single text token for plain input', () => {
    expect(parseMessageText('hello world')).toEqual([{ kind: 'text', text: 'hello world' }]);
  });

  it('detects @mentions', () => {
    expect(parseMessageText('hi @ash')).toEqual([
      { kind: 'text', text: 'hi ' },
      { kind: 'mention', text: '@ash' },
    ]);
  });

  it('detects **bold**', () => {
    expect(parseMessageText('**important**')).toEqual([{ kind: 'bold', text: 'important' }]);
  });

  it('detects `code` spans', () => {
    expect(parseMessageText('try `pnpm i`')).toEqual([
      { kind: 'text', text: 'try ' },
      { kind: 'code', text: 'pnpm i' },
    ]);
  });

  it('detects URLs', () => {
    const tokens = parseMessageText('see https://example.com/x for more');
    expect(tokens).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'url', text: 'https://example.com/x' },
      { kind: 'text', text: ' for more' },
    ]);
  });

  it('handles multiple tokens in order', () => {
    expect(parseMessageText('@ash see **this** at https://x.io')).toEqual([
      { kind: 'mention', text: '@ash' },
      { kind: 'text', text: ' see ' },
      { kind: 'bold', text: 'this' },
      { kind: 'text', text: ' at ' },
      { kind: 'url', text: 'https://x.io' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseMessageText('')).toEqual([]);
  });
});
