import type { APIRoute } from 'astro';
import { buildToolRegistry } from './tools/tools';

export const GET: APIRoute = async () => {
  const registry = await buildToolRegistry();
  const metadata = Array.from(registry.values()).map((t) => ({
    name: t.schema.name,
    displayName: t.displayName,
    shortDescription: t.shortDescription,
    category: t.category,
    instructionHint: t.instructionHint,
  }));
  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
