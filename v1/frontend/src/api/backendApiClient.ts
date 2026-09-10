export async function requestBackend<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(!(init?.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(data.error || 'Request failed');
  }
  return response.json();
}
export function postBackend<T>(path: string, body: unknown = {}) {
  return requestBackend<T>(path, { method: 'POST', body: JSON.stringify(body) });
}
export async function streamBackendEvents(
  path: string,
  body: unknown,
  onEvent: (type: string, payload: any) => void,
  signal: AbortSignal,
) {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error);
  }
  if (!response.body) throw new Error('No response stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of event.split('\n'))
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'error') throw new Error(data.payload.message);
            if (data.type === 'done') finished = true;
            onEvent(data.type, data.payload);
          }
      }
      if (done) break;
    }
    if (!finished) throw new Error('The response ended before completion');
  } finally {
    await reader.cancel().catch(() => {});
  }
}
