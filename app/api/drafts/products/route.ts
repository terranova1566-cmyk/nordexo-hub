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
    .from("draft_products")
    .select(
      "id,draft_spu,draft_title,draft_subtitle,draft_status,draft_source,draft_supplier_1688_url,draft_updated_at,draft_created_at,draft_description_html,draft_product_description_main_html,draft_mf_product_short_title,draft_mf_product_long_title,draft_mf_product_subtitle,draft_mf_product_bullets_short,draft_mf_product_bullets,draft_mf_product_bullets_long,draft_mf_product_specs,draft_image_folder,draft_main_image_url,draft_image_urls,draft_variant_image_urls,draft_raw_row,draft_image_files,draft_variant_image_files",
      { count: "exact" }
    )
    .eq("draft_status", "draft")
    .order("draft_updated_at", { ascending: false })
    .order("draft_spu", { ascending: true });

  if (query) {
    const like = `%${query}%`;
    supabaseQuery = supabaseQuery.or(
      `draft_spu.ilike.${like},draft_title.ilike.${like},draft_subtitle.ilike.${like}`
    );
  }

  const { data, error, count } = await supabaseQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = data ?? [];
  const spus = items.map((item) => item.draft_spu).filter(Boolean);
  const variantCounts = new Map<string, number>();

  if (spus.length > 0) {
    const { data: variants, error: variantError } = await adminClient
      .from("draft_variants")
      .select("draft_spu")
      .eq("draft_status", "draft")
      .in("draft_spu", spus);

    if (variantError) {
      return NextResponse.json({ error: variantError.message }, { status: 500 });
    }

    (variants ?? []).forEach((variant) => {
      const key = variant.draft_spu as string;
      if (!key) return;
      variantCounts.set(key, (variantCounts.get(key) ?? 0) + 1);
    });
  }

  const responseItems = items.map((item) => {
    const imageCount = Array.isArray(item.draft_image_files)
      ? item.draft_image_files.length
      : 0;
    const variantImageCount = Array.isArray(item.draft_variant_image_files)
      ? item.draft_variant_image_files.length
      : 0;
    const videoCount = 0;
    const variantCount = variantCounts.get(item.draft_spu as string) ?? 0;

    return {
      ...item,
      image_count: imageCount,
      variant_image_count: variantImageCount,
      video_count: videoCount,
      variant_count: variantCount,
    };
  });

  return NextResponse.json({ items: responseItems, count });
}
