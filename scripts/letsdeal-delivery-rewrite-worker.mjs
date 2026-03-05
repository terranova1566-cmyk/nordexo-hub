#!/usr/bin/env node

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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

const OPENAI_ENDPOINT =
  process.env.OPENAI_CHAT_COMPLETIONS_URL || "https://api.openai.com/v1/chat/completions";
const MODEL_SWEDISH =
  String(process.env.LETSDEAL_REWRITE_MODEL || "gpt-5.2").trim() || "gpt-5.2";
const MODEL_NORWEGIAN =
  String(process.env.LETSDEAL_TRANSLATE_MODEL || MODEL_SWEDISH).trim() || MODEL_SWEDISH;
const MAX_ATTEMPTS = Math.max(1, Number(process.env.LETSDEAL_REWRITE_MAX_ATTEMPTS || 3));
const REQUEST_TIMEOUT_MS = Math.max(
  10_000,
  Number(process.env.LETSDEAL_REWRITE_REQUEST_TIMEOUT_MS || 60_000)
);

const SYSTEM_PROMPT_SWEDISH = `
Du skriver produkttexter för LetsDeal i Sverige.

Svara endast med giltig JSON med exakt denna struktur:
{
  "rubrik_1": "...",
  "rubrik_2": "...",
  "summary": "...",
  "produktinformation": ["...", "..."]
}

Regler:
- Rubrik 1: max 70 tecken, 3-12 ord, kort och faktabaserad.
- Rubrik 2: max 70 tecken, beskriver huvudfunktion + användning.
- Summary: 200-450 tecken, 2-4 meningar, neutral och informativ ton.
- Produktinformation: lista med viktiga punkter. Inga leverans-, frakt-, retur- eller kampanjuppgifter.
- Ingen marknadsföringshype, inga superlativ, inga emojis.
- Använd korrekt, naturlig svenska.
`.trim();

const SYSTEM_PROMPT_NORWEGIAN = `
Du oversetter svensk LetsDeal-produkttekst til norsk bokmal.

Svara endast med giltig JSON med exakt samma struktur:
{
  "rubrik_1": "...",
  "rubrik_2": "...",
  "summary": "...",
  "produktinformation": ["...", "..."]
}

Regler:
- Behold betydning, fakta og struktur.
- Ingen leverings-, frakt-, retur- eller kampanjeinformasjon.
- Naturlig, korrekt norsk bokmal.
`.trim();

const asText = (value) => (value === null || value === undefined ? "" : String(value).trim());

const parseArgs = (argv) => {
  const out = {
    listId: "",
    maxJobs: 0,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = asText(argv[i]);
    const value = asText(argv[i + 1]);
    if (key === "--list-id" && value) {
      out.listId = value;
      i += 1;
      continue;
    }
    if (key === "--max-jobs" && value) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        out.maxJobs = Math.floor(parsed);
      }
      i += 1;
      continue;
    }
  }

  return out;
};

const normalizeHtml = (value) =>
  asText(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const extractJsonFromText = (text) => {
  const raw = asText(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const splitLines = (value) =>
  asText(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\u2022]\s*/, "").trim())
    .filter(Boolean);

const splitParagraphs = (value) =>
  asText(value)
    .split(/\n\s*\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const isDeliveryLine = (value) => {
  const line = asText(value).toLowerCase();
  if (!line) return false;
  return /(leverans|levering|frakt|retur|spår|sporning|arbetsdag|working day|tracking)/i.test(
    line
  );
};

const uniqueLines = (items, limit = 80) => {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const line = asText(item);
    if (!line || isDeliveryLine(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= limit) break;
  }
  return out;
};

const normalizeProductInformation = (value) => {
  if (Array.isArray(value)) {
    return uniqueLines(value, 24);
  }
  const text = asText(value);
  if (!text) return [];
  return uniqueLines(
    text
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*\u2022]\s*/, "").trim())
      .filter(Boolean),
    24
  );
};

const normalizeLetsdealPayload = (input) => {
  const record = input && typeof input === "object" ? input : {};

  const rubrik1 = asText(record.rubrik_1 || record.rubrik1 || record.title_1 || record.title1);
  const rubrik2 = asText(record.rubrik_2 || record.rubrik2 || record.title_2 || record.title2);
  const summary = asText(record.summary || record.beskrivning || record.description);
  const produktinformation = normalizeProductInformation(
    record.produktinformation || record.product_information || record.info
  );

  if (!rubrik1 || !rubrik2 || !summary || produktinformation.length === 0) {
    return null;
  }

  return {
    rubrik_1: rubrik1.slice(0, 70),
    rubrik_2: rubrik2.slice(0, 70),
    summary,
    produktinformation,
  };
};

const formatProductInformationText = (items) =>
  items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "";

const hashSource = (value) => {
  try {
    return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  } catch {
    return null;
  }
};

const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase service role credentials.");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const callOpenAiJson = async ({ apiKey, model, messages }) => {
  const payload = {
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages,
  };

  const response = await fetchWithTimeout(
    OPENAI_ENDPOINT,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    },
    REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI error ${response.status}: ${text.slice(0, 300)}`);
  }

  const parsed = await response.json();
  const content = asText(parsed?.choices?.[0]?.message?.content);
  const json = extractJsonFromText(content);
  if (!json) {
    throw new Error("Model response did not contain valid JSON.");
  }

  return json;
};

const buildSourcePayload = ({ product, metaByKey }) => {
  const longTitle = asText(metaByKey.long_title || product?.title);
  const subtitle = asText(metaByKey.subtitle || metaByKey.subtitle_sv || product?.subtitle);
  const bullets = uniqueLines(
    [
      ...splitLines(metaByKey.bullets_long),
      ...splitLines(metaByKey.bullets),
      ...splitLines(metaByKey.bullets_short),
    ],
    40
  );

  const descriptionBlocks = uniqueLines(
    [
      ...splitParagraphs(metaByKey.description_short),
      ...splitParagraphs(normalizeHtml(product?.description_html)),
      ...splitParagraphs(metaByKey.description_extended),
    ],
    24
  );

  const specifications = uniqueLines(splitLines(metaByKey.specs), 40);

  return {
    product_id: asText(product?.id),
    sku: asText(product?.spu),
    title: longTitle,
    subtitle,
    bullets,
    description_blocks: descriptionBlocks,
    specifications,
  };
};

const toErrorMessage = (error) => {
  const text = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return asText(text).slice(0, 800) || "Unknown error";
};

const main = async () => {
  const args = parseArgs(process.argv);
  if (!args.listId) {
    throw new Error("Missing --list-id");
  }

  const apiKey = asText(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const supabase = getSupabaseClient();

  const { data: listRow, error: listError } = await supabase
    .from("product_manager_wishlists")
    .select("id")
    .eq("id", args.listId)
    .maybeSingle();

  if (listError) {
    throw new Error(listError.message);
  }
  if (!listRow?.id) {
    return;
  }

  const { data: metaDefs, error: metaDefsError } = await supabase
    .from("metafield_definitions")
    .select("id, key")
    .eq("resource", "catalog_product")
    .in("key", PRODUCT_META_KEYS)
    .in("namespace", PRODUCT_META_NAMESPACES);

  if (metaDefsError) {
    throw new Error(metaDefsError.message);
  }

  const definitionKeyById = new Map();
  const definitionIds = [];
  (metaDefs ?? []).forEach((row) => {
    const id = asText(row.id);
    const key = asText(row.key);
    if (!id || !key) return;
    if (definitionKeyById.has(id)) return;
    definitionKeyById.set(id, key);
    definitionIds.push(id);
  });

  const claimNextJob = async () => {
    const { data: candidate, error: candidateError } = await supabase
      .from("letsdeal_delivery_jobs")
      .select("id, wishlist_id, product_id, status, attempt_count")
      .eq("wishlist_id", args.listId)
      .eq("status", "queued")
      .order("queued_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (candidateError) {
      throw new Error(candidateError.message);
    }
    if (!candidate?.id) return null;

    const nowIso = new Date().toISOString();
    const nextAttempt = Math.max(0, Number(candidate.attempt_count || 0)) + 1;

    const { data: claimed, error: claimError } = await supabase
      .from("letsdeal_delivery_jobs")
      .update({
        status: "running",
        attempt_count: nextAttempt,
        started_at: nowIso,
        updated_at: nowIso,
        error_message: null,
      })
      .eq("id", candidate.id)
      .eq("status", "queued")
      .select("id, wishlist_id, product_id, attempt_count")
      .maybeSingle();

    if (claimError) {
      throw new Error(claimError.message);
    }

    return claimed?.id ? claimed : null;
  };

  const markCompleted = async (jobId) => {
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("letsdeal_delivery_jobs")
      .update({
        status: "completed",
        completed_at: nowIso,
        updated_at: nowIso,
        error_message: null,
      })
      .eq("id", jobId);
    if (error) {
      throw new Error(error.message);
    }
  };

  const markFailed = async (jobId, attemptCount, message) => {
    const nowIso = new Date().toISOString();
    const shouldRetry = attemptCount < MAX_ATTEMPTS;

    const { error } = await supabase
      .from("letsdeal_delivery_jobs")
      .update({
        status: shouldRetry ? "queued" : "failed",
        updated_at: nowIso,
        error_message: message,
        completed_at: shouldRetry ? null : nowIso,
      })
      .eq("id", jobId);

    if (error) {
      throw new Error(error.message);
    }
  };

  const loadProductSource = async (productId) => {
    const { data: product, error: productError } = await supabase
      .from("catalog_products")
      .select("id, spu, title, subtitle, description_html")
      .eq("id", productId)
      .maybeSingle();

    if (productError) {
      throw new Error(productError.message);
    }
    if (!product?.id) {
      throw new Error("Product not found.");
    }

    const metaByKey = {};
    if (definitionIds.length > 0) {
      const { data: metaValues, error: metaValuesError } = await supabase
        .from("metafield_values")
        .select("definition_id, value_text, value, value_number, value_json")
        .eq("target_type", "product")
        .eq("target_id", productId)
        .in("definition_id", definitionIds);

      if (metaValuesError) {
        throw new Error(metaValuesError.message);
      }

      for (const row of metaValues ?? []) {
        const definitionId = asText(row.definition_id);
        const key = definitionKeyById.get(definitionId);
        if (!key || metaByKey[key]) continue;

        let text = asText(row.value_text);
        if (!text && row.value_number !== null && row.value_number !== undefined) {
          text = asText(row.value_number);
        }
        if (!text && typeof row.value === "string") {
          text = asText(row.value);
        }
        if (!text && Array.isArray(row.value_json)) {
          text = row.value_json.map((entry) => asText(entry)).filter(Boolean).join("\n");
        }
        if (!text && row.value_json !== null && row.value_json !== undefined) {
          text = asText(JSON.stringify(row.value_json));
        }
        if (!text && row.value !== null && row.value !== undefined) {
          text = asText(JSON.stringify(row.value));
        }

        if (text) {
          metaByKey[key] = text;
        }
      }
    }

    return buildSourcePayload({ product, metaByKey });
  };

  const generateSwedish = async (sourcePayload) => {
    const json = await callOpenAiJson({
      apiKey,
      model: MODEL_SWEDISH,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT_SWEDISH,
        },
        {
          role: "user",
          content: `Kalla:\n${JSON.stringify(sourcePayload, null, 2)}`,
        },
      ],
    });

    const normalized = normalizeLetsdealPayload(json);
    if (!normalized) {
      throw new Error("Swedish rewrite response missing required fields.");
    }
    return normalized;
  };

  const translateNorwegian = async (swedishPayload) => {
    const json = await callOpenAiJson({
      apiKey,
      model: MODEL_NORWEGIAN,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT_NORWEGIAN,
        },
        {
          role: "user",
          content: `Oversett dette til norsk bokmal og behold JSON-strukturen:\n${JSON.stringify(
            swedishPayload,
            null,
            2
          )}`,
        },
      ],
    });

    const normalized = normalizeLetsdealPayload(json);
    if (!normalized) {
      throw new Error("Norwegian translation response missing required fields.");
    }
    return normalized;
  };

  const saveProductTexts = async ({ productId, sourcePayload, swedish, norwegian }) => {
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("letsdeal_product_texts")
      .upsert(
        {
          product_id: productId,
          title_1_sv: swedish.rubrik_1,
          title_2_sv: swedish.rubrik_2,
          summary_sv: swedish.summary,
          product_information_sv: formatProductInformationText(swedish.produktinformation),
          title_1_no: norwegian.rubrik_1,
          title_2_no: norwegian.rubrik_2,
          summary_no: norwegian.summary,
          product_information_no: formatProductInformationText(norwegian.produktinformation),
          model_sv: MODEL_SWEDISH,
          model_no: MODEL_NORWEGIAN,
          generated_at_sv: nowIso,
          generated_at_no: nowIso,
          source_hash: hashSource(sourcePayload),
          source_payload: sourcePayload,
          updated_at: nowIso,
        },
        { onConflict: "product_id" }
      );

    if (error) {
      throw new Error(error.message);
    }
  };

  let processed = 0;

  while (true) {
    if (args.maxJobs > 0 && processed >= args.maxJobs) {
      break;
    }

    const job = await claimNextJob();
    if (!job?.id) {
      break;
    }

    processed += 1;
    try {
      const sourcePayload = await loadProductSource(job.product_id);
      const swedish = await generateSwedish(sourcePayload);
      const norwegian = await translateNorwegian(swedish);

      await saveProductTexts({
        productId: job.product_id,
        sourcePayload,
        swedish,
        norwegian,
      });

      await markCompleted(job.id);
    } catch (error) {
      const message = toErrorMessage(error);
      const attemptCount = Math.max(0, Number(job.attempt_count || 0));
      await markFailed(job.id, attemptCount, message);
    }
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  console.error(`[letsdeal-delivery-rewrite-worker] ${message}`);
  process.exitCode = 1;
});
