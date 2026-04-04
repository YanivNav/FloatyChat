export interface ProductCard {
  id: string;
  name: string;
  price: string;
  url: string;
  imageUrl?: string;
  slug: string;
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

export type FrontendAction = ShowProductsAction | AddToCartAction | NavigateToPageAction | CheckoutAction;
