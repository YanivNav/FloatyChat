import React, { type FC, useEffect, useRef, useState } from 'react';
import { useChatTheme } from '../ChatThemeContext';
import { darkenColor } from '../utils/colors';
import { FOCUS_DELAY_MS, INPUT_MAX_HEIGHT_PX } from '../lib/constants';
import styles from '../chat-widget.module.scss';

interface Props {
  /** Called with the trimmed message text when the visitor submits. */
  onSend: (text: string) => void;
  isTyping: boolean;
}

/** Auto-growing message input. Enter sends; Shift+Enter inserts a newline. */
export const InputRow: FC<Props> = ({ onSend, isTyping }) => {
  const { primaryColor } = useChatTheme();
  const [value, setValue] = useState<string>('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus the input when the panel opens (this component mounts on open).
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  // Auto-grow up to a cap; collapses back when cleared after a send.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT_PX)}px`;
  }, [value]);

  const submit = (): void => {
    const text = value.trim();
    if (!text || isTyping) return;
    setValue('');
    onSend(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter sends; Shift+Enter inserts a newline. Skip while an IME composition
    // is in progress (e.g. Hebrew/CJK input) so we don't send mid-word.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const disabled = !value.trim() || isTyping;

  return (
    <div className={styles.inputRow}>
      <style>{`
        .${styles.chatInput}:focus { border-color: ${primaryColor}; box-shadow: 0 0 0 3px ${primaryColor}22; }
        .${styles.sendButton}:not(:disabled):hover { background: ${darkenColor(primaryColor, 20)} !important; }
      `}</style>
      <textarea
        ref={inputRef}
        className={styles.chatInput}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={isTyping}
      />
      <button
        className={styles.sendButton}
        onClick={submit}
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
};
