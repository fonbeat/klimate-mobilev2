import { resolveApiUrl } from './api-url.ts';

const API_URL = resolveApiUrl(process.env.EXPO_PUBLIC_API_URL, typeof __DEV__ === 'undefined' ? process.env.NODE_ENV !== 'production' : __DEV__);

export class ApiError extends Error {
  status: number;
  code?: string;
  retryAfterMs?: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function parseApiBody(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : { data: parsed };
  } catch {
    return { message: raw.trim() };
  }
}

export function unwrapApiPayload<T>(payload: Record<string, unknown>): T {
  return ('data' in payload ? payload.data : payload) as T;
}

const pendingReads = new Map<string, Promise<unknown>>();
let retryAfterAt = 0;

export function retryDelay(value: string | null, now = Date.now()) {
  if (!value) return 1000;
  const seconds = Number(value);
  return Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : (Date.parse(value) || now + 1000) - now);
}

export function api<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const read = !options.method || options.method.toUpperCase() === 'GET';
  // Only identical default reads share a promise. No response cache or mutation retries.
  const key = read && !options.signal && !options.headers ? `${options.token ?? ''}:${path}` : undefined;
  if (key && pendingReads.has(key)) return pendingReads.get(key) as Promise<T>;
  const request = requestApi<T>(path, options, read);
  if (!read) void request.then(() => pendingReads.clear(), () => undefined);
  if (key) {
    pendingReads.set(key, request);
    void request.finally(() => { if (pendingReads.get(key) === request) pendingReads.delete(key); }).catch(() => undefined);
  }
  return request;
}

async function requestApi<T>(path: string, options: RequestInit & { token?: string }, canRetry: boolean): Promise<T> {
  const { token, headers, ...requestOptions } = options;
  const remaining = retryAfterAt - Date.now();
  if (remaining > 30_000) throw new ApiError('Klimate is busy. Please try again shortly.', 429);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  let raw: string;
  try {
  response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    signal: options.signal ?? controller.signal,
    headers: {
      Accept: 'application/json',
      ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  raw = response.status === 204 ? '' : await response.text();
  } catch (error) {
    if (!options.signal && controller.signal.aborted) throw new ApiError('Klimate took too long to respond. Please try again.', 408);
    throw error;
  } finally { clearTimeout(timeout); }
  const payload = parseApiBody(raw);
  if (response.status === 429) {
    const delay = retryDelay(response.headers.get('Retry-After'));
    retryAfterAt = Math.max(retryAfterAt, Date.now() + delay);
    if (canRetry && delay <= 30_000) return requestApi<T>(path, options, false);
    const error = new ApiError('Klimate is busy. Please try again shortly.', 429);
    error.retryAfterMs = delay;
    throw error;
  }
  if (!response.ok) {
    throw new ApiError(
      payload.code === 'MODULE_DISABLED' ? 'This feature is not enabled for your organization.' : typeof payload.message === 'string' ? payload.message : `Klimate returned HTTP ${response.status}.`,
      response.status,
      typeof payload.code === 'string' ? payload.code : undefined,
    );
  }
  if (response.status === 204) return undefined as T;
  return unwrapApiPayload<T>(payload);
}

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Pull down to try again.';
}
