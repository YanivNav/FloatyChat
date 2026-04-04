import type { APIRoute } from 'astro';
import { siteProperties } from '@wix/business-tools';
import { auth } from '@wix/essentials';
import Anthropic from '@anthropic-ai/sdk';
import { buildTools, executeSearchProducts, resolveVariantId, type Page, type FrontendAction } from './tools';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlock[];
}

interface SendMessageRequest {
  message: string;
  history: ConversationMessage[];
  pages?: Page[];
}

interface ProductSearchResult {
  _id?: string;
  name?: string;
  slug?: string;
}

interface NavigateToPageInput {
  url: string;
  name?: string;
  product_slug?: string;
}

interface AddToCartInput {
  product_id?: string;
  product_name?: string;
  quantity?: number;
  variant_options?: Record<string, string>;
}

type SendFn = (event: object) => void;

type ToolExecutionResult =
  | { earlyExit: false; toolResult: Anthropic.ToolResultBlockParam }
  | { earlyExit: true };

const FALLBACK_SYSTEM_PROMPT =
  'You are a helpful AI assistant for this website. Only answer questions related to this website and its business. If asked about unrelated topics, politely decline and offer to help with something relevant to this site instead. When the visitor asks broad catalog questions like "what do you sell?" or asks for recommendations without an exact product name, use the search_products tool with browse_all=true. For product navigation, first call search_products to find the exact product, then call navigate_to_page with the product_id from the search result. Do not send a bare "/product-page" URL for product navigation.';

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

    prompt += `\n\nYour role is to help visitors with questions about ${name} - its products, services, content, and any information related to this site. Only answer questions relevant to this website and its business. If a visitor asks about something unrelated, politely decline and redirect them to how you can help with ${name}. When a visitor asks broad catalog questions like "what products do you sell?", "show me what you have", or asks for recommendations without an exact product name, call search_products with browse_all set to true. When the visitor gives attributes like color, use those words in query even if the exact product name is unknown. When adding a product to cart, include any variant choices the visitor mentioned or answered with in variant_options, using the exact choice names and values from the conversation. When navigating to a product page, provide the product_name from the user request and do not try to guess the slug yourself; the backend will search the catalog and resolve the final URL.`;

    return prompt;
  } catch {
    return FALLBACK_SYSTEM_PROMPT;
  }
}

// ─── Cart helpers ─────────────────────────────────────────────────────────────

async function resolveCartProduct(input: AddToCartInput): Promise<ProductSearchResult | undefined> {
  if (input.product_id) {
    return { _id: input.product_id, name: input.product_name };
  }
  if (input.product_name) {
    const result = await executeSearchProducts({ query: input.product_name, limit: 5 });
    if (result.found && Array.isArray(result.products) && result.products.length > 0) {
      return result.products[0] as ProductSearchResult;
    }
  }
  return undefined;
}

async function executeTool(
  id: string,
  name: string,
  input: unknown,
  frontendActions: FrontendAction[],
  send: SendFn,
): Promise<ToolExecutionResult> {
  const makeResult = (content: unknown): ToolExecutionResult => ({
    earlyExit: false,
    toolResult: { type: 'tool_result', tool_use_id: id, content: JSON.stringify(content) },
  });

  if (name === 'search_products') {
    const result = await executeSearchProducts(
      input as { query?: string; browse_all?: boolean; max_price?: number; limit?: number },
    );
    return makeResult(result);
  }

  if (name === 'ask_clarification') {
    send({ type: 'token', text: (input as { question: string }).question });
    return { earlyExit: true };
  }

  if (name === 'navigate_to_page') {
    const { url, ...rest } = input as NavigateToPageInput;
    frontendActions.push({ type: name, ...rest, url });
    return makeResult({ success: true, resolvedUrl: url });
  }

  if (name === 'add_to_cart') {
    const cartInput = input as AddToCartInput;
    const product = await resolveCartProduct(cartInput);

    if (!product?._id) {
      return makeResult({ success: false, message: 'Could not find the product to add to cart.' });
    }

    let variantId: string | undefined;
    if (cartInput.variant_options && Object.keys(cartInput.variant_options).length > 0) {
      variantId = await resolveVariantId(product._id, cartInput.variant_options);
    }

    const action: FrontendAction = {
      type: name,
      product_id: product._id,
      product_name: product.name ?? cartInput.product_name ?? product._id,
      quantity: cartInput.quantity ?? 1,
      variant_id: variantId,
    };
    frontendActions.push(action);
    return makeResult({ success: true, ...action });
  }

  frontendActions.push({ type: name, ...(input as Record<string, unknown>) });
  return makeResult({ success: true });
}

async function runAgentLoop(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
  tools: Anthropic.Tool[],
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

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = await executeTool(block.id, block.name, block.input, frontendActions, send);
      if (result.earlyExit) { finalText = iterationText; earlyExit = true; break; }
      toolResults.push(result.toolResult);
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

  const { message, history, pages = [] } = body;
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey: string = import.meta.env.CLAUDE_API_KEY || '';
  const [systemPrompt, tools] = await Promise.all([buildSystemPrompt(), Promise.resolve(buildTools(pages))]);

  const initialMessages: Anthropic.MessageParam[] = [
    ...(history ?? []).map((h) => ({ role: h.role, content: h.content as string })),
    { role: 'user', content: message.trim() },
  ];

  return createSSEResponse(async (send) => {
    const client = new Anthropic({ apiKey });
    await runAgentLoop(client, initialMessages, systemPrompt, tools as Anthropic.Tool[], send);
  });
};
