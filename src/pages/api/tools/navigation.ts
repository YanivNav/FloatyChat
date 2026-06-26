import { z } from 'zod';
import { site } from '@wix/site-site';
import { auth } from '@wix/essentials';
import { defineTool } from './tools';

const navigateToPageTool = defineTool({
  name: 'navigate_to_page',
  displayName: 'Navigate to Page',
  shortDescription: 'Sends the visitor to a page on your site when they ask to go somewhere.',
  category: 'navigation',
  instructionHint: 'e.g. "Always navigate to /contact instead of /about"',
  description: `Navigate the visitor to a page on the site. Call get_site_pages first if you need to discover available pages and their URLs.
    For product pages, first call search_products to find the product, then use the slug from the results to construct the URL in the form of /product-page/{slug}.
    For product category pages, construct the URL in the form of /category/{category-slug}. All Products is a category page with the slug "all-products".
    DO NOT navigate to the "/checkout" page directly. Instead, use the "proceed_to_checkout" action if it exists.`,
  inputSchema: z.object({
    url: z.string().describe('The page URL to navigate to, e.g. "/shop" or "/about"'),
    name: z.string().optional().describe('The human-readable page name for confirmation messaging'),
  }),
  execute: async (input, ctx) => {
    ctx.frontendActions.push({ type: 'navigate_to_page', ...input });
    return { success: true, resolvedUrl: input.url };
  },
});

const getSitePagesTool = defineTool({
  name: 'get_site_pages',
  displayName: 'Get Site Pages',
  shortDescription: 'Returns the list of all pages on the site, including dynamic collection-based pages.',
  category: 'navigation',
  description: `Get the list of all pages on the site. Call this when the visitor asks what pages are available, wants to navigate somewhere, or when you need to find a specific page URL.
Returns two types of pages:
- Static pages with exact URLs (e.g. /about, /contact)
- Dynamic pages backed by CMS collections (e.g. blog posts, portfolio items). These only include the URL prefix — use search_dynamic_page with the prefix to find specific items.`,
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const structure = await auth.elevate(site.getSiteStructure)();
      const pages = (structure.pages ?? []).map((p) => {
        if (p.url) {
          return { name: p.name, url: p.url, type: 'static' };
        }
        return { name: p.name, prefix: p.prefix, type: 'dynamic' };
      });
      return { pages };
    } catch {
      return { error: 'Could not retrieve site pages.' };
    }
  },
});

const searchDynamicPageTool = defineTool({
  name: 'search_dynamic_page',
  displayName: 'Search Dynamic Page',
  shortDescription: 'Searches items within a dynamic (collection-backed) page by query.',
  category: 'navigation',
  description: `Search for items within a dynamic page (e.g. blog posts, team members, portfolio items). Use the prefix returned by get_site_pages. Returns matching items with their full URLs.`,
  inputSchema: z.object({
    prefix: z.string().describe('The URL prefix of the dynamic page, e.g. "/blog/"'),
    query: z.string().describe('Search term to match against item titles'),
  }),
  execute: async (input) => {
    try {
      const entries = await auth.elevate(site.routerSitemap)(input.prefix);
      const q = input.query.toLowerCase();
      const base = input.prefix.replace(/\/$/, '');
      const filtered = entries
        .filter((e) => e.title?.toLowerCase().includes(q) || e.url?.toLowerCase().includes(q))
        .slice(0, 8)
        .map((e) => ({ title: e.title ?? e.url, url: `${base}/${e.url}` }));

      if (!filtered.length) return { matches: [], message: 'No matching items found.' };
      return { matches: filtered };
    } catch {
      return { error: 'Could not retrieve dynamic page items.' };
    }
  },
});

export default [navigateToPageTool, getSitePagesTool, searchDynamicPageTool];
