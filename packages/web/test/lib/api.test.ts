import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from '../../src/lib/api.js';

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON for 2xx', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const result = await apiFetch<{ ok: boolean }>('/api/test');
    expect(result).toEqual({ ok: true });
  });

  it('returns undefined for 204', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );
    const result = await apiFetch('/api/test', { method: 'POST' });
    expect(result).toBeUndefined();
  });

  it('throws ApiError with status on 4xx', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'nope' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(apiFetch('/api/test')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    });
  });

  it('serialises body as JSON and sets Content-Type', async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    vi.stubGlobal('fetch', mock);
    await apiFetch('/api/x', { method: 'POST', body: { a: 1 } });
    const [, init] = mock.mock.calls[0]!;
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('verifies ApiError exposes the parsed body when JSON', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'BAD' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    try {
      await apiFetch('/api/x');
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).body).toEqual({ code: 'BAD' });
    }
  });
});
