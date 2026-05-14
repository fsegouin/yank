import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/env.js';

const VALID_USER_ID = '0193fe00-0000-7000-8000-000000000001';

const base = {
  DATABASE_URL: 'postgres://yank:secret@localhost:5432/yank',
  REDIS_URL: 'redis://localhost:6379',
  YANK_USER_ID: VALID_USER_ID,
  NODE_ENV: 'development',
} as const;

describe('loadEnv', () => {
  it('parses required env vars', () => {
    const env = loadEnv({ ...base, LOG_LEVEL: 'info' });
    expect(env.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(env.REDIS_URL).toBe(base.REDIS_URL);
    expect(env.YANK_USER_ID).toBe(VALID_USER_ID);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.NODE_ENV).toBe('development');
  });

  it('defaults LOG_LEVEL to info when missing', () => {
    const env = loadEnv(base);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('throws a readable error when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _omit, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is not a valid postgres URL', () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  });

  it('throws when YANK_USER_ID is missing', () => {
    const { YANK_USER_ID: _omit, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow(/YANK_USER_ID/);
  });

  it('throws when YANK_USER_ID is not a UUID', () => {
    expect(() => loadEnv({ ...base, YANK_USER_ID: 'not-a-uuid' })).toThrow(/YANK_USER_ID/);
  });
});
