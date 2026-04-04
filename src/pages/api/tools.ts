import type Anthropic from "@anthropic-ai/sdk";
import { site as wixSite } from "@wix/site-site";
import { productVersionHandler } from './store/product-version-handler';
import type { AddToCartAction, FrontendAction } from '../../shared/types';

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
    description: "Add a product to the visitor's cart. By default, add 1 to the quantity. If the user specifies a different quantity, use that instead. If the product has options/variants and the visitor hasn't specified them, use ask_clarification first. When the visitor provides variant choices such as size or color, include them in variant_options using the exact choice names and values the visitor used.",
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

const navigateToPageTool = async (): Promise<BackendTool<NavigateToPageInput>> => {
  const structure = await wixSite.getSiteStructure()
  const pageDescriptions = structure.pages.length > 0
      ? structure.pages.map((p) => `"${p.url}" (${p.name})`).join(', ')
      : 'unknown - do not use navigate_to_page if no pages are available';
  return {
    schema: {
      name: 'navigate_to_page',
      description: `Navigate the visitor to a page on the site. Available pages: ${pageDescriptions}. Use the URL from this list for ordinary pages. For product pages, first call search_products to find the exact product, then construct the page URL in the form of /product-page/{slug}.`,
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
  };
}

export async function buildToolRegistry(): Promise<Map<string, BackendTool<any>>> {
  const tools: BackendTool<any>[] = [
    searchProductsTool,
    askClarificationTool,
    await navigateToPageTool(),
    addToCartTool,
    proceedToCheckoutTool,
  ];
  return new Map(tools.map((tool) => [tool.schema.name, tool]));
}
