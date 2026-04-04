import type { APIRoute } from 'astro';
import { siteProperties } from '@wix/business-tools';
import { auth } from '@wix/essentials';
import Anthropic from '@anthropic-ai/sdk';
import { buildToolRegistry, type BackendTool, type SendFn, type ToolContext, type ToolExecutionResult, type Page, type ToolResult } from './tools';
import { initProductVersionHandler } from './store/product-version-handler';
import type { FrontendAction } from '../../shared/types';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlock[];
}

interface SendMessageRequest {
  message: string;
  history: ConversationMessage[];
}

const FALLBACK_SYSTEM_PROMPT =
  `You are a helpful AI assistant for this website.
  Only answer questions related to this website and its business.
  If asked about unrelated topics, politely decline and offer to help with something relevant to this site instead.`;

async function buildSystemPrompt(): Promise<string> {
  try {
    const result = await auth.elevate(siteProperties.getSiteProperties)({
      fields: ['businessName', 'siteDisplayName', 'description', 'categories'],
    });

    const props = result.properties;
    const name = props?.businessName || props?.siteDisplayName || 'this website';
    const description = props?.description;
    const category = props?.categories?.primary;

    let prompt = `You are an AI assistant for ${name}.`;
    if (description) prompt += ` ${description}`;
    else if (category) prompt += ` This is a ${category} business.`;

    prompt += `\n\nYour role is to help visitors with questions about ${name} - its products, services, content, and any information related to this site. Only answer questions relevant to this website and its business. If a visitor asks about something unrelated, politely decline and redirect them to how you can help with ${name}. When a visitor asks broad catalog questions like "what products do you sell?", "show me what you have", or asks for recommendations without an exact product name, call search_products with browse_all set to true. When the visitor gives attributes like color, use those words in query even if the exact product name is unknown. When adding a product to cart, include any variant choices the visitor mentioned or answered with in variant_options, using the exact choice names and values from the conversation. When navigating to a product page, provide the product_name from the user request and do not try to guess the slug yourself; the backend will search the catalog and resolve the final URL. After calling search_products, the results are shown as visual product cards — do NOT list or describe each product individually in your text response. Keep your text reply very short, e.g. "Here's what I found:" or "Here are some options for you:" and let the cards speak for themselves.`;

    return prompt;
  } catch {
    return FALLBACK_SYSTEM_PROMPT;
  }
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
  const res = await tool.execute(input, ctx);
  if (res.earlyExit) {
    return { earlyExit: true }
  }
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

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const apiStream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
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
      finalText = iterationText;
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let earlyExit = false;
    const ctx: ToolContext = { frontendActions, send };

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = await executeTool(block.id, block.name, block.input, registry, ctx);
      if (result.earlyExit) {
        finalText = iterationText; 
        earlyExit = true; break;
      } else {
        toolResults.push(result.result);
      }
    }

    if (earlyExit) break;
    messages.push({ role: 'user', content: toolResults });
  }

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
  let body: SendMessageRequest;
  try {
    body = (await request.json()) as SendMessageRequest;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { message, history } = body;
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await initProductVersionHandler();
  const [systemPrompt, registry] = await Promise.all([buildSystemPrompt(), buildToolRegistry()]);
  const tools = Array.from(registry.values()).map((t) => t.schema);

  const initialMessages: Anthropic.MessageParam[] = [
    ...(history ?? []).map((h) => ({ role: h.role, content: h.content as string })),
    { role: 'user', content: message.trim() },
  ];

  return createSSEResponse(async (send) => {
    const client = new Anthropic({ apiKey: import.meta.env.CLAUDE_API_KEY || '' });
    await runAgentLoop(client, initialMessages, systemPrompt, tools, registry, send);
  });
};
