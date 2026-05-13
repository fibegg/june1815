import type {
  AuthStatus,
  ConversationSummary,
  CreateConversationInput,
  SendMessageInput,
  SseEvent,
} from './types.js';

const TOKEN_KEY = 'june15.token';

/** Capture `?token=...` from the URL into sessionStorage and strip it
 *  from the address bar so we don't ship the token in browser history or
 *  navigation logs. Returns the token if one was present. */
export function captureTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('token');
  if (!fromUrl) return sessionStorage.getItem(TOKEN_KEY);
  sessionStorage.setItem(TOKEN_KEY, fromUrl);
  url.searchParams.delete('token');
  window.history.replaceState({}, '', url.toString());
  return fromUrl;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

function headers(token: string | null, extra: Record<string, string> = {}): HeadersInit {
  const out: Record<string, string> = { ...extra };
  if (token) out['Authorization'] = `Bearer ${token}`;
  return out;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    clearToken();
    throw new Error('unauthorized — token missing or invalid');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const r = await fetch('/v1/auth/status', { headers: headers(getToken()) });
  return jsonOrThrow<AuthStatus>(r);
}

export async function listConversations(): Promise<readonly ConversationSummary[]> {
  const r = await fetch('/v1/conversations', { headers: headers(getToken()) });
  const body = await jsonOrThrow<{ conversations: ConversationSummary[] }>(r);
  return body.conversations;
}

export async function createConversation(
  input: CreateConversationInput,
): Promise<ConversationSummary> {
  const r = await fetch('/v1/conversations', {
    method: 'POST',
    headers: headers(getToken(), { 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  return jsonOrThrow<ConversationSummary>(r);
}

export async function deleteConversation(id: string): Promise<void> {
  const r = await fetch(`/v1/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(getToken()),
  });
  await jsonOrThrow<void>(r);
}

export async function interrupt(id: string): Promise<void> {
  const r = await fetch(`/v1/conversations/${encodeURIComponent(id)}/interrupt`, {
    method: 'POST',
    headers: headers(getToken(), { 'Content-Type': 'application/json' }),
    body: '{}',
  });
  await jsonOrThrow<{ interrupted: boolean }>(r);
}

export async function queueMessage(
  id: string,
  input: SendMessageInput,
): Promise<{ messageId: string }> {
  const r = await fetch(`/v1/conversations/${encodeURIComponent(id)}/queue`, {
    method: 'POST',
    headers: headers(getToken(), { 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  return jsonOrThrow<{ messageId: string; queued: boolean }>(r);
}

export async function steerMessage(
  id: string,
  text: string,
): Promise<{ messageId: string }> {
  const r = await fetch(`/v1/conversations/${encodeURIComponent(id)}/steer`, {
    method: 'POST',
    headers: headers(getToken(), { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text }),
  });
  return jsonOrThrow<{ messageId: string; steered: boolean }>(r);
}

/**
 * Send a message and stream SSE events back via `onEvent`. The returned
 * promise resolves when the stream closes (after `done` or `error`).
 *
 * `signal` lets callers abort the underlying fetch — useful for UI
 * cleanups when the user navigates away mid-stream.
 */
export async function streamMessage(
  id: string,
  input: SendMessageInput,
  onEvent: (e: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const fetchInit: RequestInit = {
    method: 'POST',
    headers: headers(getToken(), {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    }),
    body: JSON.stringify(input),
  };
  if (signal) fetchInit.signal = signal;
  const res = await fetch(`/v1/conversations/${encodeURIComponent(id)}/messages`, fetchInit);
  if (res.status === 401) {
    clearToken();
    throw new Error('unauthorized — token missing or invalid');
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLine = raw.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      try {
        const evt = JSON.parse(dataLine.slice('data: '.length)) as SseEvent;
        onEvent(evt);
        if (evt.type === 'done' || evt.type === 'error') return;
      } catch {
        /* tolerate malformed event */
      }
    }
  }
}
