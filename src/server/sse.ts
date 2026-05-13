import type { SseEvent } from './events.js';

/** Format a typed event as a single SSE frame (event + data + blank line). */
export function formatSseFrame(event: SseEvent): string {
  const lines = [`event: ${event.type}`, `data: ${JSON.stringify(event)}`, '', ''];
  return lines.join('\n');
}

/** SSE comment heartbeat. Servers send this on idle streams so intermediate
 *  proxies don't reap the connection. */
export const SSE_HEARTBEAT = ': keep-alive\n\n';

/** Standard headers for an SSE response. */
export const SSE_HEADERS = Object.freeze({
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
});
