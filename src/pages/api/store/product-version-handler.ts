import { auth } from '@wix/essentials';
import { catalogVersioning, products, productsV3 } from '@wix/stores';
import type { ProductCard } from '../../../shared/types';
import type { AddToCartInput, SearchProductsInput } from '../tools';

export type ProductSearchResult =
  { found: false, message: string } |
  { found: true, mode: 'search' | 'browse', products: (products.Product[] | productsV3.V3Product[]), hasNext?: boolean, pageSize?: number };


export abstract class ProductVersionHandler<P> {
  abstract searchProducts(params: SearchProductsInput): Promise<ProductSearchResult>;

  abstract toProductCard(product: P): ProductCard;

  abstract resolveVariantId(productId: string, variantOptions: Record<string, string>): Promise<string | undefined>;

  async resolveCartProduct(input: AddToCartInput): Promise<ProductSearchResult> {
    if (input.product_id) {
      return { found: true, mode: 'browse', products: [{ _id: input.product_id, name: input.product_name }] };
    }
    if (input.product_name) {
      const result = await this.searchProducts({ query: input.product_name, limit: 5, browse_all: false });
      if (result.found && Array.isArray(result.products) && result.products.length > 0) {
        return result.products[0] as ProductSearchResult;
      }
    }
    return { found: false, message: 'Product not found' };
  }
}

export class StoreNotInstalledHandler extends ProductVersionHandler<any> {
  
  async searchProducts(): Promise<ProductSearchResult> {
    return { found: false, message: 'There is no store in this site' };
  }

  toProductCard(product: any): ProductCard {
    throw new Error('Cannot create product card as the store is not installed.');
  }

  async resolveVariantId(productId: string, variantOptions: Record<string, string>): Promise<string | undefined> {
    return undefined;
  }
}

export const notInstalled = new StoreNotInstalledHandler();

export let productVersionHandler: ProductVersionHandler<any>;

export async function initProductVersionHandler(): Promise<ProductVersionHandler<any>> {
  if (productVersionHandler) {
    return productVersionHandler;
  }
  productVersionHandler = await determineProductVersionHandler();
  return productVersionHandler;
}

async function determineProductVersionHandler(): Promise<ProductVersionHandler<any>> {
  const { catalogVersion } = await auth.elevate(catalogVersioning.getCatalogVersion)();
  if (catalogVersion === 'STORES_NOT_INSTALLED') {
    return notInstalled;
  } else if (catalogVersion === 'V3_CATALOG') {
    const { productsV3Handler } = await import('./productsV3');
    return productsV3Handler;
  } else {
    const { productsV1Handler } = await import('./productsV1');
    return productsV1Handler;
  }
}