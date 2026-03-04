import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  PARTNER_SUGGESTION_PROVIDER,
  ProductSuggestionRecord,
  buildExternalDataForImageSuggestion,
  buildExternalDataForUrlSuggestion,
  computeB2BPrices,
  crawlUrlForProduct,
  createSuggestionId,
  deriveVariantSelectionMetrics,
  deleteSuggestionRecord,
  extractImagesFromZipBuffer,
  fetchAndNormalizeImage,
  loadSuggestionRecord,
  mapMarketConfigRows,
  mapShippingClassRows,
  normalizeExternalDataForRecord,
  normalizeImageBufferToPublicTemp,
  parseInputUrls,
  saveSuggestionRecord,
} from "@/lib/product-suggestions";

export const runtime = "nodejs";

const MAX_FILES_PER_REQUEST = 300;
const MAX_URLS_PER_REQUEST = 200;
const BACKGROUND_SEARCH_WORKER_PATH =
  "/srv/nordexo-hub/scripts/product-suggestions-supplier-search-worker.mjs";
const BACKGROUND_TAXONOMY_WORKER_PATH =
  "/srv/nordexo-hub/scripts/product-suggestions-taxonomy-worker.mjs";
const DEFAULT_PUBLIC_BASE_URL = "https://hub.nordexo.se";
const URL_AI_CLEANUP_MAX_PER_REQUEST = 30;
const SEARCH_JOB_STALE_MS = 20 * 60 * 1000;
const SOURCE_JOB_STALE_MS = 20 * 60 * 1000;
const PAYLOAD_JOB_STALE_MS = 20 * 60 * 1000;
const TAXONOMY_JOB_STALE_MS = 3 * 60 * 1000;

type QueueRow = {
  user_id: string;
  provider: string;
  product_id: string;
  created_at: string;
};

type ProductionSpuRow = {
  product_id: string;
  spu: string | null;
  assigned_at: string | null;
};

type SuggestionReviewStatus = "new" | "unqualified";

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const hasCjk = (value: unknown) => /[\u3400-\u9fff]/.test(String(value || ""));

const parseIsoTimestampMs = (value: unknown) => {
  const text = asText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const isStatusStale = (value: unknown, staleMs: number) => {
  const when = parseIsoTimestampMs(value);
  if (when === null) return false;
  return Date.now() - when > staleMs;
};

const isImageFile = (file: File) => {
  const mime = asText(file.type).toLowerCase();
  const name = asText(file.name).toLowerCase();
  return mime.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|bmp|avif|heic|heif)$/i.test(name);
};

const isZipFile = (file: File) => {
  const mime = asText(file.type).toLowerCase();
  const name = asText(file.name).toLowerCase();
  return mime.includes("zip") || name.endsWith(".zip");
};

const getPublicBaseUrl = (request: Request) => {
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return null;
  return `${proto}://${host}`;
};

const makeAbsoluteIfRelative = (request: Request, value: string | null) => {
  const text = asText(value);
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (!text.startsWith("/")) return null;
  const base = getPublicBaseUrl(request);
  return base ? `${base}${text}` : text;
};

const toBool = (value: unknown, fallback = true) => {
  const text = asText(value).toLowerCase();
  if (!text) return fallback;
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
};

const normalizeSuggestionReviewStatus = (
  value: unknown
): SuggestionReviewStatus => (asText(value).toLowerCase() === "unqualified" ? "unqualified" : "new");

const spawnBackgroundSupplierSearchWorker = (
  request: Request,
  suggestionIds: string[]
) => {
  const ids = Array.from(
    new Set(suggestionIds.map((entry) => asText(entry)).filter(Boolean))
  );
  if (ids.length === 0) return false;

  const requestBaseUrl = getPublicBaseUrl(request);
  const publicBaseUrl =
    requestBaseUrl || process.env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL;

  try {
    const child = spawn(
      process.execPath,
      [
        BACKGROUND_SEARCH_WORKER_PATH,
        "--provider",
        PARTNER_SUGGESTION_PROVIDER,
        "--ids",
        ids.join(","),
      ],
      {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          PUBLIC_BASE_URL: publicBaseUrl,
        },
      }
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
};

const spawnBackgroundTaxonomyWorker = (suggestionIds: string[]) => {
  const ids = Array.from(
    new Set(suggestionIds.map((entry) => asText(entry)).filter(Boolean))
  );
  if (ids.length === 0) return false;

  try {
    const child = spawn(
      process.execPath,
      [BACKGROUND_TAXONOMY_WORKER_PATH, "--ids", ids.join(",")],
      {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
        },
      }
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
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

async function requireSignedIn() {
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

  return { ok: true as const, user, supabase };
}

async function requireAdmin() {
  const auth = await requireSignedIn();
  if (!auth.ok) {
    return auth;
  }

  const { supabase, user } = auth;

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

  return { ok: true as const, user, supabase };
}

const buildFallbackRecord = (
  id: string,
  createdAt: string,
  userId: string
): ProductSuggestionRecord => ({
  id,
  provider: PARTNER_SUGGESTION_PROVIDER,
  createdAt,
  createdBy: userId,
  sourceType: "image",
  sourceLabel: null,
  sourceUrl: null,
  crawlFinalUrl: null,
  title: null,
  description: null,
  mainImageUrl: null,
  galleryImageUrls: [],
  image: null,
  errors: ["Suggestion metadata file is missing."],
  searchJob: {
    status: "error",
    error: "Suggestion metadata file is missing.",
    finishedAt: createdAt,
    lastRunAt: createdAt,
  },
  sourceJob: {
    status: "error",
    stage: "done",
    queuedAt: null,
    startedAt: createdAt,
    finishedAt: createdAt,
    updatedAt: createdAt,
    error: "Suggestion metadata file is missing.",
  },
  googleTaxonomy: {
    status: "error",
    id: null,
    path: null,
    l1: null,
    l2: null,
    l3: null,
    confidence: null,
    sourceTitle: null,
    queuedAt: null,
    startedAt: createdAt,
    finishedAt: createdAt,
    updatedAt: createdAt,
    error: "Suggestion metadata file is missing.",
  },
  reviewStatus: "new",
});

const createImageSuggestion = async (
  params: {
    userId: string;
    sourceLabel: string | null;
    sourceUrl: string | null;
    title: string | null;
    description: string | null;
    galleryImageUrls?: string[];
    crawlFinalUrl?: string | null;
    buffer: Buffer;
  }
): Promise<ProductSuggestionRecord> => {
  const createdAt = new Date().toISOString();
  const id = createSuggestionId();
  const image = await normalizeImageBufferToPublicTemp(params.buffer, {
    maxWidth: 750,
    maxHeight: 750,
    quality: 90,
  });
  const hasSourceUrl = Boolean(asText(params.sourceUrl));
  const sourceUrl = hasSourceUrl ? asText(params.sourceUrl) : image.publicPath;

  const record: ProductSuggestionRecord = {
    id,
    provider: PARTNER_SUGGESTION_PROVIDER,
    createdAt,
    createdBy: params.userId,
    sourceType: hasSourceUrl ? "url" : "image",
    sourceLabel: params.sourceLabel,
    sourceUrl: sourceUrl || null,
    crawlFinalUrl: params.crawlFinalUrl || null,
    title: asText(params.title) || null,
    description: asText(params.description) || null,
    mainImageUrl: image.publicPath,
    galleryImageUrls: Array.isArray(params.galleryImageUrls)
      ? params.galleryImageUrls.map((entry) => asText(entry)).filter(Boolean)
      : [],
    image,
    externalData: buildExternalDataForImageSuggestion({
      createdAt,
      imageUrl: image.publicPath,
      errors: [],
    }),
    errors: [],
    searchJob: {
      status: "idle",
      error: null,
      lastRunAt: createdAt,
    },
    sourceJob: {
      status: "idle",
      stage: "done",
      queuedAt: null,
      startedAt: null,
      finishedAt: null,
      updatedAt: createdAt,
      error: null,
    },
    reviewStatus: "new",
  };

  const normalized = normalizeExternalDataForRecord(record);
  await saveSuggestionRecord(normalized);
  return normalized;
};

export async function GET(request: Request) {
  const auth = await requireSignedIn();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const { data: queueRows, error: queueError } = await adminClient
    .from("discovery_production_items")
    .select("user_id, provider, product_id, created_at")
    .eq("provider", PARTNER_SUGGESTION_PROVIDER)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (queueError) {
    return NextResponse.json({ error: queueError.message }, { status: 500 });
  }

  const rows = (queueRows ?? []) as QueueRow[];
  if (rows.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const ids = rows.map((row) => asText(row.product_id)).filter(Boolean);

  const [
    { data: searchRows, error: searchError },
    { data: selectionRows, error: selectionError },
    { data: productionStatusRows, error: productionStatusError },
    { data: productionSpuRows, error: productionSpuError },
  ] = await Promise.all([
    adminClient
      .from("discovery_production_supplier_searches")
      .select("product_id, fetched_at, offers, input, meta")
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
    adminClient
      .from("discovery_production_supplier_selection")
      .select("product_id, selected_offer_id, selected_detail_url, selected_offer, selected_at, updated_at")
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
    adminClient
      .from("discovery_production_status")
      .select(
        "product_id, status, updated_at, spu_assigned_at, production_started_at, production_done_at, last_file_name, last_job_id"
      )
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
    adminClient
      .from("discovery_production_item_spus")
      .select("product_id, spu, assigned_at")
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
  ]);

  if (searchError) {
    return NextResponse.json({ error: searchError.message }, { status: 500 });
  }
  if (selectionError) {
    return NextResponse.json({ error: selectionError.message }, { status: 500 });
  }
  if (productionStatusError) {
    return NextResponse.json({ error: productionStatusError.message }, { status: 500 });
  }
  if (productionSpuError) {
    return NextResponse.json({ error: productionSpuError.message }, { status: 500 });
  }

  const [{ data: marketRows }, { data: classRows }] = await Promise.all([
    adminClient
      .from("b2b_pricing_markets")
      .select("market, currency, fx_rate_cny, weight_threshold_g, packing_fee, markup_percent, markup_fixed"),
    adminClient
      .from("b2b_pricing_shipping_classes")
      .select("market, shipping_class, rate_low, rate_high, base_low, base_high, mult_low, mult_high"),
  ]);

  const markets = mapMarketConfigRows(marketRows ?? []);
  const shippingClasses = mapShippingClassRows(classRows ?? []);

  const searchById = new Map<string, Record<string, unknown>>();
  (searchRows ?? []).forEach((row) => {
    const rowRecord =
      row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    const id = asText(rowRecord?.product_id);
    if (!id) return;
    searchById.set(id, rowRecord || {});
  });

  const selectionById = new Map<string, Record<string, unknown>>();
  (selectionRows ?? []).forEach((row) => {
    const rowRecord =
      row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    const id = asText(rowRecord?.product_id);
    if (!id) return;
    selectionById.set(id, rowRecord || {});
  });

  const productionStatusById = new Map<string, Record<string, unknown>>();
  (productionStatusRows ?? []).forEach((row) => {
    const rowRecord =
      row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    const id = asText(rowRecord?.product_id);
    if (!id) return;
    productionStatusById.set(id, rowRecord || {});
  });

  const productionSpuById = new Map<string, ProductionSpuRow>();
  (productionSpuRows as ProductionSpuRow[] | null | undefined)?.forEach((row) => {
    const id = asText(row?.product_id);
    const spu = asText(row?.spu);
    if (!id || !spu) return;
    const existing = productionSpuById.get(id);
    const existingAt = Date.parse(asText(existing?.assigned_at || "")) || 0;
    const nextAt = Date.parse(asText(row?.assigned_at || "")) || 0;
    if (!existing || nextAt >= existingAt) {
      productionSpuById.set(id, {
        product_id: id,
        spu,
        assigned_at: asText(row?.assigned_at) || null,
      });
    }
  });

  const taxonomyQueueIds = new Set<string>();
  const items = await Promise.all(
    rows.map(async (row) => {
      const id = asText(row.product_id);
      const createdAt = asText(row.created_at) || new Date().toISOString();
      const loadedSuggestion =
        (await loadSuggestionRecord(id)) || buildFallbackRecord(id, createdAt, asText(row.user_id));
      let suggestion = normalizeExternalDataForRecord(loadedSuggestion);
      let shouldSaveSuggestion =
        JSON.stringify(loadedSuggestion) !== JSON.stringify(suggestion);
      const normalizedReviewStatus = normalizeSuggestionReviewStatus(
        suggestion.reviewStatus
      );
      if (suggestion.reviewStatus !== normalizedReviewStatus) {
        suggestion = {
          ...suggestion,
          reviewStatus: normalizedReviewStatus,
        };
        shouldSaveSuggestion = true;
      }

      const nowIso = new Date().toISOString();
      const searchJobStatus = asText(suggestion.searchJob?.status).toLowerCase();
      if (searchJobStatus === "queued" || searchJobStatus === "running") {
        const searchStartedAt = firstString(
          suggestion.searchJob?.startedAt,
          suggestion.searchJob?.queuedAt,
          suggestion.searchJob?.lastRunAt,
          suggestion.createdAt,
          createdAt
        );
        if (isStatusStale(searchStartedAt, SEARCH_JOB_STALE_MS)) {
          suggestion = {
            ...suggestion,
            searchJob: {
              ...(suggestion.searchJob || {}),
              status: "error",
              startedAt:
                firstString(
                  suggestion.searchJob?.startedAt,
                  suggestion.searchJob?.queuedAt
                ) || searchStartedAt || nowIso,
              finishedAt: nowIso,
              lastRunAt: nowIso,
              error:
                asText(suggestion.searchJob?.error) ||
                "Supplier search timed out. Please retry.",
            },
          };
          shouldSaveSuggestion = true;
        }
      }

      const sourceJobStatus = asText(suggestion.sourceJob?.status).toLowerCase();
      if (sourceJobStatus === "queued" || sourceJobStatus === "running") {
        const sourceStartedAt = firstString(
          suggestion.sourceJob?.startedAt,
          suggestion.sourceJob?.queuedAt,
          suggestion.sourceJob?.updatedAt,
          suggestion.createdAt,
          createdAt
        );
        if (isStatusStale(sourceStartedAt, SOURCE_JOB_STALE_MS)) {
          suggestion = {
            ...suggestion,
            sourceJob: {
              ...(suggestion.sourceJob || {}),
              status: "error",
              stage: "done",
              startedAt:
                firstString(
                  suggestion.sourceJob?.startedAt,
                  suggestion.sourceJob?.queuedAt
                ) || sourceStartedAt || nowIso,
              finishedAt: nowIso,
              updatedAt: nowIso,
              error:
                asText(suggestion.sourceJob?.error) ||
                "Source crawl timed out. Please retry.",
            },
          };
          shouldSaveSuggestion = true;
        }
      }

      const taxonomyJobStatus = asText(suggestion.googleTaxonomy?.status).toLowerCase();
      if (taxonomyJobStatus === "queued" || taxonomyJobStatus === "running") {
        const taxonomyStartedAt = firstString(
          suggestion.googleTaxonomy?.startedAt,
          suggestion.googleTaxonomy?.queuedAt,
          suggestion.googleTaxonomy?.updatedAt,
          suggestion.createdAt,
          createdAt
        );
        if (isStatusStale(taxonomyStartedAt, TAXONOMY_JOB_STALE_MS)) {
          suggestion = {
            ...suggestion,
            googleTaxonomy: {
              ...(suggestion.googleTaxonomy || {}),
              status: "error",
              startedAt:
                firstString(
                  suggestion.googleTaxonomy?.startedAt,
                  suggestion.googleTaxonomy?.queuedAt
                ) || taxonomyStartedAt || nowIso,
              finishedAt: nowIso,
              updatedAt: nowIso,
              error:
                asText(suggestion.googleTaxonomy?.error) ||
                "Google taxonomy fetch timed out. Please retry.",
            },
          };
          shouldSaveSuggestion = true;
        }
      }

      if (shouldSaveSuggestion) {
        suggestion = normalizeExternalDataForRecord(suggestion);
        try {
          await saveSuggestionRecord(suggestion);
        } catch {
          // keep response flowing even if local metadata write fails
        }
      }
      const search = searchById.get(id);
      const selection = selectionById.get(id);
      const productionStatus = productionStatusById.get(id);
      const productionSpu = productionSpuById.get(id);
      const offers = Array.isArray(search?.offers) ? (search?.offers as unknown[]) : [];
      let normalizedSelection = selection;
      let selectedOffer =
        selection?.selected_offer && typeof selection.selected_offer === "object"
          ? (selection.selected_offer as Record<string, unknown>)
          : null;
      const payloadStatus = asText(selectedOffer?._production_payload_status).toLowerCase();
      if (
        normalizedSelection &&
        (payloadStatus === "queued" || payloadStatus === "fetching")
      ) {
        const payloadUpdatedAt = firstString(
          selectedOffer?._production_payload_updated_at,
          normalizedSelection.updated_at,
          normalizedSelection.selected_at
        );
        if (isStatusStale(payloadUpdatedAt, PAYLOAD_JOB_STALE_MS)) {
          const timedOutAt = new Date().toISOString();
          const timedOutError =
            asText(selectedOffer?._production_payload_error) ||
            "1688 payload fetch timed out. Please retry.";
          const patchedOffer: Record<string, unknown> = {
            ...(selectedOffer || {}),
            _production_payload_status: "failed",
            _production_payload_error: timedOutError,
            _production_payload_updated_at: timedOutAt,
          };

          selectedOffer = patchedOffer;
          normalizedSelection = {
            ...(normalizedSelection as Record<string, unknown>),
            selected_offer: patchedOffer,
            updated_at: timedOutAt,
          };

          try {
            await adminClient
              .from("discovery_production_supplier_selection")
              .update({
                selected_offer: patchedOffer,
                updated_at: timedOutAt,
              })
              .eq("provider", PARTNER_SUGGESTION_PROVIDER)
              .eq("product_id", id);
          } catch {
            // keep response flowing even if DB status patch fails
          }
        }
      }
      const firstOfferEnglish = offers
        .map((offer) =>
          offer && typeof offer === "object"
            ? asText((offer as Record<string, unknown>).subject_en)
            : ""
        )
        .find(Boolean);
      const titleFallbackFromSupplier = firstString(
        selectedOffer?.subject_en,
        firstOfferEnglish
      );
      if ((!suggestion.title || hasCjk(suggestion.title)) && titleFallbackFromSupplier) {
        suggestion = normalizeExternalDataForRecord({
          ...suggestion,
          title: titleFallbackFromSupplier,
        });
        try {
          await saveSuggestionRecord(suggestion);
        } catch {
          // keep response flowing even if local metadata write fails
        }
      }

      const taxonomyTitleCandidate = firstString(
        suggestion.title,
        suggestion.externalData?.title,
        suggestion.externalData?.rawTitle
      );
      const taxonomyStatus = asText(suggestion.googleTaxonomy?.status).toLowerCase();
      const taxonomySourceTitle = asText(suggestion.googleTaxonomy?.sourceTitle);
      const taxonomyPath = asText(suggestion.googleTaxonomy?.path);
      const taxonomyNeedsQueue =
        Boolean(taxonomyTitleCandidate) &&
        taxonomyStatus !== "running" &&
        (taxonomyStatus === "idle" ||
          !taxonomyPath ||
          (taxonomyStatus === "done" && taxonomySourceTitle !== taxonomyTitleCandidate));
      if (taxonomyNeedsQueue) {
        suggestion = normalizeExternalDataForRecord({
          ...suggestion,
          googleTaxonomy: {
            ...(suggestion.googleTaxonomy || {}),
            status: "queued",
            sourceTitle: taxonomyTitleCandidate,
            queuedAt: nowIso,
            startedAt: null,
            finishedAt: null,
            updatedAt: nowIso,
            error: null,
          },
        });
        try {
          await saveSuggestionRecord(suggestion);
        } catch {
          // keep response flowing even if local metadata write fails
        }
      }
      if (
        asText(suggestion.googleTaxonomy?.status).toLowerCase() === "queued" &&
        Boolean(
          firstString(
            suggestion.googleTaxonomy?.sourceTitle,
            suggestion.title,
            suggestion.externalData?.title,
            suggestion.externalData?.rawTitle
          )
        )
      ) {
        taxonomyQueueIds.add(id);
      }

      const variantMetrics = await deriveVariantSelectionMetrics(selectedOffer);
      const pricingBase =
        variantMetrics && markets.length > 0 && shippingClasses.length > 0
          ? computeB2BPrices(
              variantMetrics.purchasePriceCny,
              variantMetrics.weightGrams,
              variantMetrics.shippingClass,
              markets,
              shippingClasses
            )
          : [];
      let pricing: Array<{
        market: string;
        currency: string;
        b2bPrice: number;
        shippingCost: number;
        stockCost: number;
        totalCost: number;
        b2bPriceMin?: number;
        b2bPriceMax?: number;
      }> = pricingBase.map((entry) => ({ ...entry }));

      if (variantMetrics && markets.length > 0 && shippingClasses.length > 0) {
        const metricPairs =
          Array.isArray(variantMetrics.selectedMetrics) && variantMetrics.selectedMetrics.length > 0
            ? variantMetrics.selectedMetrics
            : [
                {
                  priceCny: variantMetrics.priceMinCny,
                  weightGrams: variantMetrics.weightMinGrams,
                },
                {
                  priceCny: variantMetrics.priceMaxCny,
                  weightGrams: variantMetrics.weightMaxGrams,
                },
              ];

        const spanByCurrency = new Map<
          string,
          { market: string; currency: string; min: number; max: number }
        >();

        for (const pair of metricPairs) {
          const pairPrice = Number(pair?.priceCny);
          const pairWeight = Number(pair?.weightGrams);
          if (!Number.isFinite(pairPrice) || !Number.isFinite(pairWeight)) continue;
          if (pairPrice <= 0 || pairWeight <= 0) continue;

          const pairPricing = computeB2BPrices(
            pairPrice,
            pairWeight,
            variantMetrics.shippingClass,
            markets,
            shippingClasses
          );

          for (const entry of pairPricing) {
            const currency = asText(entry.currency || entry.market).toUpperCase();
            const market = asText(entry.market).toUpperCase() || currency;
            const key = currency || market;
            if (!key) continue;
            const amount = Number(entry.b2bPrice);
            if (!Number.isFinite(amount)) continue;

            const existing = spanByCurrency.get(key);
            if (!existing) {
              spanByCurrency.set(key, {
                market,
                currency: currency || market,
                min: amount,
                max: amount,
              });
            } else {
              existing.min = Math.min(existing.min, amount);
              existing.max = Math.max(existing.max, amount);
            }
          }
        }

        if (spanByCurrency.size > 0) {
          const baseByCurrency = new Map(
            pricingBase.map((entry) => [
              asText(entry.currency || entry.market).toUpperCase(),
              entry,
            ])
          );

          pricing = Array.from(spanByCurrency.values()).map((span) => {
            const key = asText(span.currency || span.market).toUpperCase();
            const base = baseByCurrency.get(key);
            const basePrice = Number(base?.b2bPrice);
            const fallback = Number.isFinite(basePrice) ? basePrice : span.min;
            const shippingCost = Number(base?.shippingCost);
            const stockCost = Number(base?.stockCost);
            const totalCost = Number(base?.totalCost);

            return {
              market: span.market || asText(base?.market) || key,
              currency: span.currency || asText(base?.currency) || key || "SEK",
              b2bPrice: fallback,
              shippingCost: Number.isFinite(shippingCost) ? shippingCost : 0,
              stockCost: Number.isFinite(stockCost) ? stockCost : 0,
              totalCost: Number.isFinite(totalCost) ? totalCost : 0,
              b2bPriceMin: span.min,
              b2bPriceMax: span.max,
            };
          });
        }
      }
      const normalizedMainImageUrl =
        makeAbsoluteIfRelative(request, suggestion.mainImageUrl) || suggestion.mainImageUrl;
      const normalizedSourceUrl =
        makeAbsoluteIfRelative(request, suggestion.sourceUrl) ||
        suggestion.sourceUrl ||
        normalizedMainImageUrl ||
        null;
      const normalizedExternalData = suggestion.externalData
        ? {
            ...suggestion.externalData,
            inputUrl:
              makeAbsoluteIfRelative(request, suggestion.externalData.inputUrl) ||
              suggestion.externalData.inputUrl,
            finalUrl:
              makeAbsoluteIfRelative(request, suggestion.externalData.finalUrl) ||
              suggestion.externalData.finalUrl,
            rawMainImageUrl:
              makeAbsoluteIfRelative(request, suggestion.externalData.rawMainImageUrl) ||
              suggestion.externalData.rawMainImageUrl,
            mainImageUrl:
              makeAbsoluteIfRelative(request, suggestion.externalData.mainImageUrl) ||
              suggestion.externalData.mainImageUrl,
            galleryImageUrls: Array.isArray(suggestion.externalData.galleryImageUrls)
              ? suggestion.externalData.galleryImageUrls.map(
                  (entry) => makeAbsoluteIfRelative(request, entry) || entry
                )
              : [],
            status: suggestion.externalData.status
              ? {
                  ...suggestion.externalData.status,
                  images: {
                    ...suggestion.externalData.status.images,
                    mainImageUrl:
                      makeAbsoluteIfRelative(
                        request,
                        suggestion.externalData.status.images?.mainImageUrl || null
                      ) || suggestion.externalData.status.images?.mainImageUrl || null,
                  },
                }
              : suggestion.externalData.status,
          }
        : null;

      return {
        ...suggestion,
        reviewStatus: normalizedReviewStatus,
        createdAt,
        sourceUrl: normalizedSourceUrl,
        mainImageUrl: normalizedMainImageUrl,
        externalData: normalizedExternalData,
        search: {
          fetchedAt: asText(search?.fetched_at) || null,
          offerCount: offers.length,
          offers,
          input: search?.input ?? null,
          meta: search?.meta ?? null,
        },
        selection: normalizedSelection
          ? {
              selected_offer_id: firstString(normalizedSelection.selected_offer_id) || null,
              selected_detail_url:
                firstString(normalizedSelection.selected_detail_url) ||
                firstString(selectedOffer?.detailUrl, selectedOffer?.detail_url) ||
                null,
              selected_at: firstString(normalizedSelection.selected_at) || null,
              updated_at: firstString(normalizedSelection.updated_at) || null,
              selected_offer: selectedOffer,
              payload_status: firstString(selectedOffer?._production_payload_status) || null,
              payload_error: firstString(selectedOffer?._production_payload_error) || null,
              payload_file_name: firstString(selectedOffer?._production_payload_file_name) || null,
              payload_file_path: firstString(selectedOffer?._production_payload_file_path) || null,
            }
          : null,
        variantMetrics,
        pricing,
        productionStatus: productionStatus
          ? {
              status: firstString(productionStatus.status) || null,
              updated_at: firstString(productionStatus.updated_at) || null,
              spu_assigned_at: firstString(productionStatus.spu_assigned_at) || null,
              production_started_at:
                firstString(productionStatus.production_started_at) || null,
              production_done_at:
                firstString(productionStatus.production_done_at) || null,
              last_file_name: firstString(productionStatus.last_file_name) || null,
              last_job_id: firstString(productionStatus.last_job_id) || null,
            }
          : null,
        production_assigned_spu: productionSpu?.spu || null,
      };
    })
  );

  if (taxonomyQueueIds.size > 0) {
    spawnBackgroundTaxonomyWorker(Array.from(taxonomyQueueIds));
  }

  return NextResponse.json({ items });
}

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

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid form payload." }, { status: 400 });
  }

  const rawUrls = asText(formData.get("urls"));
  const queueSearch = toBool(formData.get("queue_search"), true);
  const parsedUrls = parseInputUrls(rawUrls).slice(0, MAX_URLS_PER_REQUEST);

  const fileInputs = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File)
    .slice(0, MAX_FILES_PER_REQUEST);

  if (fileInputs.length === 0 && parsedUrls.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one image, zip, or URL." },
      { status: 400 }
    );
  }

  const created: ProductSuggestionRecord[] = [];
  const errors: string[] = [];

  for (const file of fileInputs) {
    if (file.size <= 0) continue;

    try {
      if (isZipFile(file)) {
        const zipBuffer = Buffer.from(await file.arrayBuffer());
        const extracted = await extractImagesFromZipBuffer(zipBuffer);
        for (const entry of extracted.slice(0, MAX_FILES_PER_REQUEST)) {
          try {
            const record = await createImageSuggestion({
              userId: auth.user.id,
              sourceLabel: `${file.name}:${entry.fileName}`,
              sourceUrl: null,
              title: null,
              description: null,
              buffer: entry.buffer,
            });
            created.push(record);
          } catch (error) {
            errors.push(
              `Failed to process ${entry.fileName}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
        if (extracted.length === 0) {
          errors.push(`Zip ${file.name} did not contain any readable image files.`);
        }
        continue;
      }

      if (!isImageFile(file)) {
        errors.push(`Unsupported file skipped: ${file.name}`);
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const record = await createImageSuggestion({
        userId: auth.user.id,
        sourceLabel: file.name,
        sourceUrl: null,
        title: null,
        description: null,
        buffer,
      });
      created.push(record);
    } catch (error) {
      errors.push(
        `Failed to process ${file.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  for (let urlIndex = 0; urlIndex < parsedUrls.length; urlIndex += 1) {
    const url = parsedUrls[urlIndex];
    const crawl = await crawlUrlForProduct(url);
    const crawlErrors = [...crawl.errors];

    let mainImagePath: string | null = null;
    let normalizedImage: ProductSuggestionRecord["image"] = null;
    let preferredImageUrl = crawl.mainImageUrl || (crawl.imageUrls.length > 0 ? crawl.imageUrls[0] : null);

    if (preferredImageUrl) {
      try {
        const fetched = await fetchAndNormalizeImage(preferredImageUrl);
        normalizedImage = fetched.image;
        mainImagePath = fetched.image.publicPath;
        preferredImageUrl = fetched.finalUrl;
      } catch (error) {
        crawlErrors.push(
          `Image download failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      crawlErrors.push("No product image could be identified from URL.");
    }

    const runAiCleanup = urlIndex < URL_AI_CLEANUP_MAX_PER_REQUEST;
    if (!runAiCleanup) {
      crawlErrors.push(
        "AI cleanup skipped for this URL because the request batch is large."
      );
    }

    const createdAt = new Date().toISOString();
    const externalData = await buildExternalDataForUrlSuggestion({
      inputUrl: url,
      finalUrl: crawl.finalUrl,
      title: asText(crawl.title),
      description: asText(crawl.description),
      readablePageText: asText(crawl.readableText),
      mainImageUrl: preferredImageUrl || crawl.mainImageUrl || null,
      galleryImageUrls: crawl.imageUrls,
      errors: crawlErrors,
      createdAt,
      runAiCleanup,
    });

    const record: ProductSuggestionRecord = normalizeExternalDataForRecord({
      id: createSuggestionId(),
      provider: PARTNER_SUGGESTION_PROVIDER,
      createdAt,
      createdBy: auth.user.id,
      sourceType: "url",
      sourceLabel: url,
      sourceUrl: url,
      crawlFinalUrl: crawl.finalUrl,
      title: externalData.title || asText(crawl.title) || null,
      description: externalData.description || asText(crawl.description) || null,
      mainImageUrl: mainImagePath || preferredImageUrl || crawl.mainImageUrl || null,
      galleryImageUrls:
        externalData.galleryImageUrls.length > 0
          ? externalData.galleryImageUrls
          : crawl.imageUrls,
      image: normalizedImage,
      externalData,
      errors: Array.from(new Set([...crawlErrors, ...(externalData.errors || [])])),
      searchJob: {
        status: "idle",
        error: null,
        lastRunAt: createdAt,
      },
      sourceJob: {
        status: "done",
        stage: "done",
        queuedAt: null,
        startedAt: createdAt,
        finishedAt: createdAt,
        updatedAt: createdAt,
        error: null,
      },
      reviewStatus: "new",
    });

    try {
      await saveSuggestionRecord(record);
      created.push(record);
    } catch (error) {
      errors.push(
        `Failed to save URL suggestion ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (created.length === 0) {
    return NextResponse.json({ error: "No suggestions were created.", details: errors }, { status: 400 });
  }

  const queueRows = created.map((record) => ({
    user_id: auth.user.id,
    provider: PARTNER_SUGGESTION_PROVIDER,
    product_id: record.id,
    created_at: record.createdAt,
  }));

  const { error: queueError } = await adminClient
    .from("discovery_production_items")
    .upsert(queueRows, { onConflict: "user_id,provider,product_id" });

  if (queueError) {
    return NextResponse.json({ error: queueError.message }, { status: 500 });
  }

  let queuedRecords = created;
  let queueWorkerStarted = false;
  if (queueSearch) {
    const queuedAt = new Date().toISOString();
    queuedRecords = created.map((record) => ({
      ...record,
      searchJob: {
        status: "queued" as const,
        queuedAt,
        startedAt: null,
        finishedAt: null,
        error: null,
        lastRunAt: queuedAt,
      },
    }));

    await Promise.all(
      queuedRecords.map((record) => saveSuggestionRecord(record))
    );

    queueWorkerStarted = spawnBackgroundSupplierSearchWorker(
      request,
      queuedRecords.map((record) => record.id)
    );

    if (!queueWorkerStarted) {
      errors.push("Background supplier search worker failed to start.");
      const failedAt = new Date().toISOString();
      queuedRecords = queuedRecords.map((record) => ({
        ...record,
        searchJob: {
          status: "error" as const,
          queuedAt: record.searchJob?.queuedAt || failedAt,
          startedAt: failedAt,
          finishedAt: failedAt,
          error: "Background supplier search worker failed to start.",
          lastRunAt: failedAt,
        },
      }));
      await Promise.all(
        queuedRecords.map((record) => saveSuggestionRecord(record))
      );
    }
  }

  const taxonomyQueueIds = queuedRecords
    .filter((record) => {
      const status = asText(record.googleTaxonomy?.status).toLowerCase();
      const title = firstString(
        record.googleTaxonomy?.sourceTitle,
        record.title,
        record.externalData?.title,
        record.externalData?.rawTitle
      );
      return status === "queued" && Boolean(title);
    })
    .map((record) => asText(record.id))
    .filter(Boolean);
  let taxonomyWorkerStarted = false;
  if (taxonomyQueueIds.length > 0) {
    taxonomyWorkerStarted = spawnBackgroundTaxonomyWorker(taxonomyQueueIds);
    if (!taxonomyWorkerStarted) {
      errors.push("Background Google taxonomy worker failed to start.");
    }
  }

  const responseItems = queuedRecords.map((record) => {
    const normalized = normalizeExternalDataForRecord(record);
    const normalizedMainImageUrl =
      makeAbsoluteIfRelative(request, normalized.mainImageUrl) || normalized.mainImageUrl;
    const normalizedSourceUrl =
      makeAbsoluteIfRelative(request, normalized.sourceUrl) ||
      normalized.sourceUrl ||
      normalizedMainImageUrl;

    const normalizedExternalData = normalized.externalData
      ? {
          ...normalized.externalData,
          inputUrl:
            makeAbsoluteIfRelative(request, normalized.externalData.inputUrl) ||
            normalized.externalData.inputUrl,
          finalUrl:
            makeAbsoluteIfRelative(request, normalized.externalData.finalUrl) ||
            normalized.externalData.finalUrl,
          rawMainImageUrl:
            makeAbsoluteIfRelative(request, normalized.externalData.rawMainImageUrl) ||
            normalized.externalData.rawMainImageUrl,
          mainImageUrl:
            makeAbsoluteIfRelative(request, normalized.externalData.mainImageUrl) ||
            normalized.externalData.mainImageUrl,
          galleryImageUrls: Array.isArray(normalized.externalData.galleryImageUrls)
            ? normalized.externalData.galleryImageUrls.map(
                (entry) => makeAbsoluteIfRelative(request, entry) || entry
              )
            : [],
          status: normalized.externalData.status
            ? {
                ...normalized.externalData.status,
                images: {
                  ...normalized.externalData.status.images,
                  mainImageUrl:
                    makeAbsoluteIfRelative(
                      request,
                      normalized.externalData.status.images?.mainImageUrl || null
                    ) || normalized.externalData.status.images?.mainImageUrl || null,
                },
              }
            : normalized.externalData.status,
        }
      : null;

    return {
      ...normalized,
      mainImageUrl: normalizedMainImageUrl,
      sourceUrl: normalizedSourceUrl,
      externalData: normalizedExternalData,
    };
  });

  return NextResponse.json({
    ok: true,
    provider: PARTNER_SUGGESTION_PROVIDER,
    createdCount: created.length,
    items: responseItems,
    queueSearch,
    queueWorkerStarted,
    taxonomyWorkerStarted,
    errors,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const payload = await request.json().catch(() => null);
  const ids: string[] = Array.from(
    new Set(
      (Array.isArray(payload?.ids) ? payload.ids : [])
        .map((entry: unknown) => asText(entry))
        .filter((entry: string) => /^[a-z0-9][a-z0-9_-]{5,80}$/i.test(entry))
    )
  );

  if (ids.length === 0) {
    return NextResponse.json({ error: "No valid suggestion IDs provided." }, { status: 400 });
  }

  const statusRaw = asText(payload?.status).toLowerCase();
  if (statusRaw !== "new" && statusRaw !== "unqualified") {
    return NextResponse.json(
      { error: "Status must be either 'new' or 'unqualified'." },
      { status: 400 }
    );
  }
  const nextStatus = statusRaw as SuggestionReviewStatus;

  let updateResults: Array<{ id: string; updated: boolean }>;
  try {
    updateResults = await Promise.all(
      ids.map(async (id) => {
        const current = await loadSuggestionRecord(id);
        if (!current) {
          return { id, updated: false as const };
        }
        const nextRecord = normalizeExternalDataForRecord({
          ...current,
          reviewStatus: nextStatus,
        });
        await saveSuggestionRecord(nextRecord);
        return { id, updated: true as const };
      })
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && asText(error.message)
            ? error.message
            : "Failed to update suggestion status.",
      },
      { status: 500 }
    );
  }

  const updatedIds = updateResults.filter((entry) => entry.updated).map((entry) => entry.id);
  const missingIds = updateResults.filter((entry) => !entry.updated).map((entry) => entry.id);

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    updatedCount: updatedIds.length,
    updatedIds,
    missingIds,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const payload = await request.json().catch(() => null);
  const ids: string[] = Array.from(
    new Set(
      (Array.isArray(payload?.ids) ? payload.ids : [])
        .map((entry: unknown) => asText(entry))
        .filter((entry: string) => /^[a-z0-9][a-z0-9_-]{5,80}$/i.test(entry))
    )
  );

  if (ids.length === 0) {
    return NextResponse.json({ error: "No valid suggestion IDs provided." }, { status: 400 });
  }

  const [
    queueDeleteResult,
    searchDeleteResult,
    selectionDeleteResult,
  ] = await Promise.all([
    adminClient
      .from("discovery_production_items")
      .delete()
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
    adminClient
      .from("discovery_production_supplier_searches")
      .delete()
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
    adminClient
      .from("discovery_production_supplier_selection")
      .delete()
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
  ]);

  const dbError =
    queueDeleteResult.error ||
    searchDeleteResult.error ||
    selectionDeleteResult.error;
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await Promise.all(ids.map((id) => deleteSuggestionRecord(id)));

  return NextResponse.json({
    ok: true,
    deletedCount: ids.length,
    ids,
  });
}
