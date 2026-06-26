import type { APIRoute } from 'astro';
import { auth } from '@wix/essentials';
import { items } from '@wix/data';
import { DEFAULT_CHAT_SETTINGS } from '../../shared/chat-settings';
import { CHAT_SETTINGS_COLLECTION_ID } from '../../shared/collection-utils';
import type { BotSettings } from '../../shared/types';
import { getRedis } from './redis';


const CACHE_KEY = 'settings:bot';
const CACHE_TTL_SECONDS = 5 * 60;

export const GET: APIRoute = async () => {
  const settings = await loadBotSettings();
  return new Response(JSON.stringify(settings), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async () => {
  await invalidateBotSettingsCache();
  return new Response(null, { status: 204 });
};

export async function loadBotSettings(): Promise<BotSettings> {
  const redis = getRedis();

  if (redis) {
    try {
      const cached = await redis.get<BotSettings>(CACHE_KEY);
      if (cached) return cached;
    } catch (err) {
      // Cache read failed — fall through to the source of truth (the DB).
      console.error("Settings cache read failed; loading from DB:", err);
    }
  }

  try {
    const elevatedQuery = auth.elevate(items.query);
    const { items: results } = await elevatedQuery(CHAT_SETTINGS_COLLECTION_ID).find();
    const item = (results[0] as BotSettings | undefined) ?? DEFAULT_CHAT_SETTINGS;
    if (redis) {
      // A cache-write failure must not discard the settings we just loaded.
      try {
        await redis.set(CACHE_KEY, item, { ex: CACHE_TTL_SECONDS });
      } catch (err) {
        console.error("Settings cache write failed; continuing without caching:", err);
      }
    }
    return item;
  } catch {
    return DEFAULT_CHAT_SETTINGS;
  }
}

export async function invalidateBotSettingsCache(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(CACHE_KEY);
  } catch (err) {
    // Worst case the stale entry lingers until its TTL expires — not fatal.
    console.error("Settings cache invalidation failed:", err);
  }
}
