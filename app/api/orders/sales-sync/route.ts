import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

function getAdminClient() {
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
}

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_START_DATE = "2026-03-01";

function normalizeYmd(value: unknown) {
  const token = String(value ?? "").trim();
  if (!token) return null;
  return YMD_PATTERN.test(token) ? token : null;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = null;
  }

  const startDateRaw = payload?.start_date;
  const endDateRaw = payload?.end_date;

  const startDate = startDateRaw
    ? normalizeYmd(startDateRaw)
    : DEFAULT_START_DATE;
  if (!startDate) {
    return NextResponse.json(
      { error: "Invalid start_date. Use YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const endDate = endDateRaw ? normalizeYmd(endDateRaw) : null;
  if (endDateRaw && !endDate) {
    return NextResponse.json(
      { error: "Invalid end_date. Use YYYY-MM-DD." },
      { status: 400 }
    );
  }

  if (endDate && endDate < startDate) {
    return NextResponse.json(
      { error: "end_date must be on or after start_date." },
      { status: 400 }
    );
  }

  const { data, error } = await adminClient.rpc("legacy_sales_sync_orders_backfill", {
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const processed =
    typeof data === "number" && Number.isFinite(data) ? data : Number(data ?? 0);

  return NextResponse.json({
    ok: true,
    start_date: startDate,
    end_date: endDate,
    processed_count: Number.isFinite(processed) ? processed : 0,
  });
}
