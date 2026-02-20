import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getDealsProviderConfig,
  resolveDealsProvider,
} from "@/lib/deals/provider";

const SELLER_GROUPS = [
  {
    display: "Nordexo",
    variants: [
      "Nordexo",
      "Nordexo Limited",
      "Nordexo Limited77795751",
      "Blank Space Limited",
    ],
  },
  {
    display: "Newtech Trading",
    variants: [
      "Newtech Trading Electronics Limited",
      "Newtech Trading Electronics Limited61275193",
    ],
  },
  {
    display: "TurboDeals",
    variants: [
      "Turbo Inc Limited2608850",
      "TurboDealz",
      "Turbo Dealz",
      "Turbo dealz",
      "TurboDeals",
      "Turbo Deals",
      "Turbodealz",
    ],
  },
  {
    display: "Nord Trading Limited",
    variants: ["Nord Trading Limited", "NordTradingLimited OU"],
  },
];

const getSellerGroup = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return SELLER_GROUPS.find((group) => {
    if (group.display.toLowerCase() === normalized) return true;
    return group.variants.some((variant) => {
      const variantValue = variant.toLowerCase();
      if (variantValue === normalized) return true;
      if (normalized.startsWith(variantValue)) {
        const suffix = normalized.slice(variantValue.length);
        return suffix.length > 0 && /^[\\s\\d-]+$/.test(suffix);
      }
      return false;
    });
  });
};

const normalizeSellerName = (value?: string | null) => {
  if (!value) return value ?? null;
  const group = getSellerGroup(value);
  return group ? group.display : value.trim();
};

export async function GET(request: NextRequest) {
  const provider = resolveDealsProvider(request.nextUrl.searchParams.get("provider"));
  const providerConfig = getDealsProviderConfig(provider);
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const productId = searchParams.get("productId")?.trim();

  if (!productId) {
    return NextResponse.json({ error: "Missing productId" }, { status: 400 });
  }

  const productSelect =
    provider === "letsdeal"
      ? [
          "product_id",
          "title",
          "subtitle",
          "product_slug",
          "seller_name",
          "status",
          "listing_image_url",
          "product_image_url",
          "deal_url",
        ].join(",")
      : [
          "product_id",
          "listing_title",
          "title_h1",
          "product_slug",
          "prodno",
          "seller_name",
          "status",
          "primary_image_url",
          "image_urls",
          "description_html",
        ].join(",");

  const { data: rawProduct, error: productError } = await supabase
    .from(providerConfig.productsTable)
    .select(productSelect)
    .eq("product_id", productId)
    .maybeSingle();

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  let analysis: Record<string, unknown> | null = null;
  if (providerConfig.contentAnalysisTable) {
    const { data, error: analysisError } = await supabase
      .from(providerConfig.contentAnalysisTable)
      .select(
        [
          "product_id",
          "status",
          "text_analysis",
          "main_image_analysis",
          "contact_sheet_analysis",
          "images",
          "main_image_local_url",
          "main_image_url",
          "contact_sheet_local_url",
          "last_run_at",
          "attempts",
          "last_error",
        ].join(",")
      )
      .eq("product_id", productId)
      .maybeSingle();

    if (analysisError) {
      return NextResponse.json({ error: analysisError.message }, { status: 500 });
    }
    analysis = (data as Record<string, unknown> | null) ?? null;
  }

  const mappedProduct =
    provider === "letsdeal" && rawProduct && typeof rawProduct === "object"
      ? {
          ...(rawProduct as Record<string, unknown>),
          listing_title: (rawProduct as any).title ?? null,
          title_h1: (rawProduct as any).title ?? null,
          prodno: null,
          primary_image_url:
            (rawProduct as any).listing_image_url ??
            (rawProduct as any).product_image_url ??
            null,
          image_urls: [
            (rawProduct as any).listing_image_url ?? null,
            (rawProduct as any).product_image_url ?? null,
          ].filter(Boolean),
          description_html: null,
          product_url: (rawProduct as any).deal_url ?? null,
        }
      : rawProduct;

  const normalizedProduct =
    mappedProduct && typeof mappedProduct === "object"
      ? {
          ...(mappedProduct as Record<string, unknown>),
          seller_name: normalizeSellerName(
            (mappedProduct as { seller_name?: string | null }).seller_name
          ),
        }
      : null;

  return NextResponse.json({
    product: normalizedProduct,
    analysis,
  });
}
