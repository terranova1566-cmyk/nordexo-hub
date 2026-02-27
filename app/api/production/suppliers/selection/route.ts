import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { spawn } from "node:child_process";

export const runtime = "nodejs";

const SUPPLIER_PAYLOAD_WORKER_PATH =
  "/srv/nordexo-hub/scripts/production-supplier-fetch-worker.mjs";
const STALE_FETCH_RETRY_AFTER_MS = 6 * 60 * 1000;
const STALE_FETCH_MAX_AUTO_RETRIES = 2;

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

const spawnSupplierPayloadWorkerBestEffort = (provider: string, productId: string) => {
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

const toText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(num) ? num : null;
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

  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  const { data, error } = await adminClient
    .from("discovery_production_supplier_selection")
    .select(
      "provider, product_id, selected_offer_id, selected_detail_url, selected_offer, selected_at, selected_by, updated_at"
    )
    .eq("provider", provider)
    .eq("product_id", productId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let offer =
    data?.selected_offer && typeof data.selected_offer === "object"
      ? (data.selected_offer as Record<string, unknown>)
      : null;

  const payloadStatus = toText((offer as any)?._production_payload_status).toLowerCase();
  if (payloadStatus === "fetching" && data) {
    const nowIso = new Date().toISOString();
    const referenceUpdatedAtText =
      toText((offer as any)?._production_payload_updated_at) ||
      toText(data.updated_at);
    const referenceUpdatedAtMs = Date.parse(referenceUpdatedAtText);
    const isStale =
      Number.isFinite(referenceUpdatedAtMs) &&
      Date.now() - referenceUpdatedAtMs >= STALE_FETCH_RETRY_AFTER_MS;

    if (isStale) {
      const retryCountRaw = Number((offer as any)?._production_payload_retry_count);
      const retryCount = Number.isFinite(retryCountRaw) ? Math.max(0, retryCountRaw) : 0;

      if (retryCount < STALE_FETCH_MAX_AUTO_RETRIES) {
        const retryOffer: Record<string, unknown> = {
          ...(offer ?? {}),
          _production_payload_status: "fetching",
          _production_payload_source: "auto_retry",
          _production_payload_error: null,
          _production_payload_updated_at: nowIso,
          _production_payload_retry_count: retryCount + 1,
          _production_payload_last_retry_at: nowIso,
        };

        const { error: retryUpdateError } = await adminClient
          .from("discovery_production_supplier_selection")
          .update({
            selected_offer: retryOffer,
            updated_at: nowIso,
          })
          .eq("provider", provider)
          .eq("product_id", productId);

        if (!retryUpdateError) {
          const started = spawnSupplierPayloadWorkerBestEffort(provider, productId);
          if (!started) {
            const failedOffer: Record<string, unknown> = {
              ...retryOffer,
              _production_payload_status: "failed",
              _production_payload_error:
                "Unable to restart stale 1688 fetch worker. Please retry manually.",
              _production_payload_updated_at: nowIso,
            };
            await adminClient
              .from("discovery_production_supplier_selection")
              .update({
                selected_offer: failedOffer,
                updated_at: nowIso,
              })
              .eq("provider", provider)
              .eq("product_id", productId);
            offer = failedOffer;
          } else {
            offer = retryOffer;
          }
        }
      } else {
        const failedOffer: Record<string, unknown> = {
          ...(offer ?? {}),
          _production_payload_status: "failed",
          _production_payload_error:
            "1688 data fetch timed out. Please retry this supplier.",
          _production_payload_updated_at: nowIso,
        };
        await adminClient
          .from("discovery_production_supplier_selection")
          .update({
            selected_offer: failedOffer,
            updated_at: nowIso,
          })
          .eq("provider", provider)
          .eq("product_id", productId);
        offer = failedOffer;
      }
    }
  }

  const meta = offer
    ? {
        payload_status: toText((offer as any)._production_payload_status) || null,
        payload_source: toText((offer as any)._production_payload_source) || null,
        payload_error: toText((offer as any)._production_payload_error) || null,
        payload_saved_at: toText((offer as any)._production_payload_saved_at) || null,
        payload_file_name: toText((offer as any)._production_payload_file_name) || null,
        payload_file_path: toText((offer as any)._production_payload_file_path) || null,
        variant_available_count: toNumber((offer as any)._production_variant_available_count),
        variant_selected_count: toNumber((offer as any)._production_variant_selected_count),
        variant_packs_text: toText((offer as any)._production_variant_packs_text) || null,
        competitor_url: toText((offer as any)._production_payload_competitor_url) || null,
        competitor_title: toText((offer as any)._production_payload_competitor_title) || null,
        competitor_images: toNumber((offer as any)._production_payload_competitor_images),
        competitor_error: toText((offer as any)._production_payload_competitor_error) || null,
      }
    : null;

  return NextResponse.json({
    provider,
    product_id: productId,
    selected_offer_id:
      data?.selected_offer_id === null || data?.selected_offer_id === undefined
        ? null
        : String(data.selected_offer_id),
    selected_detail_url:
      typeof data?.selected_detail_url === "string" ? data.selected_detail_url : null,
    selected_at: typeof data?.selected_at === "string" ? data.selected_at : null,
    updated_at: typeof data?.updated_at === "string" ? data.updated_at : null,
    meta,
  });
}
