import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
const BIGINT_ID_RE = /^\d+$/;

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
  draft_option1_zh?: string | null;
  draft_option2_zh?: string | null;
  draft_option3_zh?: string | null;
  draft_option4_zh?: string | null;
  draft_compare_at_price?: number | null;
  draft_cost?: number | null;
  draft_barcode?: string | null;
  draft_variant_image_url?: string | null;
  draft_shipping_name_en?: string | null;
  draft_short_title_zh?: string | null;
  draft_shipping_name_zh?: string | null;
  draft_shipping_class?: string | null;
  draft_taxable?: string | null;
  draft_tax_code?: string | null;
  draft_hs_code?: string | null;
  draft_country_of_origin?: string | null;
  draft_category_code_fq?: string | null;
  draft_category_code_ld?: string | null;
  draft_supplier_name?: string | null;
  draft_supplier_location?: string | null;
  draft_b2b_dropship_price_se?: number | null;
  draft_b2b_dropship_price_no?: number | null;
  draft_b2b_dropship_price_dk?: number | null;
  draft_b2b_dropship_price_fi?: number | null;
  draft_purchase_price_cny?: number | null;
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
const normalizeDraftId = (value: unknown) => {
  const text = asText(value);
  return BIGINT_ID_RE.test(text) ? text : null;
};

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

const SHIPPING_CLASS_SET = new Set(["NOR", "BAT", "PBA", "LIQ"]);
const asNullableShippingClass = (value: unknown) => {
  const text = asText(value).toUpperCase();
  if (!text) return null;
  return SHIPPING_CLASS_SET.has(text) ? text : null;
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
  const draft_shipping_class = asNullableShippingClass(
    raw.draft_shipping_class ?? draftRaw.draft_shipping_class
  );
  const optionCombinedInput = asText(raw.draft_option_combined_zh);
  const draft_option_combined_zh = buildCombinedOption({
    draft_option1,
    draft_option2,
    draft_option3,
    draft_option4,
    fallback: optionCombinedInput,
  });
  return {
    id: normalizeDraftId(raw.id),
    draft_sku: asNullableText(raw.draft_sku),
    draft_option1: draft_option1 || null,
    draft_option2: draft_option2 || null,
    draft_option3: draft_option3 || null,
    draft_option4: draft_option4 || null,
    draft_option_combined_zh: draft_option_combined_zh || null,
    draft_price: asNullableNumber(raw.draft_price),
    draft_weight: asNullableNumber(raw.draft_weight),
    draft_weight_unit: asNullableText(raw.draft_weight_unit),
    draft_option1_zh: asNullableText(raw.draft_option1_zh ?? draftRaw.draft_option1_zh),
    draft_option2_zh: asNullableText(raw.draft_option2_zh ?? draftRaw.draft_option2_zh),
    draft_option3_zh: asNullableText(raw.draft_option3_zh ?? draftRaw.draft_option3_zh),
    draft_option4_zh: asNullableText(raw.draft_option4_zh ?? draftRaw.draft_option4_zh),
    draft_compare_at_price: asNullableNumber(
      raw.draft_compare_at_price ?? draftRaw.draft_compare_at_price
    ),
    draft_cost: asNullableNumber(raw.draft_cost ?? draftRaw.draft_cost),
    draft_barcode: asNullableText(raw.draft_barcode ?? draftRaw.draft_barcode),
    draft_variant_image_url: asNullableText(raw.draft_variant_image_url),
    draft_shipping_name_en: asNullableText(
      raw.draft_shipping_name_en ?? draftRaw.draft_shipping_name_en
    ),
    draft_short_title_zh: asNullableText(raw.draft_short_title_zh ?? draftRaw.draft_short_title_zh),
    draft_shipping_name_zh: asNullableText(
      raw.draft_shipping_name_zh ?? draftRaw.draft_shipping_name_zh
    ),
    draft_shipping_class,
    draft_taxable: asNullableText(raw.draft_taxable ?? draftRaw.draft_taxable),
    draft_tax_code: asNullableText(raw.draft_tax_code ?? draftRaw.draft_tax_code),
    draft_hs_code: asNullableText(raw.draft_hs_code ?? draftRaw.draft_hs_code),
    draft_country_of_origin: asNullableText(
      raw.draft_country_of_origin ?? draftRaw.draft_country_of_origin
    ),
    draft_category_code_fq: asNullableText(
      raw.draft_category_code_fq ?? draftRaw.draft_category_code_fq
    ),
    draft_category_code_ld: asNullableText(
      raw.draft_category_code_ld ?? draftRaw.draft_category_code_ld
    ),
    draft_supplier_name: asNullableText(raw.draft_supplier_name ?? draftRaw.draft_supplier_name),
    draft_supplier_location: asNullableText(
      raw.draft_supplier_location ?? draftRaw.draft_supplier_location
    ),
    draft_b2b_dropship_price_se: asNullableNumber(
      raw.draft_b2b_dropship_price_se ?? draftRaw.draft_b2b_dropship_price_se
    ),
    draft_b2b_dropship_price_no: asNullableNumber(
      raw.draft_b2b_dropship_price_no ?? draftRaw.draft_b2b_dropship_price_no
    ),
    draft_b2b_dropship_price_dk: asNullableNumber(
      raw.draft_b2b_dropship_price_dk ?? draftRaw.draft_b2b_dropship_price_dk
    ),
    draft_b2b_dropship_price_fi: asNullableNumber(
      raw.draft_b2b_dropship_price_fi ?? draftRaw.draft_b2b_dropship_price_fi
    ),
    draft_purchase_price_cny: asNullableNumber(
      raw.draft_purchase_price_cny ?? draftRaw.draft_purchase_price_cny
    ),
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
      draft_shipping_class,
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
  draft_option1_zh: row.draft_option1_zh ?? null,
  draft_option2_zh: row.draft_option2_zh ?? null,
  draft_option3_zh: row.draft_option3_zh ?? null,
  draft_option4_zh: row.draft_option4_zh ?? null,
  draft_compare_at_price: row.draft_compare_at_price ?? null,
  draft_cost: row.draft_cost ?? null,
  draft_barcode: row.draft_barcode ?? null,
  draft_variant_image_url: row.draft_variant_image_url ?? null,
  draft_shipping_name_en: row.draft_shipping_name_en ?? null,
  draft_short_title_zh: row.draft_short_title_zh ?? null,
  draft_shipping_name_zh: row.draft_shipping_name_zh ?? null,
  draft_shipping_class: row.draft_shipping_class ?? null,
  draft_taxable: row.draft_taxable ?? null,
  draft_tax_code: row.draft_tax_code ?? null,
  draft_hs_code: row.draft_hs_code ?? null,
  draft_country_of_origin: row.draft_country_of_origin ?? null,
  draft_category_code_fq: row.draft_category_code_fq ?? null,
  draft_category_code_ld: row.draft_category_code_ld ?? null,
  draft_supplier_name: row.draft_supplier_name ?? null,
  draft_supplier_location: row.draft_supplier_location ?? null,
  draft_b2b_dropship_price_se: row.draft_b2b_dropship_price_se ?? null,
  draft_b2b_dropship_price_no: row.draft_b2b_dropship_price_no ?? null,
  draft_b2b_dropship_price_dk: row.draft_b2b_dropship_price_dk ?? null,
  draft_b2b_dropship_price_fi: row.draft_b2b_dropship_price_fi ?? null,
  draft_purchase_price_cny: row.draft_purchase_price_cny ?? null,
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
