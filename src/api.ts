const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://web-api.klimate.app').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;

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
  const payload = parseApiBody(raw);
  if (!response.ok) {
    throw new ApiError(
      typeof payload.message === 'string' ? payload.message : `Klimate returned HTTP ${response.status}.`,
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
