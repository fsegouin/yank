export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    headers,
    body,
    signal: opts.signal,
    credentials: 'same-origin',
  });
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('Content-Type') ?? '';
  const parsed: unknown = contentType.includes('application/json')
    ? await res.json()
    : await res.text();
  if (!res.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string'
        ? parsed.error
        : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, parsed);
  }
  return parsed as T;
}
