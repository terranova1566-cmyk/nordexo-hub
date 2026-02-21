#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const SUGGESTIONS_DIR =
  process.env.PARTNER_PRODUCT_SUGGESTIONS_DIR ||
  "/srv/node-files/partner-product-suggestions";
const PRODUCT_CATEGORIZER_SCRIPT =
  process.env.PRODUCT_CATEGORIZER_SCRIPT ||
  "/srv/node-tools/product-categorizer/scripts/product_categorizer.mjs";
const TAXONOMY_MODEL =
  process.env.SUGGESTION_TAXONOMY_MODEL ||
  process.env.PRODUCT_TAXONOMY_MODEL ||
  "gpt-4o-mini";
const TAXONOMY_PASS1_PROVIDER =
  process.env.SUGGESTION_TAXONOMY_PASS1_PROVIDER ||
  process.env.PRODUCT_TAXONOMY_PASS1_PROVIDER ||
  "openai";
const TAXONOMY_TIMEOUT_MS = Math.max(
  10_000,
  Number(process.env.SUGGESTION_TAXONOMY_TIMEOUT_MS || 25_000)
);

const asText = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

const parseArgs = (argv) => {
  const out = {
    ids: [],
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = asText(argv[i]);
    const value = asText(argv[i + 1]);
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

const normalizeStatus = (value) => {
  const status = asText(value).toLowerCase();
  if (status === "queued") return "queued";
  if (status === "running") return "running";
  if (status === "done") return "done";
  if (status === "error") return "error";
  return "idle";
};

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

const firstString = (...values) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const splitTaxonomyPath = (pathText) =>
  asText(pathText)
    .split(">")
    .map((entry) => entry.trim())
    .filter(Boolean);

const toNullableNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toNullableConfidence = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 1 && num >= 0) return Number(num.toFixed(3));
  if (num <= 100 && num >= 0) return Number((num / 100).toFixed(3));
  return null;
};

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

const taxonomyTitleFromRecord = (record) =>
  firstString(record?.title, record?.externalData?.title, record?.externalData?.rawTitle);

const taxonomyDescriptionFromRecord = (record) =>
  firstString(
    record?.description,
    record?.externalData?.description,
    record?.externalData?.rawDescription
  );

const updateTaxonomyState = async (record, patch) => {
  const now = new Date().toISOString();
  const previous =
    record?.googleTaxonomy && typeof record.googleTaxonomy === "object"
      ? record.googleTaxonomy
      : {};
  const nextStatus = normalizeStatus(patch?.status ?? previous.status);

  const pathText = firstString(patch?.path, previous.path);
  const pathParts = splitTaxonomyPath(pathText);
  const l1 = firstString(patch?.l1, previous.l1, pathParts[0]) || null;
  const l2 = firstString(patch?.l2, previous.l2, pathParts[1]) || null;
  const l3 = firstString(patch?.l3, previous.l3, pathParts[2]) || null;
  const fullPath = pathText || [l1, l2, l3].filter(Boolean).join(" > ") || null;

  const next = {
    status: nextStatus,
    id:
      patch && Object.prototype.hasOwnProperty.call(patch, "id")
        ? toNullableNumber(patch.id)
        : toNullableNumber(previous.id),
    path: fullPath,
    l1,
    l2,
    l3,
    confidence:
      patch && Object.prototype.hasOwnProperty.call(patch, "confidence")
        ? toNullableConfidence(patch.confidence)
        : toNullableConfidence(previous.confidence),
    sourceTitle:
      patch && Object.prototype.hasOwnProperty.call(patch, "sourceTitle")
        ? firstString(patch.sourceTitle) || null
        : firstString(previous.sourceTitle) || null,
    queuedAt:
      patch && Object.prototype.hasOwnProperty.call(patch, "queuedAt")
        ? firstString(patch.queuedAt) || null
        : firstString(previous.queuedAt) || null,
    startedAt:
      patch && Object.prototype.hasOwnProperty.call(patch, "startedAt")
        ? firstString(patch.startedAt) || null
        : firstString(previous.startedAt) || null,
    finishedAt:
      patch && Object.prototype.hasOwnProperty.call(patch, "finishedAt")
        ? firstString(patch.finishedAt) || null
        : firstString(previous.finishedAt) || null,
    updatedAt:
      patch && Object.prototype.hasOwnProperty.call(patch, "updatedAt")
        ? firstString(patch.updatedAt) || now
        : firstString(previous.updatedAt) || now,
    error:
      patch && Object.prototype.hasOwnProperty.call(patch, "error")
        ? firstString(patch.error) || null
        : firstString(previous.error) || null,
  };

  const updated = {
    ...(record && typeof record === "object" ? record : {}),
    googleTaxonomy: next,
  };
  await saveSuggestionRecord(updated);
  return updated;
};

const runTaxonomyCategorizer = (title, description) => {
  const args = [
    PRODUCT_CATEGORIZER_SCRIPT,
    "--input-title",
    title,
    "--pass1-provider",
    TAXONOMY_PASS1_PROVIDER,
    "--model-pass1",
    TAXONOMY_MODEL,
    "--model-pass2",
    TAXONOMY_MODEL,
  ];
  const trimmedDescription = asText(description).slice(0, 900);
  if (trimmedDescription) {
    args.push("--input-desc", trimmedDescription);
  }

  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: TAXONOMY_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
    },
  });

  if (result.error) {
    throw result.error;
  }
  const stderr = asText(result.stderr);
  const stdout = asText(result.stdout);
  const parsed = extractJsonFromText(stdout);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(stderr || "Google taxonomy categorizer returned invalid output.");
  }
  const resultNode =
    parsed.result && typeof parsed.result === "object"
      ? parsed.result
      : parsed;
  const pathText = firstString(
    resultNode.primaryPath,
    resultNode.taxonomy_path,
    resultNode.path
  );
  if (!pathText) {
    throw new Error(stderr || "No Google taxonomy path returned.");
  }
  return {
    id: toNullableNumber(resultNode.primaryId ?? resultNode.taxonomy_id),
    path: pathText,
    confidence: toNullableConfidence(
      resultNode.primaryConfidence ?? resultNode.confidence
    ),
  };
};

const processSuggestion = async (suggestionId) => {
  let record = await loadSuggestionRecord(suggestionId);
  if (!record) return;

  const title = taxonomyTitleFromRecord(record);
  if (!title) {
    const currentStatus = normalizeStatus(record?.googleTaxonomy?.status);
    if (currentStatus === "queued" || currentStatus === "running") {
      await updateTaxonomyState(record, {
        status: "idle",
        sourceTitle: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date().toISOString(),
        error: null,
      });
    }
    return;
  }

  const previousStatus = normalizeStatus(record?.googleTaxonomy?.status);
  const previousSourceTitle = firstString(record?.googleTaxonomy?.sourceTitle);
  const previousPath = firstString(record?.googleTaxonomy?.path);
  if (previousStatus === "done" && previousSourceTitle === title && previousPath) {
    return;
  }

  const now = new Date().toISOString();
  record = await updateTaxonomyState(record, {
    status: "running",
    sourceTitle: title,
    queuedAt: firstString(record?.googleTaxonomy?.queuedAt) || now,
    startedAt: now,
    finishedAt: null,
    updatedAt: now,
    error: null,
  });

  try {
    const description = taxonomyDescriptionFromRecord(record);
    const classified = runTaxonomyCategorizer(title, description);
    const finishedAt = new Date().toISOString();
    const pathParts = splitTaxonomyPath(classified.path);
    await updateTaxonomyState(record, {
      status: "done",
      id: classified.id,
      path: classified.path,
      l1: pathParts[0] || null,
      l2: pathParts[1] || null,
      l3: pathParts[2] || null,
      confidence: classified.confidence,
      sourceTitle: title,
      finishedAt,
      updatedAt: finishedAt,
      error: null,
    });
  } catch (error) {
    const failedAt = new Date().toISOString();
    await updateTaxonomyState(record, {
      status: "error",
      sourceTitle: title,
      finishedAt: failedAt,
      updatedAt: failedAt,
      error:
        error instanceof Error && asText(error.message)
          ? error.message
          : "Google taxonomy categorization failed.",
    });
  }
};

const main = async () => {
  const { ids } = parseArgs(process.argv);
  if (ids.length === 0) return;

  for (const suggestionId of ids) {
    try {
      await processSuggestion(suggestionId);
    } catch {
      // detached worker: intentionally silent
    }
    await sleep(200);
  }
};

main().catch(() => {
  // detached worker: intentionally silent
});
