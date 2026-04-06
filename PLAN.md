# Wix AI Chat Assistant - Project Plan

## Overview

A Wix app published on the Wix App Market that adds an AI-powered chat assistant to any Wix website. Visitors can ask questions about the site, search for products, and perform actions like adding items to cart and proceeding to checkout - all through a conversational interface.

**Example interaction:**
> User: "Buy me 2 blue shirts, 3 jeans and a pair of socks"
> Bot: adds the shirts and jeans to cart, then asks "What color socks would you like?"
> User: "Black"
> Bot: adds socks, confirms cart, proceeds to checkout

---

## Tech Stack

| Decision | Choice | Reason |
|---|---|---|
| App framework | Wix CLI | Code-first, local dev in VS Code, hot reload, same Wix API access as Blocks |
| UI framework | React (CLI default) + Wix Design System | Comes with CLI scaffold |
| Bot intelligence | Claude API (claude-sonnet-4-20250514) | Tool-use support for structured actions |
| Claude integration | `@anthropic-ai/sdk` | Available on Wix npm |
| Streaming | HTTP readable stream (SSE) | Wix backend has 14s timeout; SSE bypasses it |
| Knowledge storage | Wix CMS collections (in app) | Public app CMS doesn't count against site quota |
| Rate limiting / caching | Upstash Redis | Serverless-friendly HTTP-based Redis |
| Vector search | External provider (Pinecone or Supabase pgvector) | Wix can't run embedding workloads natively |

---

## Architecture - 5 Layers

### 1. Visitor Layer (Widget)
What the end-user sees on the live site.
- Floating chat button + expandable panel (Wix widget extension)
- Message thread UI with streaming tokens via SSE
- Action feedback (cart update confirmations, navigation prompts)
- Product cards carousel

### 2. Bot Engine (Backend)
The brain - Astro API routes called from the widget.
- **Claude API caller** - sends messages + tool definitions, receives tool calls or text
- **Action executor** - runs the tool calls Claude requests against Wix APIs
- **Context manager** - maintains conversation history per session (last 20 messages)
- **Clarification handler** - asks follow-up questions before executing actions (e.g. checkout)

### 3. Knowledge Base
What the bot knows about the site.
- **Owner editor** - custom FAQs and answers added manually by site owner ✅
- **Wix Stores API** - live product/inventory data queried at runtime ✅
- **Site crawler** - indexes Wix pages and CMS content into vector embeddings
- **Vector store** - external DB storing embeddings for semantic search
- **Sync scheduler** - re-indexes content when site data changes

### 4. Owner Dashboard
Wix Dashboard page (installed automatically with the app).
- Bot settings: persona name, greeting message ✅
- Custom system prompt ✅
- Knowledge editor: add/edit/delete custom Q&A pairs ✅
- Tool customization: enable/disable tools, add custom instructions per tool
- Analytics: conversation count, top questions, action completion rate

### 5. Monetization (App Market Tiers)
| Tier | Limits | Features |
|---|---|---|
| Free | 50 chats/month | FAQ answering only |
| Starter | 500 chats/month | FAQ + product search |
| Pro | Unlimited | All features + actions + analytics |

---

## How Claude Tool-Use Works

Instead of returning plain text, Claude can call structured "tools" that the backend executes. This is what enables real actions, not just answers.

**Request/response flow:**
1. Visitor sends message
2. Widget calls `/api/chat` via SSE
3. Backend calls Claude API with message + tool definitions + conversation history
4. Claude returns either text OR one/more tool calls
5. Backend executes tool calls (Wix Stores API, wixData, wixLocation, etc.)
6. Results are sent back to Claude for a final natural language response
7. Each chunk streams back to the widget as SSE events
8. Widget renders tokens and dispatches frontend actions (cart, navigation, product cards)

---

## Current Tools

| Tool | Status | Description |
|---|---|---|
| `search_products` | ✅ | Search or browse the store catalog |
| `show_products` | ✅ | Display product cards to the visitor |
| `add_to_cart` | ✅ | Add a product/variant to the cart |
| `remove_from_cart` | ✅ | Remove a product from the cart |
| `proceed_to_checkout` | ✅ | Navigate to checkout |
| `navigate_to_page` | ✅ | Navigate to any page on the site |
| `ask_clarification` | ✅ | Ask the visitor a follow-up question |
| `search_knowledge_base` | ✅ | Search owner-managed FAQ entries |
| `clear_chat` | ✅ | Clear the conversation history |
| `get_orders` | ✅ | Look up the visitor's order history |

---

## Completed

- Project scaffold — Wix CLI app, dev site running ✅
- Chat widget UI — floating button, expandable panel, message thread, input box ✅
- Streaming backend — SSE response streams token by token ✅
- Knowledge base (FAQ) — CMS collection for Q&A pairs, keyword retrieval ✅
- Product search + browse — wired to Wix Stores API ✅
- Add to cart / remove from cart ✅
- Checkout flow — clarification handler + proceed to checkout ✅
- Orders tool — order history lookup via `@wix/ecom` ✅
- Owner dashboard — bot settings, system prompt, FAQ editor ✅
- Rate limiting — Upstash Redis sliding window, 10 req/min per IP ✅
- Settings cache — bot settings cached in Redis, invalidated on save ✅
- Context window cap — history trimmed to last 20 messages ✅
- Clear chat button ✅

---

## Up Next

### Phase 1 — Tool Customization
Allow site owners to control which tools the bot can use and how.
- Enable / disable individual tools from the dashboard
- Add a custom instruction/hint per tool (e.g. "only suggest products under $50")
- Enabled tools + instructions passed to Claude at request time

### Phase 2 — Site Crawling
Index site content for semantic search, enabling the bot to answer questions about any page, policy, or piece of content on the site.
- Site crawler — fetch and parse Wix pages, blog posts, CMS collections
- Embed content chunks into a vector store (Pinecone or Supabase pgvector)
- `search_content` backend tool — semantic search over indexed content
- Sync scheduler — re-index when site content changes
- Manual re-index trigger in the dashboard

### Phase 3 — Publishing
Everything needed to submit to the Wix App Market.
- Usage analytics - dashboard tab for conversation count, top questions, action completion rate
- Conversation analytics — log chats to CMS, view in dashboard analytics tab
- Monetization gates — enforce Free/Starter/Pro tier chat limits (Upstash Redis counter)
- App Market prep — permissions declaration, listing copy, review

---

## Additional Tools (Post-Launch)

- **Contextual greeting** - tailor the opening message based on the current page
- **Member context** - pass logged-in member name/info to Claude for personalization
- **Fill out forms** - pre-fill contact or enquiry forms on behalf of the visitor
- **Booking support** - create/cancel bookings, check availability (`@wix/bookings`)
- **Event registration** - buy tickets, check event dates (`@wix/events`)
- **Restaurant reservations** - reserve tables, show opening hours, answer menu questions
- **Pricing plans** - answer questions about plans, check subscription status

---

## Out of Scope (for now)

- Multi-language support
- Voice input
- Human handoff / live chat escalation
- A/B testing bot personas
- Custom widget branding (colors/fonts) — post-launch upsell
