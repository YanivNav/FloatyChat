import type { ProductCard } from '../../../../shared/types';

export type { ProductCard, FrontendAction, PageInfo, CartItem, VisitorContext } from '../../../../shared/types';

export interface Message {
  id: string;
  role: 'user' | 'bot' | 'products';
  text: string;
  isTyping?: boolean;
  products?: ProductCard[];
}
