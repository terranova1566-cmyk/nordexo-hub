import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type ProviderKey = "cdon" | "fyndiq";

type ProviderConfig = {
  key: ProviderKey;
  productsTable: string;
};

const PROVIDERS: ProviderConfig[] = [
  { key: "cdon", productsTable: "cdon_products" },
  { key: "fyndiq", productsTable: "fyndiq_products" },
];

type CategoryLevel = {
  name: string;
  children: CategoryLevel[];
};

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providerParam = (request.nextUrl.searchParams.get("provider") ?? "all")
    .toLowerCase()
    .trim();
  const providerTokens = providerParam
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const providerKeys = providerTokens.some((token) => token === "all")
    ? PROVIDERS.map((provider) => provider.key)
    : providerTokens;
  const providers =
    providerKeys.length === 0
      ? PROVIDERS
      : PROVIDERS.filter((provider) => providerKeys.includes(provider.key));

  const tree = new Map<string, Map<string, Set<string>>>();

  try {
    for (const provider of providers) {
      const { data, error } = await supabase
        .from(provider.productsTable)
        .select("taxonomy_l1, taxonomy_l2, taxonomy_l3");

      if (error) {
        throw new Error(error.message);
      }

      data?.forEach((row) => {
        const l1 = row.taxonomy_l1?.trim();
        const l2 = row.taxonomy_l2?.trim();
        const l3 = row.taxonomy_l3?.trim();
        if (!l1 || !l2) return;

        const l2Map = tree.get(l1) ?? new Map<string, Set<string>>();
        const l3Set = l2Map.get(l2) ?? new Set<string>();
        if (l3) {
          l3Set.add(l3);
        }
        l2Map.set(l2, l3Set);
        tree.set(l1, l2Map);
      });
    }

    const categories: CategoryLevel[] = Array.from(tree.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([l1, l2Map]) => ({
        name: l1,
        children: Array.from(l2Map.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([l2, l3Set]) => ({
            name: l2,
            children: Array.from(l3Set)
              .sort((a, b) => a.localeCompare(b))
              .map((l3) => ({ name: l3, children: [] })),
          })),
      }));

    return NextResponse.json({ categories });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
