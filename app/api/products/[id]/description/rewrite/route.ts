import fs from "fs";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PROMPT_PATH =
  process.env.DRAFT_REWRITE_PROMPT_PATH ||
  process.env.DRAFT_REWRITE_PROMPT ||
  "/srv/shopify-sync/api/prompts/draft-rewrite.txt";
const MODEL =
  process.env.DRAFT_REWRITE_MODEL ||
  process.env.OPENAI_EDIT_MODEL ||
  "gpt-4.1";

const PRODUCT_META_KEYS = [
  "description_short",
  "description_extended",
  "short_title",
  "long_title",
  "subtitle",
  "subtitle_sv",
  "bullets_short",
  "bullets",
  "bullets_long",
  "specs",
];
const PRODUCT_META_NAMESPACES = ["product_global", "product.global"];

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

const normalizeHtml = (value: string) =>
  value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const toText = (value: unknown) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const normalizeListText = (value: unknown) => {
  const raw = toText(value).trim();
  if (!raw) return "";
  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => toText(entry).trim()).filter(Boolean).join("\n");
      }
    } catch {
      // fall through
    }
  }
  return raw;
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
  | { ok: true; adminClient: AdminClient }
> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return {
      ok: false,
      status: 500,
      error: "Server is missing Supabase credentials.",
    };
  }

  return { ok: true, adminClient: adminClient as AdminClient };
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { instruction, current } = body as {
    instruction?: string;
    current?: Record<string, unknown>;
  };

  if (!instruction || !instruction.trim()) {
    return NextResponse.json({ error: "Missing instruction." }, { status: 400 });
  }

  const { adminClient } = adminCheck;

  const { data: product, error: productError } = await adminClient
    .from("catalog_products")
    .select("id, spu, title, subtitle, description_html")
    .eq("id", id)
    .maybeSingle();

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  let metaValuesByKey = new Map<string, Map<string, string>>();
  const { data: metaDefs } = await adminClient
    .from("metafield_definitions")
    .select("id, key, namespace")
    .eq("resource", "catalog_product")
    .in("key", PRODUCT_META_KEYS)
    .in("namespace", PRODUCT_META_NAMESPACES);

  const metaDefMap = new Map(
    metaDefs?.map((def) => [def.id, def]) ?? []
  );
  const metaDefIds = Array.from(metaDefMap.keys());

  if (metaDefIds.length > 0) {
    const { data: metaValues } = await adminClient
      .from("metafield_values")
      .select("definition_id, value_text, value, value_number, value_json")
      .eq("target_type", "product")
      .eq("target_id", id)
      .in("definition_id", metaDefIds);

    metaValues?.forEach((row) => {
      const def = metaDefMap.get(row.definition_id);
      if (!def) return;
      let text: string | null = null;
      if (row.value_text) {
        text = row.value_text;
      } else if (row.value_number !== null && row.value_number !== undefined) {
        text = String(row.value_number);
      } else if (typeof row.value === "string") {
        text = row.value;
      } else if (row.value_json !== null && row.value_json !== undefined) {
        text = JSON.stringify(row.value_json);
      } else if (row.value != null) {
        text = JSON.stringify(row.value);
      }

      if (!text) return;
      const key = def.key ?? "";
      const namespace = def.namespace ?? "";
      const byNamespace = metaValuesByKey.get(key) ?? new Map<string, string>();
      byNamespace.set(namespace, text);
      metaValuesByKey.set(key, byNamespace);
    });
  }

  const pickMetaValue = (key: string) => {
    const byNamespace = metaValuesByKey.get(key);
    if (!byNamespace) return null;
    for (const namespace of PRODUCT_META_NAMESPACES) {
      const value = byNamespace.get(namespace);
      if (value) return value;
    }
    return null;
  };

  const resolveCurrent = (key: string, fallback: string | null) => {
    if (current && typeof current[key] === "string") {
      return String(current[key]);
    }
    return fallback ?? "";
  };

  const descriptionHtml = product.description_html ?? "";
  const normalizedMain = descriptionHtml ? normalizeHtml(descriptionHtml) : "";

  const shortTitle = resolveCurrent(
    "short_title",
    pickMetaValue("short_title")
  );
  const longTitle = resolveCurrent(
    "long_title",
    pickMetaValue("long_title") ?? product.title
  );
  const subtitle = resolveCurrent(
    "subtitle",
    pickMetaValue("subtitle") ?? pickMetaValue("subtitle_sv") ?? product.subtitle
  );
  const descriptionShort = resolveCurrent(
    "description_short",
    pickMetaValue("description_short")
  );
  const descriptionExtended = resolveCurrent(
    "description_extended",
    pickMetaValue("description_extended")
  );
  const bulletsShort = resolveCurrent(
    "bullets_short",
    pickMetaValue("bullets_short")
  );
  const bullets = resolveCurrent("bullets", pickMetaValue("bullets"));
  const bulletsLong = resolveCurrent(
    "bullets_long",
    pickMetaValue("bullets_long")
  );
  const specs = resolveCurrent("specs", pickMetaValue("specs"));
  const descriptionMain = resolveCurrent("description_main", normalizedMain);

  const originalRow = {
    SKU: product.spu ?? String(product.id ?? id),
    SE_shorttitle: normalizeListText(shortTitle),
    SE_longtitle: normalizeListText(longTitle),
    SE_subtitle: normalizeListText(subtitle),
    SE_bullets_short: normalizeListText(bulletsShort),
    SE_bullets: normalizeListText(bullets),
    SE_bullets_long: normalizeListText(bulletsLong),
    SE_description_main: normalizeListText(descriptionMain),
    SE_description_short: normalizeListText(descriptionShort),
    SE_description_extended: normalizeListText(descriptionExtended),
    SE_specifications: normalizeListText(specs),
  };

  if (!fs.existsSync(PROMPT_PATH)) {
    return NextResponse.json({ error: "Prompt file missing." }, { status: 500 });
  }
  const promptTemplate = fs.readFileSync(PROMPT_PATH, "utf8");

  const payload = {
    text_output: [originalRow],
    variation_output: [],
  };
  const editNotes = [
    {
      sku: product.spu ?? String(product.id ?? id),
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

  const updates = {
    short_title: normalizeListText((nextRow as any).SE_shorttitle),
    long_title: normalizeListText((nextRow as any).SE_longtitle),
    subtitle: normalizeListText((nextRow as any).SE_subtitle),
    bullets_short: normalizeListText((nextRow as any).SE_bullets_short),
    bullets: normalizeListText((nextRow as any).SE_bullets),
    bullets_long: normalizeListText((nextRow as any).SE_bullets_long),
    description_main: normalizeListText((nextRow as any).SE_description_main),
    description_short: normalizeListText((nextRow as any).SE_description_short),
    description_extended: normalizeListText((nextRow as any).SE_description_extended),
    specs: normalizeListText((nextRow as any).SE_specifications),
  };

  return NextResponse.json({
    raw_row: nextRow,
    updates,
  });
}
