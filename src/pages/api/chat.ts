import type { APIRoute } from 'astro';
import { siteProperties } from '@wix/business-tools';
import { auth } from '@wix/essentials';
import Anthropic from '@anthropic-ai/sdk';
import { buildTools, executeSearchProducts, type Page, type FrontendAction } from './tools';

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
  productPageUrl?: {
    base?: string;
    path?: string;
  };
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


async function resolveCartProduct(input: AddToCartInput): Promise<ProductSearchResult | undefined> {
  console.log('Resolving product for cart with input:', input);
  if (input.product_id) {
    return { _id: input.product_id, name: input.product_name };
  }

  if (input.product_name) {
    const byName = await executeSearchProducts({ query: input.product_name, limit: 5 });
    if (byName.found && Array.isArray(byName.products) && byName.products.length > 0) {
      return byName.products[0] as ProductSearchResult;
    }
  }

  return undefined;
}

const FALLBACK_SYSTEM_PROMPT =
      'You are a helpful AI assistant for this website. Only answer questions related to this website and its business. If asked about unrelated topics, politely decline and offer to help with something relevant to this site instead. When the visitor asks broad catalog questions like "what do you sell?" or asks for recommendations without an exact product name, use the search_products tool with browse_all=true. For product navigation, first call search_products to find the exact product, then call navigate_to_page with the product_id from the search result. Do not send a bare "/product-page" URL for product navigation.';

async function buildSystemPrompt(): Promise<string> {
  try {
    const elevatedGetSiteProperties = auth.elevate(siteProperties.getSiteProperties);
    const result = await elevatedGetSiteProperties({
      fields: ['businessName', 'siteDisplayName', 'description', 'categories'],
    });

    const props = result.properties;
    const name = props?.businessName || props?.siteDisplayName || 'this website';
    const description = props?.description;
    const category = props?.categories?.primary;

    let prompt = `You are an AI assistant for ${name}.`;

    if (description) {
      prompt += ` ${description}`;
    } else if (category) {
      prompt += ` This is a ${category} business.`;
    }

    prompt += `\n\nYour role is to help visitors with questions about ${name} - its products, services, content, and any information related to this site. Only answer questions relevant to this website and its business. If a visitor asks about something unrelated, politely decline and redirect them to how you can help with ${name}. When a visitor asks broad catalog questions like "what products do you sell?", "show me what you have", or asks for recommendations without an exact product name, call search_products with browse_all set to true. When the visitor gives attributes like color, use those words in query even if the exact product name is unknown. When adding a product to cart, include any variant choices the visitor mentioned or answered with in variant_options, using the exact choice names and values from the conversation. When navigating to a product page, provide the product_name from the user request and do not try to guess the slug yourself; the backend will search the catalog and resolve the final URL.`;

    return prompt;
  } catch {
    return FALLBACK_SYSTEM_PROMPT;
  }
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
  const [systemPrompt, tools] = await Promise.all([
    buildSystemPrompt(),
    Promise.resolve(buildTools(pages)),
  ]);

  try {
    const client = new Anthropic({ apiKey });

    const messages: Anthropic.MessageParam[] = [
      ...(history ?? []).map((h) => ({ role: h.role, content: h.content as string })),
      { role: 'user', content: message.trim() },
    ];

    const frontendActions: FrontendAction[] = [];
    const MAX_ITERATIONS = 5;
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        tools: tools as Anthropic.Tool[],
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b) => b.type === 'text');
        return new Response(
          JSON.stringify({
            text: textBlock?.type === 'text' ? textBlock.text : '',
            actions: frontendActions,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (response.stop_reason !== 'tool_use') {
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const { id, name, input } = block;
        let result: unknown;

        if (name === 'search_products') {
          result = await executeSearchProducts(input as { query?: string; browse_all?: boolean; max_price?: number; limit?: number });
        } else if (name === 'ask_clarification') {
          return new Response(
            JSON.stringify({
              text: (input as { question: string }).question,
              actions: frontendActions,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } else if (name === 'navigate_to_page') {
          const navigationInput = input as NavigateToPageInput;
          frontendActions.push({
            type: name,
            ...(input as Record<string, unknown>),
            url: navigationInput.url,
          });
          result = { success: true, resolvedUrl: navigationInput.url };
        } else if (name === 'add_to_cart') {
          const cartInput = input as AddToCartInput;
          const resolvedProduct = await resolveCartProduct(cartInput);

          if (resolvedProduct?._id) {
            frontendActions.push({
              type: name,
              product_id: resolvedProduct._id,
              product_name: resolvedProduct.name ?? cartInput.product_name ?? resolvedProduct._id,
              quantity: cartInput.quantity ?? 1,
              variant_options: cartInput.variant_options,
            });
            result = {
              success: true,
              product_id: resolvedProduct._id,
              product_name: resolvedProduct.name ?? cartInput.product_name ?? resolvedProduct._id,
              quantity: cartInput.quantity ?? 1,
              variant_options: cartInput.variant_options,
            };
          } else {
            result = {
              success: false,
              message: 'Could not find the product to add to cart.',
            };
          }
        } else {
          frontendActions.push({ type: name, ...(input as Record<string, unknown>) });
          result = { success: true };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    return new Response(
      JSON.stringify({ text: 'Sorry, something went wrong. Please try again.', actions: frontendActions }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: 'Could not get response from the AI', detail: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
