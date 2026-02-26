import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { PARTNER_SUGGESTION_PROVIDER } from "@/lib/product-suggestions";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  canonical1688OfferUrl,
  isImageFetchError,
} from "@/shared/1688/core";
import {
  getPublicBaseUrlFromRequest,
  run1688ImageSearch,
} from "@/shared/1688/image-search-runner";
import { getDealsProviderConfig, resolveDealsProvider } from "@/lib/deals/provider";

export const runtime = "nodejs";
const DIGIDEAL_PROVIDER = "digideal";
const OFFERILLA_PROVIDER = "offerilla";
const PARTNER_SUGGESTION_PROVIDER_NORMALIZED = String(
  PARTNER_SUGGESTION_PROVIDER || ""
).trim().toLowerCase();
const DEALS_SUPPLIER_PROVIDERS = new Set([DIGIDEAL_PROVIDER, OFFERILLA_PROVIDER]);
const isSupportedSupplierProvider = (provider: string) => {
  const normalized = String(provider || "").trim().toLowerCase();
  return (
    DEALS_SUPPLIER_PROVIDERS.has(normalized) ||
    normalized === PARTNER_SUGGESTION_PROVIDER_NORMALIZED
  );
};

const UPLOAD_DIR = "/srv/incoming-scripts/uploads/1688-image-search";
const PUBLIC_TEMP_DIR = "/srv/incoming-scripts/uploads/public-temp-images";

type Offer = {
  offerId?: string | number | null;
  detailUrl?: string | null;
  [key: string]: unknown;
};

type CropPixels = { x: number; y: number; width: number; height: number };

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

const getPublicBaseUrl = (request: Request) =>
  getPublicBaseUrlFromRequest(request);

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

const normalizeImageUrl = (request: Request, value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (isHttpUrl(trimmed)) return normalizePublicTempImagePath(trimmed);
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) {
    const base = getPublicBaseUrl(request);
    return base ? normalizePublicTempImagePath(`${base}${trimmed}`) : null;
  }
  return null;
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

const clampInt = (value: number, min: number, max: number) => {
  const v = Math.trunc(value);
  return Math.min(max, Math.max(min, v));
};

const isValidCrop = (crop: any): crop is CropPixels => {
  if (!crop || typeof crop !== "object") return false;
  const keys: Array<keyof CropPixels> = ["x", "y", "width", "height"];
  return keys.every((k) => Number.isFinite(Number(crop[k])));
};

const run1688WithFile = (request: Request, imagePath: string, limit: number) => {
  return run1688ImageSearch({
    publicBaseUrl: getPublicBaseUrl(request),
    imagePath,
    limit,
    page: 1,
    cpsFirst: false,
    includeRaw: false,
    pretty: false,
  });
};

const run1688WithUrl = (request: Request, imageUrl: string, limit: number) => {
  return run1688ImageSearch({
    publicBaseUrl: getPublicBaseUrl(request),
    imageUrl,
    limit,
    page: 1,
    cpsFirst: false,
    includeRaw: false,
    pretty: false,
  });
};

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

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const provider = String((payload as any).provider ?? "").trim().toLowerCase();
  const productId = String((payload as any).product_id ?? "").trim();
  const imageUrlRaw = String((payload as any).image_url ?? "").trim();
  const crop = (payload as any).crop;
  const limit = clampInt(Number((payload as any).limit ?? 10), 1, 10);

  const imageUrl = imageUrlRaw ? normalizeImageUrl(request, imageUrlRaw) : null;

  if (!provider || !productId || !imageUrl || !isValidCrop(crop)) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  if (!isSupportedSupplierProvider(provider)) {
    return NextResponse.json(
      {
        error:
          "Supplier fetching is available only for DigiDeal, Offerilla, and Product Suggestions.",
      },
      { status: 409 }
    );
  }

  const cropPx: CropPixels = {
    x: clampInt(Number(crop.x), 0, 100000),
    y: clampInt(Number(crop.y), 0, 100000),
    width: clampInt(Number(crop.width), 1, 100000),
    height: clampInt(Number(crop.height), 1, 100000),
  };

  // Keep exposing the current manual supplier URL for UI context.
  let lockedSupplierUrl: string | null = null;
  if (DEALS_SUPPLIER_PROVIDERS.has(provider)) {
    const dealsProvider = resolveDealsProvider(provider);
    const providerConfig = getDealsProviderConfig(dealsProvider);
    const { data: manualRow } = await adminClient
      .from(providerConfig.productsTable)
      .select('product_id, "1688_URL", 1688_url')
      .eq("product_id", productId)
      .maybeSingle();
    const url =
      typeof (manualRow as any)?.["1688_URL"] === "string"
        ? String((manualRow as any)["1688_URL"]).trim()
        : typeof (manualRow as any)?.["1688_url"] === "string"
          ? String((manualRow as any)["1688_url"]).trim()
          : "";
    if (url) lockedSupplierUrl = url;
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_TEMP_DIR, { recursive: true });
  const id = crypto.randomBytes(16).toString("hex");
  const tempPath = path.join(UPLOAD_DIR, `recrop-${provider}-${productId}-${id}.jpg`);
  const publicId = crypto.randomBytes(16).toString("hex");
  const publicPath = path.join(PUBLIC_TEMP_DIR, `${publicId}.jpg`);
  const publicMetaPath = path.join(PUBLIC_TEMP_DIR, `${publicId}.json`);

  try {
    const imageRes = await fetch(imageUrl, { redirect: "follow" });
    if (!imageRes.ok) {
      return NextResponse.json(
        { error: `Unable to fetch image (${imageRes.status}).` },
        { status: 400 }
      );
    }
    const arrayBuf = await imageRes.arrayBuffer();
    const inputBuf = Buffer.from(arrayBuf);

    const img = sharp(inputBuf, { failOn: "none" });
    const meta = await img.metadata();
    const imgW = meta.width ?? 0;
    const imgH = meta.height ?? 0;
    if (!imgW || !imgH) {
      return NextResponse.json({ error: "Invalid image." }, { status: 400 });
    }

    const left = clampInt(cropPx.x, 0, Math.max(0, imgW - 1));
    const top = clampInt(cropPx.y, 0, Math.max(0, imgH - 1));
    const width = clampInt(cropPx.width, 1, Math.max(1, imgW - left));
    const height = clampInt(cropPx.height, 1, Math.max(1, imgH - top));

    await img
      .extract({ left, top, width, height })
      // Keep recrops small and predictable for 1688 fetching.
      .resize({ width: 500, height: 500, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toFile(tempPath);

    // Persist the cropped image so it can be reused for later searches/research.
    const croppedBuf = await fs.readFile(tempPath);
    await fs.writeFile(publicPath, croppedBuf);
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    await fs.writeFile(
      publicMetaPath,
      JSON.stringify({ expiresAt, contentType: "image/jpeg" }),
      "utf8"
    );
    // Include an extension in the URL; some upstream fetchers are stricter about this.
    const croppedPublicUrlPath = `/api/public/temp-images/${publicId}.jpg`;
    const croppedPublicUrlAbs = normalizeImageUrl(request, croppedPublicUrlPath);

    // Prefer local file search for recrops to avoid transient fetch failures on temp URLs.
    let run = run1688WithFile(request, tempPath, limit);
    // Retry strategy for intermittent 1688 "handle image error" failures.
    if (!run.ok && isImageFetchError(run.error)) {
      if (croppedPublicUrlAbs) {
        const viaUrl = run1688WithUrl(request, croppedPublicUrlAbs, limit);
        if (viaUrl.ok) {
          run = viaUrl;
        } else if (isImageFetchError(viaUrl.error)) {
          // Last fallback: keep UX moving by searching with the original image URL.
          const viaOriginal = run1688WithUrl(request, imageUrl, limit);
          if (viaOriginal.ok) {
            run = viaOriginal;
          } else {
            run = viaOriginal;
          }
        } else {
          run = viaUrl;
        }
      }
    }
    if (!run.ok) {
      return NextResponse.json({ error: run.error }, { status: run.status ?? 500 });
    }

    const toolPayload =
      run.payload && typeof run.payload === "object"
        ? (run.payload as Record<string, unknown>)
        : {};
    const offersRaw = toolPayload.offers;
    const offers = Array.isArray(offersRaw) ? offersRaw : [];
    const normalizedOffers = offers.map((offer: Offer) => {
      const canonical = canonical1688OfferUrl(offer);
      return canonical ? { ...offer, detailUrl: canonical } : offer;
    });
    const toolMeta =
      toolPayload.meta && typeof toolPayload.meta === "object"
        ? (toolPayload.meta as Record<string, unknown>)
        : null;
    const toolInput =
      toolPayload.input && typeof toolPayload.input === "object"
        ? (toolPayload.input as Record<string, unknown>)
        : null;
    const fetchedAt =
      typeof toolMeta?.fetchedAt === "string" ? toolMeta.fetchedAt : new Date().toISOString();

    const mergedInput =
      toolInput && typeof toolInput === "object"
        ? {
            ...toolInput,
            picUrl: croppedPublicUrlAbs || (toolInput as any).picUrl,
            usedPicUrl: croppedPublicUrlAbs || (toolInput as any).usedPicUrl,
            recrop: {
              crop: { left, top, width, height },
              imageUrl,
              croppedPublicUrl: croppedPublicUrlPath,
              croppedPublicUrlAbs,
            },
          }
        : {
            picUrl: croppedPublicUrlAbs,
            usedPicUrl: croppedPublicUrlAbs,
            recrop: {
              crop: { left, top, width, height },
              imageUrl,
              croppedPublicUrl: croppedPublicUrlPath,
              croppedPublicUrlAbs,
            },
          };

    const { error: upsertError } = await adminClient
      .from("discovery_production_supplier_searches")
      .upsert(
        {
          provider,
          product_id: productId,
          source: "1688_image_search",
          fetched_at: fetchedAt,
          offers: normalizedOffers,
          meta: toolMeta,
          input: mergedInput,
        },
        { onConflict: "provider,product_id" }
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    const { data: selectionRow } = await adminClient
      .from("discovery_production_supplier_selection")
      .select("provider, product_id, selected_offer_id, selected_detail_url, selected_offer, selected_at, selected_by, updated_at")
      .eq("provider", provider)
      .eq("product_id", productId)
      .maybeSingle();

    const selected = selectionRow ?? null;

    return NextResponse.json({
      provider,
      product_id: productId,
      fetched_at: fetchedAt,
      offers: normalizedOffers,
      offer_count: normalizedOffers.length,
      input: mergedInput,
      selected,
      locked_supplier_url: lockedSupplierUrl,
    });
  } finally {
    try {
      await fs.unlink(tempPath);
    } catch {}
  }
}
