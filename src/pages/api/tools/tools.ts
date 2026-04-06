import type Anthropic from "@anthropic-ai/sdk";
import { items } from '@wix/data';
import { auth } from '@wix/essentials';
import type { FaqEntry, FrontendAction } from '../../../shared/types';
import { FAQ_COLLECTION_ID } from '../../../shared/collection-utils';
import storeTools from "./store/store-tools";
import orderTools from "./orders";

export interface Page {
  name: string;
  url: string;
}

export interface NavigateToPageInput {
  url: string;
  name?: string;
  product_slug?: string;
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
}


const askClarificationTool: BackendTool<{ question: string }> = {
  schema: {
    name: 'ask_clarification',
    description: 'Ask the visitor a follow-up question before proceeding, e.g. to clarify size, color, or quantity.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The clarifying question to ask' },
      },
      required: ['question'],
    },
  },
  execute: async (input, ctx) => {
    ctx.send({ type: 'token', text: input.question });
    return { earlyExit: true };
  },
};

const navigateToPageTool: BackendTool<NavigateToPageInput> = {
  schema: {
    name: 'navigate_to_page',
    description: `Navigate the visitor to a page on the site. Use the exact URL from the page list for ordinary pages.
    For product pages, first call search_products to find the product, then use the slug from the results to construct the URL in the form of /product-page/{slug}. Do NOT call show_products in this case.
    For product category pages, construct the URL in the form of /category/{category-slug}. All Products is a category page with the slug "all-products".`,
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The page URL to navigate to, e.g. "/shop" or "/about"' },
        name: { type: 'string', description: 'The human-readable page name for confirmation messaging' },
      },
      required: ['url'],
    },
  },
  execute: async (input, ctx) => {
    ctx.frontendActions.push({ type: 'navigate_to_page', ...input });
    return { success: true, resolvedUrl: input.url };
  },
}

const searchKnowledgeBaseTool: BackendTool<{ query: string }> = {
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


export async function buildToolRegistry(): Promise<Map<string, BackendTool<any>>> {
  const tools: BackendTool<any>[] = [
    ...storeTools,
    ...orderTools,
    searchKnowledgeBaseTool,
    askClarificationTool,
    navigateToPageTool,
    clearChatTool,
  ];
  return new Map(tools.map((tool) => [tool.schema.name, tool]));
}
