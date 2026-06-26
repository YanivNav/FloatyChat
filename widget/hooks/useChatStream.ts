import { useCallback, useState } from 'react';
import { wixClient } from '../wix-client';
import type { FrontendAction, Message, VisitorContext } from '../types';
import { parseSSEStream } from '../lib/sseParser';
import { apiOrigin, GENERIC_ERROR_MESSAGE, RATE_LIMIT_MESSAGE } from '../lib/constants';

export interface ChatHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface SendOptions {
  history: ChatHistoryEntry[];
  context: VisitorContext;
}

export interface UseChatStreamArgs {
  onMessage: (message: Message) => void;
  onActions: (actions: FrontendAction[]) => void;
}

/**
 * Drives a single chat turn: posts to /api/chat, streams the SSE response, and
 * surfaces bot messages + frontend actions via callbacks. Actions are collected
 * and dispatched once on `done` (matching the backend's batched protocol).
 */
export function useChatStream({ onMessage, onActions }: UseChatStreamArgs) {
  const [isTyping, setIsTyping] = useState<boolean>(false);

  const sendMessage = useCallback(
    async (text: string, { history, context }: SendOptions): Promise<void> => {
      onMessage({ id: `user-${Date.now()}`, role: 'user', text });
      setIsTyping(true);

      try {
        const res = await wixClient.fetchWithAuth(`${apiOrigin()}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history, context }),
        });

        if (res.status === 429) {
          setIsTyping(false);
          onMessage({ id: `bot-rl-${Date.now()}`, role: 'bot', text: RATE_LIMIT_MESSAGE });
          return;
        }

        // Non-streaming fallback (e.g. an error response with a JSON body).
        if (!res.body) {
          const data = (await res.json()) as { text?: string; actions?: FrontendAction[]; error?: string };
          setIsTyping(false);
          const replyText = data.error ? GENERIC_ERROR_MESSAGE : data.text ?? '';
          if (replyText.trim()) onMessage({ id: `bot-${Date.now()}`, role: 'bot', text: replyText });
          if (data.actions?.length) onActions(data.actions);
          return;
        }

        await consumeStream(res.body, { onMessage, onActions, setIsTyping });
      } catch (err) {
        console.error('[floaty-chat] sendMessage error:', err);
        onMessage({ id: `bot-err-${Date.now()}`, role: 'bot', text: GENERIC_ERROR_MESSAGE });
        setIsTyping(false);
      }
    },
    [onMessage, onActions],
  );

  return { sendMessage, isTyping };
}

async function consumeStream(
  body: ReadableStream<Uint8Array>,
  {
    onMessage,
    onActions,
    setIsTyping,
  }: {
    onMessage: (message: Message) => void;
    onActions: (actions: FrontendAction[]) => void;
    setIsTyping: React.Dispatch<React.SetStateAction<boolean>>;
  },
): Promise<void> {
  const pendingActions: FrontendAction[] = [];
  let settled = false;

  for await (const event of parseSSEStream(body)) {
    if (event.type === 'action') {
      pendingActions.push(event.action);
    } else if (event.type === 'done') {
      setIsTyping(false);
      if (event.text?.trim()) onMessage({ id: `bot-${Date.now()}`, role: 'bot', text: event.text });
      if (pendingActions.length) onActions(pendingActions);
      settled = true;
      break;
    } else if (event.type === 'error') {
      console.error('Error from chat stream');
      setIsTyping(false);
      onMessage({ id: `bot-err-${Date.now()}`, role: 'bot', text: GENERIC_ERROR_MESSAGE });
      settled = true;
      break;
    }
    // heartbeat events are intentionally ignored.
  }

  // Stream ended without an explicit `done` — flush whatever we collected.
  if (!settled) {
    setIsTyping(false);
    if (pendingActions.length) onActions(pendingActions);
  }
}
