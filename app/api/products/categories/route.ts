import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type CategoryLevel = {
  name: string;
  children: CategoryLevel[];
};

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userSettings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(userSettings?.is_admin);

  let query = supabase
    .from("catalog_products")
    .select("google_taxonomy_l1, google_taxonomy_l2, google_taxonomy_l3")
    .neq("is_blocked", true);

  if (!isAdmin) {
    query = query.eq("nordic_partner_enabled", true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tree = new Map<string, Map<string, Set<string>>>();

  data?.forEach((row) => {
    const l1 = row.google_taxonomy_l1?.trim();
    const l2 = row.google_taxonomy_l2?.trim();
    const l3 = row.google_taxonomy_l3?.trim();
    if (!l1 || !l2) return;

    const l2Map = tree.get(l1) ?? new Map<string, Set<string>>();
    const l3Set = l2Map.get(l2) ?? new Set<string>();
    if (l3) {
      l3Set.add(l3);
    }
    l2Map.set(l2, l3Set);
    tree.set(l1, l2Map);
  });

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
}
