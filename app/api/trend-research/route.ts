import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const allowedProviders = ["cdon", "fyndiq"];

type CategoryLevel = "l1" | "l2";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const providerParam = searchParams.get("provider") ?? "all";
  const providers =
    providerParam === "all"
      ? allowedProviders
      : providerParam
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .filter((value) => allowedProviders.includes(value));

  const categoryLevel = (searchParams.get("categoryLevel") as CategoryLevel | null) ?? null;
  const categoryValue = searchParams.get("categoryValue");
  const range = searchParams.get("range") === "1d" ? "1d" : "7d";
  const bestMode = searchParams.get("best") ?? "7d";

  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const metricColumn = range === "1d" ? "sold_today" : "sold_7d";
  const groupingField =
    categoryLevel === "l2"
      ? "taxonomy_l3"
      : categoryLevel === "l1"
        ? "taxonomy_l2"
        : "taxonomy_l1";

  let chartQuery = supabase
    .from("discovery_products")
    .select(`taxonomy_l1, taxonomy_l2, taxonomy_l3, ${metricColumn}`)
    .in("provider", providers);

  if (categoryLevel === "l1" && categoryValue) {
    chartQuery = chartQuery.eq("taxonomy_l1", categoryValue);
  } else if (categoryLevel === "l2" && categoryValue) {
    chartQuery = chartQuery.eq("taxonomy_l2", categoryValue);
  }

  const { data: chartRows, error: chartError } = await chartQuery.limit(5000);
  if (chartError) {
    return NextResponse.json(
      { error: "Unable to load chart data." },
      { status: 500 }
    );
  }

  const chartTotals = new Map<string, number>();
  (chartRows ?? []).forEach((row) => {
    const label =
      (row as Record<string, string | null>)[groupingField] ?? "__uncategorized__";
    const value =
      typeof (row as Record<string, number | null>)[metricColumn] === "number"
        ? ((row as Record<string, number | null>)[metricColumn] as number)
        : 0;
    chartTotals.set(label, (chartTotals.get(label) ?? 0) + value);
  });

  const chartGroups = Array.from(chartTotals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  const bestColumn =
    bestMode === "all"
      ? "sold_all_time"
      : bestMode === "trending"
        ? "trending_score"
        : "sold_7d";

  let topQuery = supabase
    .from("discovery_products")
    .select(
      "provider, product_id, title, product_url, image_url, sold_today, sold_7d, sold_all_time, trending_score, price"
    )
    .in("provider", providers)
    .order(bestColumn, { ascending: false })
    .limit(10);

  if (categoryLevel === "l1" && categoryValue) {
    topQuery = topQuery.eq("taxonomy_l1", categoryValue);
  } else if (categoryLevel === "l2" && categoryValue) {
    topQuery = topQuery.eq("taxonomy_l2", categoryValue);
  }

  const { data: topItems, error: topError } = await topQuery;
  if (topError) {
    return NextResponse.json(
      { error: "Unable to load best sellers." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    chart: {
      groups: chartGroups,
      metric: metricColumn,
      groupLevel: groupingField,
    },
    topItems: topItems ?? [],
  });
}
