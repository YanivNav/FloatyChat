import { useEffect, useState } from 'react';
import { wixClient } from '../wix-client';
import type { BotSettings } from '../types';
import { DEFAULT_CHAT_SETTINGS } from '../../src/shared/chat-settings';
import { apiOrigin, DEFAULT_PRIMARY_COLOR } from '../lib/constants';

export interface BotSettingsState {
  /** Raw settings, or null until the fetch resolves. */
  botSettings: BotSettings | null;
  botName: string;
  primaryColor: string;
  position: 'bottom-right' | 'bottom-left';
  greetingMessage: string;
}

/**
 * Fetches the owner's bot settings (name, colors, greeting) once the chat state
 * has been restored. Falls back to defaults if the request fails.
 *
 * @param isLoaded gate so settings are fetched only after persistence restores.
 */
export function useBotSettings(isLoaded: boolean): BotSettingsState {
  const [botSettings, setBotSettings] = useState<BotSettings | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    wixClient
      .fetchWithAuth(`${apiOrigin()}/api/settings`)
      .then((res: Response) => res.json())
      .catch(() => DEFAULT_CHAT_SETTINGS)
      .then(setBotSettings);
  }, [isLoaded]);

  return {
    botSettings,
    botName: botSettings?.botName || 'Loading...',
    primaryColor: botSettings?.primaryColor ?? DEFAULT_PRIMARY_COLOR,
    position: botSettings?.position ?? 'bottom-right',
    greetingMessage: botSettings?.greetingMessage || DEFAULT_CHAT_SETTINGS.greetingMessage,
  };
}
