import { tool, type Tool } from 'ai';
import { z } from 'zod';
import { items } from '@wix/data';
import { auth } from '@wix/essentials';
import type { FaqEntry, FrontendAction, ToolSettingsMap } from '../../../shared/types';
import { FAQ_COLLECTION_ID } from '../../../shared/collection-utils';
import storeTools from "./store/store-tools";
import orderTools from "./orders";
import navigationTools from "./navigation";

export interface Page {
  name: string;
  url: string;
}

export type SendFn = (event: object) => void;

export interface ToolContext {
  frontendActions: FrontendAction[];
}

/**
 * A tool definition: dashboard metadata + the Zod schema and handler.
 * `execute` receives the parsed input and the per-request context. Its return
 * value is fed back to the model as the tool result (the AI SDK serializes it).
 */
export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  displayName: string;
  shortDescription: string;
  category: 'store' | 'orders' | 'navigation' | 'utility';
  instructionHint?: string;
  description: string;
  inputSchema: S;
  execute: (input: z.infer<S>, ctx: ToolContext) => unknown | Promise<unknown>;
}

/** Identity helper that preserves the Zod schema generic so `input` stays typed. */
export function defineTool<S extends z.ZodType>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

const searchKnowledgeBaseTool = defineTool({
  name: 'search_knowledge_base',
  displayName: 'Search Knowledge Base',
  shortDescription: 'Looks up FAQ entries you\'ve written to answer visitor questions.',
  category: 'utility',
  description: 'Use this tool to search the site knowledge base for answers about policies, shipping, returns, hours, or ANY other question, even if it might sound stupid or unrelated to the website. Use this before answering any random question. The query will be matched against a collection of FAQ entries that the site owner can manage in the dashboard. If there are no relevant matches, do not return any results and answer the visitor based on your general knowledge. DO NOT use this to search for things that could be products - Use search_products instead.',
  inputSchema: z.object({
    query: z.string().describe('The visitor question or topic to look up'),
  }),
  execute: async (input) => {
    try {
      const { items: faqs } = await auth.elevate(items.query)(FAQ_COLLECTION_ID).limit(50).find();
      if (!faqs.length) return { matches: [], message: 'No FAQ entries found.' };

      const keywords = input.query.toLowerCase().split(/\s+/)
        .map(w => w.replaceAll('?', ''))
        .filter((w) => w.length >= 3);

      console.log('Searching knowledge base for:', keywords);
      if (!keywords.length) return { matches: [], message: 'Query too short.' };

      const scored = (faqs as FaqEntry[])
        .map((faq) => {
          const text = `${faq.question} ${faq.answer}`.toLowerCase();
          const score = keywords.reduce((n, kw) => n + (text.includes(kw) ? 1 : 0), 0);
          return { ...faq, score };
        })
        .filter((f) => f.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ question, answer }) => ({ question, answer }));

      return scored.length
        ? { matches: scored }
        : { matches: [], message: 'No relevant FAQ entries found.' };
    } catch {
      return { error: 'Knowledge base unavailable.' };
    }
  },
});

const clearChatTool = defineTool({
  name: 'clear_chat',
  displayName: 'Clear Chat',
  shortDescription: 'Clears the conversation history when the visitor asks to start over.',
  category: 'utility',
  description: 'Clear the chat conversation history and start fresh. Use this when the visitor asks to start over, clear the chat, or begin a new conversation.',
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    ctx.frontendActions.push({ type: 'clear_chat' });
    return { success: true };
  },
});

/**
 * Returns the enabled tool definitions, with each owner-supplied instruction
 * already appended to the description. Consumed by the chat loop (to build AI
 * SDK tools) and by `/api/tools` (for dashboard metadata).
 */
export async function buildToolRegistry(toolSettings?: ToolSettingsMap): Promise<ToolDef<any>[]> {
  const allTools: ToolDef<any>[] = [
    ...storeTools,
    ...orderTools,
    ...navigationTools,
    searchKnowledgeBaseTool,
    clearChatTool,
  ];

  return allTools
    .filter((t) => {
      const config = toolSettings?.[t.name];
      return config === undefined || config.enabled;
    })
    .map((t) => {
      const instruction = toolSettings?.[t.name]?.instruction?.trim();
      return instruction
        ? { ...t, description: `${t.description}\n\nSite owner instruction: ${instruction}` }
        : t;
    });
}

/** Builds the `tools` map for `streamText`, injecting the per-request context. */
export function toAiTools(defs: ToolDef<any>[], ctx: ToolContext): Record<string, Tool> {
  return Object.fromEntries(
    defs.map((def) => [
      def.name,
      tool({
        description: def.description,
        inputSchema: def.inputSchema,
        execute: (input) => def.execute(input, ctx),
      }),
    ]),
  );
}
