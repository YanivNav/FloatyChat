import React, { type FC } from 'react';
import type { Message, ProductInfo } from '../types';
import { ChatHeader } from './ChatHeader';
import { MessageThread } from './MessageThread';
import { InputRow } from './InputRow';
import styles from '../chat-widget.module.scss';

interface Props {
  botName: string;
  messages: Message[];
  isTyping: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
  onClose: () => void;
  onAddToCart: (product: ProductInfo) => Promise<void>;
  onNavigate: (slug: string) => void;
}

/** The expandable chat panel: header, message thread, and input row. */
export const ChatPanel: FC<Props> = ({
  botName,
  messages,
  isTyping,
  onSend,
  onClear,
  onClose,
  onAddToCart,
  onNavigate,
}) => (
  <div className={styles.panel}>
    <ChatHeader botName={botName} onClear={onClear} onClose={onClose} />
    <MessageThread
      messages={messages}
      isTyping={isTyping}
      onAddToCart={onAddToCart}
      onNavigate={onNavigate}
    />
    <InputRow onSend={onSend} isTyping={isTyping} />
  </div>
);
