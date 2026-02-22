import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getDealsProviderConfig,
  resolveDealsProvider,
} from "@/lib/deals/provider";

type CategoryNode = {
  name: string;
  children: CategoryNode[];
};

const splitGooglePath = (value: string) =>
  value
    .split(">")
    .map((token) => token.trim())
    .filter(Boolean);

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = resolveDealsProvider(searchParams.get("provider"));
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

  const tree = new Map<string, Map<string, Set<string>>>();

  try {
    const { data, error } = await readClient
      .from(providerConfig.productsSearchView)
      .select("google_taxonomy_path")
      .not("google_taxonomy_path", "is", null)
      .neq("google_taxonomy_path", "");

    if (error) {
      throw new Error(error.message);
    }

    (data ?? []).forEach((row: { google_taxonomy_path?: string | null }) => {
      const path = String(row.google_taxonomy_path ?? "").trim();
      if (!path) return;
      const parts = splitGooglePath(path);
      const l1 = parts[0];
      const l2 = parts[1];
      const l3 = parts[2];
      if (!l1 || !l2) return;

      const l2Map = tree.get(l1) ?? new Map<string, Set<string>>();
      const l3Set = l2Map.get(l2) ?? new Set<string>();
      if (l3) {
        l3Set.add(l3);
      }
      l2Map.set(l2, l3Set);
      tree.set(l1, l2Map);
    });

    const categories: CategoryNode[] = Array.from(tree.entries())
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
