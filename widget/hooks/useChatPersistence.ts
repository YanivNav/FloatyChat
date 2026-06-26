import { useCallback, useEffect, useState } from 'react';
import type { Message } from '../types';
import { loadChatState, saveChatState } from '../utils/chatStorage';

export interface ChatPersistence {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  addMessage: (message: Message) => void;
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  hasGreeted: boolean;
  setHasGreeted: React.Dispatch<React.SetStateAction<boolean>>;
  /** True once the initial sessionStorage read has completed. */
  isLoaded: boolean;
}

/**
 * Owns the conversation state (messages, open/closed, greeting flag) and keeps
 * it in sync with sessionStorage so the chat survives reloads within a session.
 */
export function useChatPersistence(): ChatPersistence {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [hasGreeted, setHasGreeted] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Restore persisted state once on mount.
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

  // Persist on every change — but only after the initial restore, so we never
  // overwrite stored state with the empty defaults during the first render.
  useEffect(() => {
    if (!isLoaded) return;
    saveChatState({ isOpen, messages, hasGreeted });
  }, [isLoaded, hasGreeted, isOpen, messages]);

  const addMessage = useCallback((message: Message): void => {
    setMessages((prev) => [...prev, message]);
  }, []);

  return {
    messages,
    setMessages,
    addMessage,
    isOpen,
    setIsOpen,
    hasGreeted,
    setHasGreeted,
    isLoaded,
  };
}
