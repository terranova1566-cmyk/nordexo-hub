#!/usr/bin/env node

import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { canonical1688OfferUrlText } from "../shared/1688/core.mjs";

const PROJECT_ROOT = "/srv/nordexo-hub";
const EXTRACTOR_ROOT =
  process.env.NODEXO_EXTRACTOR_UPLOAD_DIR || "/srv/node-files/1688-extractor";
const FILE_SCAN_DIRS = [
  EXTRACTOR_ROOT,
  path.join(EXTRACTOR_ROOT, "_production_queue_payloads"),
];

const URL_FIELD_KEYS = new Set([
  "url_1688",
  "detail_url",
  "detailUrl",
  "selected_detail_url",
  "supplier_selected_offer_detail_url",
  "draft_supplier_1688_url",
  "1688_URL",
  "1688_url",
]);

const asText = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

const canonicalize1688Url = (value) => {
  const raw = asText(value);
  if (!raw) return "";
  return canonical1688OfferUrlText(raw) || raw;
};

const parseDotEnvLine = (line) => {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!match) return null;
  const key = match[1];
  let value = match[2] ?? "";

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  value = value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
  return { key, value };
};

const loadEnvFileBestEffort = async (filePath) => {
  try {
    const text = await fsp.readFile(filePath, "utf8");
    text.split(/\r?\n/).forEach((line) => {
      const parsed = parseDotEnvLine(line);
      if (!parsed) return;
      if (process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    });
  } catch {
    // ignore missing env files
  }
};

const ensureEnvLoaded = async () => {
  await loadEnvFileBestEffort(path.join(PROJECT_ROOT, ".env.local"));
  await loadEnvFileBestEffort(path.join(PROJECT_ROOT, ".env"));
};

const canonicalizeKnownUrlFieldsDeep = (node) => {
  if (Array.isArray(node)) {
    let changed = false;
    const next = node.map((entry) => {
      const child = canonicalizeKnownUrlFieldsDeep(entry);
      if (child.changed) changed = true;
      return child.value;
    });
    return { value: changed ? next : node, changed };
  }

  if (!node || typeof node !== "object") {
    return { value: node, changed: false };
  }

  let changed = false;
  const record = node;
  const out = Array.isArray(record) ? [...record] : { ...record };

  for (const [key, value] of Object.entries(record)) {
    if (URL_FIELD_KEYS.has(key) && typeof value === "string") {
      const canonical = canonicalize1688Url(value);
      if (canonical !== value) {
        out[key] = canonical;
        changed = true;
      }
      continue;
    }

    if (key === "url_1688_list" && Array.isArray(value)) {
      const normalizedList = value
        .map((entry) => canonicalize1688Url(entry))
        .filter(Boolean);
      const deduped = Array.from(new Set(normalizedList));
      const prev = JSON.stringify(value);
      const next = JSON.stringify(deduped);
      if (prev !== next) {
        out[key] = deduped;
        changed = true;
      }
      continue;
    }

    if (value && typeof value === "object") {
      const child = canonicalizeKnownUrlFieldsDeep(value);
      if (child.changed) {
        out[key] = child.value;
        changed = true;
      }
    }
  }

  return { value: changed ? out : node, changed };
};

const createAdminClient = () => {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const fetchPage = async (admin, table, select, from, to, orders = []) => {
  let query = admin.from(table).select(select);
  for (const order of Array.isArray(orders) ? orders : []) {
    const column = asText(order?.column);
    if (!column) continue;
    query = query.order(column, { ascending: order?.ascending !== false });
  }
  const { data, error } = await query.range(from, to);
  if (error) throw new Error(`${table}: ${error.message}`);
  return Array.isArray(data) ? data : [];
};

const cleanupSelectionTable = async (admin) => {
  const table = "discovery_production_supplier_selection";
  const pageSize = 500;
  let from = 0;
  let scanned = 0;
  let updated = 0;
  while (true) {
    const rows = await fetchPage(
      admin,
      table,
      "provider,product_id,selected_detail_url,selected_offer",
      from,
      from + pageSize - 1,
      [
        { column: "provider", ascending: true },
        { column: "product_id", ascending: true },
      ]
    );
    if (rows.length === 0) break;
    scanned += rows.length;

    for (const row of rows) {
      const currentUrl = asText(row.selected_detail_url);
      const nextUrl = currentUrl ? canonicalize1688Url(currentUrl) : "";
      const nextOffer = canonicalizeKnownUrlFieldsDeep(row.selected_offer);
      const patch = {};

      if (nextUrl !== currentUrl) {
        patch.selected_detail_url = nextUrl || null;
      }
      if (nextOffer.changed) {
        patch.selected_offer = nextOffer.value;
      }
      if (Object.keys(patch).length === 0) continue;

      const { error } = await admin
        .from(table)
        .update(patch)
        .eq("provider", asText(row.provider))
        .eq("product_id", asText(row.product_id));
      if (error) {
        throw new Error(`${table} update (${row.provider}/${row.product_id}): ${error.message}`);
      }
      updated += 1;
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { scanned, updated };
};

const cleanupSearchesTable = async (admin) => {
  const table = "discovery_production_supplier_searches";
  const pageSize = 300;
  let from = 0;
  let scanned = 0;
  let updated = 0;
  while (true) {
    const rows = await fetchPage(
      admin,
      table,
      "provider,product_id,offers",
      from,
      from + pageSize - 1,
      [
        { column: "provider", ascending: true },
        { column: "product_id", ascending: true },
      ]
    );
    if (rows.length === 0) break;
    scanned += rows.length;

    for (const row of rows) {
      const nextOffers = canonicalizeKnownUrlFieldsDeep(row.offers);
      if (!nextOffers.changed) continue;
      const { error } = await admin
        .from(table)
        .update({ offers: nextOffers.value })
        .eq("provider", asText(row.provider))
        .eq("product_id", asText(row.product_id));
      if (error) {
        throw new Error(`${table} update (${row.provider}/${row.product_id}): ${error.message}`);
      }
      updated += 1;
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { scanned, updated };
};

const cleanupDraftProductsTable = async (admin) => {
  const table = "draft_products";
  const pageSize = 500;
  let from = 0;
  let scanned = 0;
  let updated = 0;
  while (true) {
    const rows = await fetchPage(
      admin,
      table,
      "id,draft_supplier_1688_url",
      from,
      from + pageSize - 1,
      [{ column: "id", ascending: true }]
    );
    if (rows.length === 0) break;
    scanned += rows.length;

    for (const row of rows) {
      const current = asText(row.draft_supplier_1688_url);
      if (!current) continue;
      const next = canonicalize1688Url(current);
      if (next === current) continue;
      const { error } = await admin
        .from(table)
        .update({ draft_supplier_1688_url: next || null })
        .eq("id", row.id);
      if (error) {
        throw new Error(`${table} update (${row.id}): ${error.message}`);
      }
      updated += 1;
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { scanned, updated };
};

const cleanupDigidealProductsTable = async (admin) => {
  const table = "digideal_products";
  const pageSize = 500;
  let from = 0;
  let scanned = 0;
  let updated = 0;
  let hasUpper = true;
  let hasLower = true;

  while (true) {
    const selectParts = ["product_id"];
    if (hasUpper) selectParts.push('"1688_URL"');
    if (hasLower) selectParts.push("1688_url");
    const select = selectParts.join(",");
    if (select === "product_id") break;

    let rows = [];
    try {
      rows = await fetchPage(admin, table, select, from, from + pageSize - 1, [
        { column: "product_id", ascending: true },
      ]);
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      if (hasUpper && /"1688_URL".*does not exist/i.test(message)) {
        hasUpper = false;
        continue;
      }
      if (hasLower && /1688_url.*does not exist/i.test(message)) {
        hasLower = false;
        continue;
      }
      throw error;
    }

    if (rows.length === 0) break;
    scanned += rows.length;

    for (const row of rows) {
      const patch = {};
      if (hasUpper) {
        const currentUpper = asText(row["1688_URL"]);
        if (currentUpper) {
          const nextUpper = canonicalize1688Url(currentUpper);
          if (nextUpper !== currentUpper) patch["1688_URL"] = nextUpper || null;
        }
      }
      if (hasLower) {
        const currentLower = asText(row["1688_url"]);
        if (currentLower) {
          const nextLower = canonicalize1688Url(currentLower);
          if (nextLower !== currentLower) patch["1688_url"] = nextLower || null;
        }
      }
      if (Object.keys(patch).length === 0) continue;

      const { error } = await admin
        .from(table)
        .update(patch)
        .eq("product_id", row.product_id);
      if (error) {
        throw new Error(`${table} update (${row.product_id}): ${error.message}`);
      }
      updated += 1;
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return { scanned, updated, hasUpper, hasLower };
};

const shouldSkipDir = (name) =>
  name === "_summary_cache" ||
  name.startsWith("_url_cleanup_backup_");

const listJsonFiles = async (dirPath) => {
  const out = [];
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".json")) continue;
      out.push(fullPath);
    }
  }
  return out;
};

const cleanupJsonFiles = async () => {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "_");
  const backupRoot = path.join(EXTRACTOR_ROOT, `_url_cleanup_backup_${stamp}`);
  let scanned = 0;
  let updated = 0;
  let parseErrors = 0;
  let backedUp = 0;

  const targets = new Set();
  for (const dir of FILE_SCAN_DIRS) {
    const files = await listJsonFiles(dir);
    files.forEach((filePath) => targets.add(filePath));
  }

  const files = Array.from(targets).sort((a, b) => a.localeCompare(b));
  for (const filePath of files) {
    scanned += 1;
    let rawText = "";
    try {
      rawText = await fsp.readFile(filePath, "utf8");
      const parsed = JSON.parse(rawText);
      const normalized = canonicalizeKnownUrlFieldsDeep(parsed);
      if (!normalized.changed) continue;

      const rel = path.relative(EXTRACTOR_ROOT, filePath);
      const backupPath = path.join(backupRoot, rel);
      await fsp.mkdir(path.dirname(backupPath), { recursive: true });
      await fsp.writeFile(backupPath, rawText, "utf8");
      backedUp += 1;

      await fsp.writeFile(filePath, JSON.stringify(normalized.value, null, 2), "utf8");
      updated += 1;
    } catch {
      parseErrors += 1;
    }
  }

  return { scanned, updated, parseErrors, backupRoot, backedUp };
};

const main = async () => {
  await ensureEnvLoaded();
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Missing Supabase env vars (SUPABASE_URL + service role key).");
  }

  console.log("[cleanup-1688] Starting database cleanup...");
  const selectionStats = await cleanupSelectionTable(admin);
  const searchesStats = await cleanupSearchesTable(admin);
  const draftsStats = await cleanupDraftProductsTable(admin);
  const digidealStats = await cleanupDigidealProductsTable(admin);

  console.log("[cleanup-1688] Starting JSON draft/file cleanup...");
  const fileStats = await cleanupJsonFiles();

  console.log(
    JSON.stringify(
      {
        ok: true,
        selection: selectionStats,
        searches: searchesStats,
        draft_products: draftsStats,
        digideal_products: digidealStats,
        files: fileStats,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error("[cleanup-1688] Failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
