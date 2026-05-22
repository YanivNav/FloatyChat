import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { buildToolRegistry, type BackendTool, type SendFn, type ToolContext, type ToolResult } from './tools/tools';
import { initProductVersionHandler } from './tools/store/product-version-handler';
import type { FrontendAction, VisitorContext } from '../../shared/types';
import { parseToolSettings } from '../../shared/types';
import { buildSystemPrompt } from './system-prompt';
import { checkRateLimit } from './ratelimit';
import { loadBotSettings } from './settings';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlock[];
}

interface SendMessageRequest {
  message: string;
  history: ConversationMessage[];
  context?: VisitorContext;
}

async function executeTool(
  id: string,
  name: string,
  input: unknown,
  registry: Map<string, BackendTool<any>>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = registry.get(name);
  if (!tool) {
    return { earlyExit: false, result: { type: 'tool_result', tool_use_id: id, content: JSON.stringify({ error: `Unknown tool: ${name}` }) } };
  }
  console.log(`Executing tool: ${name} with input:`, input);
  const res = await tool.execute(input, ctx);
  if (res.earlyExit) {
    return { earlyExit: true }
  }
  console.log(`Tool result for ${name}:`, res);
  return { earlyExit: false, result: { type: 'tool_result', tool_use_id: id, content: JSON.stringify(res) } };
}

async function runAgentLoop(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
  tools: Anthropic.Tool[],
  registry: Map<string, BackendTool<any>>,
  send: SendFn,
): Promise<void> {
  const frontendActions: FrontendAction[] = [];
  const MAX_ITERATIONS = 5;
  let finalText = '';
  let lastNonEmptyText = '';

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const apiStream = client.messages.stream({
      cache_control: {
        type: 'ephemeral',
        ttl: '1h'
      },
      thinking: {
        type: 'adaptive',
        display: 'omitted'
      },
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });

    let iterationText = '';
    for await (const chunk of apiStream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        iterationText += chunk.delta.text;
        send({ type: 'heartbeat' });
      }
    }

    const response = await apiStream.finalMessage();
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn' || response.stop_reason !== 'tool_use') {
      finalText = iterationText || lastNonEmptyText;
      break;
    }

    if (iterationText) lastNonEmptyText = iterationText;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let earlyExit = false;
    const ctx: ToolContext = { frontendActions, send };

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = await executeTool(block.id, block.name, block.input, registry, ctx);
      if (result.earlyExit) {
        finalText = iterationText;
        earlyExit = true;
        break;
      } else {
        toolResults.push(result.result);
      }
    }

    if (earlyExit) break;
    messages.push({ role: 'user', content: toolResults });
  }

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
  const registry = await buildToolRegistry(parseToolSettings(botSettings.toolSettings));
  const tools = Array.from(registry.values()).map((t) => t.schema);

  const initialMessages: Anthropic.MessageParam[] = [
    ...(history ?? []).slice(-20).map((h) => ({ role: h.role, content: h.content as string })),
    { role: 'user', content: message.trim() },
  ];

  return createSSEResponse(async (send) => {
    const client = new Anthropic({ apiKey: import.meta.env.CLAUDE_API_KEY || '' });
    await runAgentLoop(client, initialMessages, systemPrompt, tools, registry, send);
  });
};
