import React, { type FC } from 'react';
import { useChatTheme } from '../ChatThemeContext';
import styles from '../chat-widget.module.scss';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

/** The floating button that opens/closes the chat panel. */
export const ToggleButton: FC<Props> = ({ isOpen, onToggle }) => {
  const { primaryColor, position } = useChatTheme();
  const style: React.CSSProperties = {
    background: primaryColor,
    ...(position === 'bottom-left' ? { left: '20px', right: 'unset' } : { right: '20px' }),
  };

  return (
    <button
      className={styles.toggleButton}
      onClick={onToggle}
      aria-label={isOpen ? 'Close chat' : 'Open chat'}
      style={style}
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
};
