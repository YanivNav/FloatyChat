import type Anthropic from "@anthropic-ai/sdk";

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

export function buildTools(pages: Page[]): Anthropic.Tool[] {
  const pageDescriptions =
    pages.length > 0
      ? pages.map((p) => `"${p.url}" (${p.name})`).join(', ')
      : 'unknown - do not use navigate_to_page if no pages are available';

  return [
    {
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
    {
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
    {
      name: 'proceed_to_checkout',
      description: 'Navigate the visitor to the checkout page. Only call this after the visitor explicitly confirms they want to check out.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'navigate_to_page',
      description: `Navigate the visitor to a page on the site. Available pages: ${pageDescriptions}. Use the URL from this list for ordinary pages. For product pages, first call search_products to find the exact product, then construct the page URL in the form of /product-page/{slug}.`,
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The page URL to navigate to, e.g. "/shop" or "/about"',
          },
          name: { type: 'string', description: 'The human-readable page name for confirmation messaging' }
        },
        required: ['url'],
      },
    },
    {
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
  ];
}
