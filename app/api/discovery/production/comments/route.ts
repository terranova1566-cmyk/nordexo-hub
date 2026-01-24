import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

const getAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

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

  return { ok: true, user, supabase };
};

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const provider = String(searchParams.get("provider") ?? "").trim();
  const productId = String(searchParams.get("product_id") ?? "").trim();
  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  const { data, error } = await adminClient
    .from("discovery_production_comments")
    .select("id, user_label, comment, created_at")
    .eq("provider", provider)
    .eq("product_id", productId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok || !adminCheck.user) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  let payload: { provider?: string; product_id?: string; comment?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const provider = String(payload?.provider ?? "").trim();
  const productId = String(payload?.product_id ?? "").trim();
  const rawComment =
    typeof payload?.comment === "string" ? payload.comment.trim() : "";
  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }
  if (!rawComment) {
    return NextResponse.json({ error: "Missing comment." }, { status: 400 });
  }

  let userLabel =
    adminCheck.user.email ?? adminCheck.user.id ?? "Unknown";
  const { data: settings } = await adminCheck.supabase
    .from("partner_user_settings")
    .select("full_name")
    .eq("user_id", adminCheck.user.id)
    .maybeSingle();
  if (settings?.full_name) {
    userLabel = settings.full_name;
  }

  const { data, error } = await adminCheck.supabase
    .from("discovery_production_comments")
    .insert({
      provider,
      product_id: productId,
      user_id: adminCheck.user.id,
      user_label: userLabel,
      comment: rawComment,
    })
    .select("id, user_label, comment, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}
