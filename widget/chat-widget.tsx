import React, { type FC, useState, useEffect, useRef, useCallback } from 'react';
import { wixClient } from './wix-client';
import type { Message, FrontendAction, ProductInfo, PageInfo, CartItem, VisitorContext, BotSettings } from './types';
import { handleActions as dispatchActions } from './actions';
import { loadChatState, saveChatState } from './utils/chatStorage';
import { darkenColor } from './utils/colors';
import { TypingIndicator } from './components/TypingIndicator';
import { ProductCarousel } from './components/ProductCarousel';
import { MessageBubble } from './components/MessageBubble';
import styles from './chat-widget.module.scss';
import { DEFAULT_CHAT_SETTINGS } from '../src/shared/chat-settings';

const ChatWidget: FC = () => {
  const [botName, setBotName] = useState<string>('Loading...');
  const [botSettings, setBotSettings] = useState<BotSettings | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [hasGreeted, setHasGreeted] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [visitorContext, setVisitorContext] = useState<VisitorContext>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const primaryColor = botSettings?.primaryColor ?? '#116DFF';
  const position = botSettings?.position ?? 'bottom-right';

  // Load chat state from session storage
  useEffect(() => {
    loadChatState().then((stored) => {
      if (stored) {
        setIsOpen(stored.isOpen);
        setMessages(stored.messages);
        setHasGreeted(stored.hasGreeted);
      }
      setIsLoaded(true);
    });
  }, []);

  // Load bot settings (only after storage state is restored)
  useEffect(() => {
    if (!isLoaded) return;
    wixClient.fetchWithAuth(`${new URL(import.meta.url).origin}/api/settings`)
      .then((res: Response) => res.json())
      .catch(() => DEFAULT_CHAT_SETTINGS)
      .then(setBotSettings);
  }, [isLoaded]);

  // Apply bot settings — runs when settings arrive or hasGreeted changes, so hasGreeted is always fresh
  useEffect(() => {
    if (!botSettings) return;
    if (botSettings.botName) setBotName(botSettings.botName);
    if (!hasGreeted) {
      setMessages([{ id: 'greeting', role: 'bot', text: botSettings.greetingMessage || DEFAULT_CHAT_SETTINGS.greetingMessage }]);
      setHasGreeted(true);
    }
  }, [botSettings, hasGreeted]);

  useEffect(() => {
    if (!isLoaded) return;
    saveChatState({ isOpen, messages, hasGreeted });
  }, [isLoaded, hasGreeted, isOpen, messages]);

  // Initialize visitor context
  useEffect(() => {
    createVisitorContext()
      .then((context) => setVisitorContext(context))
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  // Handle clicking outside the chat to close it
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  const addMessage = useCallback((message: Message): void => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const handleClearChat = useCallback((): void => {
    setMessages([]);
    setHasGreeted(false);
  }, []);

  const navigateToProduct = useCallback((slug: string): void => {
    wixClient.location.to(`/product-page/${slug}`);
  }, []);

  const handleProductAddToCart = useCallback(async (product: ProductInfo): Promise<void> => {
    await sendMessage(`Add ${product.name} to cart`);
  }, [addMessage]);

  const handleActions = useCallback((actions: FrontendAction[]): Promise<void> => {
    return dispatchActions(actions, { addMessage, clearChat: handleClearChat });
  }, [addMessage, handleClearChat]);

  const handleSend = useCallback(async (): Promise<void> => {
    const text = inputValue.trim();
    if (!text || isTyping) return;

    await sendMessage(text);
  }, [inputValue, isTyping, messages, handleActions]);

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    addMessage({ id: `user-${Date.now()}`, role: 'user', text });
    setInputValue('');
    setIsTyping(true);

    const history = messages
      .filter((m) => !m.isTyping && m.role !== 'products')
      .map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      }));

    try {
      const res = await wixClient.fetchWithAuth(`${new URL(import.meta.url).origin}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, context: { ...visitorContext, cart: await getCartItems() } }),
      });

      if (res.status === 429) {
        setIsTyping(false);
        addMessage({ id: `bot-rl-${Date.now()}`, role: 'bot', text: "You're sending messages too fast. Please wait a moment and try again." });
        return;
      }

      if (!res.body) {
        const data = await res.json() as { text?: string; actions?: FrontendAction[]; error?: string };
        setIsTyping(false);
        const text = data.error ? 'Sorry, something went wrong. Please try again.' : (data.text ?? '');
        if (text.trim()) addMessage({ id: `bot-${Date.now()}`, role: 'bot', text });
        if (data.actions?.length) handleActions(data.actions);
        return;
      }

      await readSSEStream(res.body, handleActions, setIsTyping, addMessage);
    } catch (err) {
      console.error('[floaty-chat] sendMessage error:', err);
      addMessage({
        id: `bot-err-${Date.now()}`,
        role: 'bot',
        text: 'Sorry, something went wrong. Please try again.',
      });
      setIsTyping(false);
    }
  }, [isTyping, messages, handleActions, addMessage, visitorContext]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') handleSend();
    },
    [handleSend],
  );

  const handleToggle = useCallback((): void => setIsOpen((prev) => !prev), []);

  const toggleButtonStyle: React.CSSProperties = {
    background: primaryColor,
    ...(position === 'bottom-left' ? { left: '20px', right: 'unset' } : { right: '20px' }),
  };

  function renderToggleButton() {
    return (
      <button
        className={styles.toggleButton}
        onClick={handleToggle}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        style={toggleButtonStyle}
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 4L16 16M16 4L4 16" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white" />
          </svg>
        )}
      </button>
    );
  }

  function renderHeader() {
    return (
      <div className={styles.header} style={{ background: primaryColor }}>
        <div className={styles.headerAvatar}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white" />
          </svg>
        </div>
        <div className={styles.headerInfo}>
          <div className={styles.headerName}>{botName}</div>
          <div className={styles.headerStatus}>Online</div>
        </div>
        <button onClick={handleClearChat} aria-label="Clear chat" className={styles.headerCloseBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button onClick={handleToggle} aria-label="Close chat" className={styles.headerCloseBtn}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M4 4L16 16M16 4L4 16" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  }

  function renderMessages() {
    return (
      <div className={styles.messagesThread}>
        {messages.map((msg) =>
          msg.role === 'products' && msg.products ? (
            <ProductCarousel
              key={msg.id}
              products={msg.products}
              primaryColor={primaryColor}
              onAddToCart={handleProductAddToCart}
              onNavigate={navigateToProduct}
            />
          ) : (
            <MessageBubble key={msg.id} msg={msg} primaryColor={primaryColor} />
          )
        )}
        {isTyping && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>
    );
  }

  function renderInputRow() {
    const disabled = !inputValue.trim() || isTyping;
    return (
      <div className={styles.inputRow}>
        <input
          ref={inputRef}
          className={styles.chatInput}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={isTyping}
        />
        <button
          className={styles.sendButton}
          onClick={handleSend}
          disabled={disabled}
          aria-label="Send message"
          style={{ background: disabled ? '#C8D3E8' : primaryColor }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
              stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: 'contents' }}>
      <style>{`
        .${styles.chatInput}:focus { border-color: ${primaryColor}; box-shadow: 0 0 0 3px ${primaryColor}22; }
        .${styles.sendButton}:not(:disabled):hover { background: ${darkenColor(primaryColor, 20)} !important; }
      `}</style>
      {renderToggleButton()}
      {isOpen && (
        <div className={styles.panel}>
          {renderHeader()}
          {renderMessages()}
          {renderInputRow()}
        </div>
      )}
    </div>
  );
};

async function createVisitorContext(): Promise<VisitorContext> {
  const page = await getPageInfo();
  return { page };
}

async function getPageInfo(): Promise<PageInfo> {
  const page = await wixClient.wixSite.currentPage();
  const meta = await wixClient.seo.metaTags();
  const title = await wixClient.seo.title();
  const description = meta.find((m: any) => m.name === 'description')?.content;
  return { url: (page as any).url, title, description };
}

async function getCartItems(): Promise<CartItem[]> {
  try {
    const cart = await wixClient.currentCart.getCurrentCart();
    return (cart.lineItems ?? []).map((item: any) => ({
      name: item.productName?.original ?? '',
      quantity: item.quantity ?? 1,
      price: item.price?.formattedAmount ?? item.price?.amount ?? '',
      variants: item.descriptionLines
        ?.map((l: any) => `${l.name?.original}: ${l.plainText?.original ?? l.colorInfo?.original ?? ''}`)
        .join(', ') || undefined,
    }));
  } catch {
    return [];
  }
}

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  handleActions: (actions: FrontendAction[]) => Promise<void>,
  setIsTyping: React.Dispatch<React.SetStateAction<boolean>>,
  addMessage: (message: Message) => void,
): Promise<void> {
  const pendingActions: FrontendAction[] = [];
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let isDone = false;

  while (!isDone) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      if (!part.startsWith('data: ')) continue;
      let event: { type: string; text?: string; action?: FrontendAction };
      try { event = JSON.parse(part.slice(6)); } catch { continue; }

      if (event.type === 'action' && event.action) {
        pendingActions.push(event.action);
      } else if (event.type === 'done') {
        setIsTyping(false);
        if (event.text?.trim()) addMessage({ id: `bot-${Date.now()}`, role: 'bot', text: event.text });
        if (pendingActions.length) handleActions(pendingActions);
        isDone = true;
        break;
      } else if (event.type === 'error') {
        console.error('Error from chat stream:', event);
        setIsTyping(false);
        addMessage({ id: `bot-err-${Date.now()}`, role: 'bot', text: 'Sorry, something went wrong. Please try again.' });
        isDone = true;
        break;
      }
    }
  }

  if (!isDone) {
    setIsTyping(false);
    if (pendingActions.length) handleActions(pendingActions);
  }
}

export default ChatWidget;
