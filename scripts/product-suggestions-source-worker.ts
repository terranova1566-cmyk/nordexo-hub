#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  PARTNER_SUGGESTION_DIR,
  loadSuggestionRecord,
} from "../lib/product-suggestions";
import {
  isHttpUrl,
  resolveSuggestionSourceUrl,
  runSuggestionSourceCrawlJob,
} from "../lib/product-suggestions-source-job";

const TAXONOMY_WORKER_PATH =
  "/srv/nordexo-hub/scripts/product-suggestions-taxonomy-worker.mjs";

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

const parseArgs = (argv: string[]) => {
  const out = {
    ids: [] as string[],
    missingAi: false,
    force: false,
    sleepMs: 300,
    limit: 500,
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
    if (key === "--missing-ai") {
      out.missingAi = true;
      continue;
    }
    if (key === "--force") {
      out.force = true;
      continue;
    }
    if (key === "--sleep-ms" && value) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        out.sleepMs = Math.trunc(parsed);
      }
      i += 1;
      continue;
    }
    if (key === "--limit" && value) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        out.limit = Math.trunc(parsed);
      }
      i += 1;
      continue;
    }
  }

  out.ids = Array.from(new Set(out.ids));
  return out;
};

const validSuggestionId = (value: string) =>
  /^[a-z0-9][a-z0-9_-]{5,80}$/i.test(asText(value));

const spawnTaxonomyWorkerForIds = (ids: string[]) => {
  const uniqueIds = Array.from(
    new Set(ids.map((entry) => asText(entry)).filter(validSuggestionId))
  );
  if (uniqueIds.length === 0) return false;
  try {
    const child = spawn(
      process.execPath,
      [TAXONOMY_WORKER_PATH, "--ids", uniqueIds.join(",")],
      {
        detached: true,
        stdio: "ignore",
        env: { ...process.env },
      }
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
};

const listMissingAiCandidateIds = async (limit: number) => {
  const ids: string[] = [];
  let entries: Array<{ name: string; isFile: () => boolean }> = [];
  try {
    entries = await fs.readdir(PARTNER_SUGGESTION_DIR, { withFileTypes: true });
  } catch {
    return ids;
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name);

  for (const fileName of files) {
    if (ids.length >= limit) break;
    const id = fileName.replace(/\.json$/i, "");
    if (!validSuggestionId(id)) continue;

    const record = await loadSuggestionRecord(id);
    if (!record) continue;
    const sourceUrl = resolveSuggestionSourceUrl(record);
    if (!isHttpUrl(sourceUrl)) continue;
    const aiModel = asText(record.externalData?.aiReview?.model);
    if (aiModel) continue;
    ids.push(id);
  }

  return ids;
};

const main = async () => {
  const args = parseArgs(process.argv);
  const ids = args.missingAi
    ? await listMissingAiCandidateIds(args.limit)
    : args.ids.slice(0, args.limit);

  if (ids.length === 0) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          total: 0,
          processed: 0,
          updated: 0,
          failed: 0,
          skipped: 0,
          reason: "no_candidate_ids",
        },
        null,
        2
      )
    );
    return;
  }

  const summary = {
    ok: true,
    total: ids.length,
    processed: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    skippedNoRecord: 0,
    skippedNoHttpSource: 0,
    skippedAiPresent: 0,
    skippedBusy: 0,
    taxonomyQueued: 0,
    taxonomyWorkerStarted: false,
    failures: [] as Array<{ id: string; error: string }>,
  };
  const taxonomyQueueIds: string[] = [];

  for (const id of ids) {
    const record = await loadSuggestionRecord(id);
    if (!record) {
      summary.skipped += 1;
      summary.skippedNoRecord += 1;
      continue;
    }

    const sourceUrl = resolveSuggestionSourceUrl(record);
    if (!isHttpUrl(sourceUrl)) {
      summary.skipped += 1;
      summary.skippedNoHttpSource += 1;
      continue;
    }

    const aiModel = asText(record.externalData?.aiReview?.model);
    if (aiModel && !args.force) {
      summary.skipped += 1;
      summary.skippedAiPresent += 1;
      continue;
    }

    const sourceJobStatus = asText(record.sourceJob?.status).toLowerCase();
    if ((sourceJobStatus === "queued" || sourceJobStatus === "running") && !args.force) {
      summary.skipped += 1;
      summary.skippedBusy += 1;
      continue;
    }

    summary.processed += 1;
    const result = await runSuggestionSourceCrawlJob({
      suggestionId: id,
      sourceUrl,
    });
    if (result.ok) {
      summary.updated += 1;
      if (result.taxonomyQueued) {
        summary.taxonomyQueued += 1;
        taxonomyQueueIds.push(id);
      }
    } else {
      summary.failed += 1;
      summary.failures.push({
        id,
        error: asText(result.error) || "Unknown source crawl failure.",
      });
    }
    if (args.sleepMs > 0) {
      await sleep(args.sleepMs);
    }
  }

  if (taxonomyQueueIds.length > 0) {
    summary.taxonomyWorkerStarted = spawnTaxonomyWorkerForIds(taxonomyQueueIds);
  }

  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
