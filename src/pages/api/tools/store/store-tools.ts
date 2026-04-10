import type { AddToCartAction, ProductInfo } from "../../../../shared/types";
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
  displayName: 'Search Products',
  shortDescription: 'Searches or browses your store catalog when visitors look for products.',
  category: 'store',
  instructionHint: 'e.g. "Only show products that are in stock"',
  schema: {
    name: 'search_products',
    description: `Use this to search or browse the store catalog. Use this tool when a visitor is looking for a product, asking about what's for sale, or asking for recommendations. The result contains a "products" array with full product data for your reference, and a "productCards" array with pre-formatted display cards. You MUST call the "show_products" tool immediately after using the "productCards" array as input (pass all of them or a filtered subset).
If the visitor is looking for something specific, use the "query" field to search for it. If the visitor is just browsing or asking general questions like "what products do you have?", set "browse_all" to true and leave "query" empty to get a selection of products to show them. You can also use "browse_all" as a fallback if a search query returns no results, to show the visitor more options to choose from.
When browsing with "browse_all", use the "page" and "limit" fields for pagination. Start with page 0. If there are more products to show, the response will include "hasNext: true", and you can increment the page number and call again to get the next set of products.`,
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search phrase, e.g. "blue shirt", "running shoes". Leave empty only when browse_all is true.',
        },
        browse_all: {
          type: 'boolean',
          description: `Set to true when the visitor wants to browse the entire catalog or asks general questions like "what products do you sell?". Set to false when searching for a specific product. 
          If searching for a specific product returned no results, you can try setting browse_all to true in a second call to fetch all products and filter them yourself.`,
        },
        max_price: { type: 'number', description: 'Optional maximum price filter' },
        limit: { type: 'number', description: 'Max number of results to return. Use 12 when browsing, 5 when searching for something specific.' },
        page: { type: 'number', description: 'Page number for pagination, starting at 0. Only used when browse_all is true.' },
      },
      required: ['browse_all', 'limit'],
    },
  },
  execute: async (input) => {
    const result = await productVersionHandler.searchProducts(input);
    if (!result.found) return result;
    return {
      found: true,
      mode: result.mode,
      hasNext: result.hasNext,
      products: result.products,
      productCards: result.products.map((p: any) => productVersionHandler.toProductInfo(p)),
    };
  },
};

const showProductsTool: BackendTool<{ products: ProductInfo[] }> = {
  displayName: 'Show Product Cards',
  shortDescription: 'Displays product cards visually in the chat for visitors to browse.',
  category: 'store',
  schema: {
    name: 'show_products',
    description: `Display a selection of products to the visitor as cards. Call this after search_products with only the products you determined are relevant. 
    Your text response should be very brief and just explain what kind of products are shown, since the visitor will see the cards below the message.
    You may also use this when the visitor asks about what's in the cart.`,
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