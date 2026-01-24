import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_FIELDS = new Set([
  "draft_option1",
  "draft_option2",
  "draft_option_combined_zh",
  "draft_price",
  "draft_weight",
  "draft_variant_image_url",
  "raw_variation_color_se",
  "raw_variation_size_se",
  "raw_variation_other_se",
  "raw_variation_amount_se",
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

  const { id, field, value } = body as {
    id?: string;
    field?: string;
    value?: string | number | null;
  };

  if (!id || !field || !ALLOWED_FIELDS.has(field)) {
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  }

  const updateValue = value === "" ? null : value;
  const isRawField = field.startsWith("raw_");

  if (isRawField) {
    const rawKey = field.replace(/^raw_/, "");
    const { data, error: fetchError } = await adminClient
      .from("draft_variants")
      .select("draft_raw_row")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    const currentRaw =
      data?.draft_raw_row && typeof data.draft_raw_row === "object"
        ? (data.draft_raw_row as Record<string, unknown>)
        : {};
    const nextRaw = {
      ...currentRaw,
      [rawKey]: updateValue ?? "",
    };
    const { error } = await adminClient
      .from("draft_variants")
      .update({
        draft_raw_row: nextRaw,
        draft_updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await adminClient
    .from("draft_variants")
    .update({
      [field]: updateValue,
      draft_updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
