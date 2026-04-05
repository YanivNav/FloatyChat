import type { APIRoute } from 'astro';
import { auth } from '@wix/essentials';
import { items } from '@wix/data';
import { DEFAULT_CHAT_SETTINGS } from '../../shared/chat-settings';
import { CHAT_SETTINGS_COLLECTION_ID } from '../../shared/collection-utils';
import type { BotSettings } from '../../shared/types';

export const GET: APIRoute = async () => {
  try {
    const elevatedQuery = auth.elevate(items.query);
    const { items: results } = await elevatedQuery(CHAT_SETTINGS_COLLECTION_ID).find();
    const item = results[0] as BotSettings | undefined;
    return new Response(
      JSON.stringify(item ?? DEFAULT_CHAT_SETTINGS),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch {
    return new Response(JSON.stringify(DEFAULT_CHAT_SETTINGS), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
