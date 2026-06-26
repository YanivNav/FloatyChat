import React, { type FC } from 'react';
import { useChatTheme } from '../ChatThemeContext';
import styles from '../chat-widget.module.scss';

interface Props {
  botName: string;
  onClear: () => void;
  onClose: () => void;
}

/** Panel header: avatar, bot name + status, clear-chat and close buttons. */
export const ChatHeader: FC<Props> = ({ botName, onClear, onClose }) => {
  const { primaryColor } = useChatTheme();
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
      <button onClick={onClear} aria-label="Clear chat" className={styles.headerCloseBtn}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button onClick={onClose} aria-label="Close chat" className={styles.headerCloseBtn}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M4 4L16 16M16 4L4 16" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
};
