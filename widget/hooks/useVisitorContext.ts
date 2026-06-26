import { useCallback, useEffect, useState } from 'react';
import { wixClient } from '../wix-client';
import type { CartItem, PageInfo, VisitorContext } from '../types';

/**
 * Provides the visitor context sent with each chat message. Page info is read
 * once on mount (it's stable for the page); the cart is read fresh at send-time
 * via buildContext so the bot always sees the current cart.
 */
export function useVisitorContext(): { buildContext: () => Promise<VisitorContext> } {
  const [visitorContext, setVisitorContext] = useState<VisitorContext>({});

  useEffect(() => {
    createVisitorContext()
      .then((context) => setVisitorContext(context))
      .catch(() => {});
  }, []);

  const buildContext = useCallback(async (): Promise<VisitorContext> => {
    return { ...visitorContext, cart: await getCartItems() };
  }, [visitorContext]);

  return { buildContext };
}

async function createVisitorContext(): Promise<VisitorContext> {
  const page = await getPageInfo();
  return { page };
}

async function getPageInfo(): Promise<PageInfo> {
  const page = await wixClient.wixSite.currentPage();
  const meta = await wixClient.seo.metaTags();
  const title = await wixClient.seo.title();
  const description = meta.find((m: any) => m.name === 'description')?.content;
  return { url: (page as any).url, title, description };
}

async function getCartItems(): Promise<CartItem[]> {
  try {
    const cart = await wixClient.currentCart.getCurrentCart();
    return (cart.lineItems ?? []).map((item: any) => ({
      name: item.productName?.original ?? '',
      quantity: item.quantity ?? 1,
      price: item.price?.formattedAmount ?? item.price?.amount ?? '',
      variants: item.descriptionLines
        ?.map((l: any) => `${l.name?.original}: ${l.plainText?.original ?? l.colorInfo?.original ?? ''}`)
        .join(', ') || undefined,
    }));
  } catch {
    return [];
  }
}
