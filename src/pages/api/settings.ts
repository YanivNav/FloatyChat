import type { APIRoute } from 'astro';
import { auth } from '@wix/essentials';
import { items } from '@wix/data';
import { CHAT_SETTINGS_COLLECTION_ID, DEFAULT_CHAT_SETTINGS } from '../../shared/chat-settings';

export const GET: APIRoute = async () => {
  try {
    const elevatedQuery = auth.elevate(items.query);
    const { items: results } = await elevatedQuery(CHAT_SETTINGS_COLLECTION_ID).find();
    const item = results[0] as { botName?: string; greetingMessage?: string } | undefined;
    return new Response(
      JSON.stringify({
        botName: item?.botName ?? DEFAULT_CHAT_SETTINGS.botName,
        greetingMessage: item?.greetingMessage ?? DEFAULT_CHAT_SETTINGS.greetingMessage,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch {
    return new Response(JSON.stringify(DEFAULT_CHAT_SETTINGS), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
