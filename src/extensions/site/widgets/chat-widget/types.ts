import type { ProductInfo } from '../../../../shared/types';

export * from '../../../../shared/types';

export interface Message {
  id: string;
  role: 'user' | 'bot' | 'products';
  text: string;
  isTyping?: boolean;
  products?: ProductInfo[];
}
