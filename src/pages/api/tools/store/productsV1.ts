import { products } from "@wix/stores";
import { ProductVersionHandler, type ProductSearchResult } from "./product-version-handler";
import type { ProductCard } from "../../../../shared/types";
import { auth } from "@wix/essentials";
import type { SearchProductsInput } from "./store-tools";

export class ProductsV1Handler extends ProductVersionHandler<products.Product> {

  async searchProducts(params: SearchProductsInput): Promise<ProductSearchResult> {
    const shouldBrowseAll = params.browse_all || !params.query?.trim();

    if (shouldBrowseAll) {
      let q = products.queryProducts().limit(params.limit).skip((params.page ?? 0) * params.limit);
      if (params.max_price != null) q = q.le('priceData.price', params.max_price);
      const result = await q.find();
      if (!result.items?.length) return { found: false, message: 'No products found.' };
      return { found: true, mode: 'browse', products: result.items, hasNext: result.hasNext() };
    }

    // Try server-side prefix filter first
    let prefixQ = products.queryProducts().startsWith('name', params.query!).limit(50);
    if (params.max_price != null) prefixQ = prefixQ.le('priceData.price', params.max_price);
    let items = (await prefixQ.find()).items ?? [];

    // Fall back to broader fetch if prefix filter found nothing
    if (!items.length) {
      let broadQ = products.queryProducts().limit(100);
      if (params.max_price != null) broadQ = broadQ.le('priceData.price', params.max_price);
      items = (await broadQ.find()).items ?? [];
    }

    if (!items.length) return { found: false, message: 'No products found matching that query.' };

    return { found: true, mode: 'search', products: items.slice(0, params.limit) };
  }

  toProductCard(product: products.Product): ProductCard {
    return {
      id: product._id!,
      name: product.name!,
      price: product.priceData?.formatted?.discountedPrice ? product.priceData.formatted.discountedPrice : 'Price not available',
      imageUrl: product.media?.mainMedia?.image?.url,
      slug: product.slug!,
      url: product.productPageUrl!.path!
    };
  }

  async resolveVariantId(productId: string, variantOptions: Record<string, string>): Promise<string | undefined> {
    const result = await auth.elevate(products.queryProductVariants)(productId, {
      choices: variantOptions,
    });
    return result.variants?.[0]?._id ?? undefined;
  }

}

export const productsV1Handler = new ProductsV1Handler();
