import { auth } from "@wix/essentials";
import type { VisitorContext } from "../../shared/types";
import { siteProperties } from "@wix/business-tools";
import { productVersionHandler } from "./tools/store/product-version-handler";

type SiteProperties = Awaited<ReturnType<typeof siteProperties.getSiteProperties>>['properties'];

const FALLBACK_SYSTEM_PROMPT =
  `You are a helpful AI assistant for this website.
  Only answer questions related to this website and its business.
  If asked about unrelated topics, or topics you didn't find in the knowledge base, politely decline and offer to help with something relevant to this site instead.`;

export async function buildSystemPrompt(context?: VisitorContext): Promise<string> {
  try {
    const [siteInfo, tokenInfo] = await Promise.all([
      auth.elevate(siteProperties.getSiteProperties)(),
      auth.getTokenInfo(),
    ]);

    const props = siteInfo.properties;
    const sections = [
      buildIdentitySection(props),
      buildContactSection(props),
      buildHoursSection(props),
      buildPagesSection(context),
      buildCurrentPageSection(context),
      buildCartSection(context),
      buildMemberSection(tokenInfo.subjectType),
    ];
    if (productVersionHandler.isStoreInstalled()) {
      sections.push(`The site has a store with the following product categories: ${Object.keys(await productVersionHandler.getCategories()).join(', ')}. 
      If the user asks about a product, what's for sale, recommendations, pricing information, etc, use the available tools to find the information.`);
    }

    return sections.filter(Boolean).join('\n\n');
  } catch (err) {
    console.error('Error building system prompt:', err);
    return FALLBACK_SYSTEM_PROMPT;
  }
}

function buildIdentitySection(props: SiteProperties | undefined): string {
  const name = props?.businessName || props?.siteDisplayName || 'this website';
  const description = props?.description;
  const category = props?.categories?.primary;

  let section = `You are an AI assistant for ${name}.`;
  if (description) section += ` ${description}`;
  else if (category) section += ` This is a ${category} business.`;

  section += `\n\nYour role is to help visitors with questions about ${name} 
  - its products, services, content, and any information related to this site. 
  Only answer questions relevant to this website and its business. 
  If a visitor asks about something unrelated, politely decline and redirect them to how you can help with ${name}.`;

  return section;
}

function buildContactSection(props: SiteProperties | undefined): string {
  const lines: string[] = [];

  if (props?.phone) lines.push(`Phone: ${props.phone}`);
  if (props?.email) lines.push(`Email: ${props.email}`);
  if (props?.address?.googleFormattedAddress) {
    lines.push(`Address: ${props.address.googleFormattedAddress}`);
  } else if (props?.address) {
    const a = props.address;
    const parts = [a.streetNumber, a.street, a.city, a.state, a.zip, a.country].filter(Boolean);
    if (parts.length) lines.push(`Address: ${parts.join(', ')}`);
  }
  if (props?.paymentCurrency) lines.push(`Currency: ${props.paymentCurrency}`);

  if (!lines.length) return '';
  return `Business contact information:\n${lines.join('\n')}`;
}

function buildHoursSection(props: SiteProperties | undefined): string {
  const periods = props?.businessSchedule?.periods;
  if (!periods?.length) return '';

  const tz = props?.timeZone ? ` (${props.timeZone})` : '';
  const lines = periods.map((p: { openDay?: string; closeDay?: string; openTime?: string; closeTime?: string }) => {
    if (p.openDay === p.closeDay) return `${p.openDay}: ${p.openTime}–${p.closeTime}`;
    return `${p.openDay} ${p.openTime} to ${p.closeDay} ${p.closeTime}`;
  });

  return `Business hours${tz}:\n${lines.join('\n')}`;
}

function buildPagesSection(context: VisitorContext | undefined): string {
  if (!context?.structure?.pages?.length) return '';

  const pages = context.structure.pages
    .map((p) => `"${p.url || (p.prefix + '...')}" (${p.name})`)
    .join(',\n');

  return `The site has the following pages:\n${pages}.\nUse this information to help visitors navigate the site.`;
}

function buildCurrentPageSection(context: VisitorContext | undefined): string {
  if (!context?.page) return '';

  let section = `The visitor is currently on: ${context.page.title} (${context.page.url}).`;
  if (context.page.description) section += ` Page description: ${context.page.description}`;
  return section;
}

function buildCartSection(context: VisitorContext | undefined): string {
  if (!context?.cart) return '';
  if (!context.cart.length) return `The visitor's cart is currently empty.`;

  const summary = context.cart
    .map((i) => `${i.quantity}x ${i.name}${i.variants ? ` (with options: ${i.variants})` : ''} - ${i.price}`)
    .join(', ');
  return `The visitor's current cart contains: ${summary}.`;
}

function buildMemberSection(subjectType: string | undefined): string {
  if (subjectType === 'MEMBER') {
    return `The visitor is logged in as a member. Tools that require login (order history, order cancellation) are available.`;
  }
  return `The visitor is not logged in. Do not offer tools that require login (order history, order cancellation) unless they provide an order number.`;
}
