import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(request: Request) {
  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  let supabaseQuery = adminClient
    .from("draft_variants")
    .select(
      "id,draft_sku,draft_spu,draft_option_combined_zh,draft_price,draft_weight,draft_weight_unit,draft_variant_image_url,draft_status,draft_updated_at,draft_raw_row",
      { count: "exact" }
    )
    .eq("draft_status", "draft")
    .order("draft_spu", { ascending: true })
    .order("draft_sku", { ascending: true });

  if (query) {
    const like = `%${query}%`;
    supabaseQuery = supabaseQuery.or(
      `draft_sku.ilike.${like},draft_spu.ilike.${like},draft_option_combined_zh.ilike.${like}`
    );
  }

  const { data, error, count } = await supabaseQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [], count });
}
