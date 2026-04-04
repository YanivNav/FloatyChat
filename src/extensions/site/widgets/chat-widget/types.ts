export interface ProductCard {
  id: string;
  name: string;
  price: string;
  imageUrl?: string;
  slug: string;
}

export interface Message {
  id: string;
  role: 'user' | 'bot' | 'products';
  text: string;
  isTyping?: boolean;
  products?: ProductCard[];
}

export interface FrontendAction {
  type: string;
  url?: string;
  product_id?: string;
  product_name?: string;
  quantity?: number;
  variant_id?: string;
  products?: ProductCard[];
}
