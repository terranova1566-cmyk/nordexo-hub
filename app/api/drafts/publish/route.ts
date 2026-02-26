import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "path";
import { createHash } from "crypto";
import { spawn } from "child_process";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  isExcludedPublishArtifactName,
  isImageFileName,
  isJpegFileName,
  isPublishableImageName,
  normalizeImageNamesInFolder,
  validateImageFolder,
} from "@/lib/image-names";
import { DRAFT_ROOT } from "@/lib/drafts";
import { archiveDraftImageVersion } from "@/lib/draft-image-versions";
import {
  listPendingAiEdits,
  resolvePendingAiEdit,
} from "@/lib/draft-ai-edits";
import { runMeiliIndexSpus } from "@/lib/server/meili-index";
import { recalculateB2BPricesForSpus } from "@/lib/pricing/recalculate-b2b-spus";
import { recalculateB2CPricesForSpus } from "@/lib/pricing/recalculate-b2c-spus";
import {
  getProductionRefsBySpus,
  upsertProductionStatuses,
} from "@/lib/production-queue-status";

export const runtime = "nodejs";

const MEDIA_ROOT = "/srv/resources/media";
const NEW_CATALOG_ROOT =
  process.env.CATALOG_IMPORT_ROOT || "/srv/resources/media/images/new-nd-catalog";
const CATALOG_ROOT =
  process.env.CATALOG_IMAGE_ROOT || "/srv/resources/media/images/catalog";
const PUBLISH_ROLLBACK_LOG_ROOT =
  process.env.PUBLISH_ROLLBACK_LOG_ROOT || "/srv/nordexo-hub/logs/publish-rollback";
const MEDIA_LIBRARY_SCRIPT =
  process.env.MEDIA_LIBRARY_SCRIPT ||
  "/srv/shopify-sync/api/scripts/ingest-media-library.mjs";
const PUBLISH_IMAGE_MAX_DIMENSION_PX = 1000;
const PUBLISH_IMAGE_QUALITY = 90;
const DEFAULT_TAX_CODE = "HST20";
const DEFAULT_COUNTRY_OF_ORIGIN = "CN";
const DIGI_TAG_IN_FILE_NAME = /(?:\(\s*DIGI?\s*\)|(?:^|[-_ ])DIGI?(?:[-_ .)]|$))/i;
const PRODUCT_CATEGORIZER_SCRIPT =
  process.env.PRODUCT_CATEGORIZER_SCRIPT ||
  "/srv/node-tools/product-categorizer/scripts/product_categorizer.mjs";
const DISCOVERY_PROVIDER_TABLE_BY_KEY: Record<string, "cdon_products" | "fyndiq_products"> = {
  cdon: "cdon_products",
  fyndiq: "fyndiq_products",
};

const shouldDisableTaxonomyCategorizer = () => {
  const raw = String(process.env.DISABLE_PRODUCT_TAXONOMY_CATEGORIZER || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(raw);
};

const spawnTaxonomyCategorizerForSpus = async (spus: string[]) => {
  if (shouldDisableTaxonomyCategorizer()) return;
  const uniq = Array.from(new Set(spus.map((v) => String(v || "").trim()).filter(Boolean)));
  if (!uniq.length) return;

  const model = process.env.PRODUCT_TAXONOMY_MODEL || "gpt-5-mini";
  const pass1Provider = process.env.PRODUCT_TAXONOMY_PASS1_PROVIDER || "openai";

  const argsBase = [
    PRODUCT_CATEGORIZER_SCRIPT,
    "--table",
    "catalog_products",
    "--spu-only",
    "--only-missing",
    "--pass1-provider",
    pass1Provider,
    "--model-pass1",
    model,
    "--model-pass2",
    model,
    "--rpm",
    String(process.env.PRODUCT_TAXONOMY_RPM || "180"),
    "--concurrency",
    String(process.env.PRODUCT_TAXONOMY_CONCURRENCY || "4"),
    "--page-size",
    String(process.env.PRODUCT_TAXONOMY_PAGE_SIZE || "50"),
    "--upsert-batch-size",
    String(process.env.PRODUCT_TAXONOMY_UPSERT_BATCH_SIZE || "50"),
    "--title-fields",
    String(process.env.PRODUCT_TAXONOMY_TITLE_FIELDS || "title,legacy_title_sv"),
    "--desc-fields",
    String(process.env.PRODUCT_TAXONOMY_DESC_FIELDS || "description_html,legacy_description_sv"),
    "--desc-words",
    String(process.env.PRODUCT_TAXONOMY_DESC_WORDS || "80"),
  ];

  // Avoid extremely long command lines by using a temp file when needed.
  const joined = uniq.join(",");
  const args = [...argsBase];
  if (joined.length > 6000 || uniq.length > 400) {
    const filePath = `/tmp/spu_list_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`;
    await fs.writeFile(filePath, `${uniq.join("\n")}\n`, "utf8");
    args.push("--spu-file", filePath);
  } else {
    args.push("--spu-in", joined);
  }

  try {
    const child = spawn("node", args, { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // Best-effort only. Publish should not fail due to categorization.
  }
};

type DraftProductRow = {
  id: string;
  draft_spu: string;
  draft_title: string | null;
  draft_subtitle: string | null;
  draft_description_html: string | null;
  draft_product_description_main_html: string | null;
  draft_mf_product_short_title: string | null;
  draft_mf_product_long_title: string | null;
  draft_mf_product_subtitle: string | null;
  draft_mf_product_bullets_short: string | null;
  draft_mf_product_bullets: string | null;
  draft_mf_product_bullets_long: string | null;
  draft_mf_product_specs: string | null;
  draft_mf_product_description_short_html: string | null;
  draft_mf_product_description_extended_html: string | null;
  draft_option1_name: string | null;
  draft_option2_name: string | null;
  draft_option3_name: string | null;
  draft_option4_name: string | null;
  draft_legacy_title_sv: string | null;
  draft_legacy_description_sv: string | null;
  draft_legacy_bullets_sv: string | null;
  draft_supplier_1688_url: string | null;
  draft_image_folder: string | null;
  draft_main_image_url: string | null;
  draft_image_urls: string[] | null;
  draft_raw_row: Record<string, unknown> | null;
  draft_created_at: string | null;
};

type DraftVariantRow = {
  id: string;
  draft_spu: string | null;
  draft_sku: string | null;
  draft_option1: string | null;
  draft_option2: string | null;
  draft_option3: string | null;
  draft_option4: string | null;
  draft_option_combined_zh: string | null;
  draft_option1_zh: string | null;
  draft_option2_zh: string | null;
  draft_option3_zh: string | null;
  draft_option4_zh: string | null;
  draft_price: string | number | null;
  draft_compare_at_price: string | number | null;
  draft_cost: string | number | null;
  draft_weight: string | number | null;
  draft_weight_unit: string | null;
  draft_barcode: string | null;
  draft_variant_image_url: string | null;
  draft_shipping_name_en: string | null;
  draft_short_title_zh: string | null;
  draft_shipping_name_zh: string | null;
  draft_shipping_class: string | null;
  draft_taxable: string | null;
  draft_tax_code: string | null;
  draft_hs_code: string | null;
  draft_country_of_origin: string | null;
  draft_category_code_fq: string | null;
  draft_category_code_ld: string | null;
  draft_supplier_name: string | null;
  draft_supplier_location: string | null;
  draft_b2b_dropship_price_se: string | number | null;
  draft_b2b_dropship_price_no: string | number | null;
  draft_b2b_dropship_price_dk: string | number | null;
  draft_b2b_dropship_price_fi: string | number | null;
  draft_purchase_price_cny: string | number | null;
  draft_raw_row: Record<string, unknown> | null;
};

type PublishStgSpuRow = {
  spu: string;
  subtitle: string | null;
  mf_product_short_title: string | null;
  mf_product_long_title: string | null;
  mf_product_subtitle: string | null;
  mf_product_bullets_short: string | null;
  mf_product_bullets: string | null;
  mf_product_bullets_long: string | null;
  mf_product_specs: string | null;
  mf_product_description_short_html: string | null;
  mf_product_description_extended_html: string | null;
  [key: string]: unknown;
};

type PublishStgSkuRow = {
  spu: string | null;
  sku: string | null;
  price: string | null;
  compare_at_price: string | null;
  cost: string | null;
  weight: string | null;
  variant_image_url: string | null;
  variation_color_se: string | null;
  variation_size_se: string | null;
  variation_other_se: string | null;
  variation_amount_se: string | null;
  [key: string]: unknown;
};

const normalizeText = (value: unknown) => {
  const text = value == null ? "" : String(value);
  const cleaned = text
    // Excel sometimes encodes carriage returns as a literal token in the cell text.
    .replace(/_x000d_/gi, "")
    // Normalize newlines; keep line breaks but avoid CR artifacts.
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  return cleaned === "" ? null : cleaned;
};

const getSpuPrefix = (spu: string | null) => {
  const normalized = normalizeText(spu);
  if (!normalized) return null;
  const upper = normalized.toUpperCase();
  return upper.length >= 2 ? upper.slice(0, 2) : upper;
};

const normalizeSpu = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const matched = raw.match(/[A-Za-z]{1,5}-\d+/);
  if (matched?.[0]) return matched[0].toUpperCase();
  return raw.toUpperCase();
};

type ProductionSpuLinkRow = {
  provider: string;
  product_id: string;
  spu: string | null;
  assigned_at: string | null;
};

const syncDiscoveryIdenticalSpuLinks = async (
  adminClient: SupabaseClient,
  spus: string[]
) => {
  const uniqueSpus = Array.from(
    new Set(spus.map((spu) => normalizeSpu(spu)).filter(Boolean))
  ) as string[];
  if (uniqueSpus.length === 0) {
    return {
      candidates: 0,
      updated: 0,
      skipped_existing: 0,
      skipped_missing_product_row: 0,
    };
  }

  const { data: linkRows, error: linkError } = await adminClient
    .from("discovery_production_item_spus")
    .select("provider, product_id, spu, assigned_at")
    .in("spu", uniqueSpus);

  if (linkError) {
    throw new Error(linkError.message);
  }

  const latestByKey = new Map<
    string,
    {
      provider: string;
      product_id: string;
      spu: string;
      assigned_at: string | null;
    }
  >();

  (linkRows as ProductionSpuLinkRow[] | null)?.forEach((row) => {
    const provider = String(row.provider || "").trim().toLowerCase();
    const productId = String(row.product_id || "").trim();
    const spu = normalizeSpu(row.spu);
    if (!provider || !productId || !spu) return;
    if (!DISCOVERY_PROVIDER_TABLE_BY_KEY[provider]) return;
    const key = `${provider}:${productId}`;
    const existing = latestByKey.get(key);
    if (!existing) {
      latestByKey.set(key, {
        provider,
        product_id: productId,
        spu,
        assigned_at: row.assigned_at ?? null,
      });
      return;
    }
    const existingTs = existing.assigned_at ? Date.parse(existing.assigned_at) : 0;
    const nextTs = row.assigned_at ? Date.parse(row.assigned_at) : 0;
    if (nextTs >= existingTs) {
      latestByKey.set(key, {
        provider,
        product_id: productId,
        spu,
        assigned_at: row.assigned_at ?? null,
      });
    }
  });

  const linksByProvider = new Map<
    string,
    Array<{
      product_id: string;
      spu: string;
    }>
  >();
  latestByKey.forEach((entry) => {
    const list = linksByProvider.get(entry.provider) ?? [];
    list.push({ product_id: entry.product_id, spu: entry.spu });
    linksByProvider.set(entry.provider, list);
  });

  let updated = 0;
  let skippedExisting = 0;
  let skippedMissingRow = 0;

  for (const [provider, links] of linksByProvider.entries()) {
    const table = DISCOVERY_PROVIDER_TABLE_BY_KEY[provider];
    if (!table || links.length === 0) continue;
    const productIds = Array.from(new Set(links.map((row) => row.product_id)));

    const { data: existingRows, error: existingError } = await adminClient
      .from(table)
      .select("product_id, identical_spu")
      .in("product_id", productIds);
    if (existingError) {
      throw new Error(existingError.message);
    }

    const existingById = new Map<
      string,
      {
        product_id: string;
        identical_spu: string | null;
      }
    >();
    (
      existingRows as
        | Array<{
            product_id: string;
            identical_spu: string | null;
          }>
        | null
    )?.forEach((row) => {
      const id = String(row.product_id ?? "").trim();
      if (!id) return;
      existingById.set(id, {
        product_id: id,
        identical_spu: row.identical_spu ?? null,
      });
    });

    for (const row of links) {
      const existing = existingById.get(row.product_id);
      if (!existing) {
        skippedMissingRow += 1;
        continue;
      }
      const existingSpu = String(existing.identical_spu ?? "").trim();
      if (existingSpu.length > 0) {
        skippedExisting += 1;
        continue;
      }

      const { error: updateError } = await adminClient
        .from(table)
        .update({ identical_spu: row.spu })
        .eq("product_id", row.product_id);
      if (updateError) {
        throw new Error(updateError.message);
      }
      updated += 1;
    }
  }

  return {
    candidates: latestByKey.size,
    updated,
    skipped_existing: skippedExisting,
    skipped_missing_product_row: skippedMissingRow,
  };
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(String(value || "").trim());
const isSrvPath = (value: string) => String(value || "").trim().startsWith("/srv/");

const toImageFileName = (value: string) =>
  path.basename(String(value || "").replace(/\\/g, "/").trim());

const normalizeVariantMatchToken = (value: unknown) => {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .trim();
  if (!normalized) return "";
  return normalized
    .replace(/\.[^.]+$/u, "")
    .replace(/[\s\-_]+/g, "")
    .replace(/[()[\]{}"'`~!@#$%^&*+=|\\:;,.<>/?]+/g, "");
};

const scoreVariantImageDirectory = (dirName: string) => {
  const normalized = String(dirName || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (!normalized.includes("variant")) return -1;
  if (normalized.includes("reject") || normalized.includes("mismatch")) return -1;
  if (normalized === "variantimages" || normalized === "variantimage") return 4;
  if (normalized.includes("variant") && normalized.includes("image")) return 3;
  return 1;
};

type VariantImageCandidate = {
  absolutePath: string;
  fileName: string;
  normalizedMatchKey: string;
};

const listVariantImageCandidates = async (folderAbsPath: string) => {
  const rootEntries = await fs.readdir(folderAbsPath, { withFileTypes: true });
  const variantDirs = rootEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ entry, score: scoreVariantImageDirectory(entry.name) }))
    .filter((row) => row.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.entry.name.localeCompare(right.entry.name);
    });
  if (variantDirs.length === 0) {
    return { variantDirName: null, files: [] as VariantImageCandidate[] };
  }

  const variantDirName = variantDirs[0].entry.name;
  const variantDirAbsPath = path.join(folderAbsPath, variantDirName);
  const variantEntries = await fs.readdir(variantDirAbsPath, { withFileTypes: true });
  const files = variantEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        isPublishableImageName(entry.name) &&
        !isExcludedPublishArtifactName(entry.name)
    )
    .map((entry) => ({
      absolutePath: path.join(variantDirAbsPath, entry.name),
      fileName: entry.name,
      normalizedMatchKey: normalizeVariantMatchToken(entry.name),
    }))
    .filter((entry) => entry.normalizedMatchKey.length > 0);

  return { variantDirName, files };
};

const sanitizeSkuForFileName = (value: string | null | undefined) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "variant";
  return normalized.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-");
};

const ensureUniqueImageName = async (
  folderAbsPath: string,
  preferredName: string
) => {
  const ext = path.extname(preferredName) || ".jpg";
  const stem = path.parse(preferredName).name || "image";
  let candidate = `${stem}${ext}`;
  let index = 2;
  while (await pathExists(path.join(folderAbsPath, candidate))) {
    candidate = `${stem}-${index}${ext}`;
    index += 1;
  }
  return candidate;
};

type AutoVariantImageAssignment = {
  variant_id: string;
  sku: string | null;
  assigned_file_name: string;
  source_file_name: string;
  source_folder: string;
  match_mode: "sku" | "option1" | "combined";
};

const autoAttachVariantImagesForPublish = async (input: {
  folderAbsPath: string;
  spu: string;
  variants: DraftVariantRow[];
}) => {
  const variantsMissingImage = input.variants.filter(
    (row) => !normalizeText(row.draft_variant_image_url)
  );
  if (variantsMissingImage.length === 0) {
    return {
      variantDirName: null as string | null,
      assignments: [] as AutoVariantImageAssignment[],
    };
  }

  const variantDir = await listVariantImageCandidates(input.folderAbsPath);
  if (!variantDir.variantDirName || variantDir.files.length === 0) {
    return {
      variantDirName: variantDir.variantDirName,
      assignments: [] as AutoVariantImageAssignment[],
    };
  }

  const variantKeys = variantsMissingImage.map((row) => {
    const raw =
      row.draft_raw_row && typeof row.draft_raw_row === "object"
        ? (row.draft_raw_row as Record<string, unknown>)
        : null;
    const skuKey = normalizeVariantMatchToken(row.draft_sku);
    const option1Key = normalizeVariantMatchToken(
      row.draft_option1 || getRawTextAny(raw, ["1688_cn_type1", "option1"])
    );
    const combinedKey = normalizeVariantMatchToken(
      row.draft_option_combined_zh || getRawTextAny(raw, ["1688 combined"])
    );
    return {
      row,
      skuKey: skuKey || null,
      option1Key: option1Key || null,
      combinedKey: combinedKey || null,
    };
  });

  const bestFileByVariantId = new Map<
    string,
    {
      file: VariantImageCandidate;
      matchMode: "sku" | "option1" | "combined";
      score: number;
    }
  >();

  for (const file of variantDir.files) {
    const matches: Array<{
      variant: (typeof variantKeys)[number];
      matchMode: "sku" | "option1" | "combined";
      score: number;
    }> = [];
    for (const variant of variantKeys) {
      if (variant.skuKey && file.normalizedMatchKey.includes(variant.skuKey)) {
        matches.push({ variant, matchMode: "sku", score: 300 });
        continue;
      }
      if (
        variant.option1Key &&
        variant.option1Key.length >= 2 &&
        file.normalizedMatchKey.includes(variant.option1Key)
      ) {
        matches.push({ variant, matchMode: "option1", score: 200 });
        continue;
      }
      if (
        variant.combinedKey &&
        variant.combinedKey.length >= 3 &&
        file.normalizedMatchKey.includes(variant.combinedKey)
      ) {
        matches.push({ variant, matchMode: "combined", score: 120 });
      }
    }
    if (matches.length !== 1) continue;
    const match = matches[0];
    const variantId = String(match.variant.row.id || "").trim();
    if (!variantId) continue;
    const existing = bestFileByVariantId.get(variantId);
    if (!existing || match.score > existing.score) {
      bestFileByVariantId.set(variantId, {
        file,
        matchMode: match.matchMode,
        score: match.score,
      });
    }
  }

  const assignments: AutoVariantImageAssignment[] = [];
  for (const variant of variantKeys) {
    const variantId = String(variant.row.id || "").trim();
    if (!variantId) continue;
    const match = bestFileByVariantId.get(variantId);
    if (!match) continue;

    const sourceExt = path.extname(match.file.fileName) || ".jpg";
    const preferredName = `${sanitizeSkuForFileName(variant.row.draft_sku)}-VAR${sourceExt}`;
    const sourceAbsPath = path.resolve(match.file.absolutePath);
    const directTopLevelTarget = path.join(input.folderAbsPath, preferredName);
    let assignedFileName = preferredName;

    if (sourceAbsPath !== path.resolve(directTopLevelTarget)) {
      assignedFileName = await ensureUniqueImageName(input.folderAbsPath, preferredName);
      await fs.copyFile(sourceAbsPath, path.join(input.folderAbsPath, assignedFileName));
    }

    variant.row.draft_variant_image_url = assignedFileName;
    assignments.push({
      variant_id: variantId,
      sku: normalizeText(variant.row.draft_sku),
      assigned_file_name: assignedFileName,
      source_file_name: match.file.fileName,
      source_folder: variantDir.variantDirName,
      match_mode: match.matchMode,
    });
  }

  return {
    variantDirName: variantDir.variantDirName,
    assignments,
  };
};

const resolveVariantImageForPublish = (input: {
  spu: string | null;
  value: string | null;
  renameMapBySpu: Map<string, Map<string, string>>;
  finalTopLevelImagesBySpu: Map<string, Set<string>>;
}) => {
  const normalized = normalizeText(input.value);
  if (!normalized) {
    return { value: null, issue: null as string | null };
  }

  // Keep explicit URLs and absolute paths unchanged.
  if (isHttpUrl(normalized) || isSrvPath(normalized)) {
    return { value: normalized, issue: null as string | null };
  }

  const spu = normalizeText(input.spu);
  const fileName = toImageFileName(normalized);
  if (!fileName) {
    return {
      value: null,
      issue: "Variant image reference is invalid after normalization.",
    };
  }

  const renameMap = spu ? input.renameMapBySpu.get(spu) : undefined;
  const finalName = renameMap?.get(fileName.toLowerCase()) ?? fileName;

  const finalImageSet = spu ? input.finalTopLevelImagesBySpu.get(spu) : undefined;
  if (finalImageSet && finalImageSet.size > 0 && !finalImageSet.has(finalName.toLowerCase())) {
    return {
      value: null,
      issue: `Variant image "${fileName}" is not in the final top-level publish image set.`,
    };
  }

  return { value: finalName, issue: null as string | null };
};

const buildFallbackVariant = (product: DraftProductRow): DraftVariantRow => {
  const raw = product.draft_raw_row && typeof product.draft_raw_row === "object"
    ? (product.draft_raw_row as Record<string, unknown>)
    : null;
  return {
    id: `fallback-${product.draft_spu || ""}`,
    draft_spu: product.draft_spu,
    draft_sku: product.draft_spu,
    draft_option1: null,
    draft_option2: null,
    draft_option3: null,
    draft_option4: null,
    draft_option_combined_zh: null,
    draft_option1_zh: null,
    draft_option2_zh: null,
    draft_option3_zh: null,
    draft_option4_zh: null,
    draft_price: getRawTextAny(raw, ["price", "product_price", "product_price_cny"]),
    draft_compare_at_price: null,
    draft_cost: getRawTextAny(raw, ["cost", "product_cost", "product_cost_cny"]),
    draft_weight: getRawTextAny(raw, [
      "product_weights_1688",
      "product_weight_gram",
      "product_weight",
      "weight",
    ]),
    draft_weight_unit: null,
    draft_barcode: null,
    draft_variant_image_url: null,
    draft_shipping_name_en: getRawTextAny(raw, [
      "EN_shipname",
      "en_shipname",
      "shipping_name_en",
    ]),
    draft_short_title_zh: getRawTextAny(raw, [
      "CN_title",
      "cn_title",
      "short_title_zh",
    ]),
    draft_shipping_name_zh: getRawTextAny(raw, [
      "CN_shipname",
      "cn_shipname",
      "shipping_name_zh",
    ]),
    draft_shipping_class: getRawTextAny(raw, [
      "product_shiptype",
      "product_shipType",
    ]),
    draft_taxable: null,
    draft_tax_code: getRawTextAny(raw, ["tax_code", "taxcode", "tax code"]),
    draft_hs_code: getRawTextAny(raw, ["hs_code", "HS_code", "hs code"]),
    draft_country_of_origin: getRawTextAny(raw, [
      "country_of_origin",
      "country of origin",
      "origin_country",
      "origin",
    ]),
    draft_category_code_fq: null,
    draft_category_code_ld: null,
    draft_supplier_name: getRawTextAny(raw, [
      "supplier_name_1688",
      "supplier_name",
    ]),
    draft_supplier_location: null,
    draft_b2b_dropship_price_se: null,
    draft_b2b_dropship_price_no: null,
    draft_b2b_dropship_price_dk: null,
    draft_b2b_dropship_price_fi: null,
    draft_purchase_price_cny: getRawTextAny(raw, [
      "purchase_price_cny",
      "purchase_price",
      "purchase price",
    ]),
    draft_raw_row: raw ?? null,
  };
};

const getRawText = (raw: Record<string, unknown> | null | undefined, key: string) => {
  if (!raw || typeof raw !== "object") return null;
  return normalizeText((raw as Record<string, unknown>)[key]);
};

const getRawTextAny = (
  raw: Record<string, unknown> | null | undefined,
  keys: string[]
) => {
  for (const key of keys) {
    const value = getRawText(raw, key);
    if (value) return value;
  }
  return null;
};

const chunkRows = <T,>(rows: T[], size = 200) => {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
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

const resolveDraftFolder = (value: string) => {
  const trimmed = value.replace(/^\/+/, "");
  const abs = value.startsWith("/")
    ? path.resolve(value)
    : path.resolve(MEDIA_ROOT, trimmed);
  if (!abs.startsWith(`${MEDIA_ROOT}${path.sep}`)) return null;
  return abs;
};

const toDraftRelativeFolder = (folderAbsPath: string) => {
  const normalized = path.resolve(folderAbsPath);
  const normalizedRoot = path.resolve(DRAFT_ROOT);
  if (normalized === normalizedRoot) return "";
  if (!normalized.startsWith(`${normalizedRoot}${path.sep}`)) return null;
  return normalized.slice(normalizedRoot.length + 1).replace(/\\/g, "/");
};

const autoPromotePendingAiEdits = async (folderAbsPath: string) => {
  const relativeFolder = toDraftRelativeFolder(folderAbsPath);
  if (relativeFolder == null) {
    return { resolvedCount: 0, errors: [] as string[] };
  }

  const pending = listPendingAiEdits(relativeFolder);
  if (pending.length === 0) {
    return { resolvedCount: 0, errors: [] as string[] };
  }

  let resolvedCount = 0;
  const errors: string[] = [];
  for (const record of pending) {
    try {
      await resolvePendingAiEdit({
        originalPath: record.originalPath,
        decision: "replace_with_ai",
        requestedBy: null,
      });
      resolvedCount += 1;
    } catch (err) {
      errors.push(
        `${path.basename(record.originalPath)}: ${
          err instanceof Error ? err.message : "unable to auto-apply AI edit"
        }`
      );
    }
  }
  return { resolvedCount, errors };
};

const pathExists = async (absolutePath: string) => {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
};

const createTempJpegPath = (folderAbsPath: string, sourceName: string) => {
  const parsed = path.parse(sourceName);
  return path.join(
    folderAbsPath,
    `.${parsed.name}.publish-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 10)}.tmp.jpg`
  );
};

const ensureUniqueJpegName = async (
  folderAbsPath: string,
  baseName: string,
  keepName: string | null
) => {
  let candidate = `${baseName}.jpg`;
  let index = 2;
  while (true) {
    if (keepName && candidate.toLowerCase() === keepName.toLowerCase()) {
      return candidate;
    }
    if (!(await pathExists(path.join(folderAbsPath, candidate)))) {
      return candidate;
    }
    candidate = `${baseName}-${index}.jpg`;
    index += 1;
  }
};

const normalizeTopLevelImageFileToJpeg = async (
  folderAbsPath: string,
  fileName: string
) => {
  const sourceAbsPath = path.join(folderAbsPath, fileName);
  const preserveDigiResolution = DIGI_TAG_IN_FILE_NAME.test(fileName);
  if (preserveDigiResolution && isJpegFileName(fileName)) {
    // DIGI images must not be re-encoded/downscaled once they are already JPEG.
    return fileName;
  }
  const parsed = path.parse(fileName);
  const baseName = parsed.name.trim() || "image";
  const keepName = isJpegFileName(fileName) ? fileName : null;
  const targetName = await ensureUniqueJpegName(folderAbsPath, baseName, keepName);
  const targetAbsPath = path.join(folderAbsPath, targetName);
  const tempAbsPath = createTempJpegPath(folderAbsPath, fileName);

  try {
    const image = sharp(sourceAbsPath, { failOnError: false }).rotate();
    const prepared = preserveDigiResolution
      ? image
      : image.resize({
          width: PUBLISH_IMAGE_MAX_DIMENSION_PX,
          height: PUBLISH_IMAGE_MAX_DIMENSION_PX,
          fit: "inside",
          withoutEnlargement: true,
        });
    await prepared
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: PUBLISH_IMAGE_QUALITY, mozjpeg: true })
      .toFile(tempAbsPath);

    await fs.rm(targetAbsPath, { force: true });
    await fs.rename(tempAbsPath, targetAbsPath);

    if (sourceAbsPath !== targetAbsPath) {
      await fs.rm(sourceAbsPath, { force: true });
    }
    return targetName;
  } catch (error) {
    await fs.rm(tempAbsPath, { force: true });
    throw error;
  }
};

const prepareFolderImagesForPublish = async (folderAbsPath: string) => {
  const entries = await fs.readdir(folderAbsPath, { withFileTypes: true });
  const imageArtifacts = entries.filter(
    (entry) =>
      entry.isFile() &&
      isImageFileName(entry.name) &&
      isExcludedPublishArtifactName(entry.name)
  );
  for (const artifact of imageArtifacts) {
    await fs.rm(path.join(folderAbsPath, artifact.name), { force: true });
  }

  const initialImageFiles = entries
    .filter((entry) => entry.isFile() && isPublishableImageName(entry.name))
    .map((entry) => entry.name);
  const jpegRenamePairs: Array<{ sourceName: string; targetName: string }> = [];
  for (const fileName of initialImageFiles) {
    try {
      archiveDraftImageVersion({
        imageAbsolutePath: path.join(folderAbsPath, fileName),
        reason: "before-publish",
      });
    } catch {
      // Best effort only; publish should continue if archive copy fails.
    }
    const targetName = await normalizeTopLevelImageFileToJpeg(folderAbsPath, fileName);
    if (targetName !== fileName) {
      jpegRenamePairs.push({ sourceName: fileName, targetName });
    }
  }

  const postEntries = await fs.readdir(folderAbsPath, { withFileTypes: true });
  const publishableImages = postEntries
    .filter((entry) => entry.isFile() && isPublishableImageName(entry.name))
    .map((entry) => entry.name);
  const nonJpgFiles = publishableImages.filter((name) => !isJpegFileName(name));

  return {
    removedArtifacts: imageArtifacts.length,
    imagesPrepared: publishableImages.length,
    nonJpgFiles,
    jpegRenamePairs,
    ignoredSubfolders: postEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  };
};

const copyFinalPublishImagesToCatalog = async (src: string, dest: string) => {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });

  const entries = await fs.readdir(src, { withFileTypes: true });
  const filesToCopy = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        isPublishableImageName(entry.name) &&
        isJpegFileName(entry.name)
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const fileName of filesToCopy) {
    await fs.copyFile(path.join(src, fileName), path.join(dest, fileName));
  }

  return {
    copiedCount: filesToCopy.length,
    ignoredSubfolders: entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  };
};

const resolveArchivePath = (archiveRoot: string, name: string) => {
  const base = path.join(archiveRoot, name);
  if (!existsSync(base)) return base;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(archiveRoot, `${name}-${stamp}`);
};

const copyFolder = async (src: string, dest: string) => {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyFolder(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
};

const archiveDraftRun = async (runFolder: string) => {
  const archiveRoot = path.join(path.dirname(runFolder), "Draft Archive");
  await fs.mkdir(archiveRoot, { recursive: true });
  const dest = resolveArchivePath(archiveRoot, path.basename(runFolder));
  await copyFolder(runFolder, dest);
  return dest;
};

const getPublishImageSerial = (fileName: string) => {
  const match = String(fileName || "").match(/^[^-]+-(\d+)(?:[-.]|$)/);
  if (!match?.[1]) return Number.MAX_SAFE_INTEGER;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
};

const hashFileSha256 = async (absolutePath: string) => {
  const buffer = await fs.readFile(absolutePath);
  return createHash("sha256").update(buffer).digest("hex");
};

const removeDuplicateTopLevelImagesByHash = async (folderAbsPath: string) => {
  const entries = await fs.readdir(folderAbsPath, { withFileTypes: true });
  const candidates = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        isPublishableImageName(entry.name) &&
        isJpegFileName(entry.name)
    )
    .map((entry) => entry.name)
    .sort((left, right) => {
      const leftSerial = getPublishImageSerial(left);
      const rightSerial = getPublishImageSerial(right);
      if (leftSerial !== rightSerial) return leftSerial - rightSerial;
      return left.localeCompare(right);
    });

  const seenHashes = new Set<string>();
  const removedFileNames: string[] = [];
  for (const fileName of candidates) {
    const absolutePath = path.join(folderAbsPath, fileName);
    const hash = await hashFileSha256(absolutePath);
    if (!seenHashes.has(hash)) {
      seenHashes.add(hash);
      continue;
    }
    await fs.rm(absolutePath, { force: true });
    removedFileNames.push(fileName);
  }

  return { removedFileNames };
};

type PublishRollbackSnapshotInput = {
  now: string;
  spus: string[];
  products: DraftProductRow[];
  variants: DraftVariantRow[];
  stgSpuRows: Array<Record<string, unknown>>;
  stgSkuRows: Array<Record<string, unknown>>;
  runFolders: Map<string, string[]>;
  archivedRuns: Map<string, string>;
  archiveResults: Array<{
    runFolder: string;
    archived: boolean;
    archivePath?: string;
    error?: string;
  }>;
  finalTopLevelImageNamesBySpu: Map<string, string[]>;
};

const writePublishRollbackSnapshot = async (
  input: PublishRollbackSnapshotInput
) => {
  try {
    await fs.mkdir(PUBLISH_ROLLBACK_LOG_ROOT, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(
      PUBLISH_ROLLBACK_LOG_ROOT,
      `publish-snapshot-${stamp}.json`
    );

    const runFoldersBySpu: Record<
      string,
      { runFolder: string; archivePath: string | null; archiveSpuPath: string | null }
    > = {};
    for (const [runFolder, rawSpus] of input.runFolders.entries()) {
      const archivePath = input.archivedRuns.get(runFolder) ?? null;
      const uniqueSpus = Array.from(
        new Set(rawSpus.map((value) => String(value || "").trim()).filter(Boolean))
      );
      for (const spu of uniqueSpus) {
        runFoldersBySpu[spu] = {
          runFolder,
          archivePath,
          archiveSpuPath: archivePath ? path.join(archivePath, spu) : null,
        };
      }
    }

    const finalImageNamesBySpu = Object.fromEntries(
      Array.from(input.finalTopLevelImageNamesBySpu.entries()).map(([spu, names]) => [
        spu,
        [...names],
      ])
    );

    const payload = {
      captured_at: new Date().toISOString(),
      publish_started_at: input.now,
      spus: [...input.spus],
      draft_products: input.products,
      draft_variants: input.variants,
      stg_import_spu_rows: input.stgSpuRows,
      stg_import_sku_rows: input.stgSkuRows,
      final_top_level_image_names_by_spu: finalImageNamesBySpu,
      archive_runs: input.archiveResults,
      archive_by_spu: runFoldersBySpu,
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return { ok: true as const, filePath };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unknown snapshot error",
    };
  }
};

const runMediaIngest = async (spus: string[]) => {
  if (spus.length === 0) return { ok: true, skipped: true };
  if (!existsSync(MEDIA_LIBRARY_SCRIPT)) {
    return { ok: false, error: "Media library script not found." };
  }

  const args = [
    MEDIA_LIBRARY_SCRIPT,
    "--source",
    NEW_CATALOG_ROOT,
    "--dest",
    CATALOG_ROOT,
    "--spu",
    spus.join(","),
  ];

  return new Promise<{ ok: boolean; code?: number; error?: string }>(
    (resolve) => {
      const child = spawn(process.execPath, args, {
        env: {
          ...process.env,
          SUPABASE_URL: process.env.SUPABASE_URL,
          SUPABASE_SERVICE_ROLE:
            process.env.SUPABASE_SERVICE_ROLE ||
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.SUPABASE_SERVICE_KEY,
        },
        stdio: ["ignore", "inherit", "pipe"],
      });
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve({ ok: true, code });
        } else {
          resolve({
            ok: false,
            code: code ?? undefined,
            error: stderr.slice(-600) || "Media ingest failed.",
          });
        }
      });
    }
  );
};

const normalizeSkuKey = (value: unknown) =>
  String(value ?? "").trim().toUpperCase();

const buildExpectedSkuSetBySpu = (
  rows: Array<{ spu: string | null; sku: string | null }>
) => {
  const bySpu = new Map<string, Set<string>>();
  for (const row of rows) {
    const spu = String(row.spu || "").trim();
    const skuKey = normalizeSkuKey(row.sku);
    if (!spu || !skuKey) continue;
    const set = bySpu.get(spu) ?? new Set<string>();
    set.add(skuKey);
    bySpu.set(spu, set);
  }
  return bySpu;
};

const pruneCatalogVariantsToPublishedSet = async (
  adminClient: SupabaseClient,
  rows: Array<{ spu: string | null; sku: string | null }>
) => {
  const expectedSkuSetBySpu = buildExpectedSkuSetBySpu(rows);
  if (expectedSkuSetBySpu.size === 0) {
    return { products: 0, stale_variants_removed: 0 };
  }

  const spus = Array.from(expectedSkuSetBySpu.keys());
  const { data: productRows, error: productError } = await adminClient
    .from("catalog_products")
    .select("id,spu")
    .in("spu", spus);
  if (productError) {
    throw new Error(`Unable to load catalog products for variant pruning: ${productError.message}`);
  }

  const productIds: string[] = [];
  const spuByProductId = new Map<string, string>();
  for (const row of (productRows ?? []) as Array<{ id: string; spu: string | null }>) {
    const productId = String(row.id || "").trim();
    const spu = String(row.spu || "").trim();
    if (!productId || !spu || !expectedSkuSetBySpu.has(spu)) continue;
    productIds.push(productId);
    spuByProductId.set(productId, spu);
  }
  if (productIds.length === 0) {
    return { products: 0, stale_variants_removed: 0 };
  }

  const { data: variantRows, error: variantError } = await adminClient
    .from("catalog_variants")
    .select("id,product_id,sku")
    .in("product_id", productIds);
  if (variantError) {
    throw new Error(`Unable to load catalog variants for pruning: ${variantError.message}`);
  }

  const staleVariantIds: string[] = [];
  for (const row of (variantRows ?? []) as Array<{
    id: string;
    product_id: string | null;
    sku: string | null;
  }>) {
    const variantId = String(row.id || "").trim();
    const productId = String(row.product_id || "").trim();
    if (!variantId || !productId) continue;
    const spu = spuByProductId.get(productId);
    if (!spu) continue;
    const expectedSet = expectedSkuSetBySpu.get(spu);
    if (!expectedSet || expectedSet.size === 0) continue;
    const skuKey = normalizeSkuKey(row.sku);
    if (!skuKey || !expectedSet.has(skuKey)) {
      staleVariantIds.push(variantId);
    }
  }

  if (staleVariantIds.length === 0) {
    return { products: productIds.length, stale_variants_removed: 0 };
  }

  const chunkSize = 200;
  let removed = 0;
  for (let index = 0; index < staleVariantIds.length; index += chunkSize) {
    const chunk = staleVariantIds.slice(index, index + chunkSize);
    const { error: deleteVariantInShopError } = await adminClient
      .from("variant_in_shop")
      .delete()
      .in("catalog_variant_id", chunk);
    if (deleteVariantInShopError) {
      throw new Error(
        `Unable to prune stale variant_in_shop rows: ${deleteVariantInShopError.message}`
      );
    }

    const { error: deletePriceError } = await adminClient
      .from("catalog_variant_prices")
      .delete()
      .in("catalog_variant_id", chunk);
    if (deletePriceError) {
      throw new Error(
        `Unable to prune stale catalog variant prices: ${deletePriceError.message}`
      );
    }

    const { error: deleteMapError } = await adminClient
      .from("catalog_variant_image_map")
      .delete()
      .in("variant_id", chunk);
    if (deleteMapError) {
      throw new Error(
        `Unable to prune stale catalog variant image mappings: ${deleteMapError.message}`
      );
    }

    const { error: deleteVariantError, count } = await adminClient
      .from("catalog_variants")
      .delete({ count: "exact" })
      .in("id", chunk);
    if (deleteVariantError) {
      throw new Error(`Unable to prune stale catalog variants: ${deleteVariantError.message}`);
    }
    removed += count ?? 0;
  }

  return { products: productIds.length, stale_variants_removed: removed };
};

const resolvePreservableImageFileName = (value: string | null | undefined) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (isHttpUrl(normalized) || isSrvPath(normalized)) return null;
  const fileName = toImageFileName(normalized);
  if (!fileName) return null;
  if (!isImageFileName(fileName)) return null;
  return fileName;
};

const loadVariantImageNamesBySpu = async (
  adminClient: SupabaseClient,
  spus: string[]
) => {
  const normalizedSpus = Array.from(
    new Set(spus.map((spu) => String(spu || "").trim()).filter(Boolean))
  );
  const bySpu = new Map<string, string[]>();
  if (normalizedSpus.length === 0) {
    return bySpu;
  }

  const { data: productRows, error: productError } = await adminClient
    .from("catalog_products")
    .select("id,spu")
    .in("spu", normalizedSpus);
  if (productError) {
    throw new Error(
      `Unable to load catalog products for variant image preservation: ${productError.message}`
    );
  }

  const productIds: string[] = [];
  const spuByProductId = new Map<string, string>();
  for (const row of (productRows ?? []) as Array<{ id: string; spu: string | null }>) {
    const productId = String(row.id || "").trim();
    const spu = String(row.spu || "").trim();
    if (!productId || !spu) continue;
    productIds.push(productId);
    spuByProductId.set(productId, spu);
  }
  if (productIds.length === 0) {
    return bySpu;
  }

  const { data: variantRows, error: variantError } = await adminClient
    .from("catalog_variants")
    .select("product_id,variant_image_url")
    .in("product_id", productIds);
  if (variantError) {
    throw new Error(
      `Unable to load catalog variant image references for preservation: ${variantError.message}`
    );
  }

  const setBySpu = new Map<string, Set<string>>();
  for (const row of (variantRows ?? []) as Array<{
    product_id: string | null;
    variant_image_url: string | null;
  }>) {
    const productId = String(row.product_id || "").trim();
    if (!productId) continue;
    const spu = spuByProductId.get(productId);
    if (!spu) continue;
    const fileName = resolvePreservableImageFileName(row.variant_image_url);
    if (!fileName) continue;
    const set = setBySpu.get(spu) ?? new Set<string>();
    set.add(fileName);
    setBySpu.set(spu, set);
  }

  for (const [spu, set] of setBySpu.entries()) {
    bySpu.set(spu, Array.from(set.values()));
  }
  return bySpu;
};

const loadTingeloShopId = async (adminClient: SupabaseClient) => {
  const { data, error } = await adminClient
    .from("shops")
    .select("id")
    .eq("name", "shopify_tingelo")
    .maybeSingle();
  if (error) {
    throw new Error(`Unable to load shopify_tingelo shop id: ${error.message}`);
  }
  return String(data?.id || "").trim() || null;
};

const applyExplicitSpuFieldClears = async (
  adminClient: SupabaseClient,
  stgSpuRows: PublishStgSpuRow[]
) => {
  const normalizedRows = stgSpuRows
    .map((row) => ({
      spu: normalizeText(row.spu),
      subtitle: normalizeText(row.subtitle),
      mf_product_short_title: normalizeText(row.mf_product_short_title),
      mf_product_long_title: normalizeText(row.mf_product_long_title),
      mf_product_subtitle: normalizeText(row.mf_product_subtitle),
      mf_product_bullets_short: normalizeText(row.mf_product_bullets_short),
      mf_product_bullets: normalizeText(row.mf_product_bullets),
      mf_product_bullets_long: normalizeText(row.mf_product_bullets_long),
      mf_product_specs: normalizeText(row.mf_product_specs),
      mf_product_description_short_html: normalizeText(row.mf_product_description_short_html),
      mf_product_description_extended_html: normalizeText(
        row.mf_product_description_extended_html
      ),
    }))
    .filter((row): row is NonNullable<typeof row> & { spu: string } => Boolean(row.spu));

  if (normalizedRows.length === 0) {
    return { products_with_clears: 0, metafields_removed: 0, product_subtitles_cleared: 0 };
  }

  const spuList = Array.from(new Set(normalizedRows.map((row) => row.spu)));
  const { data: productRows, error: productError } = await adminClient
    .from("catalog_products")
    .select("id,spu")
    .in("spu", spuList);
  if (productError) {
    throw new Error(`Unable to load catalog products for clear semantics: ${productError.message}`);
  }
  const productIdBySpu = new Map<string, string>();
  for (const row of (productRows ?? []) as Array<{ id: string; spu: string | null }>) {
    const spu = String(row.spu || "").trim();
    const productId = String(row.id || "").trim();
    if (!spu || !productId) continue;
    productIdBySpu.set(spu, productId);
  }

  const metafieldKeyMap: Array<{
    stgField: keyof Omit<(typeof normalizedRows)[number], "spu" | "subtitle">;
    key: string;
  }> = [
    { stgField: "mf_product_short_title", key: "short_title" },
    { stgField: "mf_product_long_title", key: "long_title" },
    { stgField: "mf_product_subtitle", key: "subtitle" },
    { stgField: "mf_product_bullets_short", key: "bullets_short" },
    { stgField: "mf_product_bullets", key: "bullets" },
    { stgField: "mf_product_bullets_long", key: "bullets_long" },
    { stgField: "mf_product_specs", key: "specs" },
    { stgField: "mf_product_description_short_html", key: "description_short" },
    { stgField: "mf_product_description_extended_html", key: "description_extended" },
  ];
  const wantedMetaKeys = Array.from(new Set(metafieldKeyMap.map((entry) => entry.key)));
  const { data: definitionRows, error: definitionError } = await adminClient
    .from("metafield_definitions")
    .select("id,key,namespace")
    .eq("resource", "catalog_product")
    .in("namespace", ["product_global", "product.global"])
    .in("key", wantedMetaKeys);
  if (definitionError) {
    throw new Error(
      `Unable to load catalog product metafield definitions for clear semantics: ${definitionError.message}`
    );
  }

  const definitionIdsByKey = new Map<string, string[]>();
  for (const row of (definitionRows ?? []) as Array<{
    id: string | null;
    key: string | null;
    namespace: string | null;
  }>) {
    const key = String(row.key || "").trim();
    const id = String(row.id || "").trim();
    if (!key || !id) continue;
    const list = definitionIdsByKey.get(key) ?? [];
    list.push(id);
    definitionIdsByKey.set(key, list);
  }

  let productSubtitleClears = 0;
  let metafieldsRemoved = 0;
  let productsWithClears = 0;

  for (const row of normalizedRows) {
    const productId = productIdBySpu.get(row.spu);
    if (!productId) continue;

    let touched = false;
    if (!row.subtitle) {
      const { error } = await adminClient
        .from("catalog_products")
        .update({ subtitle: null, updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (error) {
        throw new Error(`Unable to clear product subtitle for ${row.spu}: ${error.message}`);
      }
      productSubtitleClears += 1;
      touched = true;
    }

    for (const mapEntry of metafieldKeyMap) {
      if (row[mapEntry.stgField]) continue;
      const definitionIds = definitionIdsByKey.get(mapEntry.key) ?? [];
      if (definitionIds.length === 0) continue;
      const { error, count } = await adminClient
        .from("metafield_values")
        .delete({ count: "exact" })
        .eq("target_type", "product")
        .eq("target_id", productId)
        .in("definition_id", definitionIds);
      if (error) {
        throw new Error(
          `Unable to clear metafield ${mapEntry.key} for ${row.spu}: ${error.message}`
        );
      }
      metafieldsRemoved += count ?? 0;
      touched = true;
    }

    if (touched) {
      productsWithClears += 1;
    }
  }

  return {
    products_with_clears: productsWithClears,
    metafields_removed: metafieldsRemoved,
    product_subtitles_cleared: productSubtitleClears,
  };
};

const applyExplicitSkuFieldClears = async (
  adminClient: SupabaseClient,
  stgSkuRows: PublishStgSkuRow[]
) => {
  const normalizedRows = stgSkuRows
    .map((row) => ({
      spu: normalizeText(row.spu),
      sku: normalizeText(row.sku),
      clear_option1: !normalizeText(row.option1),
      clear_option2: !normalizeText(row.option2),
      clear_option3: !normalizeText(row.option3),
      clear_option4: !normalizeText(row.option4),
      clear_option_combined_zh: !normalizeText(row.option_combined_zh),
      clear_option1_zh: !normalizeText(row.option1_zh),
      clear_option2_zh: !normalizeText(row.option2_zh),
      clear_option3_zh: !normalizeText(row.option3_zh),
      clear_option4_zh: !normalizeText(row.option4_zh),
      clear_weight: !normalizeText(row.weight),
      clear_price: !normalizeText(row.price),
      clear_compare_at_price: !normalizeText(row.compare_at_price),
      clear_cost: !normalizeText(row.cost),
      clear_variant_image_url: !normalizeText(row.variant_image_url),
      clear_variation_color_se: !normalizeText(row.variation_color_se),
      clear_variation_size_se: !normalizeText(row.variation_size_se),
      clear_variation_other_se: !normalizeText(row.variation_other_se),
      clear_variation_amount_se: !normalizeText(row.variation_amount_se),
    }))
    .filter(
      (row): row is NonNullable<typeof row> & { spu: string; sku: string } =>
        Boolean(row.spu && row.sku)
    );
  if (normalizedRows.length === 0) {
    return {
      variants_with_clears: 0,
      catalog_variants_updated: 0,
      variant_in_shop_updated: 0,
      variant_price_rows_updated: 0,
      variant_image_map_rows_removed: 0,
    };
  }

  const intentBySpuSku = new Map<
    string,
    {
      spu: string;
      sku: string;
      clear_option1: boolean;
      clear_option2: boolean;
      clear_option3: boolean;
      clear_option4: boolean;
      clear_option_combined_zh: boolean;
      clear_option1_zh: boolean;
      clear_option2_zh: boolean;
      clear_option3_zh: boolean;
      clear_option4_zh: boolean;
      clear_weight: boolean;
      clear_price: boolean;
      clear_compare_at_price: boolean;
      clear_cost: boolean;
      clear_variant_image_url: boolean;
      clear_variation_color_se: boolean;
      clear_variation_size_se: boolean;
      clear_variation_other_se: boolean;
      clear_variation_amount_se: boolean;
    }
  >();
  for (const row of normalizedRows) {
    const key = `${row.spu}::${row.sku.toUpperCase()}`;
    const existing = intentBySpuSku.get(key);
    if (!existing) {
      intentBySpuSku.set(key, row);
      continue;
    }
    existing.clear_option1 = existing.clear_option1 || row.clear_option1;
    existing.clear_option2 = existing.clear_option2 || row.clear_option2;
    existing.clear_option3 = existing.clear_option3 || row.clear_option3;
    existing.clear_option4 = existing.clear_option4 || row.clear_option4;
    existing.clear_option_combined_zh =
      existing.clear_option_combined_zh || row.clear_option_combined_zh;
    existing.clear_option1_zh = existing.clear_option1_zh || row.clear_option1_zh;
    existing.clear_option2_zh = existing.clear_option2_zh || row.clear_option2_zh;
    existing.clear_option3_zh = existing.clear_option3_zh || row.clear_option3_zh;
    existing.clear_option4_zh = existing.clear_option4_zh || row.clear_option4_zh;
    existing.clear_weight = existing.clear_weight || row.clear_weight;
    existing.clear_price = existing.clear_price || row.clear_price;
    existing.clear_compare_at_price =
      existing.clear_compare_at_price || row.clear_compare_at_price;
    existing.clear_cost = existing.clear_cost || row.clear_cost;
    existing.clear_variant_image_url =
      existing.clear_variant_image_url || row.clear_variant_image_url;
    existing.clear_variation_color_se =
      existing.clear_variation_color_se || row.clear_variation_color_se;
    existing.clear_variation_size_se =
      existing.clear_variation_size_se || row.clear_variation_size_se;
    existing.clear_variation_other_se =
      existing.clear_variation_other_se || row.clear_variation_other_se;
    existing.clear_variation_amount_se =
      existing.clear_variation_amount_se || row.clear_variation_amount_se;
  }

  const clearIntents = Array.from(intentBySpuSku.values()).filter(
    (row) =>
      row.clear_option1 ||
      row.clear_option2 ||
      row.clear_option3 ||
      row.clear_option4 ||
      row.clear_option_combined_zh ||
      row.clear_option1_zh ||
      row.clear_option2_zh ||
      row.clear_option3_zh ||
      row.clear_option4_zh ||
      row.clear_weight ||
      row.clear_price ||
      row.clear_compare_at_price ||
      row.clear_cost ||
      row.clear_variant_image_url ||
      row.clear_variation_color_se ||
      row.clear_variation_size_se ||
      row.clear_variation_other_se ||
      row.clear_variation_amount_se
  );
  if (clearIntents.length === 0) {
    return {
      variants_with_clears: 0,
      catalog_variants_updated: 0,
      variant_in_shop_updated: 0,
      variant_price_rows_updated: 0,
      variant_image_map_rows_removed: 0,
    };
  }

  const spus = Array.from(new Set(clearIntents.map((row) => row.spu)));
  const { data: productRows, error: productError } = await adminClient
    .from("catalog_products")
    .select("id,spu")
    .in("spu", spus);
  if (productError) {
    throw new Error(
      `Unable to load catalog products for SKU clear semantics: ${productError.message}`
    );
  }
  const productIds: string[] = [];
  const spuByProductId = new Map<string, string>();
  for (const row of (productRows ?? []) as Array<{ id: string; spu: string | null }>) {
    const productId = String(row.id || "").trim();
    const spu = String(row.spu || "").trim();
    if (!productId || !spu) continue;
    productIds.push(productId);
    spuByProductId.set(productId, spu);
  }
  if (productIds.length === 0) {
    return {
      variants_with_clears: 0,
      catalog_variants_updated: 0,
      variant_in_shop_updated: 0,
      variant_price_rows_updated: 0,
      variant_image_map_rows_removed: 0,
    };
  }

  const { data: variantRows, error: variantError } = await adminClient
    .from("catalog_variants")
    .select("id,product_id,sku")
    .in("product_id", productIds);
  if (variantError) {
    throw new Error(
      `Unable to load catalog variants for SKU clear semantics: ${variantError.message}`
    );
  }
  const variantIdBySpuSku = new Map<string, string>();
  for (const row of (variantRows ?? []) as Array<{
    id: string;
    product_id: string | null;
    sku: string | null;
  }>) {
    const variantId = String(row.id || "").trim();
    const productId = String(row.product_id || "").trim();
    const sku = String(row.sku || "").trim();
    if (!variantId || !productId || !sku) continue;
    const spu = spuByProductId.get(productId);
    if (!spu) continue;
    variantIdBySpuSku.set(`${spu}::${sku.toUpperCase()}`, variantId);
  }

  let catalogVariantsUpdated = 0;
  let variantInShopUpdated = 0;
  let variantPriceRowsUpdated = 0;
  let variantImageMapRowsRemoved = 0;

  const tingeloShopId = await loadTingeloShopId(adminClient);
  for (const intent of clearIntents) {
    const variantId = variantIdBySpuSku.get(`${intent.spu}::${intent.sku.toUpperCase()}`);
    if (!variantId) continue;

    const catalogPatch: Record<string, unknown> = {};
    if (intent.clear_option1) catalogPatch.option1 = null;
    if (intent.clear_option2) catalogPatch.option2 = null;
    if (intent.clear_option3) catalogPatch.option3 = null;
    if (intent.clear_option4) catalogPatch.option4 = null;
    if (intent.clear_option_combined_zh) catalogPatch.option_combined_zh = null;
    if (intent.clear_option1_zh) catalogPatch.option1_zh = null;
    if (intent.clear_option2_zh) catalogPatch.option2_zh = null;
    if (intent.clear_option3_zh) catalogPatch.option3_zh = null;
    if (intent.clear_option4_zh) catalogPatch.option4_zh = null;
    if (intent.clear_weight) catalogPatch.weight = null;
    if (intent.clear_price) catalogPatch.price = null;
    if (intent.clear_compare_at_price) catalogPatch.compare_at_price = null;
    if (intent.clear_cost) catalogPatch.cost = null;
    if (intent.clear_variant_image_url) catalogPatch.variant_image_url = null;
    if (intent.clear_variation_color_se) catalogPatch.variation_color_se = null;
    if (intent.clear_variation_size_se) catalogPatch.variation_size_se = null;
    if (intent.clear_variation_other_se) catalogPatch.variation_other_se = null;
    if (intent.clear_variation_amount_se) catalogPatch.variation_amount_se = null;
    if (Object.keys(catalogPatch).length > 0) {
      catalogPatch.updated_at = new Date().toISOString();
      const { error } = await adminClient
        .from("catalog_variants")
        .update(catalogPatch)
        .eq("id", variantId);
      if (error) {
        throw new Error(
          `Unable to apply catalog variant field clears for ${intent.spu}/${intent.sku}: ${error.message}`
        );
      }
      catalogVariantsUpdated += 1;
    }

    if (intent.clear_variant_image_url) {
      const { error, count } = await adminClient
        .from("catalog_variant_image_map")
        .delete({ count: "exact" })
        .eq("variant_id", variantId);
      if (error) {
        throw new Error(
          `Unable to clear catalog_variant_image_map for ${intent.spu}/${intent.sku}: ${error.message}`
        );
      }
      variantImageMapRowsRemoved += count ?? 0;
    }

    const hasCommercialClear =
      intent.clear_price || intent.clear_compare_at_price || intent.clear_cost;
    if (hasCommercialClear && tingeloShopId) {
      const variantInShopPatch: Record<string, unknown> = {};
      if (intent.clear_price) variantInShopPatch.price = null;
      if (intent.clear_compare_at_price) variantInShopPatch.compare_at_price = null;
      if (intent.clear_cost) variantInShopPatch.cost = null;
      if (Object.keys(variantInShopPatch).length > 0) {
        const { error, count } = await adminClient
          .from("variant_in_shop")
          .update(variantInShopPatch, { count: "exact" })
          .eq("catalog_variant_id", variantId)
          .eq("shop_id", tingeloShopId);
        if (error) {
          throw new Error(
            `Unable to clear variant_in_shop prices for ${intent.spu}/${intent.sku}: ${error.message}`
          );
        }
        variantInShopUpdated += count ?? 0;
      }

      const variantPricePatch: Record<string, unknown> = {};
      if (intent.clear_price) variantPricePatch.price = null;
      if (intent.clear_compare_at_price) variantPricePatch.compare_at_price = null;
      if (intent.clear_cost) variantPricePatch.cost = null;
      if (Object.keys(variantPricePatch).length > 0) {
        const { error, count } = await adminClient
          .from("catalog_variant_prices")
          .update(variantPricePatch, { count: "exact" })
          .eq("catalog_variant_id", variantId)
          .eq("price_type", "shopify_tingelo")
          .eq("shop_id", tingeloShopId)
          .is("deleted_at", null);
        if (error) {
          throw new Error(
            `Unable to clear shopify_tingelo variant prices for ${intent.spu}/${intent.sku}: ${error.message}`
          );
        }
        variantPriceRowsUpdated += count ?? 0;
      }
    }
  }

  return {
    variants_with_clears: clearIntents.length,
    catalog_variants_updated: catalogVariantsUpdated,
    variant_in_shop_updated: variantInShopUpdated,
    variant_price_rows_updated: variantPriceRowsUpdated,
    variant_image_map_rows_removed: variantImageMapRowsRemoved,
  };
};

const pruneCatalogImagesToPublishedSet = async (
  spu: string,
  expectedImageNames: string[],
  preservedImageNames: string[] = []
) => {
  const normalizedSpu = String(spu || "").trim();
  if (!normalizedSpu || (expectedImageNames.length === 0 && preservedImageNames.length === 0)) {
    return { removed_originals: 0, removed_derived: 0 };
  }

  const catalogSpuDir = path.join(CATALOG_ROOT, normalizedSpu);
  if (!existsSync(catalogSpuDir)) {
    return { removed_originals: 0, removed_derived: 0 };
  }

  const expectedImageSet = new Set(
    [...expectedImageNames, ...preservedImageNames]
      .map((name) => String(name || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const expectedBaseSet = new Set(
    expectedImageNames
      .map((name) => path.parse(String(name || "").trim()).name.toLowerCase())
      .filter(Boolean)
  );

  let removedOriginals = 0;
  let removedDerived = 0;

  const originalDir = path.join(catalogSpuDir, "original");
  if (existsSync(originalDir)) {
    const originalEntries = await fs.readdir(originalDir, { withFileTypes: true });
    for (const entry of originalEntries) {
      if (!entry.isFile()) continue;
      if (!isImageFileName(entry.name)) continue;
      if (expectedImageSet.has(entry.name.toLowerCase())) continue;
      await fs.rm(path.join(originalDir, entry.name), { force: true });
      removedOriginals += 1;
    }
  }

  for (const derivativeDirName of ["standard", "small", "thumb"]) {
    const derivativeDir = path.join(catalogSpuDir, derivativeDirName);
    if (!existsSync(derivativeDir)) continue;
    const derivativeEntries = await fs.readdir(derivativeDir, { withFileTypes: true });
    for (const entry of derivativeEntries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (ext !== ".webp") continue;
      const base = path.parse(entry.name).name.toLowerCase();
      if (expectedBaseSet.has(base)) continue;
      await fs.rm(path.join(derivativeDir, entry.name), { force: true });
      removedDerived += 1;
    }
  }

  const manifestPath = path.join(catalogSpuDir, ".media-manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      const parsed = JSON.parse(raw) as {
        originals?: Record<string, unknown>;
        [key: string]: unknown;
      };
      if (parsed && parsed.originals && typeof parsed.originals === "object") {
        const filteredOriginals: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(parsed.originals)) {
          if (expectedImageSet.has(String(name || "").toLowerCase())) {
            filteredOriginals[name] = value;
          }
        }
        parsed.originals = filteredOriginals;
        await fs.writeFile(manifestPath, JSON.stringify(parsed, null, 2), "utf8");
      }
    } catch {
      // Manifest cleanup is best-effort.
    }
  }

  return { removed_originals: removedOriginals, removed_derived: removedDerived };
};

export async function POST(request: Request) {
  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const spus: string[] = Array.isArray(body?.spus)
    ? body.spus.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
    : [];
  const publishAllRequested = Boolean(body?.publishAll);
  if (publishAllRequested) {
    return NextResponse.json(
      { error: "Global publishAll is disabled. Provide explicit SPUs." },
      { status: 400 }
    );
  }
  if (spus.length === 0) {
    return NextResponse.json(
      { error: "No SPUs selected for publish." },
      { status: 400 }
    );
  }

  const productQuery = adminClient
    .from("draft_products")
    .select(
      "id,draft_spu,draft_title,draft_subtitle,draft_description_html,draft_product_description_main_html,draft_mf_product_short_title,draft_mf_product_long_title,draft_mf_product_subtitle,draft_mf_product_bullets_short,draft_mf_product_bullets,draft_mf_product_bullets_long,draft_mf_product_specs,draft_mf_product_description_short_html,draft_mf_product_description_extended_html,draft_option1_name,draft_option2_name,draft_option3_name,draft_option4_name,draft_legacy_title_sv,draft_legacy_description_sv,draft_legacy_bullets_sv,draft_supplier_1688_url,draft_image_folder,draft_main_image_url,draft_image_urls,draft_raw_row,draft_created_at",
      { count: "exact" }
    )
    .eq("draft_status", "draft")
    .in("draft_spu", spus);

  const { data: productRows, error: productError } = await productQuery;
  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  const products = (productRows ?? []) as DraftProductRow[];
  if (products.length === 0) {
    return NextResponse.json(
      { error: "No draft products found to publish." },
      { status: 400 }
    );
  }

  const spuList = products.map((row) => row.draft_spu).filter(Boolean);
  const { data: variantRows, error: variantError } = await adminClient
    .from("draft_variants")
    .select(
      "id,draft_spu,draft_sku,draft_option1,draft_option2,draft_option3,draft_option4,draft_option_combined_zh,draft_option1_zh,draft_option2_zh,draft_option3_zh,draft_option4_zh,draft_price,draft_compare_at_price,draft_cost,draft_weight,draft_weight_unit,draft_barcode,draft_variant_image_url,draft_shipping_name_en,draft_short_title_zh,draft_shipping_name_zh,draft_shipping_class,draft_taxable,draft_tax_code,draft_hs_code,draft_country_of_origin,draft_category_code_fq,draft_category_code_ld,draft_supplier_name,draft_supplier_location,draft_b2b_dropship_price_se,draft_b2b_dropship_price_no,draft_b2b_dropship_price_dk,draft_b2b_dropship_price_fi,draft_purchase_price_cny,draft_raw_row",
      { count: "exact" }
    )
    .eq("draft_status", "draft")
    .in("draft_spu", spuList);

  if (variantError) {
    return NextResponse.json({ error: variantError.message }, { status: 500 });
  }

  const variants = (variantRows ?? []) as DraftVariantRow[];
  const variantsBySpu = new Map<string, DraftVariantRow[]>();
  for (const row of variants) {
    if (!row.draft_spu) continue;
    const list = variantsBySpu.get(row.draft_spu) ?? [];
    list.push(row);
    variantsBySpu.set(row.draft_spu, list);
  }
  const noVariantSpus = products
    .map((row) => normalizeText(row.draft_spu))
    .filter((spu): spu is string => typeof spu === "string" && spu.length > 0)
    .filter((spu) => !variantsBySpu.has(spu));
  if (noVariantSpus.length > 0) {
    return NextResponse.json(
      {
        error:
          "Publish blocked: selected products are missing variant SKU rows. Generate SKUs before publishing.",
        missing_variant_spus: noVariantSpus.slice(0, 200),
      },
      { status: 400 }
    );
  }
  const fallbackVariants: DraftVariantRow[] = [];
  for (const product of products) {
    if (!product.draft_spu) continue;
    if (!variantsBySpu.has(product.draft_spu)) {
      fallbackVariants.push(buildFallbackVariant(product));
    }
  }
  const allVariants = variants.concat(fallbackVariants);
  const missingSkuIssues: Array<{
    spu: string;
    variant_id: string | null;
    option_combined_zh: string | null;
  }> = [];
  const duplicateSkuIssueMap = new Map<
    string,
    Array<{
      variant_id: string | null;
      sku: string;
      option_combined_zh: string | null;
    }>
  >();
  for (const variant of allVariants) {
    const spu = normalizeText(variant.draft_spu);
    if (!spu) continue;
    const sku = normalizeText(variant.draft_sku);
    const variantId = normalizeText(variant.id);
    const optionCombined = normalizeText(variant.draft_option_combined_zh);
    if (!sku) {
      missingSkuIssues.push({
        spu,
        variant_id: variantId,
        option_combined_zh: optionCombined,
      });
      continue;
    }
    const key = `${spu}::${sku.toUpperCase()}`;
    const list = duplicateSkuIssueMap.get(key) ?? [];
    list.push({
      variant_id: variantId,
      sku,
      option_combined_zh: optionCombined,
    });
    duplicateSkuIssueMap.set(key, list);
  }
  const duplicateSkuIssues = Array.from(duplicateSkuIssueMap.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => {
      const [spu, sku] = key.split("::");
      return {
        spu,
        sku,
        rows,
      };
    });
  if (missingSkuIssues.length > 0 || duplicateSkuIssues.length > 0) {
    return NextResponse.json(
      {
        error:
          "Publish blocked: SKU integrity check failed. Resolve blank or duplicate SKUs in draft variants before publishing.",
        missing_skus: missingSkuIssues.slice(0, 200),
        duplicate_skus: duplicateSkuIssues.slice(0, 200),
      },
      { status: 400 }
    );
  }
  const allVariantsBySpu = new Map<string, DraftVariantRow[]>();
  for (const variant of allVariants) {
    const spu = String(variant.draft_spu || "").trim();
    if (!spu) continue;
    const list = allVariantsBySpu.get(spu) ?? [];
    list.push(variant);
    allVariantsBySpu.set(spu, list);
  }
  const productBySpu = new Map(products.map((row) => [row.draft_spu, row]));
  const now = new Date().toISOString();
  const runFolders = new Map<string, string[]>();
  const archivedRuns = new Map<string, string>();
  const variantImageRenameMapBySpu = new Map<string, Map<string, string>>();
  const finalTopLevelImagesBySpu = new Map<string, Set<string>>();
  const finalTopLevelImageNamesBySpu = new Map<string, string[]>();
  const duplicateImageCleanupResults: Array<{ spu: string; removed: string[] }> = [];
  const autoVariantImageResults: Array<{
    spu: string;
    variant_dir: string | null;
    assignments: AutoVariantImageAssignment[];
  }> = [];
  let autoPromotedAiEdits = 0;
  const imageIssues: Array<{
    spu: string;
    folder: string;
    error?: string;
    missingMain?: boolean;
    invalidPrefixes?: string[];
    nonJpgFiles?: string[];
    ignoredSubfolders?: string[];
  }> = [];
  const variantCoverageIssues: Array<{
    spu: string;
    variant_dir: string | null;
    variant_count: number;
    var_image_file_count: number;
    missing_variant_images: Array<{
      variant_id: string | null;
      sku: string | null;
      option_combined_zh: string | null;
    }>;
  }> = [];

  for (const row of products) {
    if (!row.draft_image_folder || !row.draft_spu) continue;
    const abs = resolveDraftFolder(row.draft_image_folder);
    if (!abs) {
      imageIssues.push({
        spu: row.draft_spu,
        folder: row.draft_image_folder,
        error: "Invalid draft folder path.",
      });
      continue;
    }
    if (!existsSync(abs)) {
      imageIssues.push({
        spu: row.draft_spu,
        folder: abs,
        error: "Draft folder missing.",
      });
      continue;
    }
    try {
      const autoAttachVariants = await autoAttachVariantImagesForPublish({
        folderAbsPath: abs,
        spu: row.draft_spu,
        variants: allVariantsBySpu.get(row.draft_spu) ?? [],
      });
      if (
        autoAttachVariants.variantDirName ||
        autoAttachVariants.assignments.length > 0
      ) {
        autoVariantImageResults.push({
          spu: row.draft_spu,
          variant_dir: autoAttachVariants.variantDirName,
          assignments: autoAttachVariants.assignments,
        });
      }

      const aiPromotion = await autoPromotePendingAiEdits(abs);
      autoPromotedAiEdits += aiPromotion.resolvedCount;
      if (aiPromotion.errors.length > 0) {
        imageIssues.push({
          spu: row.draft_spu,
          folder: abs,
          error: `Failed to auto-apply pending AI edit(s): ${aiPromotion.errors
            .slice(0, 3)
            .join("; ")}${aiPromotion.errors.length > 3 ? "..." : ""}`,
        });
        continue;
      }
      const prepare = await prepareFolderImagesForPublish(abs);
      if (prepare.nonJpgFiles.length > 0) {
        imageIssues.push({
          spu: row.draft_spu,
          folder: abs,
          error:
            "Publish requires JPG files only. Non-JPG files remain after conversion.",
          nonJpgFiles: prepare.nonJpgFiles,
          ignoredSubfolders: prepare.ignoredSubfolders,
        });
        continue;
      }
      const normalizeResult = await normalizeImageNamesInFolder(abs, row.draft_spu);
      const renameMap = new Map<string, string>();
      const addRenamePair = (sourceName: string, targetName: string) => {
        const from = String(sourceName || "").trim();
        const to = String(targetName || "").trim();
        if (!from || !to || from.toLowerCase() === to.toLowerCase()) return;
        renameMap.set(from.toLowerCase(), to);
      };

      for (const pair of prepare.jpegRenamePairs) {
        addRenamePair(pair.sourceName, pair.targetName);
      }
      for (const pair of normalizeResult.renamePairs) {
        addRenamePair(pair.sourceName, pair.targetName);
      }
      // Compose prepare-stage conversion with publish rename, e.g. file.png -> file.jpg -> SPU-3-VAR.jpg.
      for (const pair of prepare.jpegRenamePairs) {
        const chainedTarget =
          renameMap.get(String(pair.targetName || "").trim().toLowerCase()) ??
          pair.targetName;
        addRenamePair(pair.sourceName, chainedTarget);
      }
      variantImageRenameMapBySpu.set(row.draft_spu, renameMap);

      const dedupe = await removeDuplicateTopLevelImagesByHash(abs);
      if (dedupe.removedFileNames.length > 0) {
        duplicateImageCleanupResults.push({
          spu: row.draft_spu,
          removed: dedupe.removedFileNames,
        });
      }

      const postEntries = await fs.readdir(abs, { withFileTypes: true });
      const finalTopLevelImageNames = postEntries
        .filter(
          (entry) =>
            entry.isFile() &&
            isPublishableImageName(entry.name) &&
            isJpegFileName(entry.name)
        )
        .map((entry) => entry.name);
      finalTopLevelImageNamesBySpu.set(row.draft_spu, finalTopLevelImageNames);
      finalTopLevelImagesBySpu.set(
        row.draft_spu,
        new Set(finalTopLevelImageNames.map((name) => name.toLowerCase()))
      );
      const variantsForSpu = allVariantsBySpu.get(row.draft_spu) ?? [];
      const hasVariantTaggedImages = finalTopLevelImageNames.some((name) =>
        /(?:^|[-_])VAR(?:[-_.]|$)/i.test(name)
      );
      const requiresVariantCoverage =
        variantsForSpu.length > 1 &&
        (Boolean(autoAttachVariants.variantDirName) || hasVariantTaggedImages);
      if (requiresVariantCoverage) {
        const missingVariantImages = variantsForSpu
          .filter((variant) => !normalizeText(variant.draft_variant_image_url))
          .map((variant) => ({
            variant_id: normalizeText(variant.id),
            sku: normalizeText(variant.draft_sku),
            option_combined_zh: normalizeText(variant.draft_option_combined_zh),
          }));
        if (missingVariantImages.length > 0) {
          variantCoverageIssues.push({
            spu: row.draft_spu,
            variant_dir: autoAttachVariants.variantDirName ?? null,
            variant_count: variantsForSpu.length,
            var_image_file_count: finalTopLevelImageNames.filter((name) =>
              /(?:^|[-_])VAR(?:[-_.]|$)/i.test(name)
            ).length,
            missing_variant_images: missingVariantImages,
          });
        }
      }

      const validation = await validateImageFolder(abs, row.draft_spu);
      if (validation.count > 0) {
        const nonJpgAfterNormalize = postEntries
          .filter(
            (entry) =>
              entry.isFile() &&
              isPublishableImageName(entry.name) &&
              !isJpegFileName(entry.name)
          )
          .map((entry) => entry.name);
        if (nonJpgAfterNormalize.length > 0) {
          imageIssues.push({
            spu: row.draft_spu,
            folder: abs,
            error:
              "Publish gate failed: non-JPG files detected in top-level draft folder.",
            nonJpgFiles: nonJpgAfterNormalize,
            ignoredSubfolders: prepare.ignoredSubfolders,
          });
          continue;
        }
        if (!validation.hasMain || validation.invalidPrefixes.length) {
          imageIssues.push({
            spu: row.draft_spu,
            folder: abs,
            missingMain: !validation.hasMain,
            invalidPrefixes: validation.invalidPrefixes,
            ignoredSubfolders: prepare.ignoredSubfolders,
          });
        }
      }
    } catch (err) {
      imageIssues.push({
        spu: row.draft_spu,
        folder: abs,
        error: (err as Error).message,
      });
    }
    const runFolder = path.dirname(abs);
    const existing = runFolders.get(runFolder) ?? [];
    existing.push(row.draft_spu);
    runFolders.set(runFolder, existing);
  }

  if (imageIssues.length) {
    return NextResponse.json(
      {
        error:
          "Some draft image folders failed publish image checks. Please resolve and retry.",
        issues: imageIssues,
      },
      { status: 400 }
    );
  }
  if (variantCoverageIssues.length > 0) {
    return NextResponse.json(
      {
        error:
          "Variant image coverage check failed. All variants must have a mapped variant image before publish.",
        issues: variantCoverageIssues,
      },
      { status: 400 }
    );
  }

  const archiveResults: Array<{
    runFolder: string;
    archived: boolean;
    archivePath?: string;
    error?: string;
  }> = [];
  const upsertArchiveResult = (runFolder: string, patch: Partial<{
    archived: boolean;
    archivePath?: string;
    error?: string;
  }>) => {
    const index = archiveResults.findIndex((entry) => entry.runFolder === runFolder);
    if (index >= 0) {
      archiveResults[index] = { ...archiveResults[index], ...patch };
    } else {
      archiveResults.push({
        runFolder,
        archived: Boolean(patch.archived),
        archivePath: patch.archivePath,
        error: patch.error,
      });
    }
  };

  for (const runFolder of runFolders.keys()) {
    try {
      const archivePath = await archiveDraftRun(runFolder);
      archivedRuns.set(runFolder, archivePath);
      upsertArchiveResult(runFolder, { archived: true, archivePath });
    } catch (err) {
      upsertArchiveResult(runFolder, {
        archived: false,
        error: (err as Error).message,
      });
    }
  }

  const archiveFailures = archiveResults.filter(
    (entry) => !entry.archived || !entry.archivePath
  );
  if (archiveFailures.length > 0) {
    return NextResponse.json(
      {
        error:
          "Failed to archive draft run(s) before publish. Publish was aborted to protect rollback safety.",
        archived: archiveResults,
      },
      { status: 500 }
    );
  }

  const stgSpuRows: PublishStgSpuRow[] = products.map((row) => ({
    spu: row.draft_spu,
    sku: row.draft_spu,
    product_title: normalizeText(row.draft_title),
    subtitle: normalizeText(row.draft_subtitle),
    product_description_html: normalizeText(row.draft_description_html),
    product_description_main_html: normalizeText(
      row.draft_product_description_main_html ?? row.draft_description_html
    ),
    brand: normalizeText(
      getRawTextAny(row.draft_raw_row, ["brand"]) || getSpuPrefix(row.draft_spu)
    ),
    vendor: normalizeText(
      getRawTextAny(row.draft_raw_row, ["vendor"]) || getSpuPrefix(row.draft_spu)
    ),
    mf_product_short_title: normalizeText(row.draft_mf_product_short_title),
    mf_product_long_title: normalizeText(row.draft_mf_product_long_title),
    mf_product_subtitle:
      normalizeText(row.draft_mf_product_subtitle) ?? normalizeText(row.draft_subtitle),
    mf_product_bullets_short: normalizeText(row.draft_mf_product_bullets_short),
    mf_product_bullets: normalizeText(row.draft_mf_product_bullets),
    mf_product_bullets_long: normalizeText(row.draft_mf_product_bullets_long),
    mf_product_specs: normalizeText(row.draft_mf_product_specs),
    mf_product_description_short_html: normalizeText(
      row.draft_mf_product_description_short_html
    ),
    mf_product_description_extended_html: normalizeText(
      row.draft_mf_product_description_extended_html
    ),
    option1_name: normalizeText(row.draft_option1_name),
    option2_name: normalizeText(row.draft_option2_name),
    option3_name: normalizeText(row.draft_option3_name),
    option4_name: normalizeText(row.draft_option4_name),
    legacy_title_sv: normalizeText(row.draft_legacy_title_sv),
    legacy_description_sv: normalizeText(row.draft_legacy_description_sv),
    legacy_bullets_sv: normalizeText(row.draft_legacy_bullets_sv),
    supplier_1688_url: normalizeText(row.draft_supplier_1688_url),
    // Do not feed legacy URL image side-effects during publish. Canonical image source
    // is the curated top-level draft folder copied to catalog + media ingest pipeline.
    product_main_image_url: null,
    product_additional_image_urls: null,
    shopify_tingelo_category_keys: getRawTextAny(row.draft_raw_row, [
      "category_external_key_shopify_tingelo",
      "shopify_tingelo_category_keys",
    ]),
    product_categorizer_keywords: getRawTextAny(row.draft_raw_row, [
      "product_categorizer_keywords",
      "poduct_categorizer_keywords",
      "poduct_keywords",
    ]),
    is_active: "true",
    status: "active",
    published: "true",
    published_scope: "global",
    shopify_tingelo_sync: true,
    image_folder: `${CATALOG_ROOT}/${row.draft_spu}`,
    raw_row: row.draft_raw_row ?? null,
    imported_at: now,
    processed: false,
    product_created_at: row.draft_created_at || null,
  }));

  const variantImageIssues: Array<{
    spu: string | null;
    sku: string | null;
    variant_image_url: string;
    issue: string;
  }> = [];

  const stgSkuRows: PublishStgSkuRow[] = allVariants.map((row) => {
    const parent = row.draft_spu ? productBySpu.get(row.draft_spu) : null;
    const rawRow =
      row.draft_raw_row && typeof row.draft_raw_row === "object"
        ? (row.draft_raw_row as Record<string, unknown>)
        : null;
    const parentShiptype =
      parent?.draft_raw_row && typeof parent.draft_raw_row === "object"
        ? (parent.draft_raw_row as Record<string, unknown>)
        : null;
    const shippingClass = normalizeText(
      row.draft_shipping_class ||
        (parentShiptype ? (parentShiptype.product_shiptype as string) : "") ||
        (parentShiptype ? (parentShiptype.product_shipType as string) : "")
    );
    const purchasePrice = normalizeText(
      row.draft_purchase_price_cny ||
        row.draft_price ||
        (rawRow ? getRawText(rawRow, "price") : "")
    );
    const hasRawVariationColor =
      !!rawRow && Object.prototype.hasOwnProperty.call(rawRow, "variation_color_se");
    const hasRawVariationSize =
      !!rawRow && Object.prototype.hasOwnProperty.call(rawRow, "variation_size_se");
    const hasRawVariationOther =
      !!rawRow && Object.prototype.hasOwnProperty.call(rawRow, "variation_other_se");
    const hasRawVariationAmount =
      !!rawRow && Object.prototype.hasOwnProperty.call(rawRow, "variation_amount_se");
    const variationColorSe = hasRawVariationColor
      ? getRawText(rawRow, "variation_color_se")
      : normalizeText(row.draft_option1);
    const variationSizeSe = hasRawVariationSize
      ? getRawText(rawRow, "variation_size_se")
      : normalizeText(row.draft_option2);
    const variationOtherSe = hasRawVariationOther
      ? getRawText(rawRow, "variation_other_se")
      : normalizeText(row.draft_option3);
    const variationAmountSe = hasRawVariationAmount
      ? getRawText(rawRow, "variation_amount_se")
      : normalizeText(row.draft_option4);
    const sku = normalizeText(row.draft_sku);
    const resolvedVariantImage = resolveVariantImageForPublish({
      spu: row.draft_spu,
      value: normalizeText(row.draft_variant_image_url),
      renameMapBySpu: variantImageRenameMapBySpu,
      finalTopLevelImagesBySpu,
    });
    if (resolvedVariantImage.issue) {
      variantImageIssues.push({
        spu: row.draft_spu ?? null,
        sku,
        variant_image_url: String(row.draft_variant_image_url || ""),
        issue: resolvedVariantImage.issue,
      });
    }
    return {
      spu: row.draft_spu,
      sku,
      option1: normalizeText(row.draft_option1),
      option2: normalizeText(row.draft_option2),
      option3: normalizeText(row.draft_option3),
      option4: normalizeText(row.draft_option4),
      option1_name: normalizeText(parent?.draft_option1_name),
      option2_name: normalizeText(parent?.draft_option2_name),
      option3_name: normalizeText(parent?.draft_option3_name),
      option4_name: normalizeText(parent?.draft_option4_name),
      option_combined_zh: normalizeText(row.draft_option_combined_zh),
      option1_zh: normalizeText(row.draft_option1_zh),
      option2_zh: normalizeText(row.draft_option2_zh),
      option3_zh: normalizeText(row.draft_option3_zh),
      option4_zh: normalizeText(row.draft_option4_zh),
      variation_color_se: variationColorSe,
      variation_size_se: variationSizeSe,
      variation_other_se: variationOtherSe,
      variation_amount_se: variationAmountSe,
      price: normalizeText(row.draft_price),
      compare_at_price: normalizeText(row.draft_compare_at_price),
      cost: normalizeText(row.draft_cost),
      weight: normalizeText(row.draft_weight),
      weight_unit: normalizeText(row.draft_weight_unit),
      barcode: normalizeText(row.draft_barcode),
      ean_code: normalizeText(row.draft_barcode),
      variant_image_url: resolvedVariantImage.value,
      shipping_name_en: normalizeText(row.draft_shipping_name_en),
      short_title_zh: normalizeText(row.draft_short_title_zh),
      shipping_name_zh: normalizeText(row.draft_shipping_name_zh),
      shipping_class: shippingClass,
      taxable: normalizeText(row.draft_taxable),
      tax_code: normalizeText(row.draft_tax_code) || DEFAULT_TAX_CODE,
      hs_code: normalizeText(row.draft_hs_code),
      country_of_origin:
        normalizeText(row.draft_country_of_origin) || DEFAULT_COUNTRY_OF_ORIGIN,
      category_code_fq: normalizeText(row.draft_category_code_fq),
      category_code_ld: normalizeText(row.draft_category_code_ld),
      supplier_name: normalizeText(row.draft_supplier_name),
      supplier_location: normalizeText(row.draft_supplier_location),
      b2b_dropship_price_se: normalizeText(row.draft_b2b_dropship_price_se),
      b2b_dropship_price_no: normalizeText(row.draft_b2b_dropship_price_no),
      b2b_dropship_price_dk: normalizeText(row.draft_b2b_dropship_price_dk),
      b2b_dropship_price_fi: normalizeText(row.draft_b2b_dropship_price_fi),
      purchase_price_cny: purchasePrice,
      raw_row: row.draft_raw_row ?? null,
      imported_at: now,
      processed: false,
    };
  });

  if (variantImageIssues.length > 0) {
    return NextResponse.json(
      {
        error:
          "Some variant image references do not resolve to the final top-level publish images. Fix variant_image_url values and retry publish.",
        issues: variantImageIssues.slice(0, 200),
      },
      { status: 400 }
    );
  }

  const rollbackSnapshot = await writePublishRollbackSnapshot({
    now,
    spus: spuList,
    products,
    variants: allVariants,
    stgSpuRows: stgSpuRows as Array<Record<string, unknown>>,
    stgSkuRows: stgSkuRows as Array<Record<string, unknown>>,
    runFolders,
    archivedRuns,
    archiveResults,
    finalTopLevelImageNamesBySpu,
  });
  if (!rollbackSnapshot.ok) {
    return NextResponse.json(
      {
        error: `Failed to write publish rollback snapshot. Publish was aborted: ${rollbackSnapshot.error}`,
      },
      { status: 500 }
    );
  }

  const moveResults: Array<{
    spu: string;
    moved: boolean;
    error?: string;
    copiedCount?: number;
    ignoredSubfolders?: string[];
  }> = [];
  for (const row of products) {
    const folderValue = row.draft_image_folder;
    if (!folderValue) {
      moveResults.push({ spu: row.draft_spu, moved: false, error: "No folder." });
      continue;
    }
    const src = resolveDraftFolder(folderValue);
    if (!src || !existsSync(src)) {
      moveResults.push({
        spu: row.draft_spu,
        moved: false,
        error: "Draft folder missing.",
      });
      continue;
    }
    const dest = path.join(NEW_CATALOG_ROOT, row.draft_spu);
    try {
      const copied = await copyFinalPublishImagesToCatalog(src, dest);
      moveResults.push({
        spu: row.draft_spu,
        moved: true,
        copiedCount: copied.copiedCount,
        ignoredSubfolders: copied.ignoredSubfolders,
      });
    } catch (err) {
      moveResults.push({
        spu: row.draft_spu,
        moved: false,
        error: (err as Error).message,
      });
    }
  }

  const mediaResult = await runMediaIngest(spuList);
  if (!mediaResult.ok) {
    const mediaError =
      "error" in mediaResult && mediaResult.error
        ? mediaResult.error
        : undefined;
    return NextResponse.json(
      { error: mediaError || "Media ingest failed before database import." },
      { status: 500 }
    );
  }

  const { error: deleteSpuError } = await adminClient
    .from("stg_import_spu")
    .delete()
    .in("spu", spuList);
  if (deleteSpuError) {
    return NextResponse.json({ error: deleteSpuError.message }, { status: 500 });
  }

  const { error: deleteSkuError } = await adminClient
    .from("stg_import_sku")
    .delete()
    .in("spu", spuList);
  if (deleteSkuError) {
    return NextResponse.json({ error: deleteSkuError.message }, { status: 500 });
  }

  for (const chunk of chunkRows(stgSpuRows, 200)) {
    const { error: insertError } = await adminClient
      .from("stg_import_spu")
      .insert(chunk);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  for (const chunk of chunkRows(stgSkuRows, 200)) {
    const { error: insertError } = await adminClient
      .from("stg_import_sku")
      .insert(chunk);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const { error: spuRpcError } = await adminClient.rpc("process_import_spu", {
    p_spus: spuList,
  });
  if (spuRpcError) {
    return NextResponse.json({ error: spuRpcError.message }, { status: 500 });
  }

  const { error: skuRpcError } = await adminClient.rpc("process_import_sku", {
    p_spus: spuList,
  });
  if (skuRpcError) {
    return NextResponse.json({ error: skuRpcError.message }, { status: 500 });
  }

  let skuClearResult: {
    variants_with_clears: number;
    catalog_variants_updated: number;
    variant_in_shop_updated: number;
    variant_price_rows_updated: number;
    variant_image_map_rows_removed: number;
  } | null = null;
  try {
    skuClearResult = await applyExplicitSkuFieldClears(adminClient, stgSkuRows);
  } catch (error) {
    return NextResponse.json(
      {
        error: `Failed applying explicit SKU field clears: ${(error as Error).message}`,
      },
      { status: 500 }
    );
  }

  let spuClearResult: {
    products_with_clears: number;
    metafields_removed: number;
    product_subtitles_cleared: number;
  } | null = null;
  try {
    spuClearResult = await applyExplicitSpuFieldClears(adminClient, stgSpuRows);
  } catch (error) {
    return NextResponse.json(
      {
        error: `Failed applying explicit SPU field clears: ${(error as Error).message}`,
      },
      { status: 500 }
    );
  }

  const variantPruneResult = await pruneCatalogVariantsToPublishedSet(
    adminClient,
    stgSkuRows.map((row) => ({
      spu: row.spu,
      sku: row.sku,
    }))
  );

  let b2bPricingResult: {
    consideredVariants: number;
    processedVariants: number;
    skippedVariants: number;
    updatedRows: number;
  } | null = null;
  try {
    b2bPricingResult = await recalculateB2BPricesForSpus(adminClient, spuList);
  } catch (error) {
    return NextResponse.json(
      {
        error: `B2B pricing generation failed: ${(error as Error).message}`,
      },
      { status: 500 }
    );
  }

  let b2cPricingResult: {
    consideredVariants: number;
    processedVariants: number;
    skippedVariants: number;
    updatedRows: number;
    updatedVariantPrices: number;
  } | null = null;
  try {
    b2cPricingResult = await recalculateB2CPricesForSpus(adminClient, spuList);
  } catch (error) {
    return NextResponse.json(
      {
        error: `B2C pricing generation failed: ${(error as Error).message}`,
      },
      { status: 500 }
    );
  }

  // Kick off Google taxonomy categorization for the newly created/updated SPUs.
  // This is async to avoid blocking publish; the DB will be updated shortly after publish completes.
  await spawnTaxonomyCategorizerForSpus(spuList);

  const variantImageNamesBySpu = await loadVariantImageNamesBySpu(adminClient, spuList);

  const imagePruneResults: Array<{
    spu: string;
    removed_originals: number;
    removed_derived: number;
  }> = [];
  for (const spu of spuList) {
    const expected = finalTopLevelImageNamesBySpu.get(spu) ?? [];
    const preserved = variantImageNamesBySpu.get(spu) ?? [];
    if (expected.length === 0 && preserved.length === 0) continue;
    const imagePrune = await pruneCatalogImagesToPublishedSet(spu, expected, preserved);
    imagePruneResults.push({
      spu,
      removed_originals: imagePrune.removed_originals,
      removed_derived: imagePrune.removed_derived,
    });
  }

  const moveBySpu = new Map(
    moveResults.map((entry) => [entry.spu, entry.moved])
  );

  const removedDraftFolders = new Set<string>();
  for (const row of products) {
    const spu = String(row.draft_spu || "").trim();
    if (!spu || !moveBySpu.get(spu)) continue;
    if (!row.draft_image_folder) continue;
    const productFolder = resolveDraftFolder(row.draft_image_folder);
    if (!productFolder || removedDraftFolders.has(productFolder)) continue;
    if (!existsSync(productFolder)) continue;
    try {
      await fs.rm(productFolder, { recursive: true, force: true });
      removedDraftFolders.add(productFolder);
    } catch (err) {
      const runFolder = path.dirname(productFolder);
      upsertArchiveResult(runFolder, {
        archived: Boolean(archivedRuns.get(runFolder)),
        archivePath: archivedRuns.get(runFolder),
        error: (err as Error).message,
      });
    }
  }

  await adminClient
    .from("draft_products")
    .update({ draft_status: "published", draft_updated_at: now })
    .in("draft_spu", spuList);
  await adminClient
    .from("draft_variants")
    .update({ draft_status: "published", draft_updated_at: now })
    .in("draft_spu", spuList);

  const meiliIndex = await runMeiliIndexSpus(spuList);
  if (!meiliIndex.ok) {
    console.error("Meili index update failed after publish:", meiliIndex.error);
  }

  let discoveryLinkSyncResult: {
    candidates: number;
    updated: number;
    skipped_existing: number;
    skipped_missing_product_row: number;
  } | null = null;
  try {
    const refs = await getProductionRefsBySpus(adminClient, spuList);
    if (refs.length > 0) {
      await upsertProductionStatuses(adminClient, refs, {
        status: "production_done",
      });
    }
    discoveryLinkSyncResult = await syncDiscoveryIdenticalSpuLinks(
      adminClient,
      spuList
    );
  } catch (error) {
    console.error("Unable to sync production queue done status:", error);
  }

  return NextResponse.json({
    ok: true,
    spus: spuList,
    auto_promoted_ai_edits: autoPromotedAiEdits,
    staged: { spus: stgSpuRows.length, skus: stgSkuRows.length },
    moved: moveResults,
    variant_prune: variantPruneResult,
    b2b_pricing: b2bPricingResult,
    b2c_pricing: b2cPricingResult,
    duplicate_image_cleanup: duplicateImageCleanupResults,
    auto_variant_images: autoVariantImageResults,
    catalog_image_prune: imagePruneResults,
    explicit_sku_clears: skuClearResult,
    explicit_spu_clears: spuClearResult,
    archived: archiveResults,
    rollback_snapshot: rollbackSnapshot.filePath,
    meili_index_ok: meiliIndex.ok,
    meili_index_error: meiliIndex.ok ? null : meiliIndex.error,
    discovery_identical_link_sync: discoveryLinkSyncResult,
  });
}
