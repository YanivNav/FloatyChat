import { productsV3, readOnlyVariantsV3 } from "@wix/stores";
import { ProductVersionHandler, type ProductSearchResult } from "./product-version-handler";
import { auth } from "@wix/essentials";
import type { ProductInfo, StoreCategory } from "../../../../shared/types";
import type { SearchProductsInput } from "./store-tools";
import { categories } from "@wix/categories";

export class ProductsV3Handler extends ProductVersionHandler<productsV3.V3Product> {
  async searchProducts(params: SearchProductsInput): Promise<ProductSearchResult> {
    const shouldBrowseAll = params.browse_all || !params.query?.trim();

    const search: productsV3.V3ProductSearch = {
      cursorPaging: { limit: params.limit }
    };
    if (!shouldBrowseAll) {
      search.search = { expression: params.query };
    }
    if (params.max_price != null) {
      search.filter = { 'actualPriceRange.minValue.amount': { $lte: String(params.max_price) } };
    }
    const result = await auth.elevate(productsV3.searchProducts)(search, {fields: ['URL', 'CURRENCY', 'PLAIN_DESCRIPTION', 'ALL_CATEGORIES_INFO', 'THUMBNAIL']});
    if (!result.products?.length) return { found: false, message: 'No products found matching that query.' };

    return { found: true, mode: shouldBrowseAll ? 'browse' : 'search', products: result.products };
  }

  toProductInfo(product: productsV3.V3Product): ProductInfo {
    return {
      id: product._id!,
      name: product.name!,
      price: product.actualPriceRange?.minValue?.formattedAmount ? product.actualPriceRange.minValue.formattedAmount : 'Price not available',
      imageUrl: product.media?.main?.thumbnail?.url,
      slug: product.slug!,
      url: product.url ?? `/product-page/${product.slug}`,
      description: product.plainDescription ?? '',
      variants: product.options ? Object.fromEntries(product.options.map(v => [v.name, v.choicesSettings?.choices?.map(c => c.name) ?? []])) : undefined
    };
  }

  async resolveVariantId(productId: string, variantOptions: Record<string, string>): Promise<string | undefined> {
    const result = await auth.elevate(readOnlyVariantsV3.queryVariants)({
      filter: { 'productData.productId': productId },
      cursorPaging: { limit: 100 },
    });
    const variant = result.variants?.find((v) =>
      Object.entries(variantOptions).every(([optionName, choiceName]) =>
        v.optionChoices?.some(
          (c) =>
            c.optionChoiceNames?.optionName?.toLowerCase() === optionName.toLowerCase() &&
            c.optionChoiceNames?.choiceName?.toLowerCase() === choiceName.toLowerCase(),
        ),
      ),
    );
    return variant?._id ?? undefined;
  }

  async getCategories(): Promise<StoreCategory[]> {
    const results = await auth.elevate(categories.queryCategories)({}, {treeReference: {appNamespace: '@wix/stores'}});
    return (results.categories ?? []).map((cat): StoreCategory => ({
      id: cat._id!,
      name: cat.name!,
      slug: cat.slug!,
    }));
  }

}

export const productsV3Handler = new ProductsV3Handler();
