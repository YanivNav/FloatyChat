import { site as wixSite } from "@wix/site-site";

export interface ProductInfo {
  id: string;
  name: string;
  price: string;
  url: string;
  imageUrl?: string;
  slug: string;
  description: string;
  variants?: Record<string, string[]>;
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

export interface StoreCategory {
  id: string;
  name: string;
  slug: string;
}

export interface VisitorContext {
  structure?: Awaited<ReturnType<typeof wixSite.getSiteStructure>>;
  page?: PageInfo;
  cart?: CartItem[];
}

export interface ShowProductsAction {
  type: 'show_products';
  products: ProductInfo[];
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

export interface ClearChatAction {
  type: 'clear_chat';
}

export type FrontendAction =
| ShowProductsAction
| AddToCartAction
| NavigateToPageAction
| CheckoutAction
| RemoveFromCartAction
| ClearChatAction;


export interface BotSettings extends Record<string, unknown> {
  _id?: string;
  botName: string;
  greetingMessage: string;
  toolSettings?: string; // JSON-serialized ToolSettingsMap
}

export interface ToolConfig {
  enabled: boolean;
  instruction: string;
}

export type ToolSettingsMap = Record<string, ToolConfig>;

export function parseToolSettings(raw: string | undefined): ToolSettingsMap {
  if (!raw) return {};
  try { return JSON.parse(raw) as ToolSettingsMap; }
  catch { return {}; }
}

export interface FaqEntry extends Record<string, unknown> {
  _id?: string;
  question: string;
  answer: string;
}
