import type Anthropic from "@anthropic-ai/sdk";
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

export type ToolExecutionResult = any | { earlyExit: true };

export type ToolResult = { earlyExit: true } | { earlyExit: false, result: Anthropic.ToolResultBlockParam };

export interface ToolContext {
  frontendActions: FrontendAction[];
  send: SendFn;
}

export interface BackendTool<TInput = unknown> {
  schema: Anthropic.Tool;
  execute: (input: TInput, ctx: ToolContext) => Promise<ToolExecutionResult>;
  displayName: string;
  shortDescription: string;
  category: 'store' | 'orders' | 'navigation' | 'utility';
  instructionHint?: string;
}

const searchKnowledgeBaseTool: BackendTool<{ query: string }> = {
  displayName: 'Search Knowledge Base',
  shortDescription: 'Looks up FAQ entries you\'ve written to answer visitor questions.',
  category: 'utility',
  schema: {
    name: 'search_knowledge_base',
    description: 'Use this tool to search the site knowledge base for answers about policies, shipping, returns, hours, or ANY other question, even if it might sound stupid or unrelated to the website. Use this before answering any random question. The query will be matched against a collection of FAQ entries that the site owner can manage in the dashboard. If there are no relevant matches, do not return any results and answer the visitor based on your general knowledge.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The visitor question or topic to look up' },
      },
      required: ['query'],
    },
  },
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
};

const clearChatTool: BackendTool = {
  displayName: 'Clear Chat',
  shortDescription: 'Clears the conversation history when the visitor asks to start over.',
  category: 'utility',
  schema: {
    name: 'clear_chat',
    description: 'Clear the chat conversation history and start fresh. Use this when the visitor asks to start over, clear the chat, or begin a new conversation.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  execute: async (_input, ctx) => {
    ctx.frontendActions.push({ type: 'clear_chat' });
    return { success: true };
  },
};


export async function buildToolRegistry(toolSettings?: ToolSettingsMap): Promise<Map<string, BackendTool<any>>> {
  const allTools: BackendTool<any>[] = [
    ...storeTools,
    ...orderTools,
    ...navigationTools,
    searchKnowledgeBaseTool,
    clearChatTool,
  ];

  return new Map(
    allTools
      .filter((tool) => {
        const config = toolSettings?.[tool.schema.name];
        return config === undefined || config.enabled;
      })
      .map((tool) => {
        const instruction = toolSettings?.[tool.schema.name]?.instruction?.trim();
        if (instruction) {
          return [tool.schema.name, {
            ...tool,
            schema: { ...tool.schema, description: `${tool.schema.description}\n\nSite owner instruction: ${instruction}` },
          }];
        }
        return [tool.schema.name, tool];
      })
  );
}
