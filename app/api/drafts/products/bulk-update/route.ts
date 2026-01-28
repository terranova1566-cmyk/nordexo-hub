import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set([
  "draft_title",
  "draft_subtitle",
  "draft_description_html",
  "draft_product_description_main_html",
  "draft_mf_product_description_short_html",
  "draft_mf_product_description_extended_html",
  "draft_mf_product_short_title",
  "draft_mf_product_long_title",
  "draft_mf_product_subtitle",
  "draft_mf_product_bullets_short",
  "draft_mf_product_bullets",
  "draft_mf_product_bullets_long",
  "draft_mf_product_specs",
  "draft_raw_row",
]);

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

export async function POST(request: Request) {
  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { id, updates } = body as {
    id?: string;
    updates?: Record<string, unknown>;
  };

  if (!id || !updates || typeof updates !== "object") {
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  }

  const filtered: Record<string, unknown> = {};
  Object.entries(updates).forEach(([key, value]) => {
    if (!ALLOWED_FIELDS.has(key)) return;
    filtered[key] = value === "" ? null : value;
  });

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: "No valid fields." }, { status: 400 });
  }

  filtered.draft_updated_at = new Date().toISOString();

  const { error } = await adminClient
    .from("draft_products")
    .update(filtered)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
