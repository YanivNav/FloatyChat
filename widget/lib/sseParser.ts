import type { FrontendAction } from '../types';

// Server-sent event shapes emitted by /api/chat. `heartbeat` events are sent
// while the model streams and carry no payload we render — they exist only to
// keep the connection alive past intermediaries' idle timeouts.
export type SSEEvent =
  | { type: 'heartbeat' }
  | { type: 'action'; action: FrontendAction }
  | { type: 'done'; text?: string }
  | { type: 'error' };

/**
 * Parse a chat SSE body into typed events. Pure (no React/DOM beyond the stream
 * reader) and framework-agnostic, so it can be unit-tested in isolation.
 */
export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      if (!part.startsWith('data: ')) continue;
      try {
        yield JSON.parse(part.slice(6)) as SSEEvent;
      } catch {
        // Ignore malformed frames.
      }
    }
  }
}
