import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

  const offer =
    data?.selected_offer && typeof data.selected_offer === "object"
      ? (data.selected_offer as Record<string, unknown>)
      : null;

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

