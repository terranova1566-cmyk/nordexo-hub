import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadJsonFile, safeExtractorJsonPath } from "@/lib/production-queue-status";

export const runtime = "nodejs";

type VariantCombo = {
  index: number;
  t1: string;
  t2: string;
  t3: string;
  t1_zh?: string;
  t1_en?: string;
  t2_zh?: string;
  t2_en?: string;
  t3_zh?: string;
  t3_en?: string;
  image_url?: string;
  price_raw: string;
  price: number | null;
  weight_raw?: string;
  weight_grams?: number | null;
};

const variantTranslationCache = new Map<string, string>();

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const asNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const asPriceNumber = (value: unknown) => {
  const text = asText(value).replace(/[^\d.]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const asWeightGrams = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return null;
  const normalized = raw.replace(/,/g, ".").trim();
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  if (!Number.isFinite(num) || num <= 0) return null;

  const unit = normalized.toLowerCase();
  if (
    unit.includes("kg") ||
    unit.includes("公斤") ||
    unit.includes("千克")
  ) {
    return Math.round(num * 1000);
  }
  if (unit.includes("g") || unit.includes("克")) {
    return Math.round(num);
  }
  if (num <= 20 && normalized.includes(".")) {
    return Math.round(num * 1000);
  }
  return Math.round(num);
};

const hasCjk = (value: string) => /[\u3400-\u9fff]/.test(value);
const normalizeVariantTextKey = (value: unknown) =>
  asText(value)
    .replace(/\s+/g, "")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .toLowerCase();

const normalizeNameStrict = (value: unknown) =>
  asText(value)
    .toLowerCase()
    .replace(/\s+/g, "");

const normalizeNameLoose = (value: unknown) =>
  normalizeNameStrict(value).replace(/[（(].*?[）)]/g, "");

const pickText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const buildLangPair = (combo: Record<string, unknown>, rawKey: string, zhKeys: string[], enKeys: string[]) => {
  const raw = pickText(combo[rawKey]);
  let zh = pickText(...zhKeys.map((key) => combo[key]));
  let en = pickText(...enKeys.map((key) => combo[key]));

  if (!zh && !en) {
    if (raw && hasCjk(raw)) zh = raw;
    else if (raw) en = raw;
  } else if (!zh && raw && raw !== en && hasCjk(raw)) {
    zh = raw;
  } else if (!en && raw && raw !== zh && !hasCjk(raw)) {
    en = raw;
  }

  if (!zh && en) zh = en;
  return { raw, zh, en };
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

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

const normalizeCombos = (
  variations: unknown,
  variantImageByName: Map<string, string>,
  fallbackWeightGrams: number | null
): VariantCombo[] => {
  const combos = Array.isArray((variations as any)?.combos)
    ? ((variations as any).combos as any[])
    : [];
  return combos.map((combo, index) => {
    const row = combo && typeof combo === "object" ? (combo as Record<string, unknown>) : {};
    const t1 = buildLangPair(
      row,
      "t1",
      ["t1_zh", "t1Zh", "t1_cn", "t1Cn", "t1Chinese"],
      ["t1_en", "t1En", "t1English"]
    );
    const t2 = buildLangPair(
      row,
      "t2",
      ["t2_zh", "t2Zh", "t2_cn", "t2Cn", "t2Chinese"],
      ["t2_en", "t2En", "t2English"]
    );
    const t3 = buildLangPair(
      row,
      "t3",
      ["t3_zh", "t3Zh", "t3_cn", "t3Cn", "t3Chinese"],
      ["t3_en", "t3En", "t3English"]
    );
    const comboNameCandidates = [
      t1.raw,
      t1.zh,
      t1.en,
      t2.raw,
      t2.zh,
      t2.en,
      t3.raw,
      t3.zh,
      t3.en,
    ].filter(Boolean);
    const comboNamesStrict = comboNameCandidates
      .map((entry) => normalizeNameStrict(entry))
      .filter(Boolean);
    const comboNamesLoose = comboNameCandidates
      .map((entry) => normalizeNameLoose(entry))
      .filter(Boolean);
    const imageUrl =
      comboNamesStrict
        .map((key) => variantImageByName.get(key) || "")
        .find(Boolean) ||
      comboNamesLoose
        .map((key) => variantImageByName.get(key) || "")
        .find(Boolean) || "";

    const details =
      row.details && typeof row.details === "object"
        ? (row.details as Record<string, unknown>)
        : {};
    const weightRaw = pickText(
      row.weightRaw,
      row.weight_raw,
      row.weight,
      row.skuWeight,
      row.sku_weight,
      row.weightGrams,
      row.weight_grams,
      details["重量"],
      details.weight
    );
    const weightGrams = asWeightGrams(weightRaw) ?? fallbackWeightGrams;

    return {
      index,
      t1: t1.raw,
      t2: t2.raw,
      t3: t3.raw,
      t1_zh: t1.zh || undefined,
      t1_en: t1.en || undefined,
      t2_zh: t2.zh || undefined,
      t2_en: t2.en || undefined,
      t3_zh: t3.zh || undefined,
      t3_en: t3.en || undefined,
      image_url: imageUrl || undefined,
      price_raw: pickText(
        row.priceRaw,
        row.price_raw,
        row.priceText,
        row.price_text,
        row.skuPrice,
        row.sku_price,
        row.salePrice,
        row.sale_price,
        row.price
      ),
      price:
        asNumber(row.price) ??
        asNumber(row.salePrice) ??
        asNumber(row.sale_price) ??
        asNumber(row.skuPrice) ??
        asNumber(row.sku_price) ??
        asPriceNumber(
          pickText(
            row.priceRaw,
            row.price_raw,
            row.priceText,
            row.price_text
          )
        ),
      weight_raw: weightRaw || undefined,
      weight_grams: Number.isFinite(Number(weightGrams))
        ? Number(weightGrams)
        : null,
    };
  });
};

const normalizePacks = (raw: unknown) => {
  const text = asText(raw);
  if (!text) return [] as number[];
  const values = text
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0 && entry <= 999);
  return Array.from(new Set(values));
};

const normalizeSelectionIndexes = (raw: unknown, maxCount: number) => {
  const values = Array.isArray(raw) ? raw : [];
  const out = values
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry < maxCount);
  return Array.from(new Set(out));
};

async function loadSelection(adminClient: NonNullable<ReturnType<typeof getAdminClient>>, provider: string, productId: string) {
  const { data, error } = await adminClient
    .from("discovery_production_supplier_selection")
    .select("provider, product_id, selected_offer")
    .eq("provider", provider)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as
    | {
        provider: string;
        product_id: string;
        selected_offer?: Record<string, unknown> | null;
      }
    | null;
}

async function loadPayloadCombos(selection: { selected_offer?: Record<string, unknown> | null }) {
  const selectedOffer = selection?.selected_offer;
  if (!selectedOffer || typeof selectedOffer !== "object") {
    return { combos: [] as VariantCombo[], type1Label: "", type2Label: "", type3Label: "" };
  }
  const payloadPath = safeExtractorJsonPath(selectedOffer._production_payload_file_path);
  if (!payloadPath) {
    return { combos: [] as VariantCombo[], type1Label: "", type2Label: "", type3Label: "" };
  }
  const payload = await loadJsonFile(payloadPath);
  const item =
    Array.isArray(payload) && payload.length > 0
      ? payload[0]
      : payload && typeof payload === "object" && Array.isArray((payload as any).items)
        ? (payload as any).items[0]
        : payload;
  const variations = item && typeof item === "object" ? (item as any).variations : null;
  const fallbackWeightGrams = (() => {
    const weights = Array.isArray((item as any)?.product_weights_1688)
      ? ((item as any).product_weights_1688 as unknown[])
      : [];
    const candidates: unknown[] = [
      ...weights,
      (item as any)?.weight_grams,
      (item as any)?.weight,
      (item as any)?.product_weight_1688,
      (variations as any)?.weight,
      (variations as any)?.weight_grams,
      (variations as any)?.defaultWeight,
    ];
    for (const candidate of candidates) {
      const grams = asWeightGrams(candidate);
      if (Number.isFinite(Number(grams)) && Number(grams) > 0) {
        return Number(grams);
      }
    }
    return null;
  })();
  const variantImages = Array.isArray((item as any)?.variant_images_1688)
    ? ((item as any).variant_images_1688 as Array<Record<string, unknown>>)
    : [];
  const variantImageByName = new Map<string, string>();
  for (const row of variantImages) {
    const strictName = normalizeNameStrict(row?.name);
    const looseName = normalizeNameLoose(row?.name);
    const url = asText((row as any)?.url_full || (row as any)?.url);
    if (!url) continue;
    if (strictName && !variantImageByName.has(strictName)) {
      variantImageByName.set(strictName, url);
    }
    if (looseName && !variantImageByName.has(looseName)) {
      variantImageByName.set(looseName, url);
    }
  }

  return {
    combos: normalizeCombos(variations, variantImageByName, fallbackWeightGrams),
    type1Label: asText((variations as any)?.type1Label),
    type2Label: asText((variations as any)?.type2Label),
    type3Label: asText((variations as any)?.type3Label),
  };
}

const extractJsonFromText = (text: string) => {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const translateVariantCombosBestEffort = async (combos: VariantCombo[]) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || combos.length === 0) return combos;

  const targets: Array<{ idx: number; field: "t1" | "t2" | "t3"; zh: string }> = [];
  const unique = new Set<string>();
  combos.forEach((combo, idx) => {
    (["t1", "t2", "t3"] as const).forEach((field) => {
      const zh = asText((combo as any)[`${field}_zh`] || (combo as any)[field]);
      const en = asText((combo as any)[`${field}_en`]);
      if (!zh || !hasCjk(zh) || en) return;
      const key = `${field}:${zh}`;
      if (!unique.has(key)) unique.add(key);
      targets.push({ idx, field, zh });
    });
  });
  if (targets.length === 0) return combos;

  // Fill from in-memory cache first (fast path for repeated opens).
  const prefilled = combos.map((combo) => ({ ...combo }));
  let missingCount = 0;
  prefilled.forEach((combo) => {
    (["t1", "t2", "t3"] as const).forEach((field) => {
      const zh = asText((combo as any)[`${field}_zh`] || (combo as any)[field]);
      const en = asText((combo as any)[`${field}_en`]);
      if (!zh || en || !hasCjk(zh)) return;
      const cached = variantTranslationCache.get(zh);
      if (cached) {
        (combo as any)[`${field}_en`] = cached;
      } else {
        missingCount += 1;
      }
    });
  });
  if (missingCount === 0) return prefilled;

  const uniqueTitles = Array.from(
    new Set(
      targets
        .map((t) => t.zh)
        .filter((title) => !variantTranslationCache.has(title))
    )
  ).slice(0, 40);
  if (uniqueTitles.length === 0) return prefilled;
  const prompt = [
    "Translate this title to English, maximum 80 characters.",
    "Return JSON only.",
    'Return format: { "items": [ { "source": "...", "english_title": "..." } ] }',
    "",
    "Titles:",
    ...uniqueTitles.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");

  const models = Array.from(
    new Set(
      [
        process.env.SUPPLIER_VARIANT_TRANSLATE_MODEL,
        "gpt-5-mini",
        "gpt-5-nano",
        process.env.SUPPLIER_TRANSLATE_MODEL,
        process.env.OPENAI_EDIT_MODEL,
      ]
        .map((v) => asText(v))
        .filter(Boolean)
    )
  );
  let parsed: any = null;
  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const result = await response.json().catch(() => null);
      parsed = extractJsonFromText(String(result?.choices?.[0]?.message?.content || ""));
      if (parsed) break;
    } catch {
      // try next model
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!parsed) return prefilled;

  const translations = new Map<string, string>();
  const items = Array.isArray((parsed as any)?.items) ? (parsed as any).items : [];
  items.forEach((row: any, i: number) => {
    const source = asText(row?.source || uniqueTitles[i]);
    const english = asText(
      row?.english_title ||
        row?.englishTitle ||
        row?.title_en ||
        row?.translation ||
        row?.english
    ).slice(0, 80);
    if (!source || !english) return;
    translations.set(source, english);
    translations.set(normalizeVariantTextKey(source), english);
    variantTranslationCache.set(source, english);
    variantTranslationCache.set(normalizeVariantTextKey(source), english);
  });
  if (translations.size === 0) return prefilled;

  return prefilled.map((combo) => {
    const next = { ...combo };
    (["t1", "t2", "t3"] as const).forEach((field) => {
      const zh = asText((next as any)[`${field}_zh`] || (next as any)[field]);
      const en = asText((next as any)[`${field}_en`]);
      if (!zh || en || !hasCjk(zh)) return;
      const translated = translations.get(zh) || translations.get(normalizeVariantTextKey(zh));
      if (translated) (next as any)[`${field}_en`] = translated;
    });
    return next;
  });
};

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const provider = asText(request.nextUrl.searchParams.get("provider"));
  const productId = asText(request.nextUrl.searchParams.get("product_id"));
  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  try {
    const selection = await loadSelection(adminClient, provider, productId);
    if (!selection) {
      return NextResponse.json({ error: "No selected supplier found." }, { status: 404 });
    }
    const selectedOffer =
      selection.selected_offer && typeof selection.selected_offer === "object"
        ? selection.selected_offer
        : {};
    const { combos, type1Label, type2Label, type3Label } = await loadPayloadCombos(selection);
    const translatedCombos = await translateVariantCombosBestEffort(combos);
    const saved = (selectedOffer as any)?._production_variant_selection;
    const savedIndexes = normalizeSelectionIndexes(
      saved && typeof saved === "object" ? (saved as any).selected_combo_indexes : [],
      combos.length
    );
    const savedPacksText =
      saved && typeof saved === "object" ? asText((saved as any).packs_text) : "";
    const packsText =
      savedPacksText ||
      asText((selectedOffer as any)?._production_variant_packs_text);

    return NextResponse.json({
      provider,
      product_id: productId,
      type1_label: type1Label,
      type2_label: type2Label,
      type3_label: type3Label,
      available_count: translatedCombos.length,
      combos: translatedCombos,
      selected_combo_indexes: savedIndexes,
      packs_text: packsText,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load variants." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const provider = asText((body as any).provider);
  const productId = asText((body as any).product_id);
  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  try {
    const selection = await loadSelection(adminClient, provider, productId);
    if (!selection) {
      return NextResponse.json({ error: "No selected supplier found." }, { status: 404 });
    }

    const selectedOffer =
      selection.selected_offer && typeof selection.selected_offer === "object"
        ? { ...selection.selected_offer }
        : {};
    const { combos, type1Label, type2Label, type3Label } = await loadPayloadCombos(selection);
    const selectedIndexes = normalizeSelectionIndexes(
      (body as any).selected_combo_indexes,
      combos.length
    );
    const packsText = asText((body as any).packs_text);
    const packs = normalizePacks(packsText);

    const selectionPayload = {
      selected_combo_indexes: selectedIndexes,
      selected_count: selectedIndexes.length,
      available_count: combos.length,
      packs_text: packsText,
      packs,
      type1_label: type1Label,
      type2_label: type2Label,
      type3_label: type3Label,
      updated_at: new Date().toISOString(),
    };

    (selectedOffer as any)._production_variant_selection = selectionPayload;
    (selectedOffer as any)._production_variant_available_count = combos.length;
    (selectedOffer as any)._production_variant_selected_count = selectedIndexes.length;
    (selectedOffer as any)._production_variant_packs = packs;
    (selectedOffer as any)._production_variant_packs_text = packsText;

    const { error: updateError } = await adminClient
      .from("discovery_production_supplier_selection")
      .update({
        selected_offer: selectedOffer,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", provider)
      .eq("product_id", productId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      provider,
      product_id: productId,
      available_count: combos.length,
      selected_combo_indexes: selectedIndexes,
      selected_count: selectedIndexes.length,
      packs,
      packs_text: packsText,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save variants." },
      { status: 500 }
    );
  }
}
