import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const TOOL_PATH = "/srv/node-tools/1688-image-search/index.js";
const SUPPLIER_PAYLOAD_WORKER_PATH =
  "/srv/nordexo-hub/scripts/production-supplier-fetch-worker.mjs";
const PUBLIC_TEMP_DIR = "/srv/incoming-scripts/uploads/public-temp-images";
const PUBLIC_TEMP_PERSIST_DAYS = 180;
const TEMP_IMAGE_ID_RE = /\/api\/public\/temp-images\/([a-f0-9]{32})/i;

type Offer = {
  rank?: number;
  offerId?: string | number | null;
  detailUrl?: string | null;
  imageUrl?: string | null;
  subject?: string | null;
  sellerName?: string | null;
  saleAmount?: string | number | null;
  [key: string]: unknown;
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

const extendTempImageExpiryBestEffort = async (id: string, days: number) => {
  const safe = String(id || "").trim();
  if (!/^[a-f0-9]{32}$/i.test(safe)) return;
  const metaPath = path.join(PUBLIC_TEMP_DIR, `${safe}.json`);
  if (!fs.existsSync(metaPath)) return;

  let meta: any = null;
  try {
    meta = JSON.parse(await fsp.readFile(metaPath, "utf8"));
  } catch {
    return;
  }

  const nextExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const updated = { ...(meta && typeof meta === "object" ? meta : {}), expiresAt: nextExpiresAt };
  try {
    await fsp.writeFile(metaPath, JSON.stringify(updated, null, 2), "utf8");
  } catch {
    // ignore
  }
};

const persistTempImageUrlsBestEffort = async (input: unknown) => {
  if (!input || typeof input !== "object") return;
  const maybeUrls = [(input as any).picUrl, (input as any).usedPicUrl];
  for (const entry of maybeUrls) {
    const url = typeof entry === "string" ? entry.trim() : "";
    if (!url) continue;
    const match = url.match(TEMP_IMAGE_ID_RE);
    const id = match?.[1] ? match[1] : null;
    if (!id) continue;
    await extendTempImageExpiryBestEffort(id, PUBLIC_TEMP_PERSIST_DAYS);
  }
};

const getPublicBaseUrl = (request: Request) => {
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return null;
  return `${proto}://${host}`;
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const normalizePublicTempImagePath = (urlText: string) => {
  const raw = String(urlText || "").trim();
  if (!raw) return raw;
  const match = raw.match(/^(https?:\/\/[^/]+)?(\/api\/public\/temp-images\/([a-f0-9]{32}))(?:\.(jpg|jpeg|png|webp))?(\?.*)?$/i);
  if (!match) return raw;
  const origin = match[1] || "";
  const pathNoExt = match[2];
  const id = match[3];
  const query = match[5] || "";
  if (!id) return raw;
  return `${origin}${pathNoExt}.jpg${query}`;
};

const normalizeSupplierImageUrl = (
  request: Request,
  value: string | null
): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isHttpUrl(trimmed)) return normalizePublicTempImagePath(trimmed);
  if (trimmed.startsWith("/")) {
    const base = getPublicBaseUrl(request);
    return base ? normalizePublicTempImagePath(`${base}${trimmed}`) : null;
  }
  return null;
};

const isImageFetchError = (error: string) => {
  const msg = String(error || "").toLowerCase();
  return (
    msg.includes("handle image error") ||
    msg.includes("image_fetch_error") ||
    msg.includes("image fetch error")
  );
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

const toUniqueImageCandidates = (
  request: Request,
  ...values: Array<string | null | undefined>
) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeSupplierImageUrl(request, value ?? null);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
};

const withPayloadFetchingState = (offer: Offer, nowIso: string): Offer => {
  const base = offer && typeof offer === "object" ? offer : ({} as Offer);
  return {
    ...(base as any),
    _production_payload_status: "fetching",
    _production_payload_source: "auto",
    _production_payload_error: null,
    _production_payload_file_name: null,
    _production_payload_file_path: null,
    _production_payload_updated_at: nowIso,
    _production_payload_saved_at: null,
  } as Offer;
};

const spawnSupplierPayloadWorkerBestEffort = (
  provider: string,
  productId: string
) => {
  try {
    const child = spawn(
      process.execPath,
      [
        SUPPLIER_PAYLOAD_WORKER_PATH,
        "--provider",
        provider,
        "--product-id",
        productId,
      ],
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

const toOfferId = (offer: Offer) => {
  const raw = offer?.offerId;
  const text = raw === null || raw === undefined ? "" : String(raw).trim();
  return text || null;
};

const canonical1688OfferUrl = (offer: Offer) => {
  const id = toOfferId(offer);
  if (id && /^\d{6,}$/.test(id)) {
    return `https://detail.1688.com/offer/${id}.html`;
  }
  const raw = typeof offer?.detailUrl === "string" ? offer.detailUrl.trim() : "";
  if (!raw) return null;
  const match = raw.match(/(?:detail\.1688\.com\/offer\/|\/offer\/)(\d{6,})\.html/i);
  if (match?.[1]) return `https://detail.1688.com/offer/${match[1]}.html`;
  return raw || null;
};

const extractJsonFromText = (text: string) => {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const translateOffersBestEffort = async (offers: Offer[]) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return offers;

  const subjectsToTranslate: string[] = [];
  const seen = new Set<string>();
  for (const offer of offers) {
    const subject = typeof offer?.subject === "string" ? offer.subject.trim() : "";
    const existingEn =
      typeof (offer as any)?.subject_en === "string" ? String((offer as any).subject_en).trim() : "";
    if (!subject || existingEn) continue;
    if (seen.has(subject)) continue;
    seen.add(subject);
    subjectsToTranslate.push(subject);
  }

  if (subjectsToTranslate.length === 0) return offers;

  const configured = [
    process.env.SUPPLIER_TRANSLATE_MODEL,
    process.env.OPENAI_EDIT_MODEL,
    "gpt-5-mini",
    "gpt-4o-mini",
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const modelCandidates = Array.from(new Set(configured));
  const limitedSubjects = subjectsToTranslate.slice(0, 15);

  const prompt = [
    "Translate this title to English, maximum 80 characters.",
    "Return JSON only.",
    'Return format: { \"items\": [ { \"subject\": \"...\", \"english_title\": \"...\" } ] }',
    "",
    "Titles to translate:",
    ...limitedSubjects.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");

  let parsed: any = null;
  for (const model of modelCandidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const result = await response.json().catch(() => null);
      const content = result?.choices?.[0]?.message?.content || "";
      parsed = extractJsonFromText(String(content));
      if (parsed) break;
    } catch {
      // try next model
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!parsed) return offers;
  const items = Array.isArray((parsed as any)?.items) ? (parsed as any).items : [];
  const map = new Map<string, string>();

  items.forEach((row: any, idx: number) => {
    const subject =
      typeof row?.subject === "string"
        ? row.subject.trim()
        : typeof limitedSubjects[idx] === "string"
          ? limitedSubjects[idx].trim()
          : "";
    const englishCandidate =
      (typeof row?.english_title === "string" && row.english_title.trim()) ||
      (typeof row?.englishTitle === "string" && row.englishTitle.trim()) ||
      (typeof row?.title_en === "string" && row.title_en.trim()) ||
      (typeof row?.translation === "string" && row.translation.trim()) ||
      (typeof row?.english === "string" && row.english.trim()) ||
      "";
    const english = typeof englishCandidate === "string" ? englishCandidate.trim() : "";
    if (!subject || !english) return;
    map.set(subject, english.slice(0, 80));
  });

  if (map.size === 0) return offers;

  return offers.map((offer) => {
    const subject = typeof offer?.subject === "string" ? offer.subject.trim() : "";
    if (!subject) return offer;
    const existingEn =
      typeof (offer as any)?.subject_en === "string" ? String((offer as any).subject_en).trim() : "";
    if (existingEn) return offer;
    const translated = map.get(subject);
    return translated ? ({ ...(offer as any), subject_en: translated } as Offer) : offer;
  });
};

const toDetailUrl = (offer: Offer) => canonical1688OfferUrl(offer);

const findOffer = (offers: Offer[], offerId: string, detailUrl?: string | null) => {
  const normalizedId = offerId.trim();
  if (normalizedId) {
    const match = offers.find((offer) => toOfferId(offer) === normalizedId);
    if (match) return match;
  }
  const normalizedUrl = (detailUrl ?? "").trim();
  if (normalizedUrl) {
    return offers.find((offer) => toDetailUrl(offer) === normalizedUrl) ?? null;
  }
  return null;
};

const pickImageUrlFromItem = (
  request: Request,
  item: {
    image_url?: string | null;
    image_local_url?: string | null;
    image_local_path?: string | null;
    provider?: string | null;
    product_id?: string | null;
  }
) => {
  const first = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  const direct =
    first(item.image_url) ||
    first(item.image_local_url) ||
    (item.image_local_path
      ? `/api/discovery/local-image?path=${encodeURIComponent(item.image_local_path)}`
      : null);

  return normalizeSupplierImageUrl(request, direct);
};

const run1688ImageSearch = (request: Request, imageUrl: string, limit: number) => {
  const baseUrl = getPublicBaseUrl(request);
  if (!baseUrl) {
    return { ok: false as const, error: "Unable to determine public base URL." };
  }

  const args: string[] = [
    "--pretty",
    "false",
    "--limit",
    String(limit),
    "--page",
    "1",
    "--cpsFirst",
    "false",
    "--includeRaw",
    "false",
    "--image-url",
    imageUrl,
  ];

  const result = spawnSync(process.execPath, [TOOL_PATH, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PUBLIC_BASE_URL: baseUrl,
      // Keep temp images around longer than the tool's default (5 minutes),
      // so recrop and verification flows don't break on later revisits.
      PUBLIC_TEMP_IMAGE_TTL_MS:
        process.env.PUBLIC_TEMP_IMAGE_TTL_MS || String(30 * 60 * 1000),
    },
    maxBuffer: 20 * 1024 * 1024,
    timeout: 60_000,
  });

  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();

  let parsed: any = null;
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch {}
  }

  if (parsed) {
    // The tool always returns structured JSON. Treat ok:false as an error so we don't cache
    // permanent "0 suppliers" rows on transient failures.
    if (parsed && typeof parsed === "object" && (parsed as any).ok === false) {
      const message =
        typeof (parsed as any)?.error?.message === "string"
          ? String((parsed as any).error.message)
          : typeof (parsed as any)?.error === "string"
            ? String((parsed as any).error)
            : "1688 image search failed.";
      return { ok: false as const, error: message, status: 502 };
    }
    return { ok: true as const, payload: parsed };
  }

  const status = result.status === 2 ? 400 : 500;
  return {
    ok: false as const,
    error: stderr || "1688 image search failed.",
    status,
  };
};

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const provider = String(sp.get("provider") ?? "").trim();
  const productId = String(sp.get("product_id") ?? "").trim();
  const refresh = String(sp.get("refresh") ?? "").trim() === "1";
  const limitParam = Number(sp.get("limit") ?? "10");
  const limit = Number.isFinite(limitParam) ? Math.min(10, Math.max(1, Math.trunc(limitParam))) : 10;

  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  let lockedSupplierUrl: string | null = null;
  if (provider === "digideal") {
    const { data: manualRow, error: manualError } = await adminClient
      .from("digideal_products")
      .select('product_id, "1688_URL", 1688_url')
      .eq("product_id", productId)
      .maybeSingle();
    if (manualError) {
      return NextResponse.json({ error: manualError.message }, { status: 500 });
    }
    const url =
      typeof (manualRow as any)?.["1688_URL"] === "string"
        ? String((manualRow as any)["1688_URL"]).trim()
        : typeof (manualRow as any)?.["1688_url"] === "string"
          ? String((manualRow as any)["1688_url"]).trim()
          : "";
    if (url) lockedSupplierUrl = url;
  }

  const [{ data: searchRow, error: searchError }, { data: selectionRow, error: selectionError }] =
    await Promise.all([
      adminClient
        .from("discovery_production_supplier_searches")
        .select("provider, product_id, fetched_at, offers, meta, input")
        .eq("provider", provider)
        .eq("product_id", productId)
        .maybeSingle(),
      adminClient
        .from("discovery_production_supplier_selection")
        .select("provider, product_id, selected_offer_id, selected_detail_url, selected_offer, selected_at, selected_by, updated_at")
        .eq("provider", provider)
        .eq("product_id", productId)
        .maybeSingle(),
    ]);

  if (searchError) {
    return NextResponse.json({ error: searchError.message }, { status: 500 });
  }
  if (selectionError) {
    return NextResponse.json({ error: selectionError.message }, { status: 500 });
  }

  if (searchRow && !refresh) {
    const offers = Array.isArray((searchRow as any).offers) ? (searchRow as any).offers : [];
    // Normalize 1688 detail URLs to the canonical form (detail.1688.com/offer/{id}.html).
    const normalizedOffers = offers.map((offer: Offer) => {
      const canonical = canonical1688OfferUrl(offer);
      return canonical ? { ...offer, detailUrl: canonical } : offer;
    });
    const meta = (searchRow as any).meta ?? null;
    const input = (searchRow as any).input ?? null;
    const fetchedAtRaw = typeof (searchRow as any).fetched_at === "string" ? (searchRow as any).fetched_at : null;
    const fetchedAtMs = fetchedAtRaw ? Date.parse(fetchedAtRaw) : Number.NaN;
    const isStale = !Number.isFinite(fetchedAtMs) ? true : Date.now() - fetchedAtMs > 6 * 60 * 60 * 1000;

    // Previously we cached tool failures as empty offers (tool returns { ok:false, offers:[] } with no meta).
    // That makes the UI look like "no suppliers found" forever. If we see that shape, rerun once.
    const looksLikeFailure = normalizedOffers.length === 0 && meta === null;
    if (!looksLikeFailure && !isStale) {
      const selected =
        lockedSupplierUrl !== null
          ? {
              provider,
              product_id: productId,
              selected_offer_id: null,
              selected_detail_url: lockedSupplierUrl,
              selected_offer: { detailUrl: lockedSupplierUrl, source: "digideal_manual" },
              selected_at: null,
              selected_by: null,
              updated_at: null,
              locked: true,
            }
          : (selectionRow ?? null);
      return NextResponse.json({
        provider,
        product_id: productId,
        fetched_at: (searchRow as any).fetched_at ?? null,
        offers: normalizedOffers,
        offer_count: normalizedOffers.length,
        input,
        selected,
        locked_supplier_url: lockedSupplierUrl,
      });
    }
  }

  const imageUrlParamRaw = String(sp.get("image_url") ?? "").trim();
  const previousInput = searchRow ? ((searchRow as any).input ?? null) : null;
  const previousUsedPicUrl =
    typeof previousInput?.usedPicUrl === "string" ? previousInput.usedPicUrl : null;
  const previousPicUrl =
    typeof previousInput?.picUrl === "string" ? previousInput.picUrl : null;

  let dbCandidates: string[] = [];
  if (provider === "digideal") {
    const { data: digidealRow, error: digidealError } = await adminClient
      .from("digideal_products_search")
      .select("primary_image_url, image_urls")
      .eq("product_id", productId)
      .maybeSingle();
    if (digidealError) {
      return NextResponse.json({ error: digidealError.message }, { status: 500 });
    }
    const firstString = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : null;
    const firstImageFromArray = (value: unknown) => {
      if (!Array.isArray(value)) return null;
      for (const entry of value) {
        const text = firstString(entry);
        if (text) return text;
      }
      return null;
    };
    dbCandidates = toUniqueImageCandidates(
      request,
      firstString((digidealRow as any)?.primary_image_url),
      firstImageFromArray((digidealRow as any)?.image_urls)
    );
  } else {
    const { data: productRow, error: productError } = await adminClient
      .from("discovery_products")
      .select("image_url, image_local_url, image_local_path, provider, product_id")
      .eq("provider", provider)
      .eq("product_id", productId)
      .maybeSingle();
    if (productError) {
      return NextResponse.json({ error: productError.message }, { status: 500 });
    }
    const row = (productRow as any) ?? {};
    dbCandidates = toUniqueImageCandidates(
      request,
      typeof row?.image_url === "string" ? row.image_url : null,
      typeof row?.image_local_url === "string" ? row.image_local_url : null,
      typeof row?.image_local_path === "string" && row.image_local_path.trim()
        ? `/api/discovery/local-image?path=${encodeURIComponent(row.image_local_path)}`
        : null,
      pickImageUrlFromItem(request, row)
    );
  }

  const imageCandidates = toUniqueImageCandidates(
    request,
    imageUrlParamRaw,
    previousUsedPicUrl,
    previousPicUrl,
    ...dbCandidates
  );

  if (imageCandidates.length === 0) {
    return NextResponse.json(
      { error: "Missing image URL for supplier search." },
      { status: 400 }
    );
  }

  let run:
    | { ok: true; payload: any }
    | { ok: false; error: string; status?: number | undefined }
    | null = null;

  for (let i = 0; i < imageCandidates.length; i += 1) {
    const candidate = imageCandidates[i];
    // 1688 sometimes returns transient "handle image error" for otherwise valid URLs.
    // Retry a few times before moving on to the next candidate so DigiDeal webp->jpg rehosts
    // don’t flake as often.
    run = run1688ImageSearch(request, candidate, limit);
    if (!run.ok && isImageFetchError(run.error)) {
      for (const delayMs of [250, 600, 1200]) {
        await sleep(delayMs);
        run = run1688ImageSearch(request, candidate, limit);
        if (run.ok) break;
        if (!isImageFetchError(run.error)) break;
      }
      if (!run.ok && isImageFetchError(run.error)) {
        // Helps debug the (rare) cases where 1688 can't fetch a URL that looks valid.
        console.warn("[api/production/suppliers] image fetch error after retries", {
          provider,
          productId,
          candidate,
          error: run.error,
        });
      }
    }
    if (run.ok) break;
    if (i >= imageCandidates.length - 1) break;
    if (!isImageFetchError(run.error)) break;
  }

  if (!run || !run.ok) {
    return NextResponse.json({ error: run?.error || "1688 image search failed." }, { status: run?.status ?? 500 });
  }

  const payload = run.payload ?? {};
  const offers = Array.isArray(payload.offers) ? payload.offers : [];
  let normalizedOffers = offers.map((offer: Offer) => {
    const canonical = canonical1688OfferUrl(offer);
    return canonical ? { ...offer, detailUrl: canonical } : offer;
  });
  // Best-effort: translate titles during the search run so revisits already have English cached.
  normalizedOffers = await translateOffersBestEffort(normalizedOffers);
  const meta = payload.meta ?? null;
  const input = payload.input ?? null;
  const fetchedAt =
    typeof meta?.fetchedAt === "string" ? meta.fetchedAt : new Date().toISOString();

  // If the 1688 tool had to rehost the image into our /api/public/temp-images/ bucket,
  // extend its expiry so it remains available for recrop / research later.
  await persistTempImageUrlsBestEffort(input);

  const { error: upsertError } = await adminClient
    .from("discovery_production_supplier_searches")
    .upsert(
      {
        provider,
        product_id: productId,
        source: "1688_image_search",
        fetched_at: fetchedAt,
        offers: normalizedOffers,
        meta,
        input,
      },
      { onConflict: "provider,product_id" }
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const selected =
    lockedSupplierUrl !== null
      ? {
          provider,
          product_id: productId,
          selected_offer_id: null,
          selected_detail_url: lockedSupplierUrl,
          selected_offer: { detailUrl: lockedSupplierUrl, source: "digideal_manual" },
          selected_at: null,
          selected_by: null,
          updated_at: null,
          locked: true,
        }
      : (selectionRow ?? null);

  return NextResponse.json({
    provider,
    product_id: productId,
    fetched_at: fetchedAt,
    offers: normalizedOffers,
    offer_count: normalizedOffers.length,
    input,
    selected,
    locked_supplier_url: lockedSupplierUrl,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  let payload: {
    provider?: string;
    product_id?: string;
    offer_id?: string;
    detail_url?: string;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const provider = String(payload?.provider ?? "").trim();
  const productId = String(payload?.product_id ?? "").trim();
  const offerId = String(payload?.offer_id ?? "").trim();
  const detailUrl = typeof payload?.detail_url === "string" ? payload.detail_url.trim() : "";

  if (!provider || !productId || (!offerId && !detailUrl)) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  if (provider === "digideal") {
    const { data: manualRow, error: manualError } = await adminClient
      .from("digideal_products")
      .select('product_id, "1688_URL", 1688_url')
      .eq("product_id", productId)
      .maybeSingle();
    if (manualError) {
      return NextResponse.json({ error: manualError.message }, { status: 500 });
    }
    const url =
      typeof (manualRow as any)?.["1688_URL"] === "string"
        ? String((manualRow as any)["1688_URL"]).trim()
        : typeof (manualRow as any)?.["1688_url"] === "string"
          ? String((manualRow as any)["1688_url"]).trim()
          : "";
    if (url) {
      return NextResponse.json(
        {
          error:
            "A supplier has already been set in DigiDeal (EST rerun price). Remove it there to change the production supplier.",
        },
        { status: 409 }
      );
    }

    // This supplier is selected via image search (not manually locked). Clear any previously
    // derived purchase/weight so the UI doesn't keep showing an old estimate after reselection.
    try {
      const productIdValue: string | number = /^\d+$/.test(productId)
        ? Number(productId)
        : productId;
      await adminClient
        .from("digideal_products")
        .update({ purchase_price: null, weight_grams: null, weight_kg: null })
        .eq("product_id", productIdValue);
    } catch {
      // ignore
    }
  }

  const { data: searchRow, error: searchError } = await adminClient
    .from("discovery_production_supplier_searches")
    .select("offers")
    .eq("provider", provider)
    .eq("product_id", productId)
    .maybeSingle();

  if (searchError) {
    return NextResponse.json({ error: searchError.message }, { status: 500 });
  }

  const offers: Offer[] = Array.isArray((searchRow as any)?.offers)
    ? ((searchRow as any).offers as Offer[])
    : [];

  const match = findOffer(offers, offerId, detailUrl || null);
  if (!match) {
    return NextResponse.json(
      { error: "Supplier offer not found. Refresh supplier suggestions and try again." },
      { status: 404 }
    );
  }

  const selectedOfferId = toOfferId(match) ?? (offerId ? offerId : null);
  const selectedDetailUrl =
    toDetailUrl(match) ??
    (detailUrl ? canonical1688OfferUrl({ detailUrl } as Offer) : null);

  const selectedOffer = selectedDetailUrl
    ? ({ ...match, detailUrl: selectedDetailUrl } as Offer)
    : (match as Offer);

  const now = new Date().toISOString();
  const selectedOfferWithPayload = withPayloadFetchingState(selectedOffer, now);
  const { data: selectionRow, error: upsertError } = await adminClient
    .from("discovery_production_supplier_selection")
    .upsert(
      {
        provider,
        product_id: productId,
        selected_offer_id: selectedOfferId,
        selected_detail_url: selectedDetailUrl,
        selected_offer: selectedOfferWithPayload,
        selected_at: now,
        selected_by: auth.user.id,
        updated_at: now,
      },
      { onConflict: "provider,product_id" }
    )
    .select(
      "provider, product_id, selected_offer_id, selected_detail_url, selected_offer, selected_at, selected_by, updated_at"
    )
    .maybeSingle();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const queued = spawnSupplierPayloadWorkerBestEffort(provider, productId);
  if (!queued) {
    const failedAt = new Date().toISOString();
    const failedSelectedOffer: Offer = {
      ...(selectedOfferWithPayload as any),
      _production_payload_status: "failed",
      _production_payload_error: "Unable to start background 1688 fetch job.",
      _production_payload_updated_at: failedAt,
    } as Offer;

    const { data: failedRow } = await adminClient
      .from("discovery_production_supplier_selection")
      .update({
        selected_offer: failedSelectedOffer,
        updated_at: failedAt,
      })
      .eq("provider", provider)
      .eq("product_id", productId)
      .select(
        "provider, product_id, selected_offer_id, selected_detail_url, selected_offer, selected_at, selected_by, updated_at"
      )
      .maybeSingle();

    return NextResponse.json({
      selected: failedRow ?? selectionRow ?? null,
      payload_fetch_status: "failed",
    });
  }

  return NextResponse.json({
    selected: selectionRow ?? null,
    payload_fetch_status: "fetching",
  });
}
