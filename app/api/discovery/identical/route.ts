import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

type Payload = {
  provider?: unknown;
  product_id?: unknown;
  identical_spu?: unknown;
};

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

  const provider = String(payload?.provider ?? "").trim().toLowerCase();
  const productId = String(payload?.product_id ?? "").trim();
  const rawSpu =
    payload?.identical_spu === null || payload?.identical_spu === undefined
      ? null
      : String(payload.identical_spu).trim();
  const identicalSpu = rawSpu && rawSpu.length > 0 ? rawSpu : null;

  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  if (provider !== "cdon" && provider !== "fyndiq") {
    return NextResponse.json({ error: "Invalid provider." }, { status: 400 });
  }

  const table = provider === "cdon" ? "cdon_products" : "fyndiq_products";
  const { data, error } = await adminClient
    .from(table)
    .update({ identical_spu: identicalSpu })
    .eq("product_id", productId)
    .select("product_id, identical_spu")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    item: {
      provider,
      product_id: data.product_id,
      identical_spu: data.identical_spu ?? null,
    },
  });
}
