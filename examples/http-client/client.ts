/**
 * Minimal SSE client for a running `june1815 gogogo` instance.
 * Usage:
 *   JUNE1815_BEARER=<token> npx tsx client.ts "say hi"
 */

const URL_BASE = process.env['JUNE1815_URL'] ?? 'http://127.0.0.1:7150';
const BEARER = process.env['JUNE1815_BEARER'] ?? '';
const CWD = process.env['JUNE1815_CWD'] ?? '/tmp';

if (!BEARER) {
  // eslint-disable-next-line no-console
  console.error('JUNE1815_BEARER env var required (the bearer token printed by `june1815 gogogo`)');
  process.exit(2);
}

const text = process.argv.slice(2).join(' ') || 'say hi in three words';

interface ConversationSummary {
  id: string;
}

interface SseEvent {
  type: string;
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  messageId?: string;
  name?: string;
  summary?: string;
  code?: string;
  message?: string;
}

async function createConversation(): Promise<string> {
  const res = await fetch(`${URL_BASE}/v1/conversations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${BEARER}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ cwd: CWD }),
  });
  if (!res.ok) {
    throw new Error(`create failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as ConversationSummary;
  return body.id;
}

async function streamMessage(conversationId: string, prompt: string): Promise<void> {
  const res = await fetch(`${URL_BASE}/v1/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${BEARER}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ text: prompt }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`messages failed: ${res.status} ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    let frameEnd: number;
    while ((frameEnd = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, frameEnd);
      buf = buf.slice(frameEnd + 2);
      const lines = frame.split('\n');
      const dataLine = lines.find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      const event = JSON.parse(dataLine.slice('data: '.length)) as SseEvent;
      handle(event);
      if (event.type === 'done' || event.type === 'error') return;
    }
  }
}

function handle(event: SseEvent): void {
  switch (event.type) {
    case 'text_delta':
      process.stdout.write(event.text ?? '');
      break;
    case 'reasoning_delta':
      process.stdout.write(`\n[thinking] ${event.text ?? ''}`);
      break;
    case 'tool_use':
      process.stdout.write(`\n[tool ${event.name}${event.summary ? `(${event.summary})` : ''}]\n`);
      break;
    case 'usage':
      // eslint-disable-next-line no-console
      console.error(`\n[usage] in=${event.inputTokens} out=${event.outputTokens}`);
      break;
    case 'done':
      // eslint-disable-next-line no-console
      console.error('\n[done]');
      break;
    case 'error':
      // eslint-disable-next-line no-console
      console.error(`\n[error] ${event.code}: ${event.message}`);
      break;
    default:
      // unknown event type — swallow
      break;
  }
}

const conversationId = await createConversation();
await streamMessage(conversationId, text);
