import fs from "fs";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PROMPT_PATH =
  process.env.DRAFT_REWRITE_PROMPT_PATH ||
  process.env.DRAFT_REWRITE_PROMPT ||
  "/srv/shopify-sync/api/prompts/draft-rewrite.txt";
const MODEL =
  process.env.DRAFT_REWRITE_MODEL ||
  process.env.OPENAI_EDIT_MODEL ||
  "gpt-4.1";

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

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value);

const toRowValue = (value: unknown) =>
  typeof value === "string" ? value : value == null ? "" : String(value);

const normalizeRawRow = (raw: unknown) => {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
};

const buildFallbackRow = (row: Record<string, unknown>) => ({
  SKU: asText(row.draft_spu),
  SE_shorttitle: asText(row.draft_mf_product_short_title || row.draft_title),
  SE_longtitle: asText(row.draft_mf_product_long_title || row.draft_title),
  SE_subtitle: asText(row.draft_mf_product_subtitle || row.draft_subtitle),
  SE_bullets_short: asText(row.draft_mf_product_bullets_short),
  SE_bullets: asText(row.draft_mf_product_bullets),
  SE_bullets_long: asText(row.draft_mf_product_bullets_long),
  SE_description_main: asText(row.draft_product_description_main_html),
  SE_description_short: asText(
    row.draft_mf_product_description_short_html || row.draft_description_html
  ),
  SE_description_extended: asText(row.draft_mf_product_description_extended_html),
  SE_specifications: asText(row.draft_mf_product_specs),
});

const mapRowToDraftFields = (
  row: Record<string, unknown>,
  current: Record<string, unknown>
) => {
  const shortTitle = asText(row.SE_shorttitle || current.draft_mf_product_short_title);
  const longTitle = asText(row.SE_longtitle || current.draft_mf_product_long_title);
  const subtitle = asText(row.SE_subtitle || current.draft_mf_product_subtitle);
  const mainDesc = asText(
    row.SE_description_main || current.draft_product_description_main_html
  );
  const shortDesc = asText(
    row.SE_description_short ||
      current.draft_mf_product_description_short_html ||
      current.draft_description_html
  );
  const extendedDesc = asText(
    row.SE_description_extended || current.draft_mf_product_description_extended_html
  );
  const bulletsShort = asText(
    row.SE_bullets_short || current.draft_mf_product_bullets_short
  );
  const bullets = asText(row.SE_bullets || current.draft_mf_product_bullets);
  const bulletsLong = asText(
    row.SE_bullets_long || current.draft_mf_product_bullets_long
  );
  const specs = asText(row.SE_specifications || current.draft_mf_product_specs);

  return {
    draft_title: longTitle || shortTitle || asText(current.draft_title),
    draft_subtitle: subtitle || asText(current.draft_subtitle),
    draft_description_html: shortDesc || mainDesc || asText(current.draft_description_html),
    draft_product_description_main_html: mainDesc,
    draft_mf_product_description_short_html: shortDesc,
    draft_mf_product_description_extended_html: extendedDesc,
    draft_mf_product_short_title: shortTitle,
    draft_mf_product_long_title: longTitle,
    draft_mf_product_subtitle: subtitle,
    draft_mf_product_bullets_short: bulletsShort,
    draft_mf_product_bullets: bullets,
    draft_mf_product_bullets_long: bulletsLong,
    draft_mf_product_specs: specs,
  };
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

  const { id, instruction } = body as { id?: string; instruction?: string };
  if (!id || !instruction || !instruction.trim()) {
    return NextResponse.json({ error: "Missing instruction." }, { status: 400 });
  }

  const { data, error } = await adminClient
    .from("draft_products")
    .select(
      "id,draft_spu,draft_title,draft_subtitle,draft_description_html,draft_product_description_main_html,draft_mf_product_description_short_html,draft_mf_product_description_extended_html,draft_mf_product_short_title,draft_mf_product_long_title,draft_mf_product_subtitle,draft_mf_product_bullets_short,draft_mf_product_bullets,draft_mf_product_bullets_long,draft_mf_product_specs,draft_raw_row"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  const rawRow = normalizeRawRow(data.draft_raw_row) ?? buildFallbackRow(data);
  if (!fs.existsSync(PROMPT_PATH)) {
    return NextResponse.json({ error: "Prompt file missing." }, { status: 500 });
  }
  const promptTemplate = fs.readFileSync(PROMPT_PATH, "utf8");

  const payload = {
    text_output: [rawRow],
    variation_output: [],
  };
  const editNotes = [
    {
      sku: asText(data.draft_spu),
      description_edit_notes: instruction.trim(),
    },
  ];

  const prompt = promptTemplate
    .replace("{{ORIGINAL_JSON}}", JSON.stringify(payload, null, 2))
    .replace("{{NEW_INFO}}", JSON.stringify(editNotes, null, 2));

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
  }

  const allowJsonFormat =
    String(process.env.DRAFT_REWRITE_RESPONSE_FORMAT || "").toLowerCase() !== "false";
  const bodyPayload: Record<string, unknown> = {
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  };
  if (allowJsonFormat) {
    bodyPayload.response_format = { type: "json_object" };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(bodyPayload),
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
  if (!parsed) {
    return NextResponse.json({ error: "Unable to parse model response." }, { status: 500 });
  }

  let nextRow: Record<string, unknown> | null = null;
  if (Array.isArray((parsed as any).text_output) && (parsed as any).text_output[0]) {
    nextRow = (parsed as any).text_output[0];
  } else if ((parsed as any).updated_json && typeof (parsed as any).updated_json === "object") {
    nextRow = (parsed as any).updated_json;
  } else if ((parsed as any).text_output && typeof (parsed as any).text_output === "object") {
    nextRow = (parsed as any).text_output;
  }

  if (!nextRow) {
    return NextResponse.json({ error: "No rewritten row returned." }, { status: 500 });
  }

  const updates = mapRowToDraftFields(nextRow, data as Record<string, unknown>);

  return NextResponse.json({
    raw_row: nextRow,
    updates,
  });
}
