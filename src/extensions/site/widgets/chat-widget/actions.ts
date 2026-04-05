import { location as siteLocation } from '@wix/site-location';
import { currentCart } from '@wix/ecom';
import { ecom } from '@wix/site-ecom';
import type { FrontendAction, Message } from './types';

export type ActionHandlerResult = 'continue' | 'stop';

export interface ActionContext {
  addMessage: (message: Message) => void;
}

type ActionHandler<A extends FrontendAction> = (action: A, ctx: ActionContext) => Promise<ActionHandlerResult>;

type ActionHandlerRegistry = {
  [K in FrontendAction['type']]?: ActionHandler<Extract<FrontendAction, { type: K }>>;
};

const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

const registry: ActionHandlerRegistry = {
  show_products: async (action, { addMessage }) => {
    if (action.products?.length) {
      addMessage({ id: `products-${Date.now()}`, role: 'products', text: '', products: action.products });
    }
    return 'continue';
  },

  navigate_to_page: async (action) => {
    siteLocation.to(action.url);
    return 'stop';
  },

  add_to_cart: async (action, { addMessage }) => {
    if (!action.product_id) return 'stop';
    try {
      await addToCart(action.product_id, action.quantity ?? 1, action.variant_id);
      return 'continue';
    } catch {
      addMessage({ id: `bot-cart-err-${Date.now()}`, role: 'bot', text: 'Sorry, I could not add that item to your cart.' });
      return 'stop';
    }
  },

  remove_from_cart: async (action, { addMessage }) => {
    try {
      const cart = await currentCart.getCurrentCart();
      const target = action.product_name.toLowerCase();
      const lineItem = cart.lineItems?.find((item) =>
        (item.productName?.original ?? '').toLowerCase().includes(target)
      );
      if (!lineItem?._id) {
        addMessage({ id: `bot-remove-err-${Date.now()}`, role: 'bot', text: `I couldn't find "${action.product_name}" in your cart.` });
        return 'stop';
      }
      await currentCart.removeLineItemsFromCurrentCart([lineItem._id]);
      await ecom.refreshCart();
      return 'continue';
    } catch {
      addMessage({ id: `bot-remove-err-${Date.now()}`, role: 'bot', text: 'Sorry, I could not remove that item from your cart.' });
      return 'stop';
    }
  },

  proceed_to_checkout: async () => {
    const res = await currentCart.createCheckoutFromCurrentCart();
    await ecom.navigateToCheckoutPage(res.checkoutId!);
    return 'continue';
  },
};

export async function handleActions(actions: FrontendAction[], ctx: ActionContext): Promise<void> {
  for (const action of actions) {
    const handler = registry[action.type] as ActionHandler<typeof action> | undefined;
    if (!handler) continue;
    const result = await handler(action, ctx);
    if (result === 'stop') return;
  }
}

export async function addToCart(productId: string, quantity = 1, variantId?: string): Promise<void> {
  await currentCart.addToCurrentCart({
    lineItems: [{
      catalogReference: {
        appId: STORES_APP_ID,
        catalogItemId: productId,
        ...(variantId ? { options: { variantId } } : {}),
      },
      quantity: Math.max(1, Number(quantity)),
    }],
  });
  await ecom.refreshCart();
}