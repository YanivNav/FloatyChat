import type Anthropic from "@anthropic-ai/sdk";
import { items } from '@wix/data';
import { auth } from '@wix/essentials';
import { orders, orderFulfillments } from '@wix/ecom';
import { productVersionHandler } from './store/product-version-handler';
import type { AddToCartAction, FaqEntry, FrontendAction, ProductCard } from '../../shared/types';
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
  page?: number;
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
    description: `Search or browse the store catalog. Returns a list of matching products for you to review. After calling this, decide which results are actually relevant to the visitor's request, then call show_products with only those products. For navigation to a product page, use the slug from the results without calling show_products.`,
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search phrase, e.g. "blue shirt", "running shoes". Leave empty only when browse_all is true.',
        },
        browse_all: {
          type: 'boolean',
          description: 'Set to true when the visitor wants to browse the entire catalog or asks general questions like "what products do you sell?". Set to false when searching for a specific product. Also set to true if searching for a specific product returned no relevant results.',
        },
        max_price: { type: 'number', description: 'Optional maximum price filter' },
        limit: { type: 'number', description: 'Max number of results to return. Use 50 when browsing, 5 when searching for something specific.' },
        page: { type: 'number', description: 'Page number for pagination, starting at 0. Only used when browse_all is true and if the previous search has no relevant results.' },
      },
      required: ['browse_all', 'limit'],
    },
  },
  execute: async (input) => {
    const result = await productVersionHandler.searchProducts(input);
    if (result.found && Array.isArray(result.products) && result.products.length > 0) {
      const cards = result.products.map((p) => productVersionHandler.toProductCard(p));
      return { found: true, products: cards };
    }
    return result;
  },
};

const showProductsTool: BackendTool<{ products: Array<ProductCard> }> = {
  schema: {
    name: 'show_products',
    description: 'Display a selection of products to the visitor as cards. Call this after search_products with only the products you determined are relevant. Pass the product objects exactly as returned by search_products. Your text response should be very brief since the visitor will see the cards.',
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
    description: `Navigate the visitor to a page on the site. Use the exact URL from the page list for ordinary pages.
    For product pages, first call search_products to find the product, then use the slug from the results to construct the URL in the form of /product-page/{slug}. Do NOT call show_products in this case.
    For product category pages, construct the URL in the form of /category/{category-slug}. All Products is a category page with the slug "all-products".`,
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

function formatOrder(order: orders.Order, fulfillments?: orderFulfillments.Fulfillment[]) {
  const tracking = (fulfillments ?? [])
    .map((f) => f.trackingInfo)
    .filter((t): t is orderFulfillments.FulfillmentTrackingInfo => !!t?.trackingNumber)
    .map((t) => ({ trackingNumber: t.trackingNumber, trackingLink: t.trackingLink, provider: t.shippingProvider }));

  return {
    orderNumber: order.number,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    total: order.priceSummary?.total?.formattedAmount,
    createdDate: order._createdDate?.toISOString?.().split('T')[0],
    items: (order.lineItems ?? []).map((l: any) => ({
      name: l.productName?.original,
      quantity: l.quantity,
      price: l.price?.formattedAmount,
    })),
    estimatedDelivery: order.shippingInfo?.logistics?.deliveryTime ?? null,
    tracking: tracking.length ? tracking : null,
  };
}

const getOrderStatusTool: BackendTool<{ order_number: string }> = {
  schema: {
    name: 'get_order_status',
    description: 'Look up a specific order by order number. Use when the visitor provides an order number and asks about payment status, fulfillment, estimated delivery, or tracking.',
    input_schema: {
      type: 'object',
      properties: {
        order_number: { type: 'string', description: 'The order number exactly as the visitor stated it, e.g. "10042"' },
      },
      required: ['order_number'],
    },
  },
  execute: async (input) => {
    try {
      const result = await auth.elevate(orders.searchOrders)({
        filter: { number: { $eq: input.order_number } },
        cursorPaging: { limit: 1 },
      });
      if (!result.orders?.length) {
        return { found: false, message: `No order found with number ${input.order_number}.` };
      }
      const order = result.orders[0]!;
      const fulfillmentsResult = await auth.elevate(orderFulfillments.listFulfillmentsForSingleOrder)(order._id!);
      return { found: true, order: formatOrder(order, fulfillmentsResult.orderWithFulfillments?.fulfillments) };
    } catch {
      return { error: 'Could not retrieve order. Please try again.' };
    }
  },
};

const listMyOrdersTool: BackendTool<{ limit?: number }> = {
  schema: {
    name: 'list_my_orders',
    description: "List the visitor's recent orders. Use when the visitor asks to see their orders or order history without providing a specific order number. Only works if the visitor is logged in.",
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of orders to return, default 5' },
      },
      required: [],
    },
  },
  execute: async (input) => {
    try {
      const tokenInfo = await auth.getTokenInfo();
      if (tokenInfo.subjectType !== 'MEMBER') {
        return { found: false, message: 'You need to be logged in to view your orders.' };
      }
      const result = await auth.elevate(orders.searchOrders)({
        filter: { 'buyerInfo.memberId': { $eq: tokenInfo.subjectId } },
        sort: [{ fieldName: '_createdDate', order: 'DESC' }],
        cursorPaging: { limit: input.limit ?? 5 },
      });
      if (!result.orders?.length) {
        return { found: false, message: 'No orders found for your account.' };
      }
      return { found: true, count: result.orders.length, orders: result.orders.map((o) => formatOrder(o)) };
    } catch {
      return { error: 'Could not retrieve orders. Please try again.' };
    }
  },
};

const cancelOrderTool: BackendTool<{ order_number: string }> = {
  schema: {
    name: 'cancel_order',
    description: 'Cancel an order by order number. Only works for logged-in members cancelling their own orders. Do not attempt if the order is already cancelled or fulfilled.',
    input_schema: {
      type: 'object',
      properties: {
        order_number: { type: 'string', description: 'The order number to cancel, e.g. "10042"' },
      },
      required: ['order_number'],
    },
  },
  execute: async (input) => {
    try {
      const tokenInfo = await auth.getTokenInfo();
      if (tokenInfo.subjectType !== 'MEMBER') {
        return { success: false, message: 'You need to be logged in to cancel an order.' };
      }

      const result = await auth.elevate(orders.searchOrders)({
        filter: { number: { $eq: input.order_number } },
        cursorPaging: { limit: 1 },
      });
      if (!result.orders?.length) {
        return { success: false, message: `No order found with number ${input.order_number}.` };
      }
      const order = result.orders[0]!;

      if (order.buyerInfo?.memberId !== tokenInfo.subjectId) {
        return { success: false, message: 'You can only cancel your own orders.' };
      }
      if (order.status === 'CANCELED') {
        return { success: false, message: `Order ${input.order_number} is already cancelled.` };
      }
      if (order.fulfillmentStatus === 'FULFILLED') {
        return { success: false, message: `Order ${input.order_number} has already been fulfilled and cannot be cancelled.` };
      }

      await auth.elevate(orders.cancelOrder)(order._id!, { sendOrderCanceledEmail: true, restockAllItems: true });
      return { success: true, message: `Order ${input.order_number} has been cancelled successfully.` };
    } catch {
      return { success: false, message: 'Could not cancel the order. Please try again or contact support.' };
    }
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

export async function buildToolRegistry(): Promise<Map<string, BackendTool<any>>> {
  const tools: BackendTool<any>[] = [
    searchKnowledgeBaseTool,
    searchProductsTool,
    showProductsTool,
    askClarificationTool,
    navigateToPageTool,
    addToCartTool,
    getOrderStatusTool,
    listMyOrdersTool,
    cancelOrderTool,
    removeFromCartTool,
    proceedToCheckoutTool,
  ];
  return new Map(tools.map((tool) => [tool.schema.name, tool]));
}
