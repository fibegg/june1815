export interface SseFrame {
  readonly event: string;
  readonly data: unknown;
}

/** Stream SSE frames from a fetch Response. The generator completes when
 *  the body ends (the server closes after `done` or `error`). */
export async function* readSse(res: Response): AsyncGenerator<SseFrame> {
  if (!res.body) throw new Error('no response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const lines = raw.split('\n');
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice('event: '.length).trim();
        else if (line.startsWith('data: ')) data += line.slice('data: '.length);
      }
      if (data.length === 0) continue;
      try {
        yield { event, data: JSON.parse(data) };
      } catch {
        yield { event, data };
      }
    }
  }
}
