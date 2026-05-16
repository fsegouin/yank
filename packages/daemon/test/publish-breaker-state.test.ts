import { describe, expect, it, vi } from 'vitest';
// Import the internal helper by re-exporting it in download.ts for tests,
// OR test it indirectly via the full handleDownloadCommand path.
// We test it indirectly: after 3 timeout failures the bus.publish + redis.hset are both called.

import { handleDownloadCommand, resetBreakerForTest } from '../src/download.js';
import type { DownloadDeps } from '../src/download.js';

function makeRow() {
  return [{
    mediaMessageId: 'msg1',
    filePath: JSON.stringify({ directPath: '/p', mediaKey: 'key' }),
    mime: 'image/jpeg',
    status: 'queued',
    messageKind: 'image',
    waMessageId: 'wa1',
    senderJid: 'other@s.whatsapp.net',
    chatJid: 'chat@g.us',
  }];
}

function makeDb(): DownloadDeps['db'] {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        // flat chain: .from().where().limit() — used by markFailed
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
        // two-join chain: .from().innerJoin().innerJoin().where().limit() — used by main query
        innerJoin: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(makeRow()),
            }),
          }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
  } as unknown as DownloadDeps['db'];
}

function makeDeps(): DownloadDeps {
  return {
    db: makeDb(),
    userId: 'u1',
    mediaDir: '/tmp',
    bus: { publish: vi.fn().mockResolvedValue(undefined) },
    connector: { downloadMedia: vi.fn().mockRejectedValue(new Error('timed out')) },
    redis: {
      hset: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    } as unknown as DownloadDeps['redis'],
  };
}

describe('publishBreakerState side effects', () => {
  it('writes state + retryAt to Redis hash with 1h TTL when breaker opens', async () => {
    vi.useFakeTimers();
    resetBreakerForTest();
    const deps = makeDeps();

    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });

    const redisCalls = (deps.redis.hset as ReturnType<typeof vi.fn>).mock.calls;
    expect(redisCalls.length).toBeGreaterThan(0);
    const call = redisCalls[0]!;
    expect(call[0]).toBe('breaker:user:u1');
    expect(call[1]).toBe('state');
    expect(call[2]).toBe('open');

    const expireCalls = (deps.redis.expire as ReturnType<typeof vi.fn>).mock.calls;
    expect(expireCalls.length).toBeGreaterThan(0);
    expect(expireCalls[0]![0]).toBe('breaker:user:u1');
    expect(expireCalls[0]![1]).toBe(3600);

    vi.useRealTimers();
  });

  it('publishes media-breaker-state event to SSE bus when breaker opens', async () => {
    vi.useFakeTimers();
    resetBreakerForTest();
    const deps = makeDeps();

    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });

    const publishCalls = (deps.bus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const breakerEvt = publishCalls.find(
      (c: unknown[]) => (c[0] as { type: string }).type === 'media-breaker-state',
    );
    expect(breakerEvt).toBeDefined();
    expect((breakerEvt![0] as { state: string }).state).toBe('open');
    expect((breakerEvt![0] as { retryAt: string }).retryAt).toBeDefined();

    vi.useRealTimers();
  });
});
