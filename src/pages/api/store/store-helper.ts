import type { products, productsV3 } from "@wix/stores";
import { normalizeText } from "../utils";


export type AnyProduct = products.Product | productsV3.V3Product;

function tokenize(value: unknown): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 1);
}

function productSearchText(product: AnyProduct): string {
  return normalizeText([
    product.name,
    product.slug,
    product.description,
    product.ribbon
  ].join(' '));
}

function scoreProduct(product: AnyProduct, query: string): number {
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

export function rankProducts<T extends AnyProduct>(items: T[], query?: string): T[] {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return items;

  return [...items]
    .map((product) => ({ product, score: scoreProduct(product, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ product }) => product);
}
