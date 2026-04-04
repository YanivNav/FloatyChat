import { catalogVersioning, products, productsV3, readOnlyVariantsV3 } from '@wix/stores';
import { auth } from '@wix/essentials';

export interface Page {
  name: string;
  url: string;
}

export interface FrontendAction {
  type: string;
  [key: string]: unknown;
}

interface SearchProductsInput {
  query?: string;
  max_price?: number;
  limit?: number;
  browse_all?: boolean;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: unknown): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 1);
}

function productSearchText(product: Record<string, unknown>): string {
  return normalizeText([
    product.name,
    product.slug,
    product.description,
    product.plainDescription,
    product.ribbon,
  ].join(' '));
}

function scoreProduct(product: Record<string, unknown>, query: string): number {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 1;

  const haystack = productSearchText(product);
  const productName = normalizeText(product.name);
  const queryTokens = tokenize(query);
  let score = 0;

  if (productName === normalizedQuery) score += 100;
  if (productName.startsWith(normalizedQuery)) score += 60;
  if (haystack.includes(normalizedQuery)) score += 40;

  for (const token of queryTokens) {
    if (productName.startsWith(token)) score += 15;
    if (productName.includes(token)) score += 10;
    if (haystack.includes(token)) score += 5;
  }

  return score;
}

function rankProducts<T extends Record<string, unknown>>(items: T[], query?: string): T[] {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return items;

  return [...items]
    .map((product) => ({ product, score: scoreProduct(product, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ product }) => product);
}

export function buildTools(pages: Page[]) {
  const pageDescriptions =
    pages.length > 0
      ? pages.map((p) => `"${p.url}" (${p.name})`).join(', ')
      : 'unknown - do not use navigate_to_page if no pages are available';

  return [
    {
      name: 'search_products',
      description:
        'Search or browse the store catalog. Use this when the visitor asks about products, wants recommendations, asks what the store sells, or needs help finding an item even if they do not know the exact product name. For broad catalog questions like "what do you sell?" set browse_all to true.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Optional search phrase, e.g. "blue shirt", "running shoes", or "gift ideas". Leave empty when browsing the catalog generally.',
          },
          browse_all: {
            type: 'boolean',
            description:
              'Set to true when the visitor wants to browse the catalog or asks general questions like "what products do you sell?"',
          },
          max_price: { type: 'number', description: 'Optional maximum price filter' },
          limit: { type: 'number', description: 'Max number of results to return, default 5' },
        },
        required: [],
      },
    },
    {
      name: 'add_to_cart',
      description:
        "Add a product to the visitor's cart. By default, add 1 to the quantity. If the user specifies a different quantity, use that instead. If the product has options/variants and the visitor hasn't specified them, use ask_clarification first. When the visitor provides variant choices such as size or color, include them in variant_options using the exact choice names and values the visitor used.",
      input_schema: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'The product ID from search results' },
          product_name: { type: 'string', description: 'The product name, for confirmation messaging' },
          quantity: { type: 'number', description: 'Quantity to add' },
          variant_options: {
            type: 'object',
            description:
              'Optional product variant selections, for example { "size": "M", "color": "White" }. Use only when the visitor specified variant choices.',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['product_id', 'product_name', 'quantity'],
      },
    },
    {
      name: 'proceed_to_checkout',
      description:
        'Navigate the visitor to the checkout page. Only call this after the visitor explicitly confirms they want to check out.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'navigate_to_page',
      description: `Navigate the visitor to a page on the site. Available pages: ${pageDescriptions}. Use the URL from this list for ordinary pages only. For product pages, first call search_products to find the exact product, then construct the page URL in the form of /product-page/{slug}.`,
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'The page URL to navigate to, e.g. "/shop" or "/about". Do not use this as "/product-page" for product navigation.',
          },
          name: { type: 'string', description: 'The human-readable page name for confirmation messaging' },
          product_slug: {
            type: 'string',
            description: 'Product slug used to navigate to product pages.',
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'ask_clarification',
      description:
        'Ask the visitor a follow-up question before proceeding, e.g. to clarify size, color, or quantity.',
      input_schema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The clarifying question to ask' },
        },
        required: ['question'],
      },
    },
  ];
}

export async function resolveVariantId(
  productId: string,
  variantOptions: Record<string, string>,
): Promise<string | undefined> {
  try {
    const { catalogVersion } = await auth.elevate(catalogVersioning.getCatalogVersion)();

    if (catalogVersion === 'V3_CATALOG') {
      const result = await auth.elevate(readOnlyVariantsV3.searchVariants)({
        filter: { 'productData.productId': productId },
        cursorPaging: { limit: 100 },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variant = (result.variants as any[])?.find((v: any) =>
        Object.entries(variantOptions).every(([optionName, choiceName]) =>
          v.optionChoices?.some(
            (c: any) =>
              c.optionChoiceNames?.optionName?.toLowerCase() === optionName.toLowerCase() &&
              c.optionChoiceNames?.choiceName?.toLowerCase() === choiceName.toLowerCase(),
          ),
        ),
      );
      return variant?._id ?? undefined;
    }

    const result = await auth.elevate(products.queryProductVariants)(productId, {
      choices: variantOptions,
    });
    return result.variants?.[0]?._id ?? undefined;
  } catch {
    return undefined;
  }
}

export async function executeSearchProducts({
  query,
  max_price,
  limit = 5,
  browse_all = false,
}: SearchProductsInput) {
  try {
    const { catalogVersion } = await auth.elevate(catalogVersioning.getCatalogVersion)();

    if (catalogVersion === 'STORES_NOT_INSTALLED') {
      return { found: false, message: 'No store is installed on this site.' };
    }

    const cap = Math.min(limit, 10);
    const normalizedQuery = normalizeText(query);
    const shouldBrowseAll = browse_all || normalizedQuery.length === 0;

    if (catalogVersion === 'V3_CATALOG') {
      const search: Parameters<typeof productsV3.searchProducts>[0] = {
        cursorPaging: { limit: cap },
      };
      if (!shouldBrowseAll) {
        search.search = { expression: normalizedQuery };
      }
      if (max_price != null) {
        search.filter = { 'actualPriceRange.minValue.amount': { $lte: String(max_price) } };
      }
      const result = await auth.elevate(productsV3.searchProducts)(search);
      if (!result.products?.length) return { found: false, message: 'No products found matching that query.' };

      const rankedProducts = shouldBrowseAll
        ? result.products.slice(0, cap)
        : rankProducts(result.products as Record<string, unknown>[], normalizedQuery).slice(0, cap);

      if (!rankedProducts.length) {
        return { found: false, message: 'No products found matching that query.' };
      }

      return { found: true, mode: shouldBrowseAll ? 'browse' : 'search', products: rankedProducts };
    }

    let productQuery = products.queryProducts().limit(Math.max(cap * 5, 25));
    if (max_price != null) productQuery = productQuery.le('priceData.price', max_price);
    const result = await productQuery.find();

    if (!result.items?.length) return { found: false, message: 'No products found matching that query.' };

    const rankedProducts = shouldBrowseAll
      ? result.items.slice(0, cap)
      : rankProducts(result.items as Record<string, unknown>[], normalizedQuery).slice(0, cap);

    if (!rankedProducts.length) {
      return { found: false, message: 'No products found matching that query.' };
    }

    return { found: true, mode: shouldBrowseAll ? 'browse' : 'search', products: rankedProducts };
  } catch (err) {
    console.error('Error executing product search:', err);
    return { found: false, message: `Search failed: ${(err as Error).message}` };
  }
}
