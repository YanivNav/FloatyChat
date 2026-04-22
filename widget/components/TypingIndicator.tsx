import React, { type FC } from 'react';
import styles from '../chat-widget.module.scss';

export const TypingIndicator: FC = () => (
  <div className={`${styles.messageRow} ${styles.messageRowBot}`}>
    <div className={styles.typingBubble}>
      <span className={styles.typingDot} />
      <span className={styles.typingDot} />
      <span className={styles.typingDot} />
    </div>
  </div>
);
