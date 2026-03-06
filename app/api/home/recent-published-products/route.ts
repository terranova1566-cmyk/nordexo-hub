import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadImageUrls } from "@/lib/server-images";

const ENV_TAG_IN_FILE_NAME =
  /(?:\(\s*(?:ENV|ENF|EMV)\s*\)|(?:^|[-_ ])(?:ENV|ENF|EMV)(?:[-_ .)]|$))/i;
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 40;
const MIN_LIMIT = 10;

type ProductRow = {
  id: string;
  spu: string | null;
  title: string | null;
  image_folder: string | null;
  visible_updated_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

const parseLimit = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(parsed)));
};

const getFilenameFromUrl = (value: string) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const withoutHash = trimmed.split("#", 1)[0] ?? trimmed;
  const withoutQuery = withoutHash.split("?", 1)[0] ?? withoutHash;
  try {
    return decodeURIComponent(path.basename(withoutQuery));
  } catch {
    return path.basename(withoutQuery);
  }
};

const isEnvImageUrl = (url: string) => {
  const fileName = getFilenameFromUrl(url);
  if (!fileName) return false;
  return ENV_TAG_IN_FILE_NAME.test(fileName);
};

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const productsToScan = Math.max(120, limit * 6);

  let query = supabase
    .from("catalog_products")
    .select("id,spu,title,image_folder,visible_updated_at,updated_at,created_at")
    .not("visible_updated_at", "is", null)
    .order("visible_updated_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(productsToScan);

  const { data: userSettings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!userSettings?.is_admin) {
    query = query.or("spu.ilike.ND-%,spu.ilike.GB-%,spu.ilike.LD-%,spu.ilike.SK-%");
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as ProductRow[];
  const items: Array<{
    product_id: string;
    spu: string | null;
    title: string | null;
    image_url: string;
    visible_updated_at: string | null;
    updated_at: string | null;
    created_at: string | null;
  }> = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (items.length >= limit) break;
    if (!row.image_folder) continue;

    const smallUrls = await loadImageUrls(row.image_folder, { size: "small" });
    const fallbackUrls =
      smallUrls.length > 0 ? smallUrls : await loadImageUrls(row.image_folder, { size: "thumb" });
    if (fallbackUrls.length === 0) continue;

    const envUrls = fallbackUrls.filter(isEnvImageUrl);
    if (envUrls.length === 0) continue;

    let pickedForProduct = 0;
    for (const imageUrl of envUrls) {
      if (items.length >= limit || pickedForProduct >= 2) break;
      if (seen.has(imageUrl)) continue;
      seen.add(imageUrl);
      items.push({
        product_id: row.id,
        spu: row.spu ?? null,
        title: row.title ?? null,
        image_url: imageUrl,
        visible_updated_at: row.visible_updated_at ?? null,
        updated_at: row.updated_at ?? null,
        created_at: row.created_at ?? null,
      });
      pickedForProduct += 1;
    }
  }

  return NextResponse.json({
    items,
    total: items.length,
    requested: limit,
  });
}
