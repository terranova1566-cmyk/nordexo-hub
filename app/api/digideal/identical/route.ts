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
    return { ok: false, status: 401, error: "Unauthorized" as const };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return { ok: false, status: 403, error: "Forbidden" as const };
  }

  return { ok: true, user };
};

type Payload = {
  product_id?: string;
  identical_spu?: string | null;
};

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

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const productId = String(payload?.product_id ?? "").trim();
  if (!productId) {
    return NextResponse.json({ error: "Missing product_id." }, { status: 400 });
  }

  const identicalSpuRaw = payload?.identical_spu;
  const identicalSpu =
    typeof identicalSpuRaw === "string" ? identicalSpuRaw.trim() : null;
  const normalizedSpu = identicalSpu ? identicalSpu.toUpperCase() : null;

  if (normalizedSpu) {
    const { data: existsRow, error: existsError } = await adminClient
      .from("catalog_products")
      .select("id, spu")
      .eq("spu", normalizedSpu)
      .maybeSingle();

    if (existsError) {
      return NextResponse.json({ error: existsError.message }, { status: 500 });
    }

    if (!existsRow) {
      return NextResponse.json({ error: "SPU not found." }, { status: 400 });
    }
  }

  const { data, error } = await adminClient
    .from("digideal_products")
    .update({ identical_spu: normalizedSpu && normalizedSpu.length ? normalizedSpu : null })
    .eq("product_id", productId)
    .select("product_id, identical_spu")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  return NextResponse.json({
    item: {
      product_id: data.product_id,
      identical_spu: data.identical_spu ?? null,
    },
  });
}
