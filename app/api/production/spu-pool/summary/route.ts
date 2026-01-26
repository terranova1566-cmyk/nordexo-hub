import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getAdminClient() {
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
}

type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;

const requireAdmin = async (): Promise<
  | { ok: false; status: number; error: string }
  | { ok: true; adminClient: AdminClient }
> => {
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

  const adminClient = getAdminClient();
  if (!adminClient) {
    return {
      ok: false,
      status: 500,
      error: "Server is missing Supabase credentials.",
    };
  }

  return { ok: true, adminClient: adminClient as AdminClient };
};

export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const adminClient = adminCheck.adminClient;
  const { count: totalCount, error: totalError } = await adminClient
    .from("production_spu_pool")
    .select("spu", { count: "exact", head: true });

  if (totalError) {
    return NextResponse.json({ error: totalError.message }, { status: 500 });
  }

  const { count: freeCount, error: freeError } = await adminClient
    .from("production_spu_pool")
    .select("spu", { count: "exact", head: true })
    .eq("status", "free");

  if (freeError) {
    return NextResponse.json({ error: freeError.message }, { status: 500 });
  }

  const { count: usedCount, error: usedError } = await adminClient
    .from("production_spu_pool")
    .select("spu", { count: "exact", head: true })
    .eq("status", "used");

  if (usedError) {
    return NextResponse.json({ error: usedError.message }, { status: 500 });
  }

  return NextResponse.json({
    totalCount: totalCount ?? 0,
    freeCount: freeCount ?? 0,
    usedCount: usedCount ?? 0,
  });
}
