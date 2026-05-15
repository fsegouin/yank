import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DownloadDeps } from '../src/download.js';
import { handleDownloadCommand, resetBreakerForTest } from '../src/download.js';

const ROW = {
  mediaMessageId: 'msg1',
  filePath: JSON.stringify({ directPath: '/p', mediaKey: 'key' }),
  mime: 'image/jpeg',
  status: 'queued',
  messageKind: 'image',
  waMessageId: 'wa1',
  senderJid: 'other@s.whatsapp.net',
  chatJid: 'chat@g.us',
};

/** Build a mock db that returns the given row from the two-join chain, and [] from the flat chain. */
function makeDb(row?: typeof ROW): DownloadDeps['db'] {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        // flat chain: .from().where().limit() — used by markFailed
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
        // two-join chain: used by main query
        innerJoin: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(row ? [row] : []),
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

// Minimal fake deps
function makeDeps(overrides: Partial<DownloadDeps> = {}): DownloadDeps {
  return {
    db: makeDb(),
    userId: 'test-user-id',
    mediaDir: '/tmp/media',
    bus: { publish: vi.fn().mockResolvedValue(undefined) },
    connector: { downloadMedia: vi.fn().mockRejectedValue(new Error('timed out')) },
    redis: {
      hset: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    } as unknown as DownloadDeps['redis'],
    ...overrides,
  };
}

describe('handleDownloadCommand with circuit breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetBreakerForTest();
  });

  it('publishes media-breaker-state open after 3 failures', async () => {
    const connector = { downloadMedia: vi.fn().mockRejectedValue(new Error('timed out')) };
    const bus = { publish: vi.fn().mockResolvedValue(undefined) };
    const redis = { hset: vi.fn().mockResolvedValue(1), expire: vi.fn().mockResolvedValue(1) } as unknown as DownloadDeps['redis'];
    const deps = makeDeps({ db: makeDb(ROW), connector, bus, redis });

    // Trip the breaker: 3 failures
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });

    const openPublish = (bus.publish as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => (c[0] as { type: string }).type === 'media-breaker-state',
    );
    expect(openPublish).toBeDefined();
    expect((openPublish![0] as { state: string }).state).toBe('open');
  });

  it('returns immediately (paused) when breaker is open', async () => {
    // Trip the breaker manually via failures, then a 4th call should not call connector
    const connector = { downloadMedia: vi.fn().mockRejectedValue(new Error('timed out')) };
    const bus = { publish: vi.fn().mockResolvedValue(undefined) };
    const redis = { hset: vi.fn().mockResolvedValue(1), expire: vi.fn().mockResolvedValue(1) } as unknown as DownloadDeps['redis'];
    const deps = makeDeps({ db: makeDb(ROW), connector, bus, redis });

    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });

    // Now open; 4th call should short-circuit
    const callsBefore = (connector.downloadMedia as ReturnType<typeof vi.fn>).mock.calls.length;
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    expect((connector.downloadMedia as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it('bypassBreaker: true proceeds regardless of breaker state', async () => {
    const connector = { downloadMedia: vi.fn().mockRejectedValue(new Error('timed out')) };
    const bus = { publish: vi.fn().mockResolvedValue(undefined) };
    const redis = { hset: vi.fn().mockResolvedValue(1), expire: vi.fn().mockResolvedValue(1) } as unknown as DownloadDeps['redis'];
    const deps = makeDeps({ db: makeDb(ROW), connector, bus, redis });

    // Trip breaker
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });

    const callsBefore = (connector.downloadMedia as ReturnType<typeof vi.fn>).mock.calls.length;
    // bypassBreaker should still call connector
    await handleDownloadCommand(deps, { messageId: 'msg1', bypassBreaker: true });
    expect((connector.downloadMedia as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore + 1);
  });
});
