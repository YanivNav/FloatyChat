import React, { type FC, useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import reactToWebComponent from 'react-to-webcomponent';
import { currentCart } from '@wix/ecom';
import { ecom } from '@wix/site-ecom';
import { location as siteLocation } from '@wix/site-location';
import { window as siteWindow } from '@wix/site-window';
import { site as wixSite } from '@wix/site-site';
import { httpClient } from '@wix/essentials';
import type { Message, FrontendAction, ProductCard } from './types';
import { loadChatState, saveChatState } from './utils/chatStorage';
import { darkenColor } from './utils/colors';
import { TypingIndicator } from './components/TypingIndicator';
import { ProductCarousel } from './components/ProductCarousel';
import { MessageBubble } from './components/MessageBubble';
import widgetStyles from './chat-widget.module.css';
import panelStyles from './chat-panel.module.css';

const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

interface ChatAssistantProps {
  botName?: string;
  primaryColor?: string;
  greetingMessage?: string;
}

const ChatWidget: FC<ChatAssistantProps> = ({
  botName = 'AI Assistant',
  primaryColor = '#116DFF',
  greetingMessage = 'Hi! How can I help you today?',
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(() => loadChatState()?.isOpen ?? false);
  const [messages, setMessages] = useState<Message[]>(() => loadChatState()?.messages ?? []);
  const [inputValue, setInputValue] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [hasGreeted, setHasGreeted] = useState<boolean>(() => {
    const restored = loadChatState();
    return restored?.hasGreeted ?? (restored?.messages.length ?? 0) > 0;
  });
  const [inEditor, setInEditor] = useState<boolean>(false);
  const [pages, setPages] = useState<{ name: string; url: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    siteWindow.viewMode()
      .then((mode) => setInEditor(mode === 'Editor'))
      .catch(() => setInEditor(!!(window as any).Wix));
  }, []);

  useEffect(() => {
    wixSite.getSiteStructure()
      .then((structure) => setPages(structure.pages?.map((p) => ({ name: p.name, url: p.url! })) ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    saveChatState({ isOpen, messages, hasGreeted });
  }, [hasGreeted, isOpen, messages]);

  useEffect(() => {
    if (isOpen && !hasGreeted) {
      setMessages([{ id: 'greeting', role: 'bot', text: greetingMessage }]);
      setHasGreeted(true);
    }
  }, [isOpen, hasGreeted, greetingMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  // ── Cart & navigation ──────────────────────────────────────────────────────

  const addToCart = useCallback(async (action: FrontendAction): Promise<void> => {
    const productId = action.product_id;
    if (!productId) return;

    await currentCart.addToCurrentCart({
      lineItems: [{
        catalogReference: {
          appId: STORES_APP_ID,
          catalogItemId: productId,
          ...(action.variant_id ? { options: { variantId: action.variant_id } } : {}),
        },
        quantity: Math.max(1, Number(action.quantity ?? 1)),
      }],
    });
    await ecom.refreshCart().catch(() => {});
  }, []);

  const checkout = useCallback(async (): Promise<void> => {
    const res = await currentCart.createCheckoutFromCurrentCart();
    await ecom.navigateToCheckoutPage(res.checkoutId!);
  }, []);

  const navigateToProduct = useCallback((slug: string): void => {
    siteLocation.to(`/product-page/${slug}`);
  }, []);

  const handleProductAddToCart = useCallback(async (product: ProductCard): Promise<void> => {
    await addToCart({ type: 'add_to_cart', product_id: product.id, product_name: product.name })
      .catch(() => setMessages((prev) => [
        ...prev,
        { id: `bot-cart-err-${Date.now()}`, role: 'bot', text: `Sorry, I couldn't add ${product.name} to your cart.` },
      ]));
  }, [addToCart]);

  // ── Action handler ─────────────────────────────────────────────────────────

  const handleActions = useCallback(async (actions: FrontendAction[]): Promise<void> => {
    for (const action of actions) {
      if (action.type === 'show_products' && action.products?.length) {
        setMessages((prev) => [
          ...prev,
          { id: `products-${Date.now()}`, role: 'products', text: '', products: action.products },
        ]);
      } else if (action.type === 'navigate_to_page' && action.url) {
        siteLocation.to(action.url);
        return;
      } else if (action.type === 'add_to_cart') {
        let failed = false;
        await addToCart(action).catch(() => {
          failed = true;
          setMessages((prev) => [
            ...prev,
            { id: `bot-cart-err-${Date.now()}`, role: 'bot', text: 'Sorry, I could not add that item to your cart.' },
          ]);
        });
        if (failed) return;
      } else if (action.type === 'proceed_to_checkout') {
        await checkout();
      }
    }
  }, [addToCart, checkout]);

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = useCallback(async (): Promise<void> => {
    const text = inputValue.trim();
    if (!text || isTyping) return;

    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', text }]);
    setInputValue('');
    setIsTyping(true);

    const history = messages
      .filter((m) => !m.isTyping && m.role !== 'products')
      .map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      }));

    try {
      const res = await httpClient.fetchWithAuth(`${new URL(import.meta.url).origin}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, pages }),
      });

      if (!res.body) {
        const data = await res.json() as { text?: string; actions?: FrontendAction[]; error?: string };
        setIsTyping(false);
        setMessages((prev) => [...prev, {
          id: `bot-${Date.now()}`,
          role: 'bot',
          text: data.error ? 'Sorry, something went wrong. Please try again.' : (data.text ?? ''),
        }]);
        if (data.actions?.length) handleActions(data.actions);
        return;
      }

      await readSSEStream(res.body, handleActions, setIsTyping, setMessages);
    } catch {
      setMessages((prev) => [...prev, {
        id: `bot-err-${Date.now()}`,
        role: 'bot',
        text: 'Sorry, something went wrong. Please try again.',
      }]);
      setIsTyping(false);
    }
  }, [inputValue, isTyping, messages, pages, handleActions]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') handleSend();
    },
    [handleSend],
  );

  const handleToggle = useCallback((): void => setIsOpen((prev) => !prev), []);

  // ── Render methods ─────────────────────────────────────────────────────────

  function renderToggleButton() {
    return (
      <button
        className={inEditor ? widgetStyles.toggleButtonEditor : widgetStyles.toggleButton}
        onClick={inEditor ? undefined : handleToggle}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        style={{ background: primaryColor }}
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
      <div className={panelStyles.header} style={{ background: primaryColor }}>
        <div className={panelStyles.headerAvatar}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white" />
          </svg>
        </div>
        <div className={panelStyles.headerInfo}>
          <div className={panelStyles.headerName}>{botName}</div>
          <div className={panelStyles.headerStatus}>Online</div>
        </div>
        <button onClick={handleToggle} aria-label="Close chat" className={panelStyles.headerCloseBtn}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M4 4L16 16M16 4L4 16" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  }

  function renderMessages() {
    return (
      <div className={panelStyles.messagesThread}>
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
      <div className={panelStyles.inputRow}>
        <input
          ref={inputRef}
          className={panelStyles.chatInput}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={isTyping}
        />
        <button
          className={panelStyles.sendButton}
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        .${panelStyles.chatInput}:focus { border-color: ${primaryColor}; box-shadow: 0 0 0 3px ${primaryColor}22; }
        .${panelStyles.sendButton}:not(:disabled):hover { background: ${darkenColor(primaryColor, 20)} !important; }
      `}</style>
      {renderToggleButton()}
      {isOpen && !inEditor && (
        <div className={panelStyles.panel}>
          {renderHeader()}
          {renderMessages()}
          {renderInputRow()}
        </div>
      )}
    </>
  );
};

// ── SSE stream reader ────────────────────────────────────────────────────────

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  handleActions: (actions: FrontendAction[]) => Promise<void>,
  setIsTyping: React.Dispatch<React.SetStateAction<boolean>>,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
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
        setMessages((prev) => [...prev, { id: `bot-${Date.now()}`, role: 'bot', text: event.text ?? '' }]);
        if (pendingActions.length) handleActions(pendingActions);
        isDone = true;
        break;
      } else if (event.type === 'error') {
        setIsTyping(false);
        setMessages((prev) => [...prev, { id: `bot-err-${Date.now()}`, role: 'bot', text: 'Sorry, something went wrong. Please try again.' }]);
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

// ── Web component registration ───────────────────────────────────────────────

const customElement = reactToWebComponent(ChatWidget, React, ReactDOM, {
  props: {
    botName: 'string',
    primaryColor: 'string',
    greetingMessage: 'string',
  },
});

export default customElement;
