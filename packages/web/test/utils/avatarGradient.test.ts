import { describe, expect, it } from 'vitest';
import { avatarGradient } from '../../src/utils/avatarGradient.js';

describe('avatarGradient', () => {
  it('returns a class in the av-g1..av-g8 range', () => {
    const cls = avatarGradient('alice');
    expect(cls).toMatch(/^av-g[1-8]$/);
  });

  it('is deterministic for the same seed', () => {
    expect(avatarGradient('bob')).toBe(avatarGradient('bob'));
  });

  it('falls back to av-g4 for empty seed', () => {
    expect(avatarGradient('')).toBe('av-g4');
  });

  it('distributes seeds across the 8 buckets', () => {
    const buckets = new Set<string>();
    for (let i = 0; i < 64; i++) buckets.add(avatarGradient(`name-${i}`));
    expect(buckets.size).toBeGreaterThanOrEqual(6);
  });
});
