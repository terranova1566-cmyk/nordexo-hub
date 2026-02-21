import { NextResponse } from "next/server";
import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { EXTRACTOR_UPLOAD_DIR } from "@/lib/1688-extractor";
import {
  BULK_JOB_UPLOAD_DIR,
  type BulkJob,
  countItems,
  resolveWorkerCount,
  upsertJob,
} from "@/lib/bulk-jobs";
import {
  collectProductionRefsFromPayload,
  loadJsonFile,
  safeExtractorJsonPath,
  upsertProductionStatuses,
} from "@/lib/production-queue-status";
import { generateQueueKeywordsForFile } from "@/lib/queue-keywords";
import { warmQueueImageCacheForFile } from "@/lib/queue-image-cache";

export const runtime = "nodejs";

type QueueItem = {
  provider: string;
  product_id: string;
};

type VariantSelection = {
  selected_combo_indexes: number[];
  packs: number[];
  packs_text: string;
  combo_overrides?: Array<{
    index: number;
    price: number | null;
    weight_grams: number | null;
  }>;
};

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

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

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, user };
}

const normalizeItems = (value: unknown): QueueItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      provider: asText((entry as any)?.provider),
      product_id: asText((entry as any)?.product_id),
    }))
    .filter((entry) => entry.provider && entry.product_id);
};

const formatStamp = (date = new Date()) => {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate()
  )}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}_${pad(
    date.getMilliseconds(),
    3
  )}`;
};

const normalizePayloadItems = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray((payload as any).items)) {
    return (payload as { items: unknown[] }).items;
  }
  if (payload && typeof payload === "object") return [payload];
  return [];
};

const normalizeVariantSelection = (
  selectedOffer: unknown,
  comboCount: number
): VariantSelection | null => {
  if (!selectedOffer || typeof selectedOffer !== "object") return null;
  const selection = (selectedOffer as any)._production_variant_selection;
  if (!selection || typeof selection !== "object") return null;

  const selected_combo_indexes = Array.isArray((selection as any).selected_combo_indexes)
    ? ((selection as any).selected_combo_indexes as unknown[])
        .map((entry) => Number(entry))
        .filter(
          (entry) =>
            Number.isInteger(entry) && entry >= 0 && (!comboCount || entry < comboCount)
        )
    : [];

  const packs = Array.isArray((selection as any).packs)
    ? ((selection as any).packs as unknown[])
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
    : [];

  const packs_text =
    typeof (selection as any).packs_text === "string"
      ? (selection as any).packs_text.trim()
      : "";

  return {
    selected_combo_indexes: Array.from(new Set(selected_combo_indexes)),
    packs: Array.from(new Set(packs)),
    packs_text,
    combo_overrides: Array.isArray((selection as any).combo_overrides)
      ? ((selection as any).combo_overrides as Array<{
          index: unknown;
          price?: unknown;
          weight_grams?: unknown;
          weightGrams?: unknown;
        }>)
          .map((row) => ({
            index: Number((row as any)?.index),
            price:
              Number.isFinite(Number((row as any)?.price)) && Number((row as any).price) > 0
                ? Number((row as any).price)
                : null,
            weight_grams:
              Number.isFinite(
                Number((row as any)?.weight_grams ?? (row as any)?.weightGrams)
              ) &&
              Number((row as any)?.weight_grams ?? (row as any)?.weightGrams) > 0
                ? Math.round(
                    Number((row as any)?.weight_grams ?? (row as any)?.weightGrams)
                  )
                : null,
          }))
          .filter(
            (row) =>
              Number.isInteger(row.index) &&
              row.index >= 0 &&
              (!comboCount || row.index < comboCount) &&
              (row.price !== null || row.weight_grams !== null)
          )
      : undefined,
  };
};

const buildVariantFilterTokens = (
  combos: Array<Record<string, unknown>>,
  indexes: number[]
) => {
  const tokens = new Set<string>();
  indexes.forEach((idx) => {
    const combo = combos[idx];
    if (!combo || typeof combo !== "object") return;
    ["t1", "t2", "t3"].forEach((key) => {
      const value = asText((combo as any)[key]);
      if (value) tokens.add(value);
    });
  });
  return Array.from(tokens);
};

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const queueItems = normalizeItems((body as any)?.items);
  if (queueItems.length === 0) {
    return NextResponse.json({ error: "No products selected." }, { status: 400 });
  }

  const mergedItems: Record<string, unknown>[] = [];
  const missingFiles: QueueItem[] = [];

  for (const item of queueItems) {
    const { data, error } = await adminClient
      .from("discovery_production_supplier_selection")
      .select("selected_offer")
      .eq("provider", item.provider)
      .eq("product_id", item.product_id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const selectedOffer = (data as any)?.selected_offer;
    const payloadPath = safeExtractorJsonPath(
      selectedOffer && typeof selectedOffer === "object"
        ? (selectedOffer as any)._production_payload_file_path
        : null
    );
    if (!payloadPath) {
      missingFiles.push(item);
      continue;
    }

    let payload: unknown;
    try {
      payload = await loadJsonFile(payloadPath);
    } catch {
      missingFiles.push(item);
      continue;
    }

    const payloadItems = normalizePayloadItems(payload);
    payloadItems.forEach((entry) => {
      const record = entry && typeof entry === "object" ? { ...entry } : {};
      const variationCombos = Array.isArray((record as any)?.variations?.combos)
        ? (((record as any).variations.combos as unknown[]).filter(
            (combo) => combo && typeof combo === "object"
          ) as Array<Record<string, unknown>>)
        : [];
      const variantSelection = normalizeVariantSelection(
        selectedOffer,
        variationCombos.length
      );

      const decoratedCombos = (() => {
        const base = variationCombos.map((combo) => ({ ...combo }));
        const overrides = variantSelection?.combo_overrides;
        if (!overrides || overrides.length === 0) return base;
        const map = new Map<number, { price: number | null; weight_grams: number | null }>();
        overrides.forEach((row) => {
          if (!row || typeof row.index !== "number" || !Number.isInteger(row.index)) return;
          map.set(row.index, {
            price:
              typeof row.price === "number" && Number.isFinite(row.price) && row.price > 0
                ? Number(row.price)
                : null,
            weight_grams:
              typeof row.weight_grams === "number" &&
              Number.isFinite(row.weight_grams) &&
              row.weight_grams > 0
                ? Math.round(Number(row.weight_grams))
                : null,
          });
        });
        if (map.size === 0) return base;
        return base.map((combo, idx) => {
          const override = map.get(idx);
          if (!override) return combo;
          const next = { ...combo } as Record<string, unknown>;
          if (override.price !== null) {
            next.price = override.price;
            next.priceRaw = `¥${override.price}`;
            next.price_raw = `¥${override.price}`;
          }
          if (override.weight_grams !== null) {
            next.weight_grams = override.weight_grams;
            next.weightGrams = override.weight_grams;
            next.weightRaw = `${override.weight_grams}g`;
            next.weight_raw = `${override.weight_grams}g`;
          }
          return next;
        });
      })();

      if (variantSelection && decoratedCombos.length > 0) {
        const selectedIndexes = variantSelection.selected_combo_indexes;
        const filteredCombos =
          selectedIndexes.length > 0
            ? selectedIndexes.map((idx) => decoratedCombos[idx]).filter(Boolean)
            : decoratedCombos;
        if (
          (record as any).variations &&
          typeof (record as any).variations === "object"
        ) {
          (record as any).variations = {
            ...(record as any).variations,
            combos: filteredCombos,
            note: [
              asText((record as any)?.variations?.note),
              selectedIndexes.length > 0
                ? `Production queue filtered variants: ${filteredCombos.length}/${variationCombos.length}`
                : "",
            ]
              .filter(Boolean)
              .join(" | "),
          };
        }

        const filterTokens = buildVariantFilterTokens(
          decoratedCombos,
          selectedIndexes.length > 0
            ? selectedIndexes
            : decoratedCombos.map((_, idx) => idx)
        );
        (record as any).variation_filter_tokens = filterTokens;
        (record as any).variants_1688 = filterTokens.join("\n");
        (record as any).production_variant_selection = variantSelection;
      }

      if (variantSelection && variantSelection.packs.length > 0) {
        (record as any).production_packs = variantSelection.packs;
        (record as any).production_packs_text = variantSelection.packs_text;
      }

      if (!asText((record as any).production_provider)) {
        (record as any).production_provider = item.provider;
      }
      if (!asText((record as any).production_product_id)) {
        (record as any).production_product_id = item.product_id;
      }
      mergedItems.push(record as Record<string, unknown>);
    });
  }

  if (mergedItems.length === 0) {
    const missingText = missingFiles
      .map((entry) => `${entry.provider}:${entry.product_id}`)
      .join(", ");
    return NextResponse.json(
      {
        error: missingText
          ? `No saved supplier JSON found for selected products: ${missingText}`
          : "No saved supplier JSON found for selected products.",
      },
      { status: 400 }
    );
  }

  const itemCount = countItems(mergedItems);
  if (itemCount === 0) {
    return NextResponse.json({ error: "Merged payload has no items." }, { status: 400 });
  }

  const now = new Date();
  const fileName = `production_queue_incoming_${formatStamp(now)}.json`;
  const extractorFilePath = path.join(EXTRACTOR_UPLOAD_DIR, fileName);
  await fs.mkdir(EXTRACTOR_UPLOAD_DIR, { recursive: true });
  await fs.writeFile(extractorFilePath, JSON.stringify(mergedItems, null, 2), "utf8");
  try {
    await generateQueueKeywordsForFile(fileName, {
      force: true,
      mode: "fast",
    });
  } catch (error) {
    console.error("Queue keyword precompute failed:", error);
  }
  void warmQueueImageCacheForFile(fileName).catch((error) => {
    console.error("Queue image cache warm failed:", error);
  });

  const workerCount = resolveWorkerCount(itemCount, null);
  const jobId = crypto.randomUUID();
  await fs.mkdir(BULK_JOB_UPLOAD_DIR, { recursive: true });
  const inputPath = path.join(BULK_JOB_UPLOAD_DIR, `${jobId}.json`);
  await fs.writeFile(inputPath, JSON.stringify(mergedItems, null, 2), "utf8");

  const job: BulkJob = {
    jobId,
    status: "queued",
    inputPath,
    inputName: fileName,
    itemCount,
    workerCount,
    createdAt: now.toISOString(),
    summary: null,
    error: null,
  };
  upsertJob(job);

  const refs = collectProductionRefsFromPayload(mergedItems);
  if (refs.length > 0) {
    try {
      await upsertProductionStatuses(
        adminClient,
        refs.map((entry) => ({ provider: entry.provider, product_id: entry.product_id })),
        {
          status: "queued_for_production",
          fileName,
          jobId,
        }
      );
    } catch (error) {
      console.error("Unable to touch production queue status metadata:", error);
    }
  }

  return NextResponse.json({
    ok: true,
    file_name: fileName,
    merged_count: mergedItems.length,
    selected_count: queueItems.length,
    missing_count: missingFiles.length,
    missing: missingFiles,
    job,
  });
}
