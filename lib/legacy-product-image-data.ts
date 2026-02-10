import { createClient } from "@supabase/supabase-js";

// This project doesn't use generated Supabase DB types, so we keep this client
// intentionally untyped to allow querying non-public schemas/views.
let cachedServiceClient: any | null = null;

function getServiceClient() {
  if (cachedServiceClient) return cachedServiceClient;

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) return null;

  cachedServiceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as any;

  return cachedServiceClient;
}

export async function loadLegacyHeroWhiteBySpu(
  spus: Array<string | null | undefined>
) {
  const supabase = getServiceClient();
  if (!supabase) return new Map<string, string>();

  const unique = Array.from(new Set(spus.map((spu) => (spu ?? "").trim()))).filter(
    Boolean
  );
  if (!unique.length) return new Map<string, string>();

  const { data, error } = await supabase
    .schema("legacy_product_image_data")
    .from("image_decisions")
    .select("folder,resolved_filename,checked_at")
    .in("folder", unique)
    .contains("decision_tags", ["hero_white"])
    .eq("exists_on_disk", true)
    .not("resolved_filename", "is", null)
    .order("checked_at", { ascending: false });

  if (error) {
    // Fail open: legacy mapping is optional for displaying images.
    return new Map<string, string>();
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const folder = (row as any)?.folder ? String((row as any).folder) : "";
    if (!folder || map.has(folder)) continue;
    const filename = (row as any)?.resolved_filename
      ? String((row as any).resolved_filename)
      : "";
    if (!filename) continue;
    map.set(folder, filename);
  }

  return map;
}

export async function loadLegacyVariantLocksBySku(
  skus: Array<string | null | undefined>
) {
  const supabase = getServiceClient();
  if (!supabase) return new Map<string, string>();

  const unique = Array.from(new Set(skus.map((sku) => (sku ?? "").trim()))).filter(Boolean);
  if (!unique.length) return new Map<string, string>();

  const { data, error } = await supabase
    .schema("legacy_product_image_data")
    .from("v_variant_image_locks")
    .select("sku,chosen_filename,checked_at,exists_on_disk")
    .in("sku", unique)
    .eq("exists_on_disk", true)
    .order("checked_at", { ascending: false });

  if (error) {
    return new Map<string, string>();
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const sku = (row as any)?.sku ? String((row as any).sku) : "";
    if (!sku || map.has(sku)) continue;
    const filename = (row as any)?.chosen_filename
      ? String((row as any).chosen_filename)
      : "";
    if (!filename) continue;
    map.set(sku, filename);
  }

  return map;
}
