export type DealsProvider = "digideal" | "letsdeal";

export const DEFAULT_DEALS_PROVIDER: DealsProvider = "digideal";

export const resolveDealsProvider = (value: unknown): DealsProvider => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "letsdeal") return "letsdeal";
  return DEFAULT_DEALS_PROVIDER;
};

export type DealsProviderConfig = {
  provider: DealsProvider;
  productsTable: string;
  productsSearchView: string;
  productDailyTable: string;
  dailyCountColumn: "purchased_count" | "bought_count";
  viewsTable: string;
  viewItemsTable: string;
  sellerCountsView: string;
  contentAnalysisTable: string | null;
  fakeSalesOffset: number;
};

export const getDealsProviderConfig = (
  provider: DealsProvider
): DealsProviderConfig => {
  if (provider === "letsdeal") {
    return {
      provider,
      productsTable: "letsdeal_products",
      productsSearchView: "letsdeal_products_search",
      productDailyTable: "letsdeal_product_daily",
      dailyCountColumn: "bought_count",
      viewsTable: "letsdeal_views",
      viewItemsTable: "letsdeal_view_items",
      sellerCountsView: "letsdeal_seller_counts",
      contentAnalysisTable: null,
      fakeSalesOffset: 0,
    };
  }

  return {
    provider,
    productsTable: "digideal_products",
    productsSearchView: "digideal_products_search",
    productDailyTable: "digideal_product_daily",
    dailyCountColumn: "purchased_count",
    viewsTable: "digideal_views",
    viewItemsTable: "digideal_view_items",
    sellerCountsView: "digideal_seller_counts",
    contentAnalysisTable: "digideal_content_analysis",
    fakeSalesOffset: 30,
  };
};
