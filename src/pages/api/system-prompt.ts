import { auth } from "@wix/essentials";
import type { VisitorContext } from "../../shared/types";
import { siteProperties } from "@wix/business-tools";

const FALLBACK_SYSTEM_PROMPT =
  `You are a helpful AI assistant for this website.
  Only answer questions related to this website and its business.
  If asked about unrelated topics, or topics you didn't find in the knowledge base, politely decline and offer to help with something relevant to this site instead.`;

export async function buildSystemPrompt(context?: VisitorContext): Promise<string> {
  try {
    const [siteInfo, tokenInfo] = await Promise.all([
      auth.elevate(siteProperties.getSiteProperties)({
        fields: ['businessName', 'siteDisplayName', 'description', 'categories'],
      }),
      auth.getTokenInfo(),
    ]);
    const pageDescriptions = context?.structure ? 
      context.structure.pages.map((p) => `"${p.url || (p.prefix + '...')}" (${p.name})`).join(', \n') 
      : '';

    const props = siteInfo.properties;
    const name = props?.businessName || props?.siteDisplayName || 'this website';
    const description = props?.description;
    const category = props?.categories?.primary;

    let prompt = `You are an AI assistant for ${name}.`;
    if (description) prompt += ` ${description}`;
    else if (category) prompt += ` This is a ${category} business.`;

    prompt += `\n\nYour role is to help visitors with questions about ${name} - its products, services, content, and any information related to this site. 
      Only answer questions relevant to this website and its business. 
      If a visitor asks about something unrelated, politely decline and redirect them to how you can help with ${name}.`;
    
    if (pageDescriptions) {
      prompt += `\n\nThe site has the following pages: \n${pageDescriptions}.\n Use this information to help visitors navigate the site.`;
    }

    if (context?.page) {
      prompt += `\n\nThe visitor is currently on: ${context.page.title} (${context.page.url}).`;
      if (context.page.description) {
        prompt += ` Page description: ${context.page.description}`;
      }
    }

    if (context?.cart && context.cart.length > 0) {
      const cartSummary = context.cart
        .map((i) => `${i.quantity}x ${i.name}${i.variants ? ` (${i.variants})` : ''} — ${i.price}`)
        .join(', ');
      prompt += `\n\nTheir current cart contains: ${cartSummary}.`;
    } else if (context?.cart) {
      prompt += `\n\nTheir cart is currently empty.`;
    }

    if (tokenInfo.subjectType === 'MEMBER') {
      prompt += `\n\nThe visitor is logged in as a member. Tools that require login (order history, order cancellation) are available.`;
    } else {
      prompt += `\n\nThe visitor is not logged in. Do not offer tools that require login (order history, order cancellation) unless they provide an order number.`;
    }

    console.debug('Built system prompt:', prompt);

    return prompt;
  } catch (err) {
    console.error('Error building system prompt:', err);
    return FALLBACK_SYSTEM_PROMPT;
  }
}