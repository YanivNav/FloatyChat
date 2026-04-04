import type { Message } from '../types';

export interface StoredChatState {
  isOpen: boolean;
  messages: Message[];
  hasGreeted: boolean;
}

const CHAT_SESSION_STORAGE_KEY = 'floaty-chat.widget-state';

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function loadChatState(): StoredChatState | null {
  if (!canUseSessionStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredChatState>;
    if (!Array.isArray(parsed.messages)) return null;

    return {
      isOpen: Boolean(parsed.isOpen),
      hasGreeted: Boolean(parsed.hasGreeted),
      messages: parsed.messages.filter((m): m is Message => Boolean(m && m.id)),
    };
  } catch {
    return null;
  }
}

export function saveChatState(state: StoredChatState): void {
  if (!canUseSessionStorage()) return;

  try {
    window.sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures so chat still works when storage is blocked.
  }
}
