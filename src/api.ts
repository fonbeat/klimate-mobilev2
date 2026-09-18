const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://web-api.klimate.app').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...requestOptions } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    headers: {
      Accept: 'application/json',
      ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const raw = response.status === 204 ? '' : await response.text();
  let payload: any = {};
  if (raw) {
    try { payload = JSON.parse(raw); }
    catch { payload = { message: raw.trim() }; }
  }
  if (!response.ok) {
    throw new ApiError(payload.message || `Klimate returned HTTP ${response.status}.`, response.status, payload.code);
  }
  if (response.status === 204) return undefined as T;
  return (payload.data ?? payload) as T;
}

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Pull down to try again.';
}
