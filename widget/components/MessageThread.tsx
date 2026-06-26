import React, { type FC, useEffect, useRef } from 'react';
import type { Message, ProductInfo } from '../types';
import { useChatTheme } from '../ChatThemeContext';
import { MessageBubble } from './MessageBubble';
import { ProductCarousel } from './ProductCarousel';
import { TypingIndicator } from './TypingIndicator';
import styles from '../chat-widget.module.scss';

interface Props {
  messages: Message[];
  isTyping: boolean;
  onAddToCart: (product: ProductInfo) => Promise<void>;
  onNavigate: (slug: string) => void;
}

/** Scrollable message list: bubbles, product carousels, and the typing indicator. */
export const MessageThread: FC<Props> = ({ messages, isTyping, onAddToCart, onNavigate }) => {
  const { primaryColor } = useChatTheme();
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view as the conversation grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  return (
    <div className={styles.messagesThread}>
      {messages.map((msg) =>
        msg.role === 'products' && msg.products ? (
          <ProductCarousel
            key={msg.id}
            products={msg.products}
            primaryColor={primaryColor}
            onAddToCart={onAddToCart}
            onNavigate={onNavigate}
          />
        ) : (
          <MessageBubble key={msg.id} msg={msg} primaryColor={primaryColor} />
        ),
      )}
      {isTyping && <TypingIndicator />}
      <div ref={endRef} />
    </div>
  );
};
