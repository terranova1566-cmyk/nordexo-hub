import { NextResponse } from "next/server";
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

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, user };
};

const toNumber = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const { data: markets, error: marketError } = await adminClient
    .from("b2b_pricing_markets")
    .select("*")
    .order("market", { ascending: true });

  if (marketError) {
    return NextResponse.json({ error: marketError.message }, { status: 500 });
  }

  const { data: classes, error: classError } = await adminClient
    .from("b2b_pricing_shipping_classes")
    .select("*")
    .order("market", { ascending: true })
    .order("shipping_class", { ascending: true });

  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 500 });
  }

  return NextResponse.json({
    markets: markets ?? [],
    shippingClasses: classes ?? [],
  });
}

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const markets = Array.isArray(payload.markets) ? payload.markets : [];
  const shippingClasses = Array.isArray(payload.shippingClasses)
    ? payload.shippingClasses
    : [];

  const now = new Date().toISOString();

  if (markets.length > 0) {
    const upsertMarkets = markets
      .map((entry: Record<string, unknown>) => ({
        market: String(entry.market || "").toUpperCase(),
        currency: String(entry.currency || "").toUpperCase(),
        fx_rate_cny: toNumber(entry.fx_rate_cny),
        weight_threshold_g: toNumber(entry.weight_threshold_g),
        packing_fee: toNumber(entry.packing_fee),
        markup_percent: toNumber(entry.markup_percent),
        markup_fixed: toNumber(entry.markup_fixed),
        updated_at: now,
      }))
      .filter(
        (entry: { market: string; currency: string }) =>
          entry.market && entry.currency
      );

    if (upsertMarkets.length > 0) {
      const { error } = await adminClient
        .from("b2b_pricing_markets")
        .upsert(upsertMarkets, { onConflict: "market" });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  if (shippingClasses.length > 0) {
    const upsertClasses = shippingClasses
      .map((entry: Record<string, unknown>) => ({
        market: String(entry.market || "").toUpperCase(),
        shipping_class: String(entry.shipping_class || "").toUpperCase(),
        rate_low: toNumber(entry.rate_low),
        rate_high: toNumber(entry.rate_high),
        base_low: toNumber(entry.base_low),
        base_high: toNumber(entry.base_high),
        mult_low: toNumber(entry.mult_low),
        mult_high: toNumber(entry.mult_high),
        updated_at: now,
      }))
      .filter(
        (entry: { market: string; shipping_class: string }) =>
          entry.market && entry.shipping_class
      );

    if (upsertClasses.length > 0) {
      const { error } = await adminClient
        .from("b2b_pricing_shipping_classes")
        .upsert(upsertClasses, { onConflict: "market,shipping_class" });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
