import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { PRODUCTION_SUPPLIER_PAYLOAD_DIR } from "@/lib/1688-extractor";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const OUTPUT_DIR = PRODUCTION_SUPPLIER_PAYLOAD_DIR;

type Offer = {
  offerId?: string | number | null;
  detailUrl?: string | null;
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

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const sanitizeFilePart = (value: string) =>
  String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100) || "item";

const formatTimestamp = (date: Date) => {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}${pad(
    date.getMilliseconds(),
    3
  )}`;
};

const extractOfferId = (offer: Offer) => {
  const raw = offer?.offerId;
  const text = raw === null || raw === undefined ? "" : String(raw).trim();
  return text || null;
};

const canonical1688Url = (detailUrl: string | null, offerId?: string | null) => {
  const id = asText(offerId);
  if (id && /^\d{6,}$/.test(id)) {
    return `https://detail.1688.com/offer/${id}.html`;
  }
  const raw = asText(detailUrl);
  if (!raw) return "";
  const match = raw.match(/(?:detail\.1688\.com\/offer\/|\/offer\/)(\d{6,})\.html/i);
  if (match?.[1]) return `https://detail.1688.com/offer/${match[1]}.html`;
  return raw;
};

const withPayloadMeta = (
  offer: Offer,
  patch: {
    status: string;
    source: string;
    error: string | null;
    fileName?: string | null;
    filePath?: string | null;
    savedAt?: string | null;
  }
) => {
  const now = new Date().toISOString();
  const base = offer && typeof offer === "object" ? offer : {};
  return {
    ...(base as any),
    _production_payload_status: patch.status,
    _production_payload_source: patch.source,
    _production_payload_error: patch.error,
    _production_payload_file_name: asText(patch.fileName || "") || null,
    _production_payload_file_path: asText(patch.filePath || "") || null,
    _production_payload_updated_at: now,
    _production_payload_saved_at: patch.savedAt ?? null,
  };
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

const normalizeItemsPayload = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (payload && typeof payload === "object") return [payload];
  return [];
};

const saveItems = async (items: unknown[], provider: string, productId: string) => {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  const base = `production_supplier_manual_${sanitizeFilePart(provider)}_${sanitizeFilePart(
    productId
  )}`;
  const stamp = formatTimestamp(new Date());
  let fileName = `${base}_${stamp}.json`;
  let counter = 1;
  while (fs.existsSync(path.join(OUTPUT_DIR, fileName))) {
    fileName = `${base}_${stamp}_${counter}.json`;
    counter += 1;
  }
  const filePath = path.join(OUTPUT_DIR, fileName);
  await fsp.writeFile(filePath, JSON.stringify(items, null, 2), "utf8");
  return { fileName, filePath };
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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const provider = asText((body as any).provider);
  const productId = asText((body as any).product_id);
  const payload = (body as any).payload;

  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  const { data: selectionRow, error: selectionError } = await adminClient
    .from("discovery_production_supplier_selection")
    .select("provider, product_id, selected_offer_id, selected_detail_url, selected_offer")
    .eq("provider", provider)
    .eq("product_id", productId)
    .maybeSingle();

  if (selectionError) {
    return NextResponse.json({ error: selectionError.message }, { status: 500 });
  }
  if (!selectionRow) {
    return NextResponse.json(
      { error: "No supplier is selected for this product." },
      { status: 404 }
    );
  }

  const selectedOffer = ((selectionRow as any).selected_offer ?? {}) as Offer;
  const selectedOfferId =
    asText((selectionRow as any).selected_offer_id) || asText(extractOfferId(selectedOffer));
  const selectedDetailUrl = canonical1688Url(
    asText((selectionRow as any).selected_detail_url) || asText(selectedOffer?.detailUrl),
    selectedOfferId
  );

  if (!selectedDetailUrl) {
    return NextResponse.json(
      { error: "Selected supplier URL is missing." },
      { status: 400 }
    );
  }

  const items = normalizeItemsPayload(payload);
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "Missing JSON payload items." },
      { status: 400 }
    );
  }

  const normalizedItems = items.map((item: any) => {
    const record = item && typeof item === "object" ? { ...item } : {};
    record.url_1688 = selectedDetailUrl;
    record.url_1688_list = [selectedDetailUrl];
    if (!record.selected_supplier_offer_id && selectedOfferId) {
      record.selected_supplier_offer_id = selectedOfferId;
    }
    record.production_provider = provider;
    record.production_product_id = productId;
    return record;
  });

  const saved = await saveItems(normalizedItems, provider, productId);
  const savedAt = new Date().toISOString();
  const patchedOffer = withPayloadMeta(selectedOffer, {
    status: "ready",
    source: "manual",
    error: null,
    fileName: saved.fileName,
    filePath: saved.filePath,
    savedAt,
  });

  const { data: updatedRow, error: updateError } = await adminClient
    .from("discovery_production_supplier_selection")
    .update({
      selected_offer: patchedOffer,
      updated_at: savedAt,
    })
    .eq("provider", provider)
    .eq("product_id", productId)
    .select(
      "provider, product_id, selected_offer_id, selected_detail_url, selected_offer, selected_at, selected_by, updated_at"
    )
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    selected: updatedRow ?? null,
    saved: {
      file_name: saved.fileName,
      file_path: saved.filePath,
      count: normalizedItems.length,
    },
  });
}
