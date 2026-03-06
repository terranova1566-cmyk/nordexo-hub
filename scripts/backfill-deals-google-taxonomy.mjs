#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const BACKFILL_SCRIPT =
  process.env.DEALS_TAXONOMY_BACKFILL_SCRIPT ||
  "/srv/node-tools/product-categorizer/scripts/competitor_taxonomy_backfill.mjs";

const asText = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

const toBool = (value, fallback) => {
  if (value === undefined) return fallback;
  const normalized = asText(value).toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(normalized);
};

const parseArgs = (argv) => {
  const out = {
    providers: ["letsdeal", "outspot", "offerilla"],
    dryRun: false,
    onlyMissing: true,
    limit: null,
    concurrency: null,
    pageSize: null,
    upsertBatchSize: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = asText(argv[i]);
    const next = asText(argv[i + 1]);
    if (!key.startsWith("--")) continue;

    if (key === "--provider" && next) {
      out.providers = next
        .split(",")
        .map((entry) => asText(entry).toLowerCase())
        .filter(Boolean);
      i += 1;
      continue;
    }
    if (key === "--dry-run") {
      out.dryRun = next ? toBool(next, true) : true;
      if (next) i += 1;
      continue;
    }
    if (key === "--only-missing" && next) {
      out.onlyMissing = toBool(next, true);
      i += 1;
      continue;
    }
    if (key === "--limit" && next) {
      out.limit = asText(next);
      i += 1;
      continue;
    }
    if (key === "--concurrency" && next) {
      out.concurrency = asText(next);
      i += 1;
      continue;
    }
    if (key === "--page-size" && next) {
      out.pageSize = asText(next);
      i += 1;
      continue;
    }
    if (key === "--upsert-batch-size" && next) {
      out.upsertBatchSize = asText(next);
      i += 1;
      continue;
    }
  }

  out.providers = Array.from(new Set(out.providers));
  return out;
};

const PROVIDERS = {
  letsdeal: {
    table: "letsdeal_products",
    idField: "product_id",
    titleField: "title",
    descField: "subtitle",
    extraArgs: [
      "--path-field",
      "google_taxonomy_path",
      "--confidence-field",
      "google_taxonomy_confidence",
      "--updated-at-field",
      "google_taxonomy_categorized_at",
      "--taxonomy-id-field",
      "google_taxonomy_id",
      "--status-field",
      "google_taxonomy_status",
      "--status-value",
      "done",
      "--skip-level-fields",
      "true",
    ],
  },
  outspot: {
    table: "outspot_products",
    idField: "product_id",
    titleField: "title",
    descField: "description_text",
    extraArgs: [],
  },
  offerilla: {
    table: "offerilla_products",
    idField: "product_id",
    titleField: "title",
    descField: "description_text",
    extraArgs: [],
  },
};

const runBackfill = (provider, options) => {
  const config = PROVIDERS[provider];
  if (!config) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const args = [
    BACKFILL_SCRIPT,
    "--table",
    config.table,
    "--id-field",
    config.idField,
    "--title-field",
    config.titleField,
    "--only-missing",
    options.onlyMissing ? "true" : "false",
    "--dry-run",
    options.dryRun ? "true" : "false",
  ];

  if (config.descField) {
    args.push("--desc-field", config.descField);
  }
  if (options.limit) {
    args.push("--limit", options.limit);
  }
  if (options.concurrency) {
    args.push("--concurrency", options.concurrency);
  }
  if (options.pageSize) {
    args.push("--page-size", options.pageSize);
  }
  if (options.upsertBatchSize) {
    args.push("--upsert-batch-size", options.upsertBatchSize);
  }
  args.push(...config.extraArgs);

  const run = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (run.error) {
    throw run.error;
  }
  if (run.status !== 0) {
    throw new Error(
      `Backfill failed for provider=${provider} with exit code ${run.status}`
    );
  }
};

const main = () => {
  const options = parseArgs(process.argv);
  const providers = options.providers.filter((entry) => PROVIDERS[entry]);
  if (!providers.length) {
    throw new Error("No valid providers provided. Use letsdeal,outspot,offerilla.");
  }

  for (const provider of providers) {
    console.log(`\n[deals-taxonomy-backfill] provider=${provider} start`);
    runBackfill(provider, options);
    console.log(`[deals-taxonomy-backfill] provider=${provider} done`);
  }
};

main();

