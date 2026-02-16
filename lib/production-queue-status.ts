import { promises as fs } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EXTRACTOR_UPLOAD_DIR } from "@/lib/1688-extractor";

export type ProductionQueueRef = {
  provider: string;
  product_id: string;
};

export type ProductionQueueRefWithSpu = ProductionQueueRef & {
  spu?: string | null;
};

export type ProductionQueueStatusValue =
  | "queued_for_production"
  | "spu_assigned"
  | "production_started"
  | "production_done";

type ProductionStatusRow = {
  provider: string;
  product_id: string;
  status: string | null;
  spu_assigned_at: string | null;
  production_started_at: string | null;
  production_done_at: string | null;
  last_file_name: string | null;
  last_job_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const keyOf = (provider: string, productId: string) =>
  `${provider}:${productId}`;

const normalizeRef = (
  providerValue: unknown,
  productIdValue: unknown
): ProductionQueueRef | null => {
  const provider = asText(providerValue);
  const product_id = asText(productIdValue);
  if (!provider || !product_id) return null;
  return { provider, product_id };
};

const extractBaseSpu = (value: unknown) => {
  const text = asText(value);
  if (!text) return null;
  const match = text.match(/[A-Za-z]{1,5}-\d+/);
  if (!match?.[0]) return null;
  return match[0].toUpperCase();
};

export const parsePayloadItems = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === "object") as Record<
      string,
      unknown
    >[];
  }
  if (payload && typeof payload === "object") {
    const rec = payload as Record<string, unknown>;
    if (Array.isArray(rec.items)) {
      return rec.items.filter((item) => item && typeof item === "object") as Record<
        string,
        unknown
      >[];
    }
    return [rec];
  }
  return [];
};

export const collectProductionRefsFromPayload = (
  payload: unknown,
  fallbackRef?: ProductionQueueRef | null
) => {
  const items = parsePayloadItems(payload);
  const out: ProductionQueueRefWithSpu[] = [];
  const seen = new Set<string>();

  items.forEach((item) => {
    const ref =
      normalizeRef(item.production_provider, item.production_product_id) ??
      normalizeRef(item.provider, item.product_id) ??
      fallbackRef ??
      null;
    if (!ref) return;
    const spu = extractBaseSpu(item.spu ?? item.sku ?? item.SKU);
    const key = `${keyOf(ref.provider, ref.product_id)}:${spu || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...ref, spu });
  });

  return out;
};

export const loadJsonFile = async (filePath: string) => {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
};

export const safeExtractorJsonPath = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return null;
  const resolved = path.resolve(raw);
  const allowedRoot = path.resolve(EXTRACTOR_UPLOAD_DIR);
  if (!resolved.startsWith(`${allowedRoot}${path.sep}`)) return null;
  if (path.extname(resolved).toLowerCase() !== ".json") return null;
  return resolved;
};

const uniqRefs = (rows: ProductionQueueRef[]) => {
  const out: ProductionQueueRef[] = [];
  const seen = new Set<string>();
  rows.forEach((row) => {
    const key = keyOf(row.provider, row.product_id);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  });
  return out;
};

export const upsertProductionStatuses = async (
  adminClient: SupabaseClient,
  refs: ProductionQueueRef[],
  options: {
    status?: ProductionQueueStatusValue;
    fileName?: string | null;
    jobId?: string | null;
    timestamp?: string;
  } = {}
) => {
  const uniqueRefs = uniqRefs(
    refs.filter((row) => asText(row.provider) && asText(row.product_id))
  );
  if (uniqueRefs.length === 0) return;

  const now = options.timestamp || new Date().toISOString();
  const providers = Array.from(new Set(uniqueRefs.map((row) => row.provider)));
  const productIds = Array.from(new Set(uniqueRefs.map((row) => row.product_id)));

  const { data: existingRows, error: existingError } = await adminClient
    .from("discovery_production_status")
    .select(
      "provider, product_id, status, spu_assigned_at, production_started_at, production_done_at, last_file_name, last_job_id, created_at, updated_at"
    )
    .in("provider", providers)
    .in("product_id", productIds);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingMap = new Map<string, ProductionStatusRow>();
  (existingRows as ProductionStatusRow[] | null)?.forEach((row) => {
    existingMap.set(keyOf(row.provider, row.product_id), row);
  });

  const rows = uniqueRefs.map((ref) => {
    const existing = existingMap.get(keyOf(ref.provider, ref.product_id));
    const row: Record<string, unknown> = {
      provider: ref.provider,
      product_id: ref.product_id,
      status: existing?.status ?? null,
      spu_assigned_at: existing?.spu_assigned_at ?? null,
      production_started_at: existing?.production_started_at ?? null,
      production_done_at: existing?.production_done_at ?? null,
      last_file_name: existing?.last_file_name ?? null,
      last_job_id: existing?.last_job_id ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };

    if (options.fileName !== undefined) {
      row.last_file_name = options.fileName || null;
    }
    if (options.jobId !== undefined) {
      row.last_job_id = options.jobId || null;
    }

    if (options.status === "queued_for_production") {
      row.status = "queued_for_production";
    } else if (options.status === "spu_assigned") {
      row.status = "spu_assigned";
      row.spu_assigned_at = now;
    } else if (options.status === "production_started") {
      row.status = "production_started";
      row.production_started_at = now;
      row.spu_assigned_at = row.spu_assigned_at || now;
    } else if (options.status === "production_done") {
      row.status = "production_done";
      row.production_done_at = now;
      row.production_started_at = row.production_started_at || now;
      row.spu_assigned_at = row.spu_assigned_at || now;
    }

    return row;
  });

  const { error: upsertError } = await adminClient
    .from("discovery_production_status")
    .upsert(rows, { onConflict: "provider,product_id" });
  if (upsertError) {
    throw new Error(upsertError.message);
  }
};

export const upsertProductionSpuLinks = async (
  adminClient: SupabaseClient,
  refs: ProductionQueueRefWithSpu[],
  options: { sourceFileName?: string | null; timestamp?: string } = {}
) => {
  const now = options.timestamp || new Date().toISOString();
  const rows = refs
    .filter((ref) => asText(ref.provider) && asText(ref.product_id) && asText(ref.spu))
    .map((ref) => ({
      provider: ref.provider,
      product_id: ref.product_id,
      spu: asText(ref.spu),
      source_file_name: options.sourceFileName || null,
      assigned_at: now,
      created_at: now,
    }));

  if (rows.length === 0) return;

  const { error } = await adminClient
    .from("discovery_production_item_spus")
    .upsert(rows, { onConflict: "provider,product_id,spu" });
  if (error) {
    throw new Error(error.message);
  }
};

export const getProductionRefsBySpus = async (
  adminClient: SupabaseClient,
  spus: string[]
) => {
  const uniqueSpus = Array.from(
    new Set(spus.map((spu) => asText(spu).toUpperCase()).filter(Boolean))
  );
  if (uniqueSpus.length === 0) return [] as ProductionQueueRef[];

  const { data, error } = await adminClient
    .from("discovery_production_item_spus")
    .select("provider, product_id")
    .in("spu", uniqueSpus);

  if (error) {
    throw new Error(error.message);
  }

  return uniqRefs(
    ((data as Array<{ provider: string; product_id: string }> | null) ?? []).map((row) => ({
      provider: asText(row.provider),
      product_id: asText(row.product_id),
    }))
  );
};
