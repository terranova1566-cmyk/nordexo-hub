#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  canonical1688OfferUrl,
  extractJsonFromText,
  hasCjk,
} from "../shared/1688/core.mjs";
import { run1688ImageSearch } from "../shared/1688/image-search-runner.mjs";

const TAXONOMY_WORKER_PATH =
  "/srv/nordexo-hub/scripts/product-suggestions-taxonomy-worker.mjs";
const SUGGESTIONS_DIR =
  process.env.PARTNER_PRODUCT_SUGGESTIONS_DIR ||
  "/srv/node-files/partner-product-suggestions";
const PUBLIC_TEMP_DIR = "/srv/incoming-scripts/uploads/public-temp-images";
const DEFAULT_PROVIDER = "partner_suggestions";
const DEFAULT_PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || process.env.HUB_PUBLIC_URL || "https://hub.nordexo.se";
const MAX_OFFERS = 10;

const asText = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const parseArgs = (argv) => {
  const out = {
    provider: DEFAULT_PROVIDER,
    ids: [],
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = asText(argv[i]);
    const value = asText(argv[i + 1]);
    if (key === "--provider" && value) {
      out.provider = value;
      i += 1;
      continue;
    }
    if (key === "--ids" && value) {
      out.ids = value
        .split(",")
        .map((entry) => asText(entry))
        .filter(Boolean);
      i += 1;
      continue;
    }
  }

  out.ids = Array.from(new Set(out.ids));
  return out;
};

const isHexId = (value) => /^[a-f0-9]{32}$/i.test(asText(value));

const suggestionPathForId = (id) => {
  const safe = asText(id);
  if (!/^[a-z0-9][a-z0-9_-]{5,80}$/i.test(safe)) return null;
  return path.join(SUGGESTIONS_DIR, `${safe}.json`);
};

const loadSuggestionRecord = async (id) => {
  const filePath = suggestionPathForId(id);
  if (!filePath) return null;
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

const saveSuggestionRecord = async (record) => {
  const filePath = suggestionPathForId(record?.id);
  if (!filePath) return;
  await fs.mkdir(SUGGESTIONS_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf8");
};

const updateSearchJob = async (record, patch) => {
  const now = new Date().toISOString();
  const prev = record && record.searchJob && typeof record.searchJob === "object" ? record.searchJob : {};
  const next = {
    status: asText(patch.status) || asText(prev.status) || "idle",
    queuedAt: patch.queuedAt ?? prev.queuedAt ?? null,
    startedAt: patch.startedAt ?? prev.startedAt ?? null,
    finishedAt: patch.finishedAt ?? prev.finishedAt ?? null,
    lastRunAt: patch.lastRunAt ?? now,
    error: patch.error ?? prev.error ?? null,
  };
  const updated = {
    ...(record && typeof record === "object" ? record : {}),
    searchJob: next,
  };
  await saveSuggestionRecord(updated);
  return updated;
};

const spawnTaxonomyWorkerForIds = (suggestionIds) => {
  const ids = Array.from(
    new Set((Array.isArray(suggestionIds) ? suggestionIds : []).map((entry) => asText(entry)).filter(Boolean))
  );
  if (ids.length === 0) return false;
  try {
    const child = spawn(process.execPath, [TAXONOMY_WORKER_PATH, "--ids", ids.join(",")], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
      },
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
};

const localImagePathFromSuggestion = (record) => {
  const candidates = [record?.mainImageUrl, record?.image?.publicPath]
    .map((entry) => asText(entry))
    .filter(Boolean);

  for (const candidate of candidates) {
    const match = candidate.match(/\/api\/public\/temp-images\/([a-f0-9]{32})/i);
    if (!match?.[1]) continue;
    const id = match[1];
    if (!isHexId(id)) continue;
    const filePath = path.join(PUBLIC_TEMP_DIR, `${id}.jpg`);
    return filePath;
  }

  return null;
};

const canonical1688OfferUrlFromResult = (offer) =>
  canonical1688OfferUrl({
    ...(offer && typeof offer === "object" ? offer : {}),
    detailUrl: asText(offer?.detailUrl || offer?.detail_url),
  });

const cleanSuggestionTitle = (value) => {
  const normalized = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[|]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
  if (!normalized) return "";
  return normalized.slice(0, 80);
};

const generateSuggestionTitleWithOpenAi = async (sourceTitle) => {
  const apiKey = asText(process.env.OPENAI_API_KEY);
  if (!apiKey) return "";

  const prompt = [
    "Convert this product title into a concise ENGLISH product noun title.",
    "Return JSON only with format: { \"title\": \"...\" }",
    "Rules:",
    "1) 2-8 words.",
    "2) Noun-focused product name only.",
    "3) No marketing terms (best, premium, hot, etc).",
    "4) Keep key attributes only when essential.",
    "",
    `Input title: ${sourceTitle}`,
  ].join("\n");

  const modelCandidates = Array.from(
    new Set(
      [
        process.env.SUGGESTION_TITLE_MODEL,
        "gpt-4o-mini",
        process.env.SUPPLIER_TRANSLATE_MODEL,
        process.env.OPENAI_EDIT_MODEL,
        "gpt-5-mini",
      ]
        .map((entry) => asText(entry))
        .filter(Boolean)
    )
  );

  for (const model of modelCandidates) {
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
      const content = asText(result?.choices?.[0]?.message?.content);
      const parsed = extractJsonFromText(content);
      const title = cleanSuggestionTitle(parsed?.title || parsed?.english_title || "");
      if (title) return title;
    } catch {
      // try next model
    } finally {
      clearTimeout(timeout);
    }
  }

  return "";
};

const updateSuggestionTitleFromOffersBestEffort = async (record, offers) => {
  if (!record || typeof record !== "object") return record;
  if (!Array.isArray(offers) || offers.length === 0) return record;
  const topOffer =
    offers.find((entry) => entry && typeof entry === "object") || null;
  if (!topOffer) return record;

  const sourceTitle = asText(topOffer.subject_en) || asText(topOffer.subject);
  if (!sourceTitle) return record;

  const aiTitle = await generateSuggestionTitleWithOpenAi(sourceTitle);
  const fallbackTitle = hasCjk(sourceTitle) ? "" : cleanSuggestionTitle(sourceTitle);
  const nextTitle = aiTitle || fallbackTitle;
  if (!nextTitle) return record;

  if (asText(record.title) === nextTitle) return record;
  const updated = { ...record, title: nextTitle };
  await saveSuggestionRecord(updated);
  return updated;
};

const queueTaxonomyForRecordIfNeeded = async (record) => {
  if (!record || typeof record !== "object") return record;
  const title = asText(record.title) || asText(record?.externalData?.title) || asText(record?.externalData?.rawTitle);
  if (!title) return record;

  const taxonomy =
    record.googleTaxonomy && typeof record.googleTaxonomy === "object"
      ? record.googleTaxonomy
      : {};
  const status = asText(taxonomy.status).toLowerCase();
  const sourceTitle = asText(taxonomy.sourceTitle);
  const pathText = asText(taxonomy.path);
  const needsQueue =
    status !== "running" &&
    (status === "idle" ||
      status === "error" ||
      !pathText ||
      (status === "done" && sourceTitle !== title));
  if (!needsQueue) return record;

  const queuedAt = new Date().toISOString();
  const updated = {
    ...record,
    googleTaxonomy: {
      ...taxonomy,
      status: "queued",
      sourceTitle: title,
      queuedAt,
      startedAt: null,
      finishedAt: null,
      updatedAt: queuedAt,
      error: null,
    },
  };
  await saveSuggestionRecord(updated);
  spawnTaxonomyWorkerForIds([updated.id]);
  return updated;
};

const runImageSearchByFile = (imagePath, limit = MAX_OFFERS) => {
  return run1688ImageSearch({
    publicBaseUrl: DEFAULT_PUBLIC_BASE_URL,
    imagePath,
    limit,
    page: 1,
    cpsFirst: false,
    includeRaw: false,
    pretty: false,
    timeoutMs: 70_000,
  });
};

const isRetriableSearchError = (message) => {
  const text = asText(message).toLowerCase();
  if (!text) return false;
  return (
    text.includes("handle image error") ||
    text.includes("image_fetch_error") ||
    text.includes("image fetch error") ||
    text.includes("timeout") ||
    text.includes("temporarily")
  );
};

const translateOffersBestEffort = async (offers) => {
  const apiKey = asText(process.env.OPENAI_API_KEY);
  if (!apiKey || !Array.isArray(offers) || offers.length === 0) return offers;

  const subjectsToTranslate = [];
  const seen = new Set();
  for (const offer of offers) {
    const subject = asText(offer?.subject);
    const subjectEn = asText(offer?.subject_en);
    if (!subject || (subjectEn && !hasCjk(subjectEn))) continue;
    if (seen.has(subject)) continue;
    seen.add(subject);
    subjectsToTranslate.push(subject);
  }
  if (subjectsToTranslate.length === 0) return offers;

  const limited = subjectsToTranslate.slice(0, 15);
  const prompt = [
    "You translate Chinese 1688 product titles into clean English for sourcing.",
    "Return JSON only.",
    'Return format: { "items": [ { "subject": "...", "english_title": "..." } ] }',
    "Rules:",
    "1) Remove marketing filler words and hype.",
    "2) Keep technical data: material, dimensions, model, pack count, and key specs.",
    "3) Keep clear product nouns and essential attributes.",
    "4) Output should be detailed but concise, max 120 characters.",
    "",
    "Titles to translate:",
    ...limited.map((title, idx) => `${idx + 1}. ${title}`),
  ].join("\n");

  const models = Array.from(
    new Set(
      [
        process.env.SUPPLIER_TRANSLATE_MODEL,
        "gpt-5-mini",
        "gpt-4o-mini",
        process.env.OPENAI_EDIT_MODEL,
      ]
        .map((entry) => asText(entry))
        .filter(Boolean)
    )
  );

  let parsed = null;
  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
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
      parsed = extractJsonFromText(asText(result?.choices?.[0]?.message?.content));
      if (parsed) break;
    } catch {
      // try next model
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!parsed) return offers;

  const map = new Map();
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  items.forEach((row, idx) => {
    const subject = asText(row?.subject || limited[idx]);
    const english = asText(
      row?.english_title ||
        row?.englishTitle ||
        row?.title_en ||
        row?.translation ||
        row?.english
    ).slice(0, 120);
    if (!subject || !english) return;
    map.set(subject, english);
  });
  if (map.size === 0) return offers;

  return offers.map((offer) => {
    const subject = asText(offer?.subject);
    const subjectEn = asText(offer?.subject_en);
    if (!subject || (subjectEn && !hasCjk(subjectEn))) return offer;
    const translated = map.get(subject);
    return translated ? { ...offer, subject_en: translated.slice(0, 120) } : offer;
  });
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

const upsertSupplierSearch = async (adminClient, provider, productId, payload) => {
  const offersRaw = Array.isArray(payload?.offers) ? payload.offers : [];
  let offers = offersRaw.map((offer) => {
    const canonical = canonical1688OfferUrlFromResult(offer);
    return canonical && offer && typeof offer === "object"
      ? { ...offer, detailUrl: canonical }
      : offer;
  });
  offers = await translateOffersBestEffort(offers);

  const meta = payload?.meta ?? null;
  const input = payload?.input ?? null;
  const fetchedAt = asText(meta?.fetchedAt) || new Date().toISOString();

  const { error } = await adminClient
    .from("discovery_production_supplier_searches")
    .upsert(
      {
        provider,
        product_id: productId,
        source: "1688_image_search",
        fetched_at: fetchedAt,
        offers,
        meta,
        input,
      },
      { onConflict: "provider,product_id" }
    );

  if (error) {
    throw new Error(error.message);
  }

  return { offersCount: offers.length, fetchedAt, offers };
};

const processSuggestion = async (adminClient, provider, suggestionId) => {
  const now = new Date().toISOString();
  const originalRecord = await loadSuggestionRecord(suggestionId);
  if (!originalRecord) return;

  let record = await updateSearchJob(originalRecord, {
    status: "running",
    startedAt: now,
    finishedAt: null,
    error: null,
    lastRunAt: now,
  });

  const localImagePath = localImagePathFromSuggestion(record);
  if (!localImagePath) {
    await updateSearchJob(record, {
      status: "error",
      finishedAt: new Date().toISOString(),
      error: "Missing normalized image for supplier search.",
    });
    return;
  }

  let searchResult = null;
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    searchResult = runImageSearchByFile(localImagePath, MAX_OFFERS);
    if (searchResult.ok) break;
    lastError = asText(searchResult.error) || "1688 image search failed.";
    if (!isRetriableSearchError(lastError)) break;
    await sleep(500 * (attempt + 1));
  }

  if (!searchResult || !searchResult.ok) {
    await updateSearchJob(record, {
      status: "error",
      finishedAt: new Date().toISOString(),
      error: lastError || "1688 image search failed.",
    });
    return;
  }

  try {
    const upserted = await upsertSupplierSearch(
      adminClient,
      provider,
      suggestionId,
      searchResult.payload
    );
    record = await updateSuggestionTitleFromOffersBestEffort(
      record,
      Array.isArray(upserted?.offers) ? upserted.offers : []
    );
    record = await queueTaxonomyForRecordIfNeeded(record);
    record = await updateSearchJob(record, {
      status: "done",
      finishedAt: new Date().toISOString(),
      error: null,
    });
  } catch (error) {
    await updateSearchJob(record, {
      status: "error",
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const main = async () => {
  const { provider, ids } = parseArgs(process.argv);
  if (!provider || ids.length === 0) return;

  const adminClient = getAdminClient();
  if (!adminClient) return;

  for (const suggestionId of ids) {
    try {
      await processSuggestion(adminClient, provider, suggestionId);
    } catch (error) {
      const failedAt = new Date().toISOString();
      const record = await loadSuggestionRecord(suggestionId);
      if (record) {
        await updateSearchJob(record, {
          status: "error",
          finishedAt: failedAt,
          lastRunAt: failedAt,
          error:
            error instanceof Error && asText(error.message)
              ? error.message
              : "Supplier search worker failed unexpectedly.",
        });
      }
    }
    await sleep(800);
  }
};

main().catch(() => {
  // detached worker: intentionally silent
});
