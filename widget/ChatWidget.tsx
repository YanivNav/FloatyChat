import React, { type FC, useCallback, useEffect, useRef } from 'react';
import { wixClient } from './wix-client';
import type { FrontendAction, Message, ProductInfo } from './types';
import { handleActions as dispatchActions } from './actions';
import { ChatThemeProvider } from './ChatThemeContext';
import { useChatPersistence } from './hooks/useChatPersistence';
import { useBotSettings } from './hooks/useBotSettings';
import { useVisitorContext } from './hooks/useVisitorContext';
import { useChatStream, type ChatHistoryEntry } from './hooks/useChatStream';
import { useClickOutside } from './hooks/useClickOutside';
import { ToggleButton } from './components/ToggleButton';
import { ChatPanel } from './components/ChatPanel';

/** History sent to the model: prior turns, minus typing/product placeholders. */
function buildHistory(messages: Message[]): ChatHistoryEntry[] {
  return messages
    .filter((m) => !m.isTyping && m.role !== 'products')
    .map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.text,
    }));
}

const ChatWidget: FC = () => {
  const { messages, setMessages, addMessage, isOpen, setIsOpen, hasGreeted, setHasGreeted, isLoaded } =
    useChatPersistence();
  const { botSettings, botName, primaryColor, position, greetingMessage } = useBotSettings(isLoaded);
  const { buildContext } = useVisitorContext();
  const containerRef = useRef<HTMLDivElement>(null);

  // Seed the greeting once settings load, unless the visitor already has history.
  useEffect(() => {
    if (!botSettings) return;
    if (!hasGreeted) {
      setMessages([{ id: 'greeting', role: 'bot', text: greetingMessage }]);
      setHasGreeted(true);
    }
  }, [botSettings, hasGreeted]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearChat = useCallback((): void => {
    setMessages([]);
    setHasGreeted(false);
  }, [setMessages, setHasGreeted]);

  const handleActions = useCallback(
    (actions: FrontendAction[]): void => {
      void dispatchActions(actions, { addMessage, clearChat: handleClearChat });
    },
    [addMessage, handleClearChat],
  );

  const { sendMessage, isTyping } = useChatStream({ onMessage: addMessage, onActions: handleActions });

  const send = useCallback(
    async (text: string): Promise<void> => {
      const history = buildHistory(messages);
      const context = await buildContext();
      await sendMessage(text, { history, context });
    },
    [messages, buildContext, sendMessage],
  );

  const handleAddToCart = useCallback(
    (product: ProductInfo): Promise<void> => send(`Add ${product.name} to cart`),
    [send],
  );

  const navigateToProduct = useCallback((slug: string): void => {
    wixClient.location.to(`/product-page/${slug}`);
  }, []);

  const closePanel = useCallback(() => setIsOpen(false), [setIsOpen]);
  useClickOutside(containerRef, closePanel, isOpen);

  return (
    <ChatThemeProvider value={{ primaryColor, position }}>
      <div ref={containerRef} style={{ display: 'contents' }}>
        <ToggleButton isOpen={isOpen} onToggle={() => setIsOpen((prev) => !prev)} />
        {isOpen && (
          <ChatPanel
            botName={botName}
            messages={messages}
            isTyping={isTyping}
            onSend={send}
            onClear={handleClearChat}
            onClose={closePanel}
            onAddToCart={handleAddToCart}
            onNavigate={navigateToProduct}
          />
        )}
      </div>
    </ChatThemeProvider>
  );
};

export default ChatWidget;
