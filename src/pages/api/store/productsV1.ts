import { products } from "@wix/stores";
import { ProductVersionHandler, type ProductSearchResult } from "./product-version-handler";
import { normalizeText } from "../utils";
import { rankProducts } from "./store-helper";
import type { ProductCard } from "../../../shared/types";
import type { SearchProductsInput } from "../tools";
import { auth } from "@wix/essentials";

export class ProductsV1Handler extends ProductVersionHandler<products.Product> {

  async searchProducts(params: SearchProductsInput): Promise<ProductSearchResult> {
    const cap = Math.min(params.limit, 10);
    const normalizedQuery = normalizeText(params.query);
    const shouldBrowseAll = params.browse_all || normalizedQuery.length === 0;
    let productQuery = products.queryProducts().limit(Math.max(cap * 5, 25));
    if (params.max_price != null) productQuery = productQuery.le('priceData.price', params.max_price);
    const result = await productQuery.find();

    if (!result.items?.length) return { found: false, message: 'No products found matching that query.' };

    const rankedProducts = shouldBrowseAll
      ? result.items.slice(0, cap)
      : rankProducts(result.items as Record<string, unknown>[], normalizedQuery).slice(0, cap) as products.Product[];

    if (!rankedProducts.length) {
      return { found: false, message: 'No products found matching that query.' };
    }

    return { found: true, mode: shouldBrowseAll ? 'browse' : 'search', products: rankedProducts };
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