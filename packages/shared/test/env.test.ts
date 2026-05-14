import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/env.js';

describe('loadEnv', () => {
  it('parses required env vars', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://yank:secret@localhost:5432/yank',
      REDIS_URL: 'redis://localhost:6379',
      LOG_LEVEL: 'info',
      NODE_ENV: 'development',
    });
    expect(env.DATABASE_URL).toBe('postgres://yank:secret@localhost:5432/yank');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.NODE_ENV).toBe('development');
  });

  it('defaults LOG_LEVEL to info when missing', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://yank:secret@localhost:5432/yank',
      REDIS_URL: 'redis://localhost:6379',
      NODE_ENV: 'development',
    });
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('throws a readable error when DATABASE_URL is missing', () => {
    expect(() =>
      loadEnv({ REDIS_URL: 'redis://localhost:6379', NODE_ENV: 'development' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is not a valid postgres URL', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: 'not-a-url',
        REDIS_URL: 'redis://localhost:6379',
        NODE_ENV: 'development',
      }),
    ).toThrow(/DATABASE_URL/);
  });
});
