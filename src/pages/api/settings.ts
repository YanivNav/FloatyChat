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
  console.time('fetch-settings');
  const redis = getRedis();

  if (redis) {
    const cached = await redis.get<BotSettings>(CACHE_KEY);
    if (cached) {
      console.timeEnd('fetch-settings');
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const elevatedQuery = auth.elevate(items.query);
    const { items: results } = await elevatedQuery(CHAT_SETTINGS_COLLECTION_ID).find();
    const item = (results[0] as BotSettings | undefined) ?? DEFAULT_CHAT_SETTINGS;

    if (redis) {
      await redis.set(CACHE_KEY, item, { ex: CACHE_TTL_SECONDS });
    }

    console.timeEnd('fetch-settings');
    return new Response(JSON.stringify(item), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify(DEFAULT_CHAT_SETTINGS), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async () => {
  const redis = getRedis();
  if (redis) {
    await redis.del(CACHE_KEY);
  }
  return new Response(null, { status: 204 });
};
