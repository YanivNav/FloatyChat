import type { AddToCartAction, ProductInfo } from "../../../../shared/types";
import type { BackendTool } from "../tools";
import { productVersionHandler } from "./product-version-handler";


export interface SearchProductsInput {
  query?: string;
  browse_all: boolean;
  show_cards: boolean;
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
  displayName: 'Search Products',
  shortDescription: 'Searches or browses your store catalog when visitors look for products.',
  category: 'store',
  instructionHint: 'e.g. "Only show products that are in stock"',
  schema: {
    name: 'search_products',
    description: `Retrieve products from the store catalog. Call this whenever a visitor asks about products, what's for sale, prices, availability, or wants recommendations. Do NOT generate any text before calling this tool.

Set show_cards=true when the visitor wants to see or browse products (e.g. "what do you sell?", "show me something", "any gift ideas?", "do you have sneakers?"). The cards will be displayed automatically.
Set show_cards=false when answering a factual question about a specific product (e.g. "what sizes does the blue shirt come in?", "how much is product X?"). Answer from the returned data instead.

- Use query for specific product searches ("blue shirt", "running shoes under $50")
- Use browse_all: true for general browsing or when a specific search returns no results
- Use limit=12 when browsing, limit=5 when searching for something specific`,
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search phrase. Leave empty when browse_all is true.' },
        browse_all: { type: 'boolean', description: 'True to browse the full catalog, false for a specific search.' },
        show_cards: { type: 'boolean', description: 'True to display product cards to the visitor, false to just retrieve data for answering a question.' },
        max_price: { type: 'number', description: 'Optional maximum price filter.' },
        limit: { type: 'number', description: 'Max results to return.' },
        page: { type: 'number', description: 'Page number for pagination, starting at 0. Only used when browse_all is true.' },
      },
      required: ['browse_all', 'show_cards', 'limit'],
    },
  },
  execute: async (input, ctx) => {
    const result = await productVersionHandler.searchProducts(input);
    if (!result.found) {
      return { found: false, _instruction: 'No products found. Write a helpful response to the visitor.' };
    }
    const productCards: ProductInfo[] = result.products.map((p: any) => productVersionHandler.toProductInfo(p));
    if (input.show_cards && productCards.length > 0) {
      ctx.frontendActions.push({ type: 'show_products', products: productCards.map((p) => ({ ...p, url: p.url ?? `/product-page/${p.slug}` })) });
    }
    return {
      found: true,
      mode: result.mode,
      hasNext: result.hasNext,
      // Only return raw product data when the bot needs to read it (no cards shown)
      ...(input.show_cards ? {} : { products: result.products }),
      _instruction: input.show_cards
        ? 'Product cards are now visible to the visitor. Write a brief, natural response describing what you showed (e.g. "We carry a nice range of teas and oils — here are some options:").'
        : 'Products retrieved. Answer the visitor\'s question using the data above. You MUST write a text response.',
    };
  },
};

const showProductsTool: BackendTool<{ products: ProductInfo[] }> = {
  displayName: 'Show Product Cards',
  shortDescription: 'Displays product cards visually in the chat for visitors to browse.',
  category: 'store',
  schema: {
    name: 'show_products',
    description: `Display a curated subset of product cards. Use this only when you already retrieved products via search_products (with show_cards=false) and now want to display a specific filtered subset of them. Pass the relevant items from the productCards array. After calling this, write a brief text response.`,
    input_schema: {
      type: 'object',
      properties: {
        products: {
          type: 'array',
          description: 'The products to display. Use the "productCards" array from search_products (or a filtered subset). Do NOT pass the full raw "products" array.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              price: { type: 'string' },
              slug: { type: 'string' },
              imageUrl: { type: 'string' },
              url: { type: 'string' },
              description: { type: 'string' },
              variants: { type: 'object', additionalProperties: { type: 'string' } }
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
  displayName: 'Add to Cart',
  shortDescription: 'Adds a product to the visitor\'s cart on their behalf.',
  category: 'store',
  instructionHint: 'e.g. "Always confirm with the visitor before adding to cart"',
  schema: {
    name: 'add_to_cart',
    description: "Add a product to the visitor's cart. By default, add 1 to the quantity. If the user specifies a different quantity, use that instead. If the product has options/variants and the visitor hasn't specified them, ask them first. When the visitor provides variant choices such as size or color, include them in variant_options according to the available options the product has.",
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'The product ID from search results' },
        product_name: { type: 'string', description: 'The product name, for confirmation messaging' },
        quantity: { type: 'number', description: 'Quantity to add' },
        variant_options: {
          type: 'object',
          description: 'Optional product variant selections, for example { "size": "M", "color": "White" }. If the product has variant options, this field is required.',
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
  displayName: 'Proceed to Checkout',
  shortDescription: 'Sends the visitor to the checkout page when they\'re ready to buy.',
  category: 'store',
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
  displayName: 'Remove from Cart',
  shortDescription: 'Removes a product from the visitor\'s cart when they ask.',
  category: 'store',
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