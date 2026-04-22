import type { ProductInfo } from '../src/shared/types';

export * from '../src/shared/types';

export interface Message {
  id: string;
  role: 'user' | 'bot' | 'products';
  text: string;
  isTyping?: boolean;
  products?: ProductInfo[];
}
