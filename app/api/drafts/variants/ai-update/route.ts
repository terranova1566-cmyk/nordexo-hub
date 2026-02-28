import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MODEL =
  process.env.DRAFT_VARIANTS_AI_MODEL ||
  process.env.OPENAI_EDIT_MODEL ||
  "gpt-5.2";
const BIGINT_ID_RE = /^\d+$/;

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

const normalizeDraftId = (value: unknown) => {
  const text = asText(value);
  return BIGINT_ID_RE.test(text) ? text : null;
};

const normalizeSkuKey = (value: unknown) => asText(value).toLowerCase();

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

const sanitizeVariant = (value: unknown, fallbackSpu: string) => {
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
  const draft_option_combined_zh = buildCombinedOption({
    draft_option1,
    draft_option2,
    draft_option3,
    draft_option4,
    fallback: asText(raw.draft_option_combined_zh),
  });

  return {
    id: normalizeDraftId(raw.id),
    draft_spu: asText(raw.draft_spu || fallbackSpu),
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

type SanitizedVariant = NonNullable<ReturnType<typeof sanitizeVariant>>;

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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const spu = asText((body as Record<string, unknown>).spu);
  const instruction = asText((body as Record<string, unknown>).instruction);
  const inputVariants = Array.isArray((body as Record<string, unknown>).variants)
    ? ((body as Record<string, unknown>).variants as unknown[])
    : [];

  if (!spu) {
    return NextResponse.json({ error: "Missing SPU." }, { status: 400 });
  }
  if (!instruction) {
    return NextResponse.json({ error: "Missing instruction." }, { status: 400 });
  }
  if (inputVariants.length === 0) {
    return NextResponse.json({ error: "No variants to update." }, { status: 400 });
  }

  const normalizedInput = inputVariants
    .map((entry) => sanitizeVariant(entry, spu))
    .filter((entry): entry is SanitizedVariant => Boolean(entry));

  if (normalizedInput.length === 0) {
    return NextResponse.json({ error: "No valid variants in payload." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
  }

  const prompt = [
    "You are a product variant manager.",
    "Rewrite variant rows while keeping the same output schema.",
    "Return strict JSON with this shape only:",
    '{ "variants": [ { "id": string|null, "draft_spu": string, "draft_sku": string|null, "draft_option1": string|null, "draft_option2": string|null, "draft_option3": string|null, "draft_option4": string|null, "draft_option_combined_zh": string|null, "draft_price": number|null, "draft_weight": number|null, "draft_weight_unit": string|null, "draft_variant_image_url": string|null, "variation_color_se": string|null, "variation_size_se": string|null, "variation_other_se": string|null, "variation_amount_se": string|null, "draft_raw_row": object } ] }',
    "Rules:",
    "1) Keep draft_spu unchanged.",
    "2) Keep draft_sku unique.",
    "3) Keep values as plain text, no markdown.",
    "4) Keep output compatible with the same format as input.",
    "5) If unsure, preserve original values.",
    "",
    `SPU: ${spu}`,
    "",
    "User instruction:",
    instruction,
    "",
    "Current variants JSON:",
    JSON.stringify({ variants: normalizedInput }, null, 2),
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `OpenAI error (${response.status}): ${errText.slice(0, 300)}` },
      { status: 500 }
    );
  }

  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonFromText(content);
  if (!parsed || typeof parsed !== "object") {
    return NextResponse.json({ error: "Unable to parse model response." }, { status: 500 });
  }

  const outputCandidates = Array.isArray((parsed as Record<string, unknown>).variants)
    ? ((parsed as Record<string, unknown>).variants as unknown[])
    : Array.isArray(parsed)
      ? (parsed as unknown[])
      : [];

  const outputVariants = outputCandidates
    .map((entry) => sanitizeVariant(entry, spu))
    .filter((entry): entry is SanitizedVariant => Boolean(entry));

  if (outputVariants.length === 0) {
    return NextResponse.json(
      { error: "AI did not return any valid variants." },
      { status: 500 }
    );
  }

  const validInputIds = new Set(
    normalizedInput.map((entry) => entry.id).filter((entry): entry is string => Boolean(entry))
  );
  const inputIdBySkuKey = new Map<string, string>();
  normalizedInput.forEach((entry) => {
    const skuKey = normalizeSkuKey(entry.draft_sku);
    if (!skuKey || !entry.id) return;
    if (!inputIdBySkuKey.has(skuKey)) {
      inputIdBySkuKey.set(skuKey, entry.id);
    }
  });

  // Keep variant row identity stable: AI output may mutate ids.
  const reconciledVariants = outputVariants.map((entry) => {
    let id = entry.id && validInputIds.has(entry.id) ? entry.id : null;
    if (!id) {
      const skuKey = normalizeSkuKey(entry.draft_sku);
      id = skuKey ? inputIdBySkuKey.get(skuKey) ?? null : null;
    }
    return {
      ...entry,
      id,
    };
  });

  return NextResponse.json({
    ok: true,
    model: MODEL,
    variants: reconciledVariants,
  });
}
