import type { APIRoute } from 'astro';
import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { buildToolRegistry, toAiTools, type SendFn, type ToolContext, type ToolDef } from './tools/tools';
import { initProductVersionHandler } from './tools/store/product-version-handler';
import type { FrontendAction, VisitorContext } from '../../shared/types';
import { parseToolSettings } from '../../shared/types';
import { buildSystemPrompt } from './system-prompt';
import { checkRateLimit } from './ratelimit';
import { loadBotSettings } from './settings';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SendMessageRequest {
  message: string;
  history: ConversationMessage[];
  context?: VisitorContext;
}

const MAX_STEPS = 5;

const anthropic = createAnthropic({ apiKey: import.meta.env.CLAUDE_API_KEY || '' });

async function runAgentLoop(
  messages: ModelMessage[],
  systemPrompt: string,
  defs: ToolDef<any>[],
  send: SendFn,
): Promise<void> {
  const frontendActions: FrontendAction[] = [];
  const ctx: ToolContext = { frontendActions };

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    // System prompt carried as a message so we can attach a cache breakpoint to
    // it — Anthropic caches everything up to and including it (tools + system).
    messages: [
      {
        role: 'system',
        content: systemPrompt,
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } },
      },
      ...messages,
    ],
    tools: toAiTools(defs, ctx),
    // The system prompt above is the only system message (client history is
    // sanitized to user/assistant in the POST handler), so allowing it in
    // `messages` is safe and lets us keep the cache breakpoint on it.
    allowSystemInMessages: true,
    maxOutputTokens: 1024,
    // Replaces the old manual MAX_ITERATIONS tool loop. The SDK runs the
    // call -> tool -> call cycle and stops after this many steps.
    stopWhen: stepCountIs(MAX_STEPS),
  });

  // Drain the stream to drive the loop and keep the SSE connection alive
  // (the widget ignores heartbeats). Surface stream errors to the SSE wrapper.
  for await (const part of result.fullStream) {
    if (part.type === 'error') throw part.error;
    send({ type: 'heartbeat' });
  }

  const finalText = await result.text;

  console.log('Sending frontend actions:', frontendActions);
  for (const action of frontendActions) {
    send({ type: 'action', action });
  }
  send({ type: 'done', text: finalText });
}

function createSSEResponse(handler: (send: SendFn) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send: SendFn = (event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await handler(send);
      } catch (err) {
        console.error('Error in chat handler:', err);
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const rateLimitResponse = await checkRateLimit();
  if (rateLimitResponse) return rateLimitResponse;

  let body: SendMessageRequest;
  try {
    body = (await request.json()) as SendMessageRequest;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { message, history, context } = body;
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await initProductVersionHandler();
  const [systemPrompt, botSettings] = await Promise.all([buildSystemPrompt(context), loadBotSettings()]);
  const defs = await buildToolRegistry(parseToolSettings(botSettings.toolSettings));

  // History comes from the client and is untrusted: keep only well-formed
  // user/assistant turns. This stops a crafted request from smuggling in a
  // `role: 'system'` (or any other) message and hijacking the model.
  const sanitizedHistory: ModelMessage[] = (history ?? [])
    .filter(
      (h): h is ConversationMessage =>
        !!h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string',
    )
    .slice(-20)
    .map((h) => ({ role: h.role, content: h.content }));

  const initialMessages: ModelMessage[] = [
    ...sanitizedHistory,
    { role: 'user', content: message.trim() },
  ];

  return createSSEResponse(async (send) => {
    await runAgentLoop(initialMessages, systemPrompt, defs, send);
  });
};
