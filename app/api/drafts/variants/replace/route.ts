import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

type VariantUpdateInput = {
  id?: string | null;
  draft_sku?: string | null;
  draft_option1?: string | null;
  draft_option2?: string | null;
  draft_option3?: string | null;
  draft_option4?: string | null;
  draft_option_combined_zh?: string | null;
  draft_price?: number | null;
  draft_weight?: number | null;
  draft_weight_unit?: string | null;
  draft_variant_image_url?: string | null;
  variation_color_se?: string | null;
  variation_size_se?: string | null;
  variation_other_se?: string | null;
  variation_amount_se?: string | null;
  draft_raw_row?: Record<string, unknown> | null;
};

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

const asText = (value: unknown) => String(value ?? "").trim();

const asNullableText = (value: unknown) => {
  const text = asText(value);
  return text ? text : null;
};

const asNullableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const normalized =
    typeof value === "string" ? value.replace(/\s+/g, "").replace(",", ".") : value;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

const asRawObject = (value: unknown) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const buildCombinedOption = (input: {
  draft_option1: string;
  draft_option2: string;
  draft_option3: string;
  draft_option4: string;
  fallback: string;
}) =>
  [
    input.draft_option1,
    input.draft_option2,
    input.draft_option3,
    input.draft_option4,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" / ") || input.fallback.trim();

const sanitizeVariantInput = (value: unknown): VariantUpdateInput | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const draftRaw = asRawObject(raw.draft_raw_row);
  const draft_option1 = asText(raw.draft_option1 ?? draftRaw.draft_option1);
  const draft_option2 = asText(raw.draft_option2 ?? draftRaw.draft_option2);
  const draft_option3 = asText(raw.draft_option3 ?? draftRaw.draft_option3);
  const draft_option4 = asText(raw.draft_option4 ?? draftRaw.draft_option4);
  const variation_color_se = asText(raw.variation_color_se ?? draftRaw.variation_color_se);
  const variation_size_se = asText(raw.variation_size_se ?? draftRaw.variation_size_se);
  const variation_other_se = asText(raw.variation_other_se ?? draftRaw.variation_other_se);
  const variation_amount_se = asText(raw.variation_amount_se ?? draftRaw.variation_amount_se);
  const optionCombinedInput = asText(raw.draft_option_combined_zh);
  const draft_option_combined_zh = buildCombinedOption({
    draft_option1,
    draft_option2,
    draft_option3,
    draft_option4,
    fallback: optionCombinedInput,
  });
  return {
    id: asNullableText(raw.id),
    draft_sku: asNullableText(raw.draft_sku),
    draft_option1: draft_option1 || null,
    draft_option2: draft_option2 || null,
    draft_option3: draft_option3 || null,
    draft_option4: draft_option4 || null,
    draft_option_combined_zh: draft_option_combined_zh || null,
    draft_price: asNullableNumber(raw.draft_price),
    draft_weight: asNullableNumber(raw.draft_weight),
    draft_weight_unit: asNullableText(raw.draft_weight_unit),
    draft_variant_image_url: asNullableText(raw.draft_variant_image_url),
    variation_color_se: variation_color_se || null,
    variation_size_se: variation_size_se || null,
    variation_other_se: variation_other_se || null,
    variation_amount_se: variation_amount_se || null,
    draft_raw_row: {
      ...draftRaw,
      draft_option1,
      draft_option2,
      draft_option3,
      draft_option4,
      variation_color_se,
      variation_size_se,
      variation_other_se,
      variation_amount_se,
    },
  };
};

const buildRowUpdate = (spu: string, row: VariantUpdateInput, nowIso: string) => ({
  draft_spu: spu,
  draft_status: "draft",
  draft_sku: row.draft_sku ?? null,
  draft_option1: row.draft_option1 ?? null,
  draft_option2: row.draft_option2 ?? null,
  draft_option3: row.draft_option3 ?? null,
  draft_option4: row.draft_option4 ?? null,
  draft_option_combined_zh: row.draft_option_combined_zh ?? null,
  draft_price: row.draft_price ?? null,
  draft_weight: row.draft_weight ?? null,
  draft_weight_unit: row.draft_weight_unit ?? null,
  draft_variant_image_url: row.draft_variant_image_url ?? null,
  draft_raw_row: row.draft_raw_row ?? {},
  draft_updated_at: nowIso,
});

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  let payload: { spu?: string; variants?: unknown[] };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const spu = asText(payload?.spu);
  if (!spu) {
    return NextResponse.json({ error: "Missing SPU." }, { status: 400 });
  }

  const variants = Array.isArray(payload?.variants)
    ? payload.variants
        .map((entry) => sanitizeVariantInput(entry))
        .filter((entry): entry is VariantUpdateInput => Boolean(entry))
    : [];

  const { data: existingRows, error: existingError } = await adminClient
    .from("draft_variants")
    .select("id")
    .eq("draft_spu", spu)
    .eq("draft_status", "draft");

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existingIds = new Set(
    (existingRows ?? [])
      .map((row) => asText((row as Record<string, unknown>).id))
      .filter(Boolean)
  );
  const requestedIds = new Set(
    variants.map((row) => asText(row.id)).filter(Boolean)
  );

  const nowIso = new Date().toISOString();
  const rowsToUpdate = variants.filter((row) => {
    const id = asText(row.id);
    return id && existingIds.has(id);
  });
  const rowsToInsert = variants.filter((row) => {
    const id = asText(row.id);
    return !id || !existingIds.has(id);
  });

  for (const row of rowsToUpdate) {
    const id = asText(row.id);
    const { error } = await adminClient
      .from("draft_variants")
      .update(buildRowUpdate(spu, row, nowIso))
      .eq("id", id)
      .eq("draft_spu", spu);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (rowsToInsert.length > 0) {
    const chunkSize = 150;
    for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
      const chunk = rowsToInsert
        .slice(i, i + chunkSize)
        .map((row) => buildRowUpdate(spu, row, nowIso));
      const { error } = await adminClient.from("draft_variants").insert(chunk);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  const idsToDelete = Array.from(existingIds).filter((id) => !requestedIds.has(id));
  if (idsToDelete.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < idsToDelete.length; i += chunkSize) {
      const chunk = idsToDelete.slice(i, i + chunkSize);
      const { error } = await adminClient
        .from("draft_variants")
        .delete()
        .in("id", chunk)
        .eq("draft_spu", spu);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    updated: rowsToUpdate.length,
    inserted: rowsToInsert.length,
    deleted: idsToDelete.length,
  });
}
