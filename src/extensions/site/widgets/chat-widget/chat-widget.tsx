import React, { type FC, useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import reactToWebComponent from 'react-to-webcomponent';
import { currentCart } from '@wix/ecom';
import { ecom } from '@wix/site-ecom';
import { location as siteLocation } from '@wix/site-location';
import { window as siteWindow } from '@wix/site-window';
import { site as wixSite } from '@wix/site-site';
import { httpClient } from '@wix/essentials';

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
  isTyping?: boolean;
}

interface FrontendAction {
  type: string;
  url?: string;
  product_id?: string;
  product_name?: string;
  quantity?: number;
  variant_options?: Record<string, string>;
}

const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

interface ChatAssistantProps {
  botName?: string;
  primaryColor?: string;
  greetingMessage?: string;
}

interface StoredChatState {
  isOpen: boolean;
  messages: Message[];
  hasGreeted: boolean;
}

const CHAT_SESSION_STORAGE_KEY = 'floaty-chat.widget-state';

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function loadChatState(): StoredChatState | null {
  if (!canUseSessionStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredChatState>;
    if (!Array.isArray(parsed.messages)) return null;

    return {
      isOpen: Boolean(parsed.isOpen),
      hasGreeted: Boolean(parsed.hasGreeted),
      messages: parsed.messages.filter((message): message is Message => Boolean(message && message.id)),
    };
  } catch {
    return null;
  }
}

function saveChatState(state: StoredChatState): void {
  if (!canUseSessionStorage()) return;

  try {
    window.sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures so chat still works when storage is blocked.
  }
}

function renderFormattedMessage(text: string): React.ReactNode[] {
  const lines = text.split(/\r?\n/);

  return lines.flatMap((line, lineIndex) => {
    const parts: React.ReactNode[] = [];
    const boldPattern = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = boldPattern.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }

      parts.push(
        <strong key={`bold-${lineIndex}-${match.index}`}>
          {match[1]}
        </strong>,
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    if (parts.length === 0) {
      parts.push('');
    }

    if (lineIndex < lines.length - 1) {
      parts.push(<br key={`br-${lineIndex}`} />);
    }

    return parts;
  });
}

const TypingIndicator: FC = () => (
  <div style={styles.typingBubble}>
    <span style={{ ...styles.typingDot, animationDelay: '0ms' }} />
    <span style={{ ...styles.typingDot, animationDelay: '150ms' }} />
    <span style={{ ...styles.typingDot, animationDelay: '300ms' }} />
  </div>
);

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
    const restoredState = loadChatState();
    return restoredState?.hasGreeted ?? (restoredState?.messages.length ?? 0) > 0;
  });
  const [inEditor, setInEditor] = useState<boolean>(false);
  const [pages, setPages] = useState<{ name: string; url: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    siteWindow.viewMode()
      .then((mode) => setInEditor(mode === 'Editor'))
      .catch(() => setInEditor(!!(window as any).Wix));
  }, []);

  useEffect(() => {
    wixSite.getSiteStructure()
      .then((structure) => {
        const sitePages = structure.pages?.map((p) => ({ name: p.name, url: p.url! })) ?? [];
        setPages(sitePages);
      })
      .catch(() => {/* pages stay empty */});
  }, []);

  useEffect(() => {
    saveChatState({ isOpen, messages, hasGreeted });
  }, [hasGreeted, isOpen, messages]);

  const scrollToBottom = useCallback((): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const addToCart = useCallback(async (action: FrontendAction): Promise<void> => {
    const productId = action.product_id;
    const quantity = Math.max(1, Number(action.quantity ?? 1));
    const variantOptions = action.variant_options && Object.keys(action.variant_options).length > 0
      ? action.variant_options
      : undefined;

    if (!productId) return;

    await currentCart.addToCurrentCart({
      lineItems: [
        {
          catalogReference: {
            appId: STORES_APP_ID,
            catalogItemId: productId,
            ...(variantOptions ? { options: variantOptions } : {}),
          },
          quantity,
        },
      ],
    });
    await ecom.refreshCart()
  }, []);

  const checkout = useCallback(async (): Promise<void> => {
    const res = await currentCart.createCheckoutFromCurrentCart()
    await ecom.navigateToCheckoutPage(res.checkoutId!);
  }, []);

  useEffect(() => {
    if (isOpen && !hasGreeted) {
      setMessages([
        {
          id: 'greeting',
          role: 'bot',
          text: greetingMessage,
        },
      ]);
      setHasGreeted(true);
    }
  }, [isOpen, hasGreeted, greetingMessage]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleActions = useCallback((actions: FrontendAction[]): void => {
    for (const action of actions) {
      console.log('Executing action:', action);
      if (action.type === 'navigate_to_page' && action.url) {
        console.log(`Navigating to ${action.url}`);
        siteLocation.to(action.url);
      } else if (action.type === 'add_to_cart') {
        addToCart(action).catch(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: `bot-cart-err-${Date.now()}`,
              role: 'bot',
              text: 'Sorry, I could not add that item to your cart.',
            },
          ]);
        });
      } else if (action.type === 'proceed_to_checkout') {
        checkout()
      }
    }
  }, [addToCart, checkout]);

  const handleToggle = useCallback((): void => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSend = useCallback((): void => {
    const text = inputValue.trim();
    if (!text || isTyping) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    const history = messages
      .filter((m) => !m.isTyping)
      .map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      }));

    httpClient
      .fetchWithAuth(`${new URL(import.meta.url).origin}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, pages }),
      })
      .then(async (res) => {
        const data = await res.json() as { text?: string; actions?: FrontendAction[]; error?: string };
        setIsTyping(false);

        const replyText = data.error
          ? 'Sorry, something went wrong. Please try again.'
          : (data.text ?? '');

        setMessages((prev) => [
          ...prev,
          { id: `bot-${Date.now()}`, role: 'bot', text: replyText },
        ]);

        if (data.actions?.length) {
          handleActions(data.actions);
        }
      })
      .catch(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-err-${Date.now()}`,
            role: 'bot',
            text: 'Sorry, something went wrong. Please try again.',
          },
        ]);
        setIsTyping(false);
      });
  }, [inputValue, isTyping, messages, pages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        handleSend();
      }
    },
    [handleSend],
  );

  const darkenColor = (hex: string, amount: number): string => {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - amount);
    const g = Math.max(0, ((num >> 8) & 0xff) - amount);
    const b = Math.max(0, (num & 0xff) - amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };

  const headerBg = primaryColor;
  const buttonBg = primaryColor;
  const userBubbleBg = primaryColor;
  const sendButtonHoverBg = darkenColor(primaryColor, 20);

  return (
    <>
      <style>{`
        @keyframes chat-dot-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes chat-panel-in {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes chat-panel-out {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(16px) scale(0.97); }
        }
        .chat-send-btn:hover {
          background: ${sendButtonHoverBg} !important;
        }
        .chat-input:focus {
          outline: none;
          border-color: ${primaryColor} !important;
          box-shadow: 0 0 0 3px ${primaryColor}22 !important;
        }
        .chat-toggle-btn:hover {
          transform: scale(1.08) !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.25) !important;
        }
        .chat-panel {
          animation: chat-panel-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .chat-message-bubble {
          word-break: break-word;
        }
        .chat-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .chat-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .chat-scrollbar::-webkit-scrollbar-thumb {
          background: #D0D5DD;
          border-radius: 4px;
        }
      `}</style>

      {/* Floating toggle button */}
      <button
        className={inEditor ? undefined : 'chat-toggle-btn'}
        onClick={inEditor ? undefined : handleToggle}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        style={{
          ...(inEditor
            ? {}
            : { position: 'fixed', bottom: '24px', right: '24px', zIndex: 10000 }),
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: buttonBg,
          border: 'none',
          cursor: inEditor ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        }}
      >
        {isOpen ? (
          /* X icon */
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 4L16 16M16 4L4 16" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        ) : (
          /* Chat bubble icon */
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"
              fill="white"
            />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && !inEditor && (
        <div
          className="chat-panel"
          style={{
            position: 'fixed',
            bottom: '92px',
            right: '24px',
            width: '360px',
            height: '520px',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.16)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
          }}
        >
          {/* Header */}
          <div
            style={{
              background: headerBg,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexShrink: 0,
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"
                  fill="white"
                />
              </svg>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: '15px', lineHeight: 1.2 }}>
                {botName}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px', marginTop: '2px' }}>
                Online
              </div>
            </div>

            <button
              onClick={handleToggle}
              aria-label="Close chat"
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d="M4 4L16 16M16 4L4 16" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Messages thread */}
          <div
            className="chat-scrollbar"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              background: '#FAFBFC',
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  className="chat-message-bubble"
                  style={{
                    maxWidth: '75%',
                    padding: '10px 14px',
                    borderRadius:
                      msg.role === 'user'
                        ? '18px 18px 4px 18px'
                        : '18px 18px 18px 4px',
                    background: msg.role === 'user' ? userBubbleBg : '#F0F0F0',
                    color: msg.role === 'user' ? '#ffffff' : '#1A1A2E',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    boxShadow:
                      msg.role === 'user'
                        ? '0 2px 8px rgba(0,0,0,0.12)'
                        : '0 1px 4px rgba(0,0,0,0.06)',
                  }}
                >
                  {renderFormattedMessage(msg.text)}
                </div>
              </div>
            ))}

            {isTyping && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <TypingIndicator />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid #EBEBEB',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#ffffff',
              flexShrink: 0,
            }}
          >
            <input
              ref={inputRef}
              className="chat-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              disabled={isTyping}
              style={{
                flex: 1,
                border: '1.5px solid #E0E0E0',
                borderRadius: '24px',
                padding: '10px 16px',
                fontSize: '14px',
                color: '#1A1A2E',
                background: '#F7F8FA',
                outline: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                fontFamily: 'inherit',
              }}
            />
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!inputValue.trim() || isTyping}
              aria-label="Send message"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: !inputValue.trim() || isTyping ? '#C8D3E8' : buttonBg,
                border: 'none',
                cursor: !inputValue.trim() || isTyping ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
            >
              {/* Send icon (paper plane) */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

const styles = {
  typingBubble: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '12px 16px',
    background: '#F0F0F0',
    borderRadius: '18px 18px 18px 4px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  } as React.CSSProperties,
  typingDot: {
    display: 'inline-block',
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#9AA0AD',
    animation: 'chat-dot-bounce 1.2s infinite ease-in-out',
  } as React.CSSProperties,
};

const customElement = reactToWebComponent(ChatWidget, React, ReactDOM, {
  props: {
    botName: 'string',
    primaryColor: 'string',
    greetingMessage: 'string',
  },
});

export default customElement;
