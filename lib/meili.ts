import { MeiliSearch } from "meilisearch";

const MEILI_HOST = process.env.MEILI_HOST;
const MEILI_API_KEY = process.env.MEILI_API_KEY;
const MEILI_INDEX_PRODUCTS =
  process.env.MEILI_INDEX_PRODUCTS ?? "catalog_products";

if (!MEILI_HOST) {
  throw new Error("MEILI_HOST is not set.");
}

export const meiliClient = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

export const PRODUCTS_INDEX = MEILI_INDEX_PRODUCTS;

export const getProductsIndex = () => meiliClient.index(PRODUCTS_INDEX);
