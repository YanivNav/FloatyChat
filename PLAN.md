# Wix AI Chat Assistant — Project Plan

## Overview

A Wix app published on the Wix App Market that adds an AI-powered chat assistant to any Wix website. Visitors can ask questions about the site, search for products, and perform actions like adding items to cart and proceeding to checkout — all through a conversational interface.

**Example interaction:**
> User: "Buy me 2 blue shirts, 3 jeans and a pair of socks"
> Bot: adds the shirts and jeans to cart, then asks "What color socks would you like?"
> User: "Black"
> Bot: adds socks, confirms cart, proceeds to checkout

---

## Tech Stack Decisions

| Decision | Choice | Reason |
|---|---|---|
| App framework | Wix CLI | Code-first, local dev in VS Code, hot reload, same Wix API access as Blocks |
| UI framework | React (CLI default) + Wix Design System | Comes with CLI scaffold |
| Bot intelligence | Claude API (claude-sonnet-4-20250514) | Tool-use support for structured actions |
| Claude integration | Raw `fetch` to Anthropic API | `@anthropic-ai/sdk` may not be on Wix npm approved list |
| Streaming workaround | `wixRealtime` pub/sub | Wix backend has 14s timeout; realtime channels bypass it |
| Knowledge storage | Wix CMS collections (in app) | Public app CMS doesn't count against site quota |
| Vector search | External provider (Pinecone or Supabase pgvector) | Velo can't run embedding workloads natively |

---

## Architecture — 5 Layers

### 1. Visitor Layer (Widget)
What the end-user sees on the live site.
- Floating chat button + expandable panel (Wix widget extension)
- Message thread UI with streaming tokens via `wixRealtime`
- Action feedback (cart update confirmations, navigation prompts)
- Quick-reply suggestion chips

### 2. Bot Engine (Velo Backend)
The brain — Velo backend functions called from the widget.
- **Intent router** — decides if message is FAQ / product search / action
- **Claude API caller** — sends messages + tool definitions, receives tool calls or text
- **Action executor** — runs the tool calls Claude requests against Wix APIs
- **Context manager** — maintains conversation history per session
- **Clarification handler** — asks follow-up questions before executing destructive actions (e.g. checkout)

### 3. Knowledge Base
What the bot knows about the site.
- **Site crawler** — indexes Wix pages, Stores products, CMS collections into vector embeddings
- **Owner editor** — custom FAQs and answers added manually by site owner
- **Vector store** — external DB storing embeddings for semantic search
- **Wix Stores API** — live product/inventory data queried at runtime
- **Sync scheduler** — re-indexes content when site data changes

### 4. Owner Dashboard
Wix Dashboard page (installed automatically with the app).
- Bot settings: persona name, tone, greeting message, restricted topics
- Knowledge editor: add/edit/delete custom Q&A pairs, trigger manual re-index
- Analytics: conversation count, action completion rate, top questions

### 5. Monetization (App Market Tiers)
| Tier | Limits | Features |
|---|---|---|
| Free | 50 chats/month | FAQ answering only |
| Starter | 500 chats/month | FAQ + product search |
| Pro | Unlimited | All features + actions + analytics |

---

## How Claude Tool-Use Works in This App

Instead of returning plain text, Claude can call structured "tools" that your backend executes. This is what enables real actions, not just answers.

**Tool definitions sent to Claude on every request:**

```json
[
  {
    "name": "search_products",
    "description": "Search the store catalog for products matching a query",
    "input_schema": {
      "type": "object",
      "properties": {
        "query": { "type": "string" },
        "filters": {
          "type": "object",
          "properties": {
            "color": { "type": "string" },
            "max_price": { "type": "number" },
            "category": { "type": "string" }
          }
        }
      },
      "required": ["query"]
    }
  },
  {
    "name": "add_to_cart",
    "description": "Add a product variant to the visitor's cart",
    "input_schema": {
      "type": "object",
      "properties": {
        "product_id": { "type": "string" },
        "quantity": { "type": "number" },
        "variant_id": { "type": "string" }
      },
      "required": ["product_id", "quantity"]
    }
  },
  {
    "name": "ask_clarification",
    "description": "Ask the visitor a follow-up question before proceeding",
    "input_schema": {
      "type": "object",
      "properties": {
        "question": { "type": "string" }
      },
      "required": ["question"]
    }
  },
  {
    "name": "navigate_to_page",
    "description": "Navigate the visitor to a page on the site",
    "input_schema": {
      "type": "object",
      "properties": {
        "page_slug": { "type": "string" }
      },
      "required": ["page_slug"]
    }
  },
  {
    "name": "proceed_to_checkout",
    "description": "Navigate the visitor to the checkout page",
    "input_schema": {
      "type": "object",
      "properties": {
        "confirm": { "type": "boolean" }
      },
      "required": ["confirm"]
    }
  },
  {
    "name": "fill_form",
    "description": "Pre-fill a form on the current page with provided values",
    "input_schema": {
      "type": "object",
      "properties": {
        "field_values": {
          "type": "object",
          "additionalProperties": { "type": "string" }
        }
      },
      "required": ["field_values"]
    }
  },
  {
    "name": "search_knowledge_base",
    "description": "Search the site knowledge base for answers to visitor questions",
    "input_schema": {
      "type": "object",
      "properties": {
        "query": { "type": "string" }
      },
      "required": ["query"]
    }
  }
]
```

**Request/response flow:**
1. Visitor sends message
2. Widget calls backend function, which immediately returns `"ok"` (avoids 14s timeout)
3. Backend calls Claude API with message + tool definitions + conversation history
4. Claude returns either text OR one/more tool calls
5. Backend executes tool calls (Wix Stores API, wixData, wixLocation, etc.)
6. Results are sent back to Claude for a final natural language response
7. Each token/chunk is published to a `wixRealtime` channel
8. Widget frontend is subscribed to that channel and renders tokens as they arrive

---

## The 14-Second Timeout Workaround

Wix enforces a 14-second timeout on frontend→backend function calls. Claude API calls with tool use can easily exceed this. The solution:

Use http streams

## Key Technical Notes

- **Claude API key** — store in environment variables
- **Navigation from widget** — the widget is a native Wix component (not an iframe), so `wixLocation.to()` and `wixWindow` APIs work directly from widget frontend code
- **Cart operations** — use `wixStoresBackend` from backend functions, not frontend
- **Checkout** — use `wixLocation.to("/checkout")` from widget frontend after cart is confirmed
- **Permissions required** — declare in app dashboard: Wix Stores read/write, CMS read/write, Contacts read/write
- **Session state** — store conversation history in `wixData` or in-memory per session; keep last N messages to avoid Claude context ballooning

---

## V1 Build Order

1. **Project scaffold** — Wix CLI app created, dev site running ✅
2. **Chat widget UI** — floating button, expandable panel, message thread, input box ✅
3. **Backend scaffolding** — backend function that calls Claude and returns a basic text response ✅
4. **wixRealtime streaming** — wire up pub/sub so response streams token by token
5. **Knowledge base (FAQ)** — CMS collection for Q&A pairs, basic retrieval
6. **Product search** — `search_products` tool wired to Wix Stores API ✅
7. **Add to cart** — `add_to_cart` tool wired to `wixStoresBackend` ✅
8. **Checkout flow** — clarification handler + `proceed_to_checkout` tool ✅
9. **Site crawler** — index pages and products into vector store
10. **Owner dashboard** — settings page, knowledge editor, analytics
11. **Monetization gates** — enforce chat limits per tier
12. **App Market prep** — permissions, listing, review

---

## Project Structure (Wix CLI)

```
src/
  dashboard/
    pages/
      page.tsx              # Main dashboard page (bot settings)
      knowledge/page.tsx    # Knowledge base editor
      analytics/page.tsx    # Conversation analytics
  site/
    widgets/
      chat-widget/
        widget.tsx          # Chat UI component
        widget.module.css   # Widget styles
  backend/
    chat.web.ts             # Web method: initiate chat session
    claude.ts               # Claude API caller + tool executor
    knowledge.ts            # Knowledge base search
    stores.ts               # Wix Stores actions (cart, products)
    realtime.ts             # wixRealtime publish helpers
  wix.config.json           # App manifest
  package.json
```

---

## Out of Scope for V1

- Multi-language support
- Voice input
- Human handoff / live chat escalation
- A/B testing bot personas
- Custom branding (widget colors/fonts) — post-launch upsell
