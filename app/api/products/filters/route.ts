import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const normalizeValue = (value?: string | null) => value?.trim() ?? "";

const collectUnique = (values: Array<string | null | undefined>) => {
  const map = new Map<string, string>();
  values.forEach((value) => {
    const trimmed = normalizeValue(value);
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!map.has(key)) {
      map.set(key, trimmed);
    }
  });
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
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
    .select("brand, vendor")
    .neq("is_blocked", true);

  if (!isAdmin) {
    query = query.eq("nordic_partner_enabled", true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const brands = collectUnique(data?.map((row) => row.brand) ?? []);
  const vendors = collectUnique(data?.map((row) => row.vendor) ?? []);

  return NextResponse.json({ brands, vendors });
}
