import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";

const WORKER_PATH = "/srv/nordexo-hub/scripts/letsdeal-delivery-rewrite-worker.mjs";
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

type SupabaseLikeError = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

type ProductSourceRow = {
  id: string | null;
  spu: string | null;
  title: string | null;
  subtitle: string | null;
  description_html: string | null;
};

type MetafieldDefinitionRow = {
  id: string | null;
  key: string | null;
};

type MetafieldValueRow = {
  target_id: string | null;
  definition_id: string | null;
  value_text: string | null;
  value: unknown;
  value_number: number | string | null;
  value_json: unknown;
};

type LetsdealProductTextRow = {
  product_id: string | null;
  source_hash: string | null;
  title_1_sv: string | null;
  title_2_sv: string | null;
  summary_sv: string | null;
  product_information_sv: string | null;
  title_1_no: string | null;
  title_2_no: string | null;
  summary_no: string | null;
  product_information_no: string | null;
};

type LetsdealJobRow = {
  product_id: string | null;
  status: string | null;
};

const normalizeIds = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
    )
  );
};

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const normalizeHtml = (value: unknown) =>
  asText(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const splitLines = (value: unknown) =>
  asText(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\u2022]\s*/, "").trim())
    .filter(Boolean);

const splitParagraphs = (value: unknown) =>
  asText(value)
    .split(/\n\s*\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const isDeliveryLine = (value: unknown) => {
  const line = asText(value).toLowerCase();
  if (!line) return false;
  return /(leverans|levering|frakt|retur|spår|sporning|arbetsdag|working day|tracking)/i.test(
    line
  );
};

const uniqueLines = (items: string[], limit = 80) => {
  const out: string[] = [];
  const seen = new Set<string>();
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

const pickMetafieldText = (row: MetafieldValueRow) => {
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
  return text;
};

const buildSourcePayload = (product: ProductSourceRow, metaByKey: Record<string, string>) => {
  const longTitle = asText(metaByKey.long_title || product.title);
  const subtitle = asText(metaByKey.subtitle || metaByKey.subtitle_sv || product.subtitle);
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
      ...splitParagraphs(normalizeHtml(product.description_html)),
      ...splitParagraphs(metaByKey.description_extended),
    ],
    24
  );

  const specifications = uniqueLines(splitLines(metaByKey.specs), 40);

  return {
    product_id: asText(product.id),
    sku: asText(product.spu),
    title: longTitle,
    subtitle,
    bullets,
    description_blocks: descriptionBlocks,
    specifications,
  };
};

const hashSource = (payload: unknown) => {
  try {
    return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  } catch {
    return null;
  }
};

const isNonEmpty = (value: unknown) => asText(value).length > 0;

const hasReusableLetsdealText = (row: LetsdealProductTextRow | undefined) => {
  if (!row) return false;
  return (
    isNonEmpty(row.title_1_sv) &&
    isNonEmpty(row.title_2_sv) &&
    isNonEmpty(row.summary_sv) &&
    isNonEmpty(row.product_information_sv) &&
    isNonEmpty(row.title_1_no) &&
    isNonEmpty(row.title_2_no) &&
    isNonEmpty(row.summary_no) &&
    isNonEmpty(row.product_information_no)
  );
};

const loadSourceHashes = async (args: {
  adminClient: ReturnType<typeof createAdminSupabase>;
  productIds: string[];
}) => {
  const { adminClient, productIds } = args;
  if (productIds.length === 0) return new Map<string, string | null>();

  const { data: productsRaw, error: productError } = await adminClient
    .from("catalog_products")
    .select("id, spu, title, subtitle, description_html")
    .in("id", productIds);
  if (productError) {
    throw new Error(`Unable to load catalog_products for LetsDeal hashing: ${productError.message}`);
  }

  const { data: metaDefsRaw, error: metaDefsError } = await adminClient
    .from("metafield_definitions")
    .select("id, key")
    .eq("resource", "catalog_product")
    .in("key", PRODUCT_META_KEYS)
    .in("namespace", PRODUCT_META_NAMESPACES);
  if (metaDefsError) {
    throw new Error(
      `Unable to load metafield_definitions for LetsDeal hashing: ${metaDefsError.message}`
    );
  }

  const keyByDefinitionId = new Map<string, string>();
  const definitionIds: string[] = [];
  ((metaDefsRaw ?? []) as MetafieldDefinitionRow[]).forEach((row) => {
    const id = asText(row.id);
    const key = asText(row.key);
    if (!id || !key || keyByDefinitionId.has(id)) return;
    keyByDefinitionId.set(id, key);
    definitionIds.push(id);
  });

  const metaByProduct = new Map<string, Record<string, string>>();
  if (definitionIds.length > 0) {
    const { data: metaValuesRaw, error: metaValuesError } = await adminClient
      .from("metafield_values")
      .select("target_id, definition_id, value_text, value, value_number, value_json")
      .eq("target_type", "product")
      .in("target_id", productIds)
      .in("definition_id", definitionIds);
    if (metaValuesError) {
      throw new Error(
        `Unable to load metafield_values for LetsDeal hashing: ${metaValuesError.message}`
      );
    }

    ((metaValuesRaw ?? []) as MetafieldValueRow[]).forEach((row) => {
      const productId = asText(row.target_id);
      const definitionId = asText(row.definition_id);
      const key = keyByDefinitionId.get(definitionId);
      if (!productId || !key) return;
      const text = pickMetafieldText(row);
      if (!text) return;
      const metaForProduct = metaByProduct.get(productId) ?? {};
      if (!metaForProduct[key]) {
        metaForProduct[key] = text;
        metaByProduct.set(productId, metaForProduct);
      }
    });
  }

  const hashByProductId = new Map<string, string | null>();
  ((productsRaw ?? []) as ProductSourceRow[]).forEach((product) => {
    const productId = asText(product.id);
    if (!productId) return;
    const payload = buildSourcePayload(product, metaByProduct.get(productId) ?? {});
    hashByProductId.set(productId, hashSource(payload));
  });

  return hashByProductId;
};

const stringifyErrorPart = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const extractSupabaseError = (error: unknown): SupabaseLikeError | null => {
  if (!error || typeof error !== "object") return null;
  return error as SupabaseLikeError;
};

export const isMissingLetsdealDeliveryJobsTableError = (error: unknown) => {
  const supabaseError = extractSupabaseError(error);
  if (!supabaseError) return false;

  const code = String(supabaseError.code ?? "")
    .trim()
    .toUpperCase();
  if (code === "PGRST205" || code === "42P01") {
    return true;
  }

  const message = stringifyErrorPart(supabaseError.message).toLowerCase();
  const details = stringifyErrorPart(supabaseError.details).toLowerCase();
  const hint = stringifyErrorPart(supabaseError.hint).toLowerCase();
  const combined = `${message} ${details} ${hint}`.trim();

  if (!combined) return false;
  if (!combined.includes("letsdeal_delivery_jobs")) return false;

  return (
    combined.includes("schema cache") ||
    combined.includes("could not find the table") ||
    combined.includes("does not exist") ||
    combined.includes("relation")
  );
};

const EMPTY_ENQUEUE_RESULT = {
  inserted: 0,
  requeued: 0,
  total: 0,
} as const;

export const spawnLetsdealDeliveryWorker = (wishlistId: string) => {
  const listId = String(wishlistId ?? "").trim();
  if (!listId) return false;

  try {
    const child = spawn(process.execPath, [WORKER_PATH, "--list-id", listId], {
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

export const enqueueLetsdealDeliveryJobs = async (args: {
  wishlistId: string;
  productIds: string[];
}) => {
  const wishlistId = String(args.wishlistId ?? "").trim();
  const productIds = normalizeIds(args.productIds);
  if (!wishlistId || productIds.length === 0) {
    return EMPTY_ENQUEUE_RESULT;
  }

  const adminClient = createAdminSupabase();

  const { data: existingRowsRaw, error: existingError } = await adminClient
    .from("letsdeal_delivery_jobs")
    .select("product_id, status")
    .eq("wishlist_id", wishlistId)
    .in("product_id", productIds);

  if (existingError) {
    if (isMissingLetsdealDeliveryJobsTableError(existingError)) {
      return EMPTY_ENQUEUE_RESULT;
    }
    throw new Error(existingError.message);
  }

  const hashByProductId = await loadSourceHashes({ adminClient, productIds });

  const { data: textRowsRaw, error: textRowsError } = await adminClient
    .from("letsdeal_product_texts")
    .select(
      "product_id, source_hash, title_1_sv, title_2_sv, summary_sv, product_information_sv, title_1_no, title_2_no, summary_no, product_information_no"
    )
    .in("product_id", productIds);
  if (textRowsError) {
    throw new Error(textRowsError.message);
  }

  const existingRows = (existingRowsRaw ?? []) as LetsdealJobRow[];
  const textRows = (textRowsRaw ?? []) as LetsdealProductTextRow[];

  const statusByProductId = new Map<string, string>();
  existingRows.forEach((row) => {
    const productId = String((row as { product_id?: unknown }).product_id ?? "").trim();
    if (!productId) return;
    const status = String((row as { status?: unknown }).status ?? "").trim().toLowerCase();
    statusByProductId.set(productId, status);
  });

  const textByProductId = new Map<string, LetsdealProductTextRow>();
  textRows.forEach((row) => {
    const productId = asText(row.product_id);
    if (!productId) return;
    if (!textByProductId.has(productId)) {
      textByProductId.set(productId, row);
    }
  });

  const needsGeneration = new Set<string>();
  const reusableFromCache = new Set<string>();

  productIds.forEach((productId) => {
    const sourceHash = hashByProductId.get(productId) ?? null;
    const textRow = textByProductId.get(productId);
    const textComplete = hasReusableLetsdealText(textRow);
    const cachedHash = asText(textRow?.source_hash || "");
    const unchanged = Boolean(sourceHash && cachedHash && sourceHash === cachedHash);

    if (textComplete && unchanged) {
      reusableFromCache.add(productId);
      return;
    }

    needsGeneration.add(productId);
  });

  const nowIso = new Date().toISOString();

  const queueInsertIds = productIds.filter(
    (productId) => needsGeneration.has(productId) && !statusByProductId.has(productId)
  );
  const completedInsertIds = productIds.filter(
    (productId) => reusableFromCache.has(productId) && !statusByProductId.has(productId)
  );
  const requeueIds = productIds.filter((productId) => {
    if (!needsGeneration.has(productId)) return false;
    const status = statusByProductId.get(productId);
    return status === "failed" || status === "completed";
  });
  const promoteToCompletedIds = productIds.filter((productId) => {
    if (!reusableFromCache.has(productId)) return false;
    const status = statusByProductId.get(productId);
    return status === "failed" || status === "queued";
  });

  const queueInserts = queueInsertIds
    .map((productId) => ({
      wishlist_id: wishlistId,
      product_id: productId,
      status: "queued",
      queued_at: nowIso,
      started_at: null,
      completed_at: null,
      error_message: null,
      updated_at: nowIso,
      created_at: nowIso,
    }));

  const completedInserts = completedInsertIds.map((productId) => ({
    wishlist_id: wishlistId,
    product_id: productId,
    status: "completed",
    attempt_count: 0,
    queued_at: nowIso,
    started_at: nowIso,
    completed_at: nowIso,
    error_message: null,
    updated_at: nowIso,
    created_at: nowIso,
  }));

  if (queueInserts.length > 0) {
    const { error: insertError } = await adminClient
      .from("letsdeal_delivery_jobs")
      .insert(queueInserts);
    if (insertError) {
      if (isMissingLetsdealDeliveryJobsTableError(insertError)) {
        return EMPTY_ENQUEUE_RESULT;
      }
      throw new Error(insertError.message);
    }
  }

  if (completedInserts.length > 0) {
    const { error: completedInsertError } = await adminClient
      .from("letsdeal_delivery_jobs")
      .insert(completedInserts);
    if (completedInsertError) {
      if (isMissingLetsdealDeliveryJobsTableError(completedInsertError)) {
        return EMPTY_ENQUEUE_RESULT;
      }
      throw new Error(completedInsertError.message);
    }
  }

  if (requeueIds.length > 0) {
    const { error: requeueError } = await adminClient
      .from("letsdeal_delivery_jobs")
      .update({
        status: "queued",
        error_message: null,
        started_at: null,
        completed_at: null,
        queued_at: nowIso,
        updated_at: nowIso,
      })
      .eq("wishlist_id", wishlistId)
      .in("status", ["failed", "completed"])
      .in("product_id", requeueIds);
    if (requeueError) {
      if (isMissingLetsdealDeliveryJobsTableError(requeueError)) {
        return EMPTY_ENQUEUE_RESULT;
      }
      throw new Error(requeueError.message);
    }
  }

  if (promoteToCompletedIds.length > 0) {
    const { error: promoteError } = await adminClient
      .from("letsdeal_delivery_jobs")
      .update({
        status: "completed",
        error_message: null,
        completed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("wishlist_id", wishlistId)
      .in("status", ["failed", "queued"])
      .in("product_id", promoteToCompletedIds);
    if (promoteError) {
      if (isMissingLetsdealDeliveryJobsTableError(promoteError)) {
        return EMPTY_ENQUEUE_RESULT;
      }
      throw new Error(promoteError.message);
    }
  }

  return {
    inserted: queueInserts.length,
    requeued: requeueIds.length,
    total: queueInserts.length + requeueIds.length,
  };
};
