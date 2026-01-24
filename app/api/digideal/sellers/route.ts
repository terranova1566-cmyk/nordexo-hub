import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const SELLER_GROUPS = [
  {
    display: "Nordexo Limited",
    variants: ["Nordexo Limited77795751", "Nordexo Limited"],
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
  return SELLER_GROUPS.find(
    (group) =>
      group.display.toLowerCase() === normalized ||
      group.variants.some((variant) => variant.toLowerCase() === normalized)
  );
};

const normalizeSellerName = (value?: string | null) => {
  if (!value) return value ?? null;
  const group = getSellerGroup(value);
  return group ? group.display : value.trim();
};

export async function GET(_request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let query = supabase
    .from("digideal_seller_counts")
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
