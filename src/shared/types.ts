import { site as wixSite } from "@wix/site-site";

export interface ProductCard {
  id: string;
  name: string;
  price: string;
  url: string;
  imageUrl?: string;
  slug: string;
}

export interface PageInfo {
  url: string;
  title: string;
  description?: string;
}

export interface CartItem {
  name: string;
  quantity: number;
  price: string;
  variants?: string;
}

export interface VisitorContext {
  structure?: Awaited<ReturnType<typeof wixSite.getSiteStructure>>;
  page?: PageInfo;
  cart?: CartItem[];
}

export interface ShowProductsAction {
  type: 'show_products';
  products: ProductCard[];
}

export interface AddToCartAction {
  type: 'add_to_cart';
  product_id?: string;
  product_name?: string;
  quantity?: number;
  variant_id?: string;
}

export interface NavigateToPageAction {
  type: 'navigate_to_page';
  url: string;
  name?: string;
}

export interface CheckoutAction {
  type: 'proceed_to_checkout';
}

export interface RemoveFromCartAction {
  type: 'remove_from_cart';
  product_name: string;
}

export type FrontendAction = 
| ShowProductsAction 
| AddToCartAction 
| NavigateToPageAction 
| CheckoutAction 
| RemoveFromCartAction;


export interface BotSettings extends Record<string, unknown> {
  _id?: string;
  botName: string;
  greetingMessage: string;
}

export interface FaqEntry extends Record<string, unknown> {
  _id?: string;
  question: string;
  answer: string;
}
