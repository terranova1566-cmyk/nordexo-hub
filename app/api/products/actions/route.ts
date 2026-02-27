import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDraftRunType, DRAFT_ROOT } from "@/lib/drafts";
import { requireAdmin } from "@/lib/auth-admin";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_ACTION_PRODUCT_IDS = 200;
const DELETED_PRODUCTS_ROOT =
  process.env.PRODUCTS_DELETED_ARCHIVE_ROOT?.trim() ||
  "/srv/resources/deleted-products";
const MEDIA_IMAGE_ROOT = "/srv/resources/media/images";
const RE_EDIT_RUN_PREFIX = "Re-Editing";
const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".tif",
  ".tiff",
]);
const MAIN_IMAGE_TAG_REGEX = /(?:\(\s*MAIN\s*\)|(?:^|[-_ ])MAIN(?:[-_ .)]|$))/i;

type ActionPayload = {
  action?: unknown;
  productIds?: unknown;
};

type CatalogProductRow = {
  id: string;
  spu: string | null;
  [key: string]: unknown;
};

type CatalogVariantRow = {
  id?: string;
  product_id?: string | null;
  sku?: string | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  option4?: string | null;
  option1_zh?: string | null;
  option2_zh?: string | null;
  option3_zh?: string | null;
  option4_zh?: string | null;
  option_combined_zh?: string | null;
  variation_color_se?: string | null;
  variation_size_se?: string | null;
  variation_other_se?: string | null;
  variation_amount_se?: string | null;
  price?: number | string | null;
  compare_at_price?: number | string | null;
  cost?: number | string | null;
  weight?: number | string | null;
  weight_unit?: string | null;
  barcode?: string | null;
  variant_image_url?: string | null;
  shipping_name_en?: string | null;
  short_title_zh?: string | null;
  shipping_name_zh?: string | null;
  shipping_class?: string | null;
  taxable?: string | null;
  tax_code?: string | null;
  hs_code?: string | null;
  country_of_origin?: string | null;
  category_code_fq?: string | null;
  category_code_ld?: string | null;
  supplier_name?: string | null;
  supplier_location?: string | null;
  b2b_dropship_price_se?: number | string | null;
  b2b_dropship_price_no?: number | string | null;
  b2b_dropship_price_dk?: number | string | null;
  b2b_dropship_price_fi?: number | string | null;
  purchase_price_cny?: number | string | null;
  raw_row?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type ExistingDraftRow = {
  draft_spu: string | null;
  draft_source: string | null;
  draft_image_folder: string | null;
};

const sanitizePathSegment = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const normalizeText = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const normalizeAction = (value: unknown) => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "reedit" || raw === "re-edit" || raw === "re_edit") return "re_edit";
  if (raw === "edit-products" || raw === "edit_products") return "re_edit";
  return raw;
};

const parseProductIds = (payload: ActionPayload) =>
  Array.from(
    new Set(
      (Array.isArray(payload?.productIds) ? payload.productIds : [])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );

const chunkRows = <T,>(rows: T[], size = 200) => {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
};

const formatTimestamp = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
};

const isImageFileName = (fileName: string) =>
  IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());

const tryDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractFileNameFromReference = (value: string | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const encodedPath = parsed.searchParams.get("path");
      if (encodedPath) {
        return path.basename(tryDecodeURIComponent(encodedPath)).trim();
      }
      return path.basename(tryDecodeURIComponent(parsed.pathname)).trim();
    } catch {
      // Fall through to generic extraction below.
    }
  }

  const noHash = raw.split("#", 1)[0] ?? raw;
  const noQuery = noHash.split("?", 1)[0] ?? noHash;
  return path.basename(tryDecodeURIComponent(noQuery)).trim();
};

const toStemKey = (value: string) =>
  value.replace(/\.[^.]+$/u, "").trim().toLowerCase();

const toFileKey = (value: string) => value.trim().toLowerCase();

const resolveCatalogFolderPath = (imageFolder: unknown) => {
  const folder = normalizeText(imageFolder);
  if (!folder) return null;

  const absolute = folder.startsWith("/")
    ? path.resolve(folder)
    : path.resolve(MEDIA_IMAGE_ROOT, folder.replace(/^\/+/, ""));

  if (!absolute.startsWith(`${MEDIA_IMAGE_ROOT}${path.sep}`) && absolute !== MEDIA_IMAGE_ROOT) {
    return null;
  }
  return absolute;
};

const listTopLevelImageFiles = async (folderPath: string) => {
  try {
    const entries = await fs.readdir(folderPath, {
      encoding: "utf8",
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name && !name.startsWith(".") && isImageFileName(name))
      .sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
      );
  } catch {
    return [] as string[];
  }
};

const pickCatalogImageSourceFolder = async (catalogFolderPath: string) => {
  const candidates = [
    path.join(catalogFolderPath, "original"),
    path.join(catalogFolderPath, "standard"),
    path.join(catalogFolderPath, "small"),
    path.join(catalogFolderPath, "thumb"),
    catalogFolderPath,
  ];

  for (const candidate of candidates) {
    const files = await listTopLevelImageFiles(candidate);
    if (files.length > 0) {
      return { sourceDir: candidate, files };
    }
  }
  return null;
};

const ensureUniqueFileName = async (destDir: string, fileName: string) => {
  const ext = path.extname(fileName);
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  let candidate = fileName;
  let index = 2;

  while (true) {
    try {
      await fs.access(path.join(destDir, candidate));
      candidate = `${base}-${index}${ext}`;
      index += 1;
    } catch {
      return candidate;
    }
  }
};

const extractRunNameFromDraftFolder = (value: string | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\\/g, "/");
  const marker = "images/draft_products/";
  const markerIndex = normalized.toLowerCase().indexOf(marker);
  if (markerIndex >= 0) {
    const rest = normalized.slice(markerIndex + marker.length);
    return rest.split("/").filter(Boolean)[0] ?? null;
  }
  const parts = normalized.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "draft_products") {
    return parts[1] ?? null;
  }
  if (parts.length >= 1) return parts[0] ?? null;
  return null;
};

const isExistingDraftReEdit = (row: ExistingDraftRow) => {
  const source = normalizeText(row.draft_source)?.toLowerCase() ?? "";
  if (source) {
    const normalized = source.replace(/[\s_-]+/g, "");
    if (normalized === "reedit" || normalized === "reediting") return true;
  }
  const runName = extractRunNameFromDraftFolder(row.draft_image_folder);
  if (!runName) return false;
  return getDraftRunType(runName) === "re_edit";
};

const buildDraftVariantRawRow = (variant: CatalogVariantRow) => ({
  variation_color_se: normalizeText(variant.variation_color_se),
  variation_size_se: normalizeText(variant.variation_size_se),
  variation_other_se: normalizeText(variant.variation_other_se),
  variation_amount_se: normalizeText(variant.variation_amount_se),
  option1_zh: normalizeText(variant.option1_zh),
  option2_zh: normalizeText(variant.option2_zh),
  option3_zh: normalizeText(variant.option3_zh),
  option4_zh: normalizeText(variant.option4_zh),
});

const deleteFromMeili = async (productId: string) => {
  try {
    const { getProductsIndex } = await import("@/lib/meili");
    const index = getProductsIndex();
    await index.deleteDocuments([productId]);
    return null;
  } catch (error) {
    return toErrorMessage(error);
  }
};

export async function POST(request: Request) {
  const adminAuth = await requireAdmin();
  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  let payload: ActionPayload;
  try {
    payload = (await request.json()) as ActionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const action = normalizeAction(payload?.action);
  if (action !== "delete" && action !== "re_edit") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  const productIds = parseProductIds(payload);
  if (productIds.length === 0) {
    return NextResponse.json({ error: "No products selected." }, { status: 400 });
  }
  if (productIds.length > MAX_ACTION_PRODUCT_IDS) {
    return NextResponse.json(
      {
        error: `You can process up to ${MAX_ACTION_PRODUCT_IDS} products per action.`,
      },
      { status: 400 }
    );
  }

  let adminClient: ReturnType<typeof createAdminSupabase>;
  try {
    adminClient = createAdminSupabase();
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }

  const { data: productsData, error: productsError } = await adminClient
    .from("catalog_products")
    .select("*")
    .in("id", productIds);

  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }

  const products = (productsData ?? []) as Array<Record<string, unknown>>;
  const productById = new Map(products.map((row) => [String(row.id), row]));
  const existingIds = products
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
  const spus = Array.from(
    new Set(
      products
        .map((row) => String(row.spu ?? "").trim())
        .filter(Boolean)
    )
  );

  const [variantsResult, stgSpuResult, stgSkuResult] = await Promise.all([
    existingIds.length > 0
      ? adminClient.from("catalog_variants").select("*").in("product_id", existingIds)
      : Promise.resolve({ data: [], error: null }),
    spus.length > 0
      ? adminClient.from("stg_import_spu").select("*").in("spu", spus)
      : Promise.resolve({ data: [], error: null }),
    spus.length > 0
      ? adminClient.from("stg_import_sku").select("*").in("spu", spus)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (variantsResult.error) {
    return NextResponse.json({ error: variantsResult.error.message }, { status: 500 });
  }
  if (stgSpuResult.error) {
    return NextResponse.json({ error: stgSpuResult.error.message }, { status: 500 });
  }
  if (stgSkuResult.error) {
    return NextResponse.json({ error: stgSkuResult.error.message }, { status: 500 });
  }

  const variants = (variantsResult.data ?? []) as Array<Record<string, unknown>>;
  const variantsByProductId = new Map<string, CatalogVariantRow[]>();
  variants.forEach((row) => {
    const productId = String(row.product_id ?? "").trim();
    if (!productId) return;
    const list = variantsByProductId.get(productId) ?? [];
    list.push(row as CatalogVariantRow);
    variantsByProductId.set(productId, list);
  });

  const stgSpuRows = (stgSpuResult.data ?? []) as Array<Record<string, unknown>>;
  const stgSpuBySpu = new Map<string, Record<string, unknown>>();
  stgSpuRows.forEach((row) => {
    const spu = String(row.spu ?? "").trim();
    if (!spu) return;
    stgSpuBySpu.set(spu, row);
  });

  const stgSkuRows = (stgSkuResult.data ?? []) as Array<Record<string, unknown>>;
  const stgSkuBySpu = new Map<string, CatalogVariantRow[]>();
  stgSkuRows.forEach((row) => {
    const spu = String(row.spu ?? "").trim();
    if (!spu) return;
    const list = stgSkuBySpu.get(spu) ?? [];
    list.push(row as CatalogVariantRow);
    stgSkuBySpu.set(spu, list);
  });

  if (action === "re_edit") {
    const nowIso = new Date().toISOString();
    const existingDraftBySpu = new Map<string, ExistingDraftRow>();

    if (spus.length > 0) {
      const { data: existingDrafts, error: existingDraftError } = await adminClient
        .from("draft_products")
        .select("draft_spu,draft_source,draft_image_folder")
        .eq("draft_status", "draft")
        .in("draft_spu", spus);

      if (existingDraftError) {
        return NextResponse.json({ error: existingDraftError.message }, { status: 500 });
      }

      (existingDrafts ?? []).forEach((row) => {
        const spu = String(row.draft_spu ?? "").trim();
        if (!spu) return;
        existingDraftBySpu.set(spu, row as ExistingDraftRow);
      });
    }

    const acceptedProducts: CatalogProductRow[] = [];
    const failed: Array<{ id: string; spu: string | null; error: string }> = [];

    for (const productId of productIds) {
      const product = productById.get(productId);
      if (!product) {
        failed.push({
          id: productId,
          spu: null,
          error: "Product not found.",
        });
        continue;
      }

      const row = product as CatalogProductRow;
      const spu = normalizeText(row.spu);
      if (!spu) {
        failed.push({
          id: String(row.id),
          spu: null,
          error: "Missing SPU.",
        });
        continue;
      }

      const existingDraft = existingDraftBySpu.get(spu);
      if (existingDraft && !isExistingDraftReEdit(existingDraft)) {
        failed.push({
          id: String(row.id),
          spu,
          error:
            "SPU is already in a non re-edit draft folder. Move or publish that draft first.",
        });
        continue;
      }

      acceptedProducts.push(row);
    }

    if (acceptedProducts.length === 0) {
      return NextResponse.json({
        ok: false,
        action: "re_edit",
        run: null,
        queued_count: 0,
        failed_count: failed.length,
        queued: [],
        failed,
      });
    }

    await fs.mkdir(DRAFT_ROOT, { recursive: true });

    const baseRunName = `${RE_EDIT_RUN_PREFIX}-${acceptedProducts.length}-SPU-${formatTimestamp(
      new Date()
    )}`;
    let runName = baseRunName;
    let suffix = 2;
    while (true) {
      const runPath = path.join(DRAFT_ROOT, runName);
      try {
        await fs.mkdir(runPath);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EEXIST") {
          runName = `${baseRunName}-${suffix}`;
          suffix += 1;
          continue;
        }
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
      }
    }

    const runAbsolutePath = path.join(DRAFT_ROOT, runName);
    const draftProductUpserts: Array<Record<string, unknown>> = [];
    const draftVariantRows: Array<Record<string, unknown>> = [];
    const queued: Array<{ id: string; spu: string; image_count: number; variant_count: number }> =
      [];

    for (const product of acceptedProducts) {
      const productId = String(product.id ?? "").trim();
      const spu = normalizeText(product.spu);
      if (!productId || !spu) continue;

      try {
        const catalogFolderPath = resolveCatalogFolderPath(product.image_folder);
        if (!catalogFolderPath) {
          throw new Error("Missing or invalid catalog image folder.");
        }

        const source = await pickCatalogImageSourceFolder(catalogFolderPath);
        if (!source) {
          throw new Error("No images found in catalog image folder.");
        }

        const destinationSpuFolder = path.join(runAbsolutePath, spu);
        await fs.mkdir(destinationSpuFolder, { recursive: true });

        const copiedFileNames: string[] = [];
        for (const fileName of source.files) {
          const safeName = path.basename(fileName);
          if (!safeName || safeName.startsWith(".")) continue;
          const finalName = await ensureUniqueFileName(destinationSpuFolder, safeName);
          await fs.copyFile(path.join(source.sourceDir, fileName), path.join(destinationSpuFolder, finalName));
          copiedFileNames.push(finalName);
        }

        if (copiedFileNames.length === 0) {
          throw new Error("No image files were copied to draft folder.");
        }

        const fileByKey = new Map<string, string>();
        const fileByStemKey = new Map<string, string>();
        copiedFileNames.forEach((fileName) => {
          fileByKey.set(toFileKey(fileName), fileName);
          fileByStemKey.set(toStemKey(fileName), fileName);
        });

        const primaryFileName =
          copiedFileNames.find((fileName) => MAIN_IMAGE_TAG_REGEX.test(fileName)) ??
          copiedFileNames[0] ??
          null;

        const stgProductRow = stgSpuBySpu.get(spu) ?? null;
        const productVariants =
          (variantsByProductId.get(productId) ?? []).length > 0
            ? (variantsByProductId.get(productId) ?? [])
            : (stgSkuBySpu.get(spu) ?? []);

        const variantRowsForSpu: Array<Record<string, unknown>> = [];

        if (productVariants.length > 0) {
          productVariants.forEach((variant, index) => {
            const fileNameFromRef = extractFileNameFromReference(
              normalizeText(variant.variant_image_url)
            );
            const mappedVariantImage =
              (fileNameFromRef
                ? fileByKey.get(toFileKey(fileNameFromRef)) ??
                  fileByStemKey.get(toStemKey(fileNameFromRef))
                : null) ?? null;

            const sku =
              normalizeText(variant.sku) ??
              `${spu}-${String(index + 1).padStart(2, "0")}`;
            const rawRowFromVariant =
              variant.raw_row && typeof variant.raw_row === "object"
                ? (variant.raw_row as Record<string, unknown>)
                : null;

            variantRowsForSpu.push({
              id: randomUUID(),
              draft_spu: spu,
              draft_sku: sku,
              draft_option1: normalizeText(variant.option1),
              draft_option2: normalizeText(variant.option2),
              draft_option3: normalizeText(variant.option3),
              draft_option4: normalizeText(variant.option4),
              draft_option_combined_zh: normalizeText(variant.option_combined_zh),
              draft_option1_zh: normalizeText(variant.option1_zh),
              draft_option2_zh: normalizeText(variant.option2_zh),
              draft_option3_zh: normalizeText(variant.option3_zh),
              draft_option4_zh: normalizeText(variant.option4_zh),
              draft_price: variant.price ?? null,
              draft_compare_at_price: variant.compare_at_price ?? null,
              draft_cost: variant.cost ?? null,
              draft_weight: variant.weight ?? null,
              draft_weight_unit: normalizeText(variant.weight_unit),
              draft_barcode: normalizeText(variant.barcode),
              draft_variant_image_url: mappedVariantImage,
              draft_shipping_name_en: normalizeText(variant.shipping_name_en),
              draft_short_title_zh: normalizeText(variant.short_title_zh),
              draft_shipping_name_zh: normalizeText(variant.shipping_name_zh),
              draft_shipping_class: normalizeText(variant.shipping_class),
              draft_taxable: normalizeText(variant.taxable),
              draft_tax_code: normalizeText(variant.tax_code),
              draft_hs_code: normalizeText(variant.hs_code),
              draft_country_of_origin: normalizeText(variant.country_of_origin),
              draft_category_code_fq: normalizeText(variant.category_code_fq),
              draft_category_code_ld: normalizeText(variant.category_code_ld),
              draft_supplier_name: normalizeText(variant.supplier_name),
              draft_supplier_location: normalizeText(variant.supplier_location),
              draft_b2b_dropship_price_se: variant.b2b_dropship_price_se ?? null,
              draft_b2b_dropship_price_no: variant.b2b_dropship_price_no ?? null,
              draft_b2b_dropship_price_dk: variant.b2b_dropship_price_dk ?? null,
              draft_b2b_dropship_price_fi: variant.b2b_dropship_price_fi ?? null,
              draft_purchase_price_cny: variant.purchase_price_cny ?? null,
              draft_raw_row:
                rawRowFromVariant ?? (buildDraftVariantRawRow(variant) as Record<string, unknown>),
              draft_status: "draft",
              draft_updated_at: nowIso,
            });
          });
        } else {
          variantRowsForSpu.push({
            id: randomUUID(),
            draft_spu: spu,
            draft_sku: spu,
            draft_option1: null,
            draft_option2: null,
            draft_option3: null,
            draft_option4: null,
            draft_option_combined_zh: null,
            draft_option1_zh: null,
            draft_option2_zh: null,
            draft_option3_zh: null,
            draft_option4_zh: null,
            draft_price: null,
            draft_compare_at_price: null,
            draft_cost: null,
            draft_weight: null,
            draft_weight_unit: null,
            draft_barcode: null,
            draft_variant_image_url: null,
            draft_shipping_name_en: null,
            draft_short_title_zh: null,
            draft_shipping_name_zh: null,
            draft_shipping_class: null,
            draft_taxable: null,
            draft_tax_code: null,
            draft_hs_code: null,
            draft_country_of_origin: null,
            draft_category_code_fq: null,
            draft_category_code_ld: null,
            draft_supplier_name: null,
            draft_supplier_location: null,
            draft_b2b_dropship_price_se: null,
            draft_b2b_dropship_price_no: null,
            draft_b2b_dropship_price_dk: null,
            draft_b2b_dropship_price_fi: null,
            draft_purchase_price_cny: null,
            draft_raw_row: null,
            draft_status: "draft",
            draft_updated_at: nowIso,
          });
        }

        const variantImageFileNames = Array.from(
          new Set(
            variantRowsForSpu
              .map((row) => normalizeText(row.draft_variant_image_url))
              .filter((value): value is string => Boolean(value))
          )
        );

        const draftImageFolder = `images/draft_products/${runName}/${spu}`;
        const stgRawRow =
          stgProductRow && typeof stgProductRow.raw_row === "object"
            ? (stgProductRow.raw_row as Record<string, unknown>)
            : null;

        draftProductUpserts.push({
          draft_spu: spu,
          draft_title:
            normalizeText(stgProductRow?.product_title) ?? normalizeText(product.title),
          draft_subtitle:
            normalizeText(stgProductRow?.subtitle) ?? normalizeText(product.subtitle),
          draft_description_html:
            normalizeText(stgProductRow?.product_description_html) ??
            normalizeText(product.description_html),
          draft_product_description_main_html:
            normalizeText(stgProductRow?.product_description_main_html) ??
            normalizeText(product.description_html),
          draft_mf_product_short_title: normalizeText(stgProductRow?.mf_product_short_title),
          draft_mf_product_long_title: normalizeText(stgProductRow?.mf_product_long_title),
          draft_mf_product_subtitle:
            normalizeText(stgProductRow?.mf_product_subtitle) ??
            normalizeText(stgProductRow?.subtitle) ??
            normalizeText(product.subtitle),
          draft_mf_product_bullets_short: normalizeText(stgProductRow?.mf_product_bullets_short),
          draft_mf_product_bullets: normalizeText(stgProductRow?.mf_product_bullets),
          draft_mf_product_bullets_long: normalizeText(stgProductRow?.mf_product_bullets_long),
          draft_mf_product_specs: normalizeText(stgProductRow?.mf_product_specs),
          draft_mf_product_description_short_html: normalizeText(
            stgProductRow?.mf_product_description_short_html
          ),
          draft_mf_product_description_extended_html: normalizeText(
            stgProductRow?.mf_product_description_extended_html
          ),
          draft_option1_name:
            normalizeText(stgProductRow?.option1_name) ?? normalizeText(product.option1_name),
          draft_option2_name:
            normalizeText(stgProductRow?.option2_name) ?? normalizeText(product.option2_name),
          draft_option3_name:
            normalizeText(stgProductRow?.option3_name) ?? normalizeText(product.option3_name),
          draft_option4_name:
            normalizeText(stgProductRow?.option4_name) ?? normalizeText(product.option4_name),
          draft_legacy_title_sv:
            normalizeText(stgProductRow?.legacy_title_sv) ?? normalizeText(product.legacy_title_sv),
          draft_legacy_description_sv:
            normalizeText(stgProductRow?.legacy_description_sv) ??
            normalizeText(product.legacy_description_sv),
          draft_legacy_bullets_sv:
            normalizeText(stgProductRow?.legacy_bullets_sv) ??
            normalizeText(product.legacy_bullets_sv),
          draft_supplier_1688_url:
            normalizeText(stgProductRow?.supplier_1688_url) ??
            normalizeText(product.supplier_1688_url),
          draft_image_folder: draftImageFolder,
          draft_main_image_url: primaryFileName,
          draft_image_urls: copiedFileNames,
          draft_variant_image_urls: variantImageFileNames,
          draft_image_files: copiedFileNames,
          draft_variant_image_files: variantImageFileNames,
          draft_raw_row:
            stgRawRow ??
            ({
              spu,
              title: normalizeText(product.title),
              subtitle: normalizeText(product.subtitle),
              description_html: normalizeText(product.description_html),
              supplier_1688_url: normalizeText(product.supplier_1688_url),
              tags: normalizeText(product.tags),
              brand: normalizeText(product.brand),
              vendor: normalizeText(product.vendor),
            } as Record<string, unknown>),
          draft_source: "re_edit",
          draft_status: "draft",
          draft_updated_at: nowIso,
          draft_created_at: normalizeText(product.created_at),
        });

        draftVariantRows.push(...variantRowsForSpu);
        queued.push({
          id: productId,
          spu,
          image_count: copiedFileNames.length,
          variant_count: variantRowsForSpu.length,
        });
      } catch (error) {
        failed.push({
          id: productId,
          spu,
          error: toErrorMessage(error),
        });
      }
    }

    const queuedSpus = queued.map((entry) => entry.spu);

    if (draftProductUpserts.length > 0) {
      const { error: upsertError } = await adminClient
        .from("draft_products")
        .upsert(draftProductUpserts, { onConflict: "draft_spu" });
      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    }

    if (queuedSpus.length > 0) {
      const { error: deleteDraftVariantsError } = await adminClient
        .from("draft_variants")
        .delete()
        .in("draft_spu", queuedSpus);
      if (deleteDraftVariantsError) {
        return NextResponse.json({ error: deleteDraftVariantsError.message }, { status: 500 });
      }
    }

    if (draftVariantRows.length > 0) {
      for (const chunk of chunkRows(draftVariantRows, 200)) {
        const { error: insertDraftVariantsError } = await adminClient
          .from("draft_variants")
          .insert(chunk);
        if (insertDraftVariantsError) {
          return NextResponse.json({ error: insertDraftVariantsError.message }, { status: 500 });
        }
      }
    }

    let stgStatusWarning: string | null = null;
    if (queuedSpus.length > 0) {
      const { error: stgStatusError } = await adminClient
        .from("stg_import_spu")
        .update({
          status: "re_editing",
          imported_at: nowIso,
          processed: false,
        })
        .in("spu", queuedSpus);
      if (stgStatusError) {
        stgStatusWarning = stgStatusError.message;
      }
    }

    return NextResponse.json({
      ok: failed.length === 0,
      action: "re_edit",
      run: runName,
      run_type: "re_edit",
      queued_count: queued.length,
      failed_count: failed.length,
      queued,
      failed,
      warning: stgStatusWarning,
    });
  }

  await fs.mkdir(DELETED_PRODUCTS_ROOT, { recursive: true });

  const nowIso = new Date().toISOString();
  const results: Array<{
    id: string;
    spu: string | null;
    archived_to?: string;
    deleted: boolean;
    error?: string;
    meili_error?: string;
  }> = [];

  for (const productId of productIds) {
    const product = productById.get(productId);
    if (!product) {
      results.push({
        id: productId,
        spu: null,
        deleted: false,
        error: "Product not found.",
      });
      continue;
    }

    const row = product as CatalogProductRow;
    const spu = row.spu ? String(row.spu) : null;
    const variantRows = variantsByProductId.get(row.id) ?? [];
    const stgSpuRow = spu ? stgSpuBySpu.get(spu) ?? null : null;
    const stgSkuBySpuRows = spu ? stgSkuBySpu.get(spu) ?? [] : [];

    try {
      const stamp = nowIso.replace(/[:.]/g, "-");
      const productKey = sanitizePathSegment(spu ?? row.id) || row.id;
      const filePath = path.join(
        DELETED_PRODUCTS_ROOT,
        `${stamp}-${productKey}-${row.id}.json`
      );
      const snapshotPayload = {
        deleted_at: nowIso,
        deleted_by_user_id: adminAuth.userId,
        action: "delete",
        product,
        variants: variantRows,
        stg_import_spu: stgSpuRow,
        stg_import_sku: stgSkuBySpuRows,
      };
      await fs.writeFile(filePath, JSON.stringify(snapshotPayload, null, 2), "utf8");

      const { error: offlineProductError } = await adminClient
        .from("catalog_products")
        .update({
          is_active: false,
          nordic_partner_enabled: false,
          shopify_tingelo_sync: false,
          is_blocked: true,
          blocked_at: nowIso,
          blocked_by: adminAuth.userId,
          updated_at: nowIso,
        })
        .eq("id", row.id);
      if (offlineProductError) {
        throw new Error(offlineProductError.message);
      }

      if (spu) {
        const { error: offlineStgSpuError } = await adminClient
          .from("stg_import_spu")
          .update({
            is_active: "false",
            status: "deleted",
            published: "false",
            published_scope: null,
            shopify_tingelo_sync: false,
            imported_at: nowIso,
            processed: false,
          })
          .eq("spu", spu);
        if (offlineStgSpuError) {
          throw new Error(offlineStgSpuError.message);
        }

        const { error: touchStgSkuError } = await adminClient
          .from("stg_import_sku")
          .update({
            imported_at: nowIso,
            processed: false,
          })
          .eq("spu", spu);
        if (touchStgSkuError) {
          throw new Error(touchStgSkuError.message);
        }
      }

      const { error: deleteVariantsError } = await adminClient
        .from("catalog_variants")
        .delete()
        .eq("product_id", row.id);
      if (deleteVariantsError) {
        throw new Error(deleteVariantsError.message);
      }

      const { error: deleteProductError } = await adminClient
        .from("catalog_products")
        .delete()
        .eq("id", row.id);
      if (deleteProductError) {
        throw new Error(deleteProductError.message);
      }

      const meiliError = await deleteFromMeili(row.id);
      results.push({
        id: row.id,
        spu,
        archived_to: filePath,
        deleted: true,
        meili_error: meiliError ?? undefined,
      });
    } catch (error) {
      results.push({
        id: row.id,
        spu,
        deleted: false,
        error: toErrorMessage(error),
      });
    }
  }

  const deleted = results.filter((entry) => entry.deleted);
  const failed = results.filter((entry) => !entry.deleted);

  return NextResponse.json({
    ok: failed.length === 0,
    action: "delete",
    deleted_count: deleted.length,
    failed_count: failed.length,
    deleted,
    failed,
  });
}
