import { createContext, useContext } from 'react';
import { DEFAULT_PRIMARY_COLOR } from './lib/constants';

export interface ChatTheme {
  primaryColor: string;
  position: 'bottom-right' | 'bottom-left';
}

const ChatThemeContext = createContext<ChatTheme>({
  primaryColor: DEFAULT_PRIMARY_COLOR,
  position: 'bottom-right',
});

export const ChatThemeProvider = ChatThemeContext.Provider;

/** Read the widget theme ({ primaryColor, position }) without prop-drilling. */
export const useChatTheme = (): ChatTheme => useContext(ChatThemeContext);
