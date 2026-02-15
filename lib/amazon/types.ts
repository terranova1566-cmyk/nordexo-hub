export type AmazonMoney = {
  amount: number | null;
  currency: string | null;
};

export type AmazonProvider = "oxylabs" | "direct";

export type AmazonProductCard = {
  asin: string | null;
  domain: string;
  productUrl: string;
  title: string | null;
  imageUrl: string | null;
  price: AmazonMoney;
  sourceUrl: string | null;
  sourceType: "listing" | "recommended" | "related" | "unknown";
  sourceAsin: string | null;
  provider: AmazonProvider;
  raw?: unknown;
};

export type AmazonVariant = {
  asin: string;
  url: string | null;
  selected: boolean;
  dimensions: Record<string, string> | null;
  tooltipImage: string | null;
  title: string | null;
  price: AmazonMoney;
  images: string[];
  raw?: unknown;
};

export type AmazonFullScrape = {
  asin: string;
  domain: string;
  productUrl: string;
  title: string | null;
  brand: string | null;
  price: AmazonMoney;
  description: string | null;
  bulletPoints: string[];
  images: string[];
  variants: AmazonVariant[];
  relatedProductAsins: string[];
  relatedProductCards: AmazonProductCard[];
  provider: AmazonProvider;
  raw?: unknown;
};
