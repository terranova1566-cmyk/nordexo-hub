import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getDealsProviderConfig,
  resolveDealsProvider,
} from "@/lib/deals/provider";

const SELLER_GROUPS = [
  {
    display: "GadgetBay",
    variants: ["GadgetBay Limited", "Gadget Bay Limited", "GadgetBay", "Gadget Bay"],
  },
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

const getAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) return null;

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

  const readClient =
    provider === "letsdeal" ? getAdminClient() ?? supabase : supabase;

  let query = readClient
    .from(providerConfig.sellerCountsView)
    .select("seller_name, product_count");

  query = query.not("seller_name", "ilike", "%digideal%");
  query = query.not("seller_name", "ilike", "%ace lloyds%");
  query = query
    .order("product_count", { ascending: false })
    .order("seller_name", { ascending: true });

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const grouped = new Map<string, number>();
  data?.forEach((row) => {
    const display = normalizeSellerName(row.seller_name);
    if (!display) return;
    grouped.set(display, (grouped.get(display) ?? 0) + (row.product_count ?? 0));
  });

  const sellers = Array.from(grouped.entries())
    .map(([seller_name, product_count]) => ({ seller_name, product_count }))
    .sort(
      (a, b) =>
        b.product_count - a.product_count ||
        a.seller_name.localeCompare(b.seller_name)
    );

  return NextResponse.json({
    sellers,
  });
}
