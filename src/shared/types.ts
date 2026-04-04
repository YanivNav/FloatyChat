export interface ProductCard {
  id: string;
  name: string;
  price: string;
  url: string;
  imageUrl?: string;
  slug: string;
}

export interface FrontendAction {
  type: string;
  url?: string;
  product_id?: string;
  product_name?: string;
  quantity?: number;
  variant_id?: string;
  products?: ProductCard[];
  [key: string]: unknown;
}
