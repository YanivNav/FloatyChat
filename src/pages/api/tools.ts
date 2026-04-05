import type Anthropic from "@anthropic-ai/sdk";
import { items } from '@wix/data';
import { auth } from '@wix/essentials';
import { productVersionHandler } from './store/product-version-handler';
import type { AddToCartAction, FaqEntry, FrontendAction } from '../../shared/types';
import { FAQ_COLLECTION_ID } from '../../shared/collection-utils';

export interface Page {
  name: string;
  url: string;
}

export interface SearchProductsInput {
  query?: string;
  browse_all: boolean;
  max_price?: number;
  limit: number;
}

export interface NavigateToPageInput {
  url: string;
  name?: string;
  product_slug?: string;
}

export interface AddToCartInput {
  product_id?: string;
  product_name?: string;
  quantity?: number;
  variant_options?: Record<string, string>;
}

export type SendFn = (event: object) => void;

export type ToolExecutionResult = any | { earlyExit: true };

export type ToolResult = { earlyExit: true } | { earlyExit: false, result: Anthropic.ToolResultBlockParam };

export interface ToolContext {
  frontendActions: FrontendAction[];
  send: SendFn;
}

export interface BackendTool<TInput = unknown> {
  schema: Anthropic.Tool;
  execute: (input: TInput, ctx: ToolContext) => Promise<ToolExecutionResult>;
}

const searchProductsTool: BackendTool<SearchProductsInput> = {
  schema: {
    name: 'search_products',
    description: 'Search or browse the store catalog. Use this when the visitor asks about products, wants recommendations, asks what the store sells, or needs help finding an item even if they do not know the exact product name. For broad catalog questions like "what do you sell?" set browse_all to true. After using this tool the user will see the results as cards, so your text response should be very brief',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional search phrase, e.g. "blue shirt", "running shoes", or "gift ideas". Leave empty when browsing the catalog generally.',
        },
        browse_all: {
          type: 'boolean',
          description: 'Set to true when the visitor wants to browse the catalog or asks general questions like "what products do you sell?"',
        },
        max_price: { type: 'number', description: 'Optional maximum price filter' },
        limit: { type: 'number', description: 'Max number of results to return, default 5' },
      },
      required: ['browse_all', 'limit'],
    },
  },
  execute: async (input, ctx) => {
    const result = await productVersionHandler.searchProducts(input);
    if (result.found && Array.isArray(result.products) && result.products.length > 0) {
      ctx.frontendActions.push({ type: 'show_products', products: result.products.map((p) => productVersionHandler.toProductCard(p)) });
    }
    return result;
  },
};

const askClarificationTool: BackendTool<{ question: string }> = {
  schema: {
    name: 'ask_clarification',
    description: 'Ask the visitor a follow-up question before proceeding, e.g. to clarify size, color, or quantity.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The clarifying question to ask' },
      },
      required: ['question'],
    },
  },
  execute: async (input, ctx) => {
    ctx.send({ type: 'token', text: input.question });
    return { earlyExit: true };
  },
};

const addToCartTool: BackendTool<AddToCartInput> = {
  schema: {
    name: 'add_to_cart',
    description: "Add a product to the visitor's cart. By default, add 1 to the quantity. If the user specifies a different quantity, use that instead. If the product has options/variants and the visitor hasn't specified them, use ask_clarification first. When the visitor provides variant choices such as size or color, include them in variant_options according to the available options the product has.",
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'The product ID from search results' },
        product_name: { type: 'string', description: 'The product name, for confirmation messaging' },
        quantity: { type: 'number', description: 'Quantity to add' },
        variant_options: {
          type: 'object',
          description: 'Optional product variant selections, for example { "size": "M", "color": "White" }. Use only when the visitor specified variant choices.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['product_id', 'product_name', 'quantity'],
    },
  },
  execute: async (input, ctx) => {
    const results = await productVersionHandler.resolveCartProduct(input);

    if (!results.found || results.products.length === 0) {
      return { error: 'Could not find the product to add to cart.' };
    }
    const product = results.products[0]!;

    let variantId: string | undefined;
    if (input.variant_options && Object.keys(input.variant_options).length > 0) {
      variantId = await productVersionHandler.resolveVariantId(product._id!, input.variant_options);
    }

    const action: AddToCartAction = {
      type: 'add_to_cart',
      product_id: product._id!,
      product_name: product.name ?? input.product_name ?? product._id!,
      quantity: input.quantity ?? 1,
      variant_id: variantId,
    };
    ctx.frontendActions.push(action);
    return action;
  },
};

const proceedToCheckoutTool: BackendTool = {
  schema: {
    name: 'proceed_to_checkout',
    description: 'Navigate the visitor to the checkout page. Only call this after the visitor explicitly confirms they want to check out.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  execute: async (input, ctx) => {
    ctx.frontendActions.push({ type: 'proceed_to_checkout' });
    return { success: true };
  },
};

const navigateToPageTool: BackendTool<NavigateToPageInput> = {
  schema: {
    name: 'navigate_to_page',
    description: `Navigate the visitor to a page on the site. Use the exact URL from the page list for ordinary pages. For product pages, first call search_products to find the exact product, then construct the page URL in the form of /product-page/{slug}.`,
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The page URL to navigate to, e.g. "/shop" or "/about"' },
        name: { type: 'string', description: 'The human-readable page name for confirmation messaging' },
      },
      required: ['url'],
    },
  },
  execute: async (input, ctx) => {
    ctx.frontendActions.push({ type: 'navigate_to_page', ...input });
    return { success: true, resolvedUrl: input.url };
  },
}

const searchKnowledgeBaseTool: BackendTool<{ query: string }> = {
  schema: {
    name: 'search_knowledge_base',
    description: 'Use this tool to search the site knowledge base for answers about policies, shipping, returns, hours, or ANY other question, even if it might sound stupid or unrelated to the website. Use this before answering any random question. The query will be matched against a collection of FAQ entries that the site owner can manage in the dashboard. If there are no relevant matches, do not return any results and answer the visitor based on your general knowledge.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The visitor question or topic to look up' },
      },
      required: ['query'],
    },
  },
  execute: async (input) => {
    try {
      const { items: faqs } = await auth.elevate(items.query)(FAQ_COLLECTION_ID).limit(50).find();
      if (!faqs.length) return { matches: [], message: 'No FAQ entries found.' };

      const keywords = input.query.toLowerCase().split(/\s+/)
        .map(w => w.replaceAll('?', ''))
        .filter((w) => w.length >= 3);

      console.log('Searching knowledge base for:', keywords);
      if (!keywords.length) return { matches: [], message: 'Query too short.' };

      const scored = (faqs as FaqEntry[])
        .map((faq) => {
          const text = `${faq.question} ${faq.answer}`.toLowerCase();
          const score = keywords.reduce((n, kw) => n + (text.includes(kw) ? 1 : 0), 0);
          return { ...faq, score };
        })
        .filter((f) => f.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ question, answer }) => ({ question, answer }));

      return scored.length
        ? { matches: scored }
        : { matches: [], message: 'No relevant FAQ entries found.' };
    } catch {
      return { error: 'Knowledge base unavailable.' };
    }
  },
};

export async function buildToolRegistry(): Promise<Map<string, BackendTool<any>>> {
  const tools: BackendTool<any>[] = [
    searchKnowledgeBaseTool,
    searchProductsTool,
    askClarificationTool,
    navigateToPageTool,
    addToCartTool,
    proceedToCheckoutTool,
  ];
  return new Map(tools.map((tool) => [tool.schema.name, tool]));
}
