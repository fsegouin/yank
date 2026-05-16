import { describe, expect, it, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerMediaRoutes } from '../src/routes/media.js';

function buildApp(redisMock: { hgetall: ReturnType<typeof vi.fn> }): FastifyInstance {
  const app = Fastify();
  registerMediaRoutes(app, {
    db: {} as Parameters<typeof registerMediaRoutes>[1]['db'],
    userId: 'user1',
    commands: { publish: vi.fn() },
    redis: redisMock as unknown as Parameters<typeof registerMediaRoutes>[1]['redis'],
  });
  return app;
}

describe('GET /api/media/breaker-state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns closed/null when no Redis key exists', async () => {
    const redisMock = { hgetall: vi.fn().mockResolvedValue(null) };
    const app = buildApp(redisMock);
    const res = await app.inject({ method: 'GET', url: '/api/media/breaker-state' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ state: string; retryAt: string | null }>();
    expect(body.state).toBe('closed');
    expect(body.retryAt).toBeNull();
  });

  it('returns persisted open state with retryAt', async () => {
    const retryAt = '2026-05-15T12:05:00.000Z';
    const redisMock = { hgetall: vi.fn().mockResolvedValue({ state: 'open', retryAt }) };
    const app = buildApp(redisMock);
    const res = await app.inject({ method: 'GET', url: '/api/media/breaker-state' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ state: string; retryAt: string | null }>();
    expect(body.state).toBe('open');
    expect(body.retryAt).toBe(retryAt);
  });

  it('returns closed/null when Redis hash has empty retryAt', async () => {
    const redisMock = { hgetall: vi.fn().mockResolvedValue({ state: 'closed', retryAt: '' }) };
    const app = buildApp(redisMock);
    const res = await app.inject({ method: 'GET', url: '/api/media/breaker-state' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ state: string; retryAt: string | null }>();
    expect(body.retryAt).toBeNull();
  });
});
