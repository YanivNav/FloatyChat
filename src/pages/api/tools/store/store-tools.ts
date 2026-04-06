import type { AddToCartAction, ProductCard } from "../../../../shared/types";
import type { BackendTool } from "../tools";
import { productVersionHandler } from "./product-version-handler";


export interface SearchProductsInput {
  query?: string;
  browse_all: boolean;
  max_price?: number;
  limit: number;
  page?: number;
}

export interface AddToCartInput {
  product_id?: string;
  product_name?: string;
  quantity?: number;
  variant_options?: Record<string, string>;
}

const searchProductsTool: BackendTool<SearchProductsInput> = {
  schema: {
    name: 'search_products',
    description: `Search or browse the store catalog.
- When browse_all is true and no query: products are shown to the visitor automatically (below the response) — do NOT call show_products afterward.
- When browse_all is true with a query (e.g. "what chairs do you sell?"): fetches all products so you can filter them. Call show_products with only the relevant matches.
- When browse_all is false: returns matching products for you to review. Use the results to answer the visitor's question in text if they asked something specific (price, availability, description). Only call show_products if the visitor's intent is to browse or find products to buy, not for informational questions. For navigation to a product page, use the slug from the results without calling show_products.`,
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search phrase, e.g. "blue shirt", "running shoes". Leave empty only when browse_all is true.',
        },
        browse_all: {
          type: 'boolean',
          description: 'Set to true when the visitor wants to browse the entire catalog or asks general questions like "what products do you sell?". Set to false when searching for a specific product.',
        },
        max_price: { type: 'number', description: 'Optional maximum price filter' },
        limit: { type: 'number', description: 'Max number of results to return. Use 12 when browsing, 5 when searching for something specific.' },
        page: { type: 'number', description: 'Page number for pagination, starting at 0. Only used when browse_all is true.' },
      },
      required: ['browse_all', 'limit'],
    },
  },
  execute: async (input, ctx) => {
    const result = await productVersionHandler.searchProducts(input);
    if (result.found && Array.isArray(result.products) && result.products.length > 0) {
      const cards = result.products.map((p) => productVersionHandler.toProductCard(p));
      if (input.browse_all && !input.query) {
        ctx.frontendActions.push({ type: 'show_products', products: cards });
        return { shown: cards.length };
      }
      return { found: true, products: cards };
    }
    return result;
  },
};

const showProductsTool: BackendTool<{ products: Array<ProductCard> }> = {
  schema: {
    name: 'show_products',
    description: 'Display a selection of products to the visitor as cards. Call this after search_products with only the products you determined are relevant. Pass the product objects exactly as returned by search_products. Your text response should be very brief since the visitor will see the cards below the message.',
    input_schema: {
      type: 'object',
      properties: {
        products: {
          type: 'array',
          description: 'The products to display, selected from the search_products results.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              price: { type: 'string' },
              slug: { type: 'string' },
              imageUrl: { type: 'string' },
              url: { type: 'string' },
            },
            required: ['id', 'name', 'price', 'slug'],
          },
        },
      },
      required: ['products'],
    },
  },
  execute: async (input, ctx) => {
    const cards = input.products.map((p) => ({ ...p, url: p.url ?? `/product-page/${p.slug}` }));
    if (cards.length > 0) ctx.frontendActions.push({ type: 'show_products', products: cards });
    return { shown: cards.length };
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
  execute: async (_input, ctx) => {
    ctx.frontendActions.push({ type: 'proceed_to_checkout' });
    return { success: true };
  },
};

const removeFromCartTool: BackendTool<{ product_name: string }> = {
  schema: {
    name: 'remove_from_cart',
    description: "Remove a product from the visitor's cart by name. Use the product name exactly as it appears in the cart context.",
    input_schema: {
      type: 'object',
      properties: {
        product_name: { type: 'string', description: 'The name of the product to remove from the cart' },
      },
      required: ['product_name'],
    },
  },
  execute: async (input, ctx) => {
    ctx.frontendActions.push({ type: 'remove_from_cart', product_name: input.product_name });
    return { success: true };
  },
};

export default [searchProductsTool, showProductsTool, addToCartTool, proceedToCheckoutTool, removeFromCartTool];