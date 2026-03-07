#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  PARTNER_SUGGESTION_DIR,
  saveSuggestionRecord,
  type ProductSuggestionRecord,
} from "@/lib/product-suggestions";
import { enhance1688ItemWithAi } from "@/shared/1688/ai-pipeline";

const loadEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    if (!key || process.env[key]) return;
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
};

loadEnvFile("/srv/nordexo-hub/.env.local");
loadEnvFile("/srv/.env.local");

const EXTRACTOR_CLI_PATH = "/srv/node-tools/1688-extractor/src/offer_detail_cli.js";

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const toInt = (value: unknown, fallback: number, min: number, max: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(num)));
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const out: Record<string, string | boolean> = {};
  args.forEach((arg) => {
    if (!arg.startsWith("--")) return;
    const idx = arg.indexOf("=");
    if (idx === -1) {
      out[arg.slice(2)] = true;
      return;
    }
    out[arg.slice(2, idx)] = arg.slice(idx + 1);
  });
  return out;
};

const toObjectRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const parseOfferId = (value: unknown) => {
  const text = asText(value);
  const match = text.match(/(?:detail\.1688\.com\/offer\/|\/offer\/)(\d{6,})\.html/i);
  return match?.[1] || "";
};

const getAdminClient = () => {
  const url = asText(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
  const key = asText(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE ||
      process.env.SUPABASE_SERVICE_KEY
  );
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const countWeightedCombos = (value: unknown) => {
  const variations = toObjectRecord(value);
  const combos = Array.isArray(variations.combos) ? variations.combos : [];
  let weighted = 0;
  combos.forEach((entry) => {
    const row = toObjectRecord(entry);
    const grams = Number(row.weight_grams ?? row.weightGrams);
    if (Number.isFinite(grams) && grams > 0) {
      weighted += 1;
      return;
    }
    const raw = asText(row.weight_raw ?? row.weightRaw ?? row.weight).toLowerCase();
    if (!raw) return;
    if (/\d/.test(raw) && /(g|kg|克|公斤|千克)/i.test(raw)) weighted += 1;
  });
  return {
    total: combos.length,
    weighted,
  };
};

const getVariations = (item: Record<string, unknown>) =>
  item.variations_enriched_1688 && typeof item.variations_enriched_1688 === "object"
    ? item.variations_enriched_1688
    : item.variations && typeof item.variations === "object"
      ? item.variations
      : null;

const has1688Source = (record: Record<string, unknown>) => {
  const sourcePlatform = asText(record.source_platform).toLowerCase();
  if (sourcePlatform.includes("1688")) return true;
  const attrs = toObjectRecord(record.platform_attributes);
  if (attrs["1688"] && typeof attrs["1688"] === "object") return true;
  if (record.extension_payload_1688 && typeof record.extension_payload_1688 === "object") {
    return true;
  }
  return false;
};

const uniqueUrls = (values: unknown[], max = 140) => {
  const out: string[] = [];
  const seen = new Set<string>();
  values.forEach((entry) => {
    const value = asText(entry);
    if (!value || !/^https?:\/\//i.test(value)) return;
    const key = value.split("#")[0].toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
    if (out.length >= max) return;
  });
  return out;
};

const detailUrlFromRecord = (record: Record<string, unknown>, payload: Record<string, unknown>) => {
  const direct =
    asText(payload.url_1688) ||
    asText(payload.detail_url) ||
    asText(payload.detailUrl) ||
    asText(record.sourceUrl) ||
    asText(record.crawlFinalUrl);
  const match = direct.match(/(?:detail\.1688\.com\/offer\/|\/offer\/)(\d{6,})\.html/i);
  if (match?.[1]) return `https://detail.1688.com/offer/${match[1]}.html`;
  return direct;
};

const run1688Extractor = async (detailUrl: string) => {
  if (!detailUrl) return { ok: false, error: "missing_detail_url" };
  const tmpOut = path.join(
    "/tmp",
    `suggestion-1688-rescrape-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  );

  const args = [
    EXTRACTOR_CLI_PATH,
    "--pretty",
    "false",
    "--includeText",
    "true",
    "--includeVariations",
    "true",
    "--downloadImages",
    "false",
    "--maxTextChars",
    "250000",
    "--url",
    detailUrl,
    "--output",
    tmpOut,
  ];

  try {
    const result = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        env: {
          ...process.env,
          HEADLESS: "1",
          FORCE_1688_CHINESE_UI: process.env.FORCE_1688_CHINESE_UI || "1",
          LOCALE: process.env.LOCALE || "zh-CN",
          ACCEPT_LANGUAGE: process.env.ACCEPT_LANGUAGE || "zh-CN,zh;q=0.9,en;q=0.6",
          TIMEZONE: process.env.TIMEZONE || "Asia/Shanghai",
        },
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      const timeout = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
        reject(new Error("extractor_timeout"));
      }, 240_000);
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve({ code, stderr });
      });
    });

    if (!fs.existsSync(tmpOut)) {
      return { ok: false, error: result.stderr || `extractor_exit_${String(result.code)}` };
    }

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(fs.readFileSync(tmpOut, "utf8")) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.ok === false) {
      return {
        ok: false,
        error: asText((parsed && parsed.error) || result.stderr) || "extractor_failed",
      };
    }

    return { ok: true, payload: parsed };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    try {
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    } catch {}
  }
};

const mergeWithExtractorPayload = (
  basePayload: Record<string, unknown>,
  extractorPayload: Record<string, unknown>,
  detailUrl: string
) => {
  const extracted = toObjectRecord(extractorPayload.extracted);
  const next = { ...basePayload };
  next.url_1688 = detailUrl;
  next.detail_url = detailUrl;
  next.detailUrl = detailUrl;
  if (asText(extractorPayload?.meta && toObjectRecord(extractorPayload.meta).h1)) {
    next.title_1688 = asText(toObjectRecord(extractorPayload.meta).h1);
  }
  if (asText(toObjectRecord(extractorPayload.meta).title)) {
    next.title_cn = asText(toObjectRecord(extractorPayload.meta).title);
    next.title_zh = asText(toObjectRecord(extractorPayload.meta).title);
  }
  if (asText(extracted.readableText)) {
    next.readable_1688 = asText(extracted.readableText);
    next.readable_1688_raw = asText(extracted.readableText);
  }
  next.main_image_1688 = asText(extracted.mainImageUrl) || asText(next.main_image_1688);
  next.image_urls_1688 = uniqueUrls(
    [
      extracted.mainImageUrl,
      ...(Array.isArray(extracted.imageUrls) ? extracted.imageUrls : []),
      ...(Array.isArray(extracted.galleryImageUrls) ? extracted.galleryImageUrls : []),
      ...(Array.isArray(extracted.descriptionImageUrls) ? extracted.descriptionImageUrls : []),
    ],
    140
  );
  next.gallery_image_urls_1688 = uniqueUrls(
    Array.isArray(extracted.galleryImageUrls) ? extracted.galleryImageUrls : [],
    140
  );
  next.description_image_urls_1688 = uniqueUrls(
    Array.isArray(extracted.descriptionImageUrls) ? extracted.descriptionImageUrls : [],
    140
  );
  next.variant_images_1688 = Array.isArray(extracted.variantImages) ? extracted.variantImages : [];
  next.variations =
    extracted.variations && typeof extracted.variations === "object"
      ? extracted.variations
      : next.variations;
  next.variations_enriched_1688 =
    extracted.variations_enriched_1688 && typeof extracted.variations_enriched_1688 === "object"
      ? extracted.variations_enriched_1688
      : next.variations_enriched_1688;
  next.product_weights_1688 = Array.isArray(extracted.weights) ? extracted.weights : [];
  if (extracted.extraction_meta_1688 && typeof extracted.extraction_meta_1688 === "object") {
    next.extraction_meta_1688 = extracted.extraction_meta_1688;
  }
  if (extracted.text_1688 && typeof extracted.text_1688 === "object") {
    next.text_1688 = extracted.text_1688;
  }
  if (extracted.weights_1688 && typeof extracted.weights_1688 === "object") {
    next.weights_1688 = extracted.weights_1688;
  }
  if (extracted.variant_table_1688 && typeof extracted.variant_table_1688 === "object") {
    next.variant_table_1688 = extracted.variant_table_1688;
  }
  if (extracted.quality_1688 && typeof extracted.quality_1688 === "object") {
    next.quality_1688 = extracted.quality_1688;
  }
  return next;
};

const copyIfPresent = (target: Record<string, unknown>, source: Record<string, unknown>, key: string) => {
  if (source[key] === undefined) return;
  target[key] = source[key];
};

const main = async () => {
  const argv = parseArgs();
  const dryRun = Boolean(argv["dry-run"]);
  const rescrape = Boolean(argv.rescrape);
  const syncSelection = argv["sync-selection"] === false ? false : true;
  const limit = toInt(argv.limit, 40, 1, 1000);
  const hours = toInt(argv.hours, 168, 1, 24 * 365);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const ids = asText(argv.ids)
    .split(",")
    .map((entry) => asText(entry))
    .filter(Boolean);
  const forcedIds = new Set(ids);
  const modelCandidates = Array.from(
    new Set(
      [
        asText(argv.models),
        process.env.NODEXO_1688_UPLOAD_AI_MODELS,
        process.env.NODEXO_1688_AI_MODELS,
        process.env.NODEXO_1688_AI_MODEL,
        "gpt-5.2",
        "gpt-5",
        "gpt-5-mini",
      ]
        .flatMap((entry) => asText(entry).split(","))
        .map((entry) => asText(entry))
        .filter(Boolean)
        .filter((entry) => !/^gpt-4/i.test(entry))
    )
  );

  const files = fs
    .readdirSync(PARTNER_SUGGESTION_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => {
      const fullPath = path.join(PARTNER_SUGGESTION_DIR, name);
      const stat = fs.statSync(fullPath);
      return {
        name,
        fullPath,
        mtimeMs: stat.mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const candidates: Array<{
    name: string;
    fullPath: string;
    record: ProductSuggestionRecord;
  }> = [];

  for (const file of files) {
    let parsed: ProductSuggestionRecord | null = null;
    try {
      parsed = JSON.parse(fs.readFileSync(file.fullPath, "utf8")) as ProductSuggestionRecord;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const rec = parsed as Record<string, unknown>;
    if (!has1688Source(rec)) continue;
    const id = asText(rec.id);
    if (forcedIds.size > 0 && !forcedIds.has(id)) continue;
    if (forcedIds.size === 0 && file.mtimeMs < cutoff) continue;
    candidates.push({
      name: file.name,
      fullPath: file.fullPath,
      record: parsed,
    });
    if (candidates.length >= limit && forcedIds.size === 0) break;
  }

  if (!candidates.length) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          processed: 0,
          message: "No matching recent 1688 suggestion records found.",
          dry_run: dryRun,
          window_hours: hours,
          limit,
        },
        null,
        2
      )
    );
    return;
  }

  const processed: Array<Record<string, unknown>> = [];
  const adminClient = !dryRun && syncSelection ? getAdminClient() : null;
  const selectionSyncErrors: Array<{ id: string; error: string }> = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const { record, name } = candidates[index];
    const mutable = { ...(record as Record<string, unknown>) };
    const id = asText(mutable.id) || name;
    const payload =
      mutable.extension_payload_1688 && typeof mutable.extension_payload_1688 === "object"
        ? ({ ...(mutable.extension_payload_1688 as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : {};

    if (!payload.url_1688 && mutable.sourceUrl) payload.url_1688 = mutable.sourceUrl;
    if (!payload.title_1688 && mutable.title) payload.title_1688 = mutable.title;
    if (!payload.readable_1688 && mutable.description) payload.readable_1688 = mutable.description;
    if (!payload.main_image_1688 && mutable.mainImageUrl) payload.main_image_1688 = mutable.mainImageUrl;
    if (!payload.image_urls_1688 && Array.isArray(mutable.galleryImageUrls)) {
      payload.image_urls_1688 = mutable.galleryImageUrls;
    }

    const beforeStats = countWeightedCombos(getVariations(payload));
    const detailUrl = detailUrlFromRecord(mutable, payload);
    let rescrapeError = "";
    let rescrapeUsed = false;
    if (rescrape && detailUrl) {
      const refreshed = await run1688Extractor(detailUrl);
      if (refreshed.ok && refreshed.payload) {
        Object.assign(payload, mergeWithExtractorPayload(payload, refreshed.payload, detailUrl));
        rescrapeUsed = true;
      } else {
        rescrapeError = asText(refreshed.error);
      }
    }

    const enhanced = (await enhance1688ItemWithAi(payload, {
      source: "suggestion_backfill_weight_refresh",
      mode: "full",
      enableWeightReview: true,
      enableAttributeExtract: true,
      enableWeightInference: true,
      modelCandidates,
    })) as Record<string, unknown>;
    const afterStats = countWeightedCombos(getVariations(enhanced));

    mutable.extension_payload_1688 = enhanced;
    if (!asText(mutable.source_platform)) mutable.source_platform = "1688";

    const attrs = toObjectRecord(mutable.platform_attributes);
    const attrs1688 = toObjectRecord(attrs["1688"]);
    copyIfPresent(attrs1688, enhanced, "piece_weight_rows_1688");
    copyIfPresent(attrs1688, enhanced, "piece_weight_applied_1688");
    copyIfPresent(attrs1688, enhanced, "weight_review_1688");
    attrs["1688"] = attrs1688;
    mutable.platform_attributes = attrs;

    const variantCache = toObjectRecord(mutable.variantCache);
    const enhancedVariations = getVariations(enhanced);
    if (enhancedVariations && typeof enhancedVariations === "object") {
      variantCache.combos = Array.isArray(toObjectRecord(enhancedVariations).combos)
        ? toObjectRecord(enhancedVariations).combos
        : [];
    }
    if (enhanced.weight_review_1688 && typeof enhanced.weight_review_1688 === "object") {
      variantCache.weight_review = enhanced.weight_review_1688;
    }
    if (Object.keys(variantCache).length > 0) mutable.variantCache = variantCache;

    if (!dryRun) {
      await saveSuggestionRecord(mutable as ProductSuggestionRecord);
    }

    let selectionSynced = false;
    let selectionSyncError = "";
    if (!dryRun && syncSelection) {
      if (!adminClient) {
        selectionSyncError = "missing_supabase_credentials";
      } else {
        try {
          const detailUrl = asText(enhanced.url_1688 || payload.url_1688 || mutable.sourceUrl);
          const offerId =
            asText(enhanced.selected_supplier_offer_id || payload.selected_supplier_offer_id) ||
            parseOfferId(detailUrl);
          const variations = toObjectRecord(getVariations(enhanced));
          const combos = Array.isArray(variations.combos) ? variations.combos : [];
          const selectionFromPayload =
            enhanced.production_variant_selection &&
            typeof enhanced.production_variant_selection === "object"
              ? (enhanced.production_variant_selection as Record<string, unknown>)
              : payload.production_variant_selection &&
                  typeof payload.production_variant_selection === "object"
                ? (payload.production_variant_selection as Record<string, unknown>)
                : null;

          const existingSelection = await adminClient
            .from("discovery_production_supplier_selection")
            .select("selected_offer, selected_offer_id, selected_detail_url")
            .eq("provider", "partner_suggestions")
            .eq("product_id", id)
            .maybeSingle();

          if (existingSelection.error) {
            throw new Error(existingSelection.error.message);
          }

          const selectedOffer =
            existingSelection.data?.selected_offer &&
            typeof existingSelection.data.selected_offer === "object"
              ? { ...(existingSelection.data.selected_offer as Record<string, unknown>) }
              : {};
          const cache =
            selectedOffer._production_variant_cache &&
            typeof selectedOffer._production_variant_cache === "object"
              ? { ...(selectedOffer._production_variant_cache as Record<string, unknown>) }
              : {};
          cache.combos = combos;
          cache.available_count = combos.length;
          cache.type1_label = asText(variations.type1_label || variations.type1Label);
          cache.type2_label = asText(variations.type2_label || variations.type2Label);
          cache.type3_label = asText(variations.type3_label || variations.type3Label);
          cache.weight_review =
            enhanced.weight_review_1688 && typeof enhanced.weight_review_1688 === "object"
              ? enhanced.weight_review_1688
              : null;
          cache.cached_at = new Date().toISOString();
          selectedOffer._production_variant_cache = cache;
          if (selectionFromPayload) {
            selectedOffer._production_variant_selection = selectionFromPayload;
          }
          if (detailUrl) selectedOffer.detailUrl = detailUrl;
          if (offerId) selectedOffer.offerId = offerId;

          const updatePayload: Record<string, unknown> = {
            selected_offer: selectedOffer,
            updated_at: new Date().toISOString(),
          };
          if (offerId) updatePayload.selected_offer_id = offerId;
          if (detailUrl) updatePayload.selected_detail_url = detailUrl;

          const updateResult = await adminClient
            .from("discovery_production_supplier_selection")
            .update(updatePayload)
            .eq("provider", "partner_suggestions")
            .eq("product_id", id);

          if (updateResult.error) {
            throw new Error(updateResult.error.message);
          }
          selectionSynced = true;
        } catch (error) {
          selectionSyncError = error instanceof Error ? error.message : String(error);
          selectionSyncErrors.push({ id, error: selectionSyncError });
        }
      }
    }

    const ai = toObjectRecord(enhanced.ai_1688);
    const inference = toObjectRecord(ai.weight_inference);
    const pieceMap = toObjectRecord(inference.piece_weight_table_mapping);
    processed.push({
      id,
      before_weighted: beforeStats.weighted,
      before_total: beforeStats.total,
      after_weighted: afterStats.weighted,
      after_total: afterStats.total,
      delta_weighted: afterStats.weighted - beforeStats.weighted,
      ai_model: asText(inference.model || toObjectRecord(ai.weight_review).model) || null,
      ai_decision: asText(inference.decision) || null,
      ai_confidence_0_to_10: Number(inference.confidence_0_to_10) || 0,
      ai_applied_count: Number(inference.applied_count) || 0,
      ai_error: asText(inference.error) || null,
      piece_rows: Number(pieceMap.row_count) || 0,
      piece_applied: Number(pieceMap.applied_count) || 0,
      rescrape_used: rescrapeUsed,
      rescrape_error: rescrapeError || null,
      selection_synced: selectionSynced,
      selection_sync_error: selectionSyncError || null,
    });
  }

  const improved = processed.filter((entry) => Number(entry.delta_weighted) > 0).length;
  const totalBeforeWeighted = processed.reduce(
    (sum, entry) => sum + Number(entry.before_weighted || 0),
    0
  );
  const totalAfterWeighted = processed.reduce(
    (sum, entry) => sum + Number(entry.after_weighted || 0),
    0
  );
  const totalCombos = processed.reduce((sum, entry) => sum + Number(entry.after_total || 0), 0);

  console.log(
    JSON.stringify(
      {
        ok: true,
        dry_run: dryRun,
        rescrape,
        sync_selection: syncSelection,
        processed: processed.length,
        improved_records: improved,
        total_combos: totalCombos,
        total_weighted_before: totalBeforeWeighted,
        total_weighted_after: totalAfterWeighted,
        model_candidates: modelCandidates,
        selection_sync_errors: selectionSyncErrors,
        results: processed,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
