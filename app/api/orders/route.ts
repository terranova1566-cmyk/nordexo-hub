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

export async function GET(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const adminClient = adminCheck.adminClient as AdminClient;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const transactionFrom = searchParams.get("transaction_from")?.trim();
  const transactionTo = searchParams.get("transaction_to")?.trim();
  const shippedFrom = searchParams.get("shipped_from")?.trim();
  const shippedTo = searchParams.get("shipped_to")?.trim();

  let supabaseQuery = adminClient
    .from("orders_global")
    .select(
      "id,sales_channel_id,order_number,sales_channel_name,customer_name,customer_email,customer_city,customer_zip,transaction_date,date_shipped,created_at",
      { count: "exact" }
    )
    .order("transaction_date", { ascending: false })
    .order("order_number", { ascending: true });

  if (query) {
    const like = `%${query}%`;
    supabaseQuery = supabaseQuery.or(
      `sales_channel_id.ilike.${like},order_number.ilike.${like},sales_channel_name.ilike.${like},customer_name.ilike.${like},customer_email.ilike.${like}`
    );
  }

  if (transactionFrom) {
    supabaseQuery = supabaseQuery.gte("transaction_date", transactionFrom);
  }
  if (transactionTo) {
    supabaseQuery = supabaseQuery.lte("transaction_date", transactionTo);
  }
  if (shippedFrom) {
    supabaseQuery = supabaseQuery.gte("date_shipped", shippedFrom);
  }
  if (shippedTo) {
    supabaseQuery = supabaseQuery.lte("date_shipped", shippedTo);
  }

  const { data, error, count } = await supabaseQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [], count });
}

export async function DELETE(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const adminClient = adminCheck.adminClient as AdminClient;
  let payload: { ids?: string[] } | null = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const ids = Array.isArray(payload?.ids) ? payload?.ids : [];
  const orderIds = Array.from(
    new Set(ids.map((id) => String(id).trim()).filter(Boolean))
  );

  if (orderIds.length === 0) {
    return NextResponse.json(
      { error: "Missing order ids." },
      { status: 400 }
    );
  }

  const { error: itemsError } = await adminClient
    .from("order_items_global")
    .delete()
    .in("order_id", orderIds);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const { error: trackingError } = await adminClient
    .from("order_tracking_numbers_global")
    .delete()
    .in("order_id", orderIds);

  if (trackingError) {
    return NextResponse.json({ error: trackingError.message }, { status: 500 });
  }

  const { error: ordersError } = await adminClient
    .from("orders_global")
    .delete()
    .in("id", orderIds);

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: orderIds.length });
}
