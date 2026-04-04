import React, { type FC } from 'react';
import type { Message } from '../types';
import { renderFormattedMessage } from '../utils/formatMessage';
import styles from './MessageBubble.module.css';

interface Props {
  msg: Message;
  primaryColor: string;
}

export const MessageBubble: FC<Props> = ({ msg, primaryColor }) => (
  <div className={`${styles.messageRow} ${msg.role === 'user' ? styles.messageRowUser : styles.messageRowBot}`}>
    <div
      className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.botBubble}`}
      style={msg.role === 'user' ? { background: primaryColor } : undefined}
    >
      {renderFormattedMessage(msg.text)}
    </div>
  </div>
);
