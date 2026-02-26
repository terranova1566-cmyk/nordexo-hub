import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { PARTNER_SUGGESTION_PROVIDER } from "@/lib/product-suggestions";
import {
  canonical1688OfferUrl,
  canonical1688OfferUrlText,
  hasCjk,
} from "@/shared/1688/core";

export const runtime = "nodejs";

const DIGIDEAL_PROVIDER = "digideal";
const OFFERILLA_PROVIDER = "offerilla";

type Offer = {
  rank?: number;
  offerId?: string | number | null;
  detailUrl?: string | null;
  imageUrl?: string | null;
  subject?: string | null;
  subject_en?: string | null;
  [key: string]: unknown;
};

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const decodeEntities = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");

const stripHtml = (value: string) =>
  decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const parseMetaTag = (html: string, key: string, attr: "name" | "property" = "property") => {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([\\\\s\\\\S]*?)["'][^>]*>`,
    "i"
  );
  const match = html.match(re);
  return match?.[1] ? decodeEntities(match[1]).trim() : "";
};

const parseTitleTag = (html: string) => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? stripHtml(match[1]) : "";
};

const toAbsoluteUrl = (baseUrl: string, value: string) => {
  const raw = asText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
};

const extractFirstImageFromHtml = (html: string, baseUrl: string) => {
  const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(html)) !== null) {
    const url = toAbsoluteUrl(baseUrl, match[1]);
    if (!url) continue;
    if (/spacer|icon|logo|avatar|sprite|thumb/i.test(url)) continue;
    return url;
  }
  return "";
};

const extractOfferIdFromDetailUrl = (value: unknown) => {
  const text = asText(value);
  if (!text) return "";
  const match = text.match(/(?:detail\.1688\.com\/offer\/|\/offer\/)(\d{6,})\.html/i);
  return match?.[1] ? match[1] : "";
};

const normalizeManualDetailUrl = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return "";
  const canonical =
    canonical1688OfferUrl({ detailUrl: raw }) || canonical1688OfferUrlText(raw) || "";
  const normalized = asText(canonical);
  if (!normalized) return "";
  if (!/^https?:\/\//i.test(normalized)) return "";
  if (!/1688\.com/i.test(normalized)) return "";
  const offerId = extractOfferIdFromDetailUrl(normalized);
  if (!offerId) return "";
  return `https://detail.1688.com/offer/${offerId}.html`;
};

const sameOffer = (offer: Offer, offerId: string, detailUrl: string) => {
  const existingId = asText(offer?.offerId);
  const existingUrl = normalizeManualDetailUrl(offer?.detailUrl);
  if (offerId && existingId && existingId === offerId) return true;
  if (detailUrl && existingUrl && existingUrl === detailUrl) return true;
  return false;
};

const trimOfferTitle = (value: unknown, maxChars = 220) => {
  const cleaned = stripHtml(asText(value)).replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.replace(/\s*[-|]\s*1688.*$/i, "").slice(0, maxChars).trim();
};

const fetchOfferMeta = async (detailUrl: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(detailUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const finalUrl = normalizeManualDetailUrl(response.url || detailUrl) || detailUrl;
    const title = trimOfferTitle(
      firstString(
        parseMetaTag(html, "og:title", "property"),
        parseMetaTag(html, "title", "name"),
        parseTitleTag(html)
      )
    );
    const imageUrl = firstString(
      toAbsoluteUrl(finalUrl, parseMetaTag(html, "og:image", "property")),
      extractFirstImageFromHtml(html, finalUrl)
    );

    return {
      ok: true as const,
      finalUrl,
      title,
      imageUrl,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const getAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const isSupportedSupplierProvider = (provider: string) => {
  const normalized = asText(provider).toLowerCase();
  return (
    normalized === DIGIDEAL_PROVIDER ||
    normalized === OFFERILLA_PROVIDER ||
    normalized === asText(PARTNER_SUGGESTION_PROVIDER).toLowerCase()
  );
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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  const bodyRecord = body as Record<string, unknown>;

  const provider = asText(bodyRecord.provider).toLowerCase();
  const productId = asText(bodyRecord.product_id);
  const detailUrl = normalizeManualDetailUrl(bodyRecord.detail_url);
  if (!provider || !productId || !detailUrl) {
    return NextResponse.json(
      { error: "Provide provider, product_id, and a valid 1688 offer URL." },
      { status: 400 }
    );
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

  const nowIso = new Date().toISOString();
  const offerId = extractOfferIdFromDetailUrl(detailUrl);

  const { data: searchRow, error: searchError } = await adminClient
    .from("discovery_production_supplier_searches")
    .select("provider, product_id, source, fetched_at, offers, meta, input")
    .eq("provider", provider)
    .eq("product_id", productId)
    .maybeSingle();
  if (searchError) {
    return NextResponse.json({ error: searchError.message }, { status: 500 });
  }
  const searchRecord =
    searchRow && typeof searchRow === "object"
      ? (searchRow as Record<string, unknown>)
      : null;

  const existingOffers: Offer[] = Array.isArray(searchRecord?.offers)
    ? (searchRecord.offers as Offer[])
    : [];
  const existingMatch = existingOffers.find((offer) => sameOffer(offer, offerId, detailUrl));
  const existingMatchRecord =
    existingMatch && typeof existingMatch === "object"
      ? (existingMatch as Record<string, unknown>)
      : null;

  const pendingOffer: Offer = {
    ...(existingMatch && typeof existingMatch === "object" ? existingMatch : {}),
    rank: -1,
    offerId: offerId || firstString(existingMatch?.offerId) || null,
    detailUrl,
    imageUrl: firstString(existingMatch?.imageUrl) || null,
    subject: firstString(existingMatch?.subject) || "",
    subject_en: firstString(existingMatch?.subject_en) || "",
    _manual_added: true,
    _manual_status: "loading",
    _manual_loading: true,
    _manual_added_at: firstString(existingMatchRecord?._manual_added_at) || nowIso,
    _manual_updated_at: nowIso,
    _manual_error: null,
  };

  const restOffers = existingOffers.filter((offer) => !sameOffer(offer, offerId, detailUrl));
  const offersWithPending = [pendingOffer, ...restOffers];

  const { error: pendingUpsertError } = await adminClient
    .from("discovery_production_supplier_searches")
    .upsert(
      {
        provider,
        product_id: productId,
        source: asText(searchRecord?.source) || "manual_supplier_url",
        fetched_at: nowIso,
        offers: offersWithPending,
        meta: searchRecord?.meta ?? null,
        input: searchRecord?.input ?? null,
      },
      { onConflict: "provider,product_id" }
    );
  if (pendingUpsertError) {
    return NextResponse.json({ error: pendingUpsertError.message }, { status: 500 });
  }

  const meta = await fetchOfferMeta(detailUrl);
  const resolvedTitle = meta.ok ? trimOfferTitle(meta.title) : "";
  const resolvedImageUrl = meta.ok ? firstString(meta.imageUrl) : "";
  const resolvedDetailUrl = meta.ok ? normalizeManualDetailUrl(meta.finalUrl) || detailUrl : detailUrl;
  const resolvedError = meta.ok ? "" : firstString(meta.error);
  const resolvedOfferId = extractOfferIdFromDetailUrl(resolvedDetailUrl) || offerId;

  const resolvedOffer: Offer = {
    ...pendingOffer,
    offerId: resolvedOfferId || pendingOffer.offerId || null,
    detailUrl: resolvedDetailUrl,
    imageUrl: resolvedImageUrl || pendingOffer.imageUrl || null,
    subject: resolvedTitle || firstString(pendingOffer.subject) || "",
    subject_en:
      resolvedTitle && !hasCjk(resolvedTitle)
        ? resolvedTitle
        : firstString(pendingOffer.subject_en) || "",
    _manual_status: meta.ok ? "ready" : "error",
    _manual_loading: false,
    _manual_updated_at: new Date().toISOString(),
    _manual_error: meta.ok ? null : resolvedError || "Failed to fetch supplier data.",
  };

  const finalOffers = [resolvedOffer, ...restOffers];
  const { error: finalUpsertError } = await adminClient
    .from("discovery_production_supplier_searches")
    .upsert(
      {
        provider,
        product_id: productId,
        source: asText(searchRecord?.source) || "manual_supplier_url",
        fetched_at: new Date().toISOString(),
        offers: finalOffers,
        meta: searchRecord?.meta ?? null,
        input: searchRecord?.input ?? null,
      },
      { onConflict: "provider,product_id" }
    );
  if (finalUpsertError) {
    return NextResponse.json({ error: finalUpsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    offer: resolvedOffer,
    offers: finalOffers,
  });
}
