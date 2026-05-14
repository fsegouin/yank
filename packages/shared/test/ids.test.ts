import { describe, it, expect } from 'vitest';
import { newId } from '../src/ids.js';

describe('newId', () => {
  it('returns a UUID-shaped string', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns values sorted by creation time (ascending lex)', async () => {
    const a = newId();
    await new Promise((r) => setTimeout(r, 5));
    const b = newId();
    expect(a < b).toBe(true);
  });
});
