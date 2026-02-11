import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { runMeiliIndexSpus } from "@/lib/server/meili-index";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

// This endpoint converts legacy product text by running the *same* text outputs
// as the current bulk-parallel processor: cleanup prompt + product JSON prompt +
// Tingelo category matcher. Then it writes results into draft tables and runs
// the same DB publish RPCs as Draft Explorer (staging + process_import_*).

const CLEANUP_PROMPT_PATH =
  process.env.LEGACY_TEXT_CLEANUP_PROMPT_PATH ||
  "/srv/node-tools/product-processor/src/text/prompts/prompt_cleanup_1688.txt";
const PRODUCT_JSON_PROMPT_PATH =
  process.env.LEGACY_TEXT_PRODUCT_JSON_PROMPT_PATH ||
  "/srv/node-tools/product-processor/src/text/prompts/prompt_product_descriptions_JSON.txt";

const DEFAULT_CLEANUP_MODEL =
  process.env.LEGACY_TEXT_CLEANUP_MODEL ||
  process.env.OPENAI_CLEAN_MODEL ||
  "gpt-5.2";
const DEFAULT_PRODUCT_JSON_MODEL =
  process.env.LEGACY_TEXT_PRODUCT_JSON_MODEL ||
  process.env.OPENAI_PRODUCT_JSON_MODEL ||
  "gpt-5.2";

const toText = (value: unknown) => (value == null ? "" : String(value));

const normalizeListText = (value: unknown) => {
  const raw = toText(value).trim();
  if (!raw) return "";
  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => toText(entry).trim())
          .filter(Boolean)
          .join("\n");
      }
    } catch {
      // ignore
    }
  }
  return raw;
};

const normalizeHtmlToText = (value: string) =>
  String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const normalizeTextCell = (value: unknown) => {
  const text = value == null ? "" : String(value);
  const cleaned = text
    .replace(/_x000d_/gi, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  return cleaned === "" ? null : cleaned;
};

const extractWeightMappingBlock = (rawText: string) => {
  const text = String(rawText || "");
  const marker = "WEIGHT_MAPPING_JSON";
  const endMarker = "END_WEIGHT_MAPPING_JSON";
  const start = text.indexOf(marker);
  if (start < 0) return text.trim();
  const end = text.indexOf(endMarker, start + marker.length);
  const cleaned =
    end >= 0
      ? (text.slice(0, start) + text.slice(end + endMarker.length)).trim()
      : text.slice(0, start).trim();
  return cleaned;
};

const toCellValue = (value: unknown) => {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((v) => toText(v).trim()).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const readPrompt = async (promptPath: string) => {
  if (!promptPath || !existsSync(promptPath)) return "";
  try {
    return await fs.readFile(promptPath, "utf8");
  } catch {
    return "";
  }
};

type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const callOpenAIChat = async (args: {
  model: string;
  apiKey: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  jsonObject?: boolean;
}) => {
  const body: any = {
    model: args.model,
    messages: args.messages,
    temperature: args.temperature ?? 0.2,
  };
  if (args.jsonObject) body.response_format = { type: "json_object" };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI error (${res.status}): ${errText.slice(0, 400)}`);
  }
  const json = await res.json().catch(() => null);
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI response missing content.");
  return String(content);
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

type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;

const requireAdmin = async (): Promise<
  | { ok: false; status: number; error: string }
  | { ok: true; userId: string; adminClient: AdminClient }
> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!settings?.is_admin) return { ok: false, status: 403, error: "Forbidden" };

  const adminClient = getAdminClient();
  if (!adminClient) {
    return {
      ok: false,
      status: 500,
      error: "Server is missing Supabase credentials.",
    };
  }
  return { ok: true, userId: user.id, adminClient };
};

const buildLegacyReadableText = (product: any) => {
  const legacyTitle = normalizeListText(product.legacy_title_sv ?? product.title);
  const legacyBullets = normalizeListText(product.legacy_bullets_sv ?? "");
  const legacyDescRaw =
    normalizeListText(product.legacy_description_sv ?? "") ||
    normalizeHtmlToText(product.description_html ?? "");
  const parts = [
    legacyTitle ? `Titel:\n${legacyTitle}` : "",
    legacyBullets ? `Bullets:\n${legacyBullets}` : "",
    legacyDescRaw ? `Beskrivning:\n${legacyDescRaw}` : "",
  ].filter(Boolean);
  return parts.join("\n\n").trim();
};

const chunkRows = <T,>(rows: T[], size = 200) => {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
};

const getSpuPrefix = (spu: string | null) => {
  const normalized = normalizeTextCell(spu);
  if (!normalized) return null;
  const upper = normalized.toUpperCase();
  return upper.length >= 2 ? upper.slice(0, 2) : upper;
};

const getRawText = (
  raw: Record<string, unknown> | null | undefined,
  key: string
) => {
  if (!raw || typeof raw !== "object") return null;
  return normalizeTextCell((raw as Record<string, unknown>)[key]);
};

const getRawTextAny = (
  raw: Record<string, unknown> | null | undefined,
  keys: string[]
) => {
  for (const key of keys) {
    const value = getRawText(raw, key);
    if (value) return value;
  }
  return null;
};

const joinUrls = (value: unknown) => {
  if (Array.isArray(value)) {
    const items = value.map((entry) => String(entry || "").trim()).filter(Boolean);
    return items.length ? items.join(";") : null;
  }
  const text = normalizeTextCell(value);
  return text || null;
};

type DraftProductRow = {
  id: string;
  draft_spu: string;
  draft_title: string | null;
  draft_subtitle: string | null;
  draft_description_html: string | null;
  draft_product_description_main_html: string | null;
  draft_mf_product_short_title: string | null;
  draft_mf_product_long_title: string | null;
  draft_mf_product_subtitle: string | null;
  draft_mf_product_bullets_short: string | null;
  draft_mf_product_bullets: string | null;
  draft_mf_product_bullets_long: string | null;
  draft_mf_product_specs: string | null;
  draft_mf_product_description_short_html: string | null;
  draft_mf_product_description_extended_html: string | null;
  draft_option1_name: string | null;
  draft_option2_name: string | null;
  draft_option3_name: string | null;
  draft_option4_name: string | null;
  draft_legacy_title_sv: string | null;
  draft_legacy_description_sv: string | null;
  draft_legacy_bullets_sv: string | null;
  draft_supplier_1688_url: string | null;
  draft_image_folder: string | null;
  draft_main_image_url: string | null;
  draft_image_urls: string[] | null;
  draft_raw_row: Record<string, unknown> | null;
  draft_created_at: string | null;
};

type DraftVariantRow = {
  id: string;
  draft_spu: string | null;
  draft_sku: string | null;
  draft_option1: string | null;
  draft_option2: string | null;
  draft_option3: string | null;
  draft_option4: string | null;
  draft_option_combined_zh: string | null;
  draft_option1_zh: string | null;
  draft_option2_zh: string | null;
  draft_option3_zh: string | null;
  draft_option4_zh: string | null;
  draft_price: string | number | null;
  draft_compare_at_price: string | number | null;
  draft_cost: string | number | null;
  draft_weight: string | number | null;
  draft_weight_unit: string | null;
  draft_barcode: string | null;
  draft_variant_image_url: string | null;
  draft_shipping_name_en: string | null;
  draft_short_title_zh: string | null;
  draft_shipping_name_zh: string | null;
  draft_shipping_class: string | null;
  draft_taxable: string | null;
  draft_tax_code: string | null;
  draft_hs_code: string | null;
  draft_country_of_origin: string | null;
  draft_category_code_fq: string | null;
  draft_category_code_ld: string | null;
  draft_supplier_name: string | null;
  draft_supplier_location: string | null;
  draft_b2b_dropship_price_se: string | number | null;
  draft_b2b_dropship_price_no: string | number | null;
  draft_b2b_dropship_price_dk: string | number | null;
  draft_b2b_dropship_price_fi: string | number | null;
  draft_purchase_price_cny: string | number | null;
  draft_raw_row: Record<string, unknown> | null;
};

const buildFallbackVariant = (product: DraftProductRow): DraftVariantRow => {
  const raw =
    product.draft_raw_row && typeof product.draft_raw_row === "object"
      ? (product.draft_raw_row as Record<string, unknown>)
      : null;
  return {
    id: `fallback-${product.draft_spu || ""}`,
    draft_spu: product.draft_spu,
    draft_sku: product.draft_spu,
    draft_option1: null,
    draft_option2: null,
    draft_option3: null,
    draft_option4: null,
    draft_option_combined_zh: null,
    draft_option1_zh: null,
    draft_option2_zh: null,
    draft_option3_zh: null,
    draft_option4_zh: null,
    draft_price: getRawTextAny(raw, ["price", "product_price", "product_price_cny"]),
    draft_compare_at_price: null,
    draft_cost: getRawTextAny(raw, ["cost", "product_cost", "product_cost_cny"]),
    draft_weight: getRawTextAny(raw, [
      "product_weights_1688",
      "product_weight_gram",
      "product_weight",
      "weight",
    ]),
    draft_weight_unit: null,
    draft_barcode: null,
    draft_variant_image_url: null,
    draft_shipping_name_en: getRawTextAny(raw, [
      "EN_shipname",
      "en_shipname",
      "shipping_name_en",
    ]),
    draft_short_title_zh: getRawTextAny(raw, [
      "CN_title",
      "cn_title",
      "short_title_zh",
    ]),
    draft_shipping_name_zh: getRawTextAny(raw, [
      "CN_shipname",
      "cn_shipname",
      "shipping_name_zh",
    ]),
    draft_shipping_class: getRawTextAny(raw, [
      "product_shiptype",
      "product_shipType",
    ]),
    draft_taxable: null,
    draft_tax_code: getRawTextAny(raw, ["tax_code", "taxcode", "tax code"]),
    draft_hs_code: getRawTextAny(raw, ["hs_code", "HS_code", "hs code"]),
    draft_country_of_origin: getRawTextAny(raw, [
      "country_of_origin",
      "country of origin",
      "origin_country",
      "origin",
    ]),
    draft_category_code_fq: null,
    draft_category_code_ld: null,
    draft_supplier_name: getRawTextAny(raw, ["supplier_name_1688", "supplier_name"]),
    draft_supplier_location: null,
    draft_b2b_dropship_price_se: null,
    draft_b2b_dropship_price_no: null,
    draft_b2b_dropship_price_dk: null,
    draft_b2b_dropship_price_fi: null,
    draft_purchase_price_cny: getRawTextAny(raw, [
      "purchase_price_cny",
      "purchase_price",
      "purchase price",
    ]),
    draft_raw_row: raw ?? null,
  };
};

const enrichTingeloCategoryKeys = async (
  apiKey: string,
  row: Record<string, unknown>
) => {
  // Local vendored copy to keep Next/Turbopack bundling happy.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { enrichRowsWithTingeloCategories } = require(
    "../../../../../vendor/tingelo/tingelo-category-matcher.cjs"
  );
  const openai = {
    chat: {
      completions: {
        create: async (payload: any) => {
          const content = await callOpenAIChat({
            model: String(payload?.model || "gpt-4o"),
            apiKey,
            messages: Array.isArray(payload?.messages) ? payload.messages : [],
            temperature: payload?.temperature ?? 0.2,
          });
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
  await enrichRowsWithTingeloCategories(openai, [row], {});
};

const generateRowUsingBulkParallelTextLogic = async (args: {
  apiKey: string;
  sku: string;
  readableRaw: string;
  cleanupPrompt: string;
  productJsonPrompt: string;
  cleanupModel: string;
  productJsonModel: string;
}) => {
  const { apiKey, sku, readableRaw, cleanupPrompt, productJsonPrompt } = args;

  // A) Cleanup prompt output is used as "VisionDescription" input to product JSON.
  let cleaned = "";
  let cleanupRawOut = "";
  if (cleanupPrompt.trim() && readableRaw.trim()) {
    const rawInput = `RAW TEXT:\n${readableRaw.trim()}\n`;
    const user = `${cleanupPrompt}\n\n---\n${rawInput}`;
    cleanupRawOut = await callOpenAIChat({
      model: args.cleanupModel,
      apiKey,
      messages: [{ role: "user", content: user }],
      temperature: 0.2,
      jsonObject: false,
    });
    cleaned = extractWeightMappingBlock(cleanupRawOut);
  }

  // B) Product JSON step (same prompt file as bulk-parallel).
  const userPrompt = `SKU: ${sku}\n\nReadable_1688:\n${readableRaw || ""}\n\nVisionDescription:\n${cleaned || ""}\n\nReturn only the JSON as specified.`;
  const productJsonRawOut = await callOpenAIChat({
    model: args.productJsonModel,
    apiKey,
    messages: [
      { role: "system", content: productJsonPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    jsonObject: true,
  });

  let parsed: any = null;
  try {
    parsed = JSON.parse(productJsonRawOut);
  } catch (e) {
    throw new Error(
      `Product JSON parse failed for ${sku}: ${(e as Error).message}`
    );
  }

  const row: Record<string, unknown> = {
    SKU: sku,
    "Readable-1688": readableRaw,
    "Vision-Description": cleaned,
  };
  Object.keys(parsed || {}).forEach((k) => {
    row[k] = toCellValue(parsed[k]);
  });

  return {
    row,
    debug: {
      cleanup_model: args.cleanupModel,
      product_json_model: args.productJsonModel,
      cleanup_raw_output: cleanupRawOut,
      product_json_raw_output: productJsonRawOut,
      product_json_parsed: parsed,
    } as Record<string, unknown>,
  };
};

const publishDraftSpusTextOnly = async (adminClient: AdminClient, spus: string[]) => {
  const spuList = Array.from(
    new Set(spus.map((s) => String(s || "").trim()).filter(Boolean))
  );
  if (!spuList.length) return { ok: true, published: [] as string[] };

  const { data: productRows, error: productError } = await adminClient
    .from("draft_products")
    .select(
      "id,draft_spu,draft_title,draft_subtitle,draft_description_html,draft_product_description_main_html,draft_mf_product_short_title,draft_mf_product_long_title,draft_mf_product_subtitle,draft_mf_product_bullets_short,draft_mf_product_bullets,draft_mf_product_bullets_long,draft_mf_product_specs,draft_mf_product_description_short_html,draft_mf_product_description_extended_html,draft_option1_name,draft_option2_name,draft_option3_name,draft_option4_name,draft_legacy_title_sv,draft_legacy_description_sv,draft_legacy_bullets_sv,draft_supplier_1688_url,draft_image_folder,draft_main_image_url,draft_image_urls,draft_raw_row,draft_created_at",
      { count: "exact" }
    )
    .eq("draft_status", "draft")
    .in("draft_spu", spuList);
  if (productError) throw new Error(productError.message);

  const products = (productRows ?? []) as DraftProductRow[];
  if (!products.length) return { ok: true, published: [] as string[] };

  const now = new Date().toISOString();

  // For legacy conversion we treat products as *existing* items and only want to
  // overwrite text/meta fields plus classifier outputs. Avoid image folder
  // changes, publication flags, and variant creation.
  const productBySpu = new Map(products.map((row) => [row.draft_spu, row]));

  const { data: existingProducts, error: existingProductError } = await adminClient
    .from("catalog_products")
    .select("id,spu")
    .in("spu", spuList);
  if (existingProductError) throw new Error(existingProductError.message);
  const spuByProductId = new Map<string, string>();
  const productIds: string[] = [];
  for (const row of existingProducts ?? []) {
    const id = String((row as any).id || "").trim();
    const spu = String((row as any).spu || "").trim();
    if (!id || !spu) continue;
    spuByProductId.set(id, spu);
    productIds.push(id);
  }

  const variantsBySpu = new Map<string, string[]>();
  if (productIds.length > 0) {
    const { data: existingVariants, error: existingVariantError } = await adminClient
      .from("catalog_variants")
      .select("product_id,sku")
      .in("product_id", productIds);
    if (existingVariantError) throw new Error(existingVariantError.message);

    for (const row of existingVariants ?? []) {
      const productId = String((row as any).product_id || "").trim();
      const spu = spuByProductId.get(productId) ?? null;
      const sku = String((row as any).sku || "").trim();
      if (!spu || !sku) continue;
      const list = variantsBySpu.get(spu) ?? [];
      list.push(sku);
      variantsBySpu.set(spu, list);
    }
  }

  for (const [spu, list] of variantsBySpu.entries()) {
    const uniq = Array.from(new Set(list.map((v) => String(v || "").trim()).filter(Boolean)));
    variantsBySpu.set(spu, uniq);
  }

  const stgSpuRows = products.map((row) => ({
    spu: row.draft_spu,
    sku: row.draft_spu,
    product_title: normalizeTextCell(row.draft_title),
    // Subtitle is stored as a metafield in process_import_spu; keep column untouched.
    subtitle: null,
    // process_import_spu uses product_description_main_html, not product_description_html.
    product_description_html: null,
    product_description_main_html: normalizeTextCell(
      row.draft_product_description_main_html ?? row.draft_description_html
    ),
    // Preserve non-text product fields by not providing values (process_import_spu uses COALESCE).
    brand: null,
    vendor: null,
    mf_product_short_title: normalizeTextCell(row.draft_mf_product_short_title),
    mf_product_long_title: normalizeTextCell(row.draft_mf_product_long_title),
    mf_product_subtitle: normalizeTextCell(row.draft_mf_product_subtitle),
    mf_product_bullets_short: normalizeTextCell(row.draft_mf_product_bullets_short),
    mf_product_bullets: normalizeTextCell(row.draft_mf_product_bullets),
    mf_product_bullets_long: normalizeTextCell(row.draft_mf_product_bullets_long),
    mf_product_specs: normalizeTextCell(row.draft_mf_product_specs),
    mf_product_description_short_html: normalizeTextCell(
      row.draft_mf_product_description_short_html
    ),
    mf_product_description_extended_html: normalizeTextCell(
      row.draft_mf_product_description_extended_html
    ),
    option1_name: normalizeTextCell(row.draft_option1_name),
    option2_name: normalizeTextCell(row.draft_option2_name),
    option3_name: normalizeTextCell(row.draft_option3_name),
    option4_name: normalizeTextCell(row.draft_option4_name),
    legacy_title_sv: normalizeTextCell(row.draft_legacy_title_sv),
    legacy_description_sv: normalizeTextCell(row.draft_legacy_description_sv),
    legacy_bullets_sv: normalizeTextCell(row.draft_legacy_bullets_sv),
    supplier_1688_url: normalizeTextCell(row.draft_supplier_1688_url),
    // Skip process_import_spu image side effects.
    product_main_image_url: null,
    product_additional_image_urls: null,
    shopify_tingelo_category_keys: getRawTextAny(row.draft_raw_row, [
      "category_external_key_shopify_tingelo",
      "shopify_tingelo_category_keys",
    ]),
    product_categorizer_keywords: getRawTextAny(row.draft_raw_row, [
      "product_categorizer_keywords",
      "poduct_categorizer_keywords",
      "poduct_keywords",
    ]),
    // Preserve publish flags and image folder for existing products.
    is_active: null,
    status: null,
    published: null,
    published_scope: null,
    shopify_tingelo_sync: null,
    image_folder: null,
    raw_row: null,
    imported_at: now,
    processed: false,
    product_created_at: row.draft_created_at || null,
  }));

  const stgSkuRows: any[] = [];
  for (const spu of spuList) {
    const draft = productBySpu.get(spu) ?? null;
    const raw =
      draft?.draft_raw_row && typeof draft.draft_raw_row === "object"
        ? (draft.draft_raw_row as Record<string, unknown>)
        : null;

    const shippingClass = getRawTextAny(raw, ["product_shiptype", "product_shipType"]);
    const hsCode = getRawTextAny(raw, ["hs_code", "HS_code", "hs code"]);
    const shippingNameEn = getRawTextAny(raw, [
      "EN_shipname",
      "en_shipname",
      "shipping_name_en",
    ]);
    const shippingNameZh = getRawTextAny(raw, [
      "CN_shipname",
      "cn_shipname",
      "shipping_name_zh",
    ]);
    const shortTitleZh = getRawTextAny(raw, [
      "CN_title",
      "cn_title",
      "short_title_zh",
    ]);

    const skus = variantsBySpu.get(spu) ?? [];
    const skuListForSpu = skus.length ? skus : [spu];
    for (const sku of skuListForSpu) {
      stgSkuRows.push({
        spu,
        sku,
        shipping_class: shippingClass,
        hs_code: hsCode,
        shipping_name_en: shippingNameEn,
        shipping_name_zh: shippingNameZh,
        short_title_zh: shortTitleZh,
        imported_at: now,
        processed: false,
      });
    }
  }

  const { error: deleteSpuError } = await adminClient
    .from("stg_import_spu")
    .delete()
    .in("spu", spuList);
  if (deleteSpuError) throw new Error(deleteSpuError.message);

  const { error: deleteSkuError } = await adminClient
    .from("stg_import_sku")
    .delete()
    .in("spu", spuList);
  if (deleteSkuError) throw new Error(deleteSkuError.message);

  for (const chunk of chunkRows(stgSpuRows, 200)) {
    const { error } = await adminClient.from("stg_import_spu").insert(chunk);
    if (error) throw new Error(error.message);
  }
  for (const chunk of chunkRows(stgSkuRows, 200)) {
    const { error } = await adminClient.from("stg_import_sku").insert(chunk);
    if (error) throw new Error(error.message);
  }

  const { error: spuRpcError } = await adminClient.rpc("process_import_spu", {
    p_spus: spuList,
  });
  if (spuRpcError) throw new Error(spuRpcError.message);

  const { error: skuRpcError } = await adminClient.rpc("process_import_sku", {
    p_spus: spuList,
  });
  if (skuRpcError) throw new Error(skuRpcError.message);

  await adminClient
    .from("draft_products")
    .update({ draft_status: "published", draft_updated_at: now })
    .in("draft_spu", spuList);
  await adminClient
    .from("draft_variants")
    .update({ draft_status: "published", draft_updated_at: now })
    .in("draft_spu", spuList);

  const meiliIndex = await runMeiliIndexSpus(spuList);
  if (!meiliIndex.ok) {
    console.error("Meili index update failed after text-only publish:", meiliIndex.error);
  }

  return {
    ok: true,
    published: spuList,
    meili_index_ok: meiliIndex.ok,
    meili_index_error: meiliIndex.ok ? null : meiliIndex.error,
  };
};

const formatTimestamp = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}Z`;
};

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
  }

  const adminClient = adminCheck.adminClient;
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is missing." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const listId = String(body?.listId || "").trim();
  const debug = Boolean(body?.debug);
  if (!listId) return NextResponse.json({ error: "Missing listId." }, { status: 400 });

  // Verify wishlist exists and is accessible for this user (RLS).
  const supabase = await createServerSupabase();
  const { data: wishlist, error: wishlistError } = await supabase
    .from("product_manager_wishlists")
    .select("id")
    .eq("id", listId)
    .maybeSingle();
  if (wishlistError) return NextResponse.json({ error: wishlistError.message }, { status: 500 });
  if (!wishlist) return NextResponse.json({ error: "Wishlist not found." }, { status: 404 });

  const { data: wishlistItems, error: itemsError } = await supabase
    .from("product_manager_wishlist_items")
    .select("product_id")
    .eq("wishlist_id", listId);
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
  const productIds = (wishlistItems ?? [])
    .map((row: any) => String(row.product_id || "").trim())
    .filter(Boolean);
  if (!productIds.length) {
    return NextResponse.json({ ok: true, converted: 0, published: 0, spus: [] });
  }

  const { data: products, error: productError } = await adminClient
    .from("catalog_products")
    .select("id,spu,title,description_html,legacy_title_sv,legacy_description_sv,legacy_bullets_sv")
    .in("id", productIds);
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });

  const cleanupPrompt = await readPrompt(CLEANUP_PROMPT_PATH);
  const productJsonPrompt = await readPrompt(PRODUCT_JSON_PROMPT_PATH);
  if (!productJsonPrompt.trim()) {
    return NextResponse.json(
      { error: `Missing product JSON prompt at ${PRODUCT_JSON_PROMPT_PATH}` },
      { status: 500 }
    );
  }

  const cleanupModel = DEFAULT_CLEANUP_MODEL;
  const productJsonModel = DEFAULT_PRODUCT_JSON_MODEL;

  const debugDir = path.join(process.cwd(), "exports", "legacy-convert-debug");
  const debugItems: any[] = [];
  const draftUpserts: any[] = [];

  for (const p of products ?? []) {
    const spu = String((p as any).spu || "").trim();
    if (!spu) continue;

    const hasLegacy =
      Boolean(normalizeListText((p as any).legacy_title_sv)) ||
      Boolean(normalizeListText((p as any).legacy_description_sv)) ||
      Boolean(normalizeListText((p as any).legacy_bullets_sv));
    if (!hasLegacy) continue;

    const readableRaw = buildLegacyReadableText(p);
    if (!readableRaw.trim()) continue;

    const generated = await generateRowUsingBulkParallelTextLogic({
      apiKey,
      sku: spu,
      readableRaw,
      cleanupPrompt,
      productJsonPrompt,
      cleanupModel,
      productJsonModel,
    });

    const row = generated.row;

    // Tingelo category matching: writes `category_external_key_shopify_tingelo`.
    try {
      await enrichTingeloCategoryKeys(apiKey, row);
    } catch (e) {
      if (debug) generated.debug.tingelo_error = (e as Error).message;
    }

    const now = new Date().toISOString();
    const update = {
      draft_spu: spu,
      draft_title: normalizeTextCell(row.SE_longtitle || row.SE_shorttitle || ""),
      draft_subtitle: normalizeTextCell(row.SE_subtitle || ""),
      draft_description_html: normalizeTextCell(
        row.SE_description_main || row.SE_description_short || ""
      ),
      draft_product_description_main_html: normalizeTextCell(row.SE_description_main || ""),
      draft_mf_product_short_title: normalizeTextCell(row.SE_shorttitle || ""),
      draft_mf_product_long_title: normalizeTextCell(row.SE_longtitle || ""),
      draft_mf_product_subtitle: normalizeTextCell(row.SE_subtitle || ""),
      draft_mf_product_bullets_short: normalizeTextCell(row.SE_bullets_short || ""),
      draft_mf_product_bullets: normalizeTextCell(row.SE_bullets || ""),
      draft_mf_product_bullets_long: normalizeTextCell(row.SE_bullets_long || ""),
      draft_mf_product_description_short_html: normalizeTextCell(row.SE_description_short || ""),
      draft_mf_product_description_extended_html: normalizeTextCell(
        row.SE_description_extended || ""
      ),
      draft_mf_product_specs: normalizeTextCell(row.SE_specifications || ""),
      draft_supplier_1688_url: normalizeTextCell(row.url_1688 || ""),
      draft_main_image_url: null,
      draft_image_folder: null,
      draft_image_urls: null,
      draft_raw_row: row,
      draft_source: "legacy_text_convert",
      draft_status: "draft",
      draft_updated_at: now,
      // Ensure the published product stops being considered legacy.
      draft_legacy_title_sv: null,
      draft_legacy_description_sv: null,
      draft_legacy_bullets_sv: null,
    };

    draftUpserts.push(update);
    if (debug) {
      debugItems.push({ spu, ...generated.debug, row_after_tingelo: row });
    }
  }

  if (!draftUpserts.length) {
    return NextResponse.json({ ok: true, converted: 0, published: 0, spus: [] });
  }

  const { error: upsertError } = await adminClient
    .from("draft_products")
    .upsert(draftUpserts, { onConflict: "draft_spu" });
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  const spus = draftUpserts.map((u) => u.draft_spu as string);
  const publishResult = await publishDraftSpusTextOnly(adminClient, spus);

  // Some import implementations use COALESCE; force-clear legacy fields/pointers.
  await adminClient
    .from("catalog_products")
    .update({
      legacy_title_sv: null,
      legacy_description_sv: null,
      legacy_bullets_sv: null,
    })
    .in("spu", spus);

  let debug_path: string | null = null;
  if (debug) {
    await fs.mkdir(debugDir, { recursive: true });
    const file = `legacy-convert_${listId}_${formatTimestamp()}.json`;
    debug_path = path.join(debugDir, file);
    await fs.writeFile(
      debug_path,
      JSON.stringify(
        {
          listId,
          models: { cleanupModel, productJsonModel },
          prompt_paths: { cleanup: CLEANUP_PROMPT_PATH, product_json: PRODUCT_JSON_PROMPT_PATH },
          items: debugItems,
        },
        null,
        2
      ),
      "utf8"
    );
  }

  return NextResponse.json({
    ok: true,
    converted: spus.length,
    published: (publishResult as any)?.published?.length ?? 0,
    spus,
    debug_path,
    meili_index_ok: (publishResult as any)?.meili_index_ok ?? null,
    meili_index_error: (publishResult as any)?.meili_index_error ?? null,
  });
}
