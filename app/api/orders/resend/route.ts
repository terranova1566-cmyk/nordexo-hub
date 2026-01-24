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

  const adminClient = getAdminClient();
  if (!adminClient) {
    return {
      ok: false,
      status: 500,
      error: "Server is missing Supabase credentials.",
    };
  }

  return { ok: true, adminClient };
};

const toInt = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok || !adminCheck.adminClient) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const { adminClient } = adminCheck;
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const transactionFrom = searchParams.get("transaction_from")?.trim();
  const transactionTo = searchParams.get("transaction_to")?.trim();

  let supabaseQuery = adminClient
    .from("orders_global_resend")
    .select(
      "id,sales_channel_id,order_number,sales_channel_name,customer_name,customer_email,customer_city,customer_zip,transaction_date,created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
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

  const { data, error, count } = await supabaseQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [], count });
}

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok || !adminCheck.adminClient) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const { adminClient } = adminCheck;
  let payload: Record<string, unknown> | null = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  if (!payload) {
    return NextResponse.json({ error: "Missing payload." }, { status: 400 });
  }

  const orderNumberRaw = String(payload.order_number ?? "").trim();
  const salesChannelId = String(payload.sales_channel_id ?? "").trim();
  if (!orderNumberRaw || !salesChannelId) {
    return NextResponse.json(
      { error: "Missing order number or sales channel id." },
      { status: 400 }
    );
  }
  const orderNumber = orderNumberRaw.endsWith("-RS")
    ? orderNumberRaw
    : `${orderNumberRaw}-RS`;

  const insertOrder = {
    source_order_id: payload.source_order_id ?? null,
    sales_channel_id: salesChannelId,
    order_number: orderNumber,
    sales_channel_name: payload.sales_channel_name ?? null,
    customer_name: payload.customer_name ?? null,
    customer_address: payload.customer_address ?? null,
    customer_zip: payload.customer_zip ?? null,
    customer_city: payload.customer_city ?? null,
    customer_phone: payload.customer_phone ?? null,
    customer_email: payload.customer_email ?? null,
    transaction_date: payload.transaction_date || null,
    resend_comment: payload.resend_comment ?? payload.comment ?? null,
    status: "pending",
    raw_row: payload,
  };

  const { data: orderRow, error: orderError } = await adminClient
    .from("orders_global_resend")
    .insert(insertOrder)
    .select("id")
    .single();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  const orderId = orderRow?.id;
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (items.length > 0) {
    const insertItems = items.map((item) => ({
      order_resend_id: orderId,
      source_order_item_id: toInt(item.source_item_id),
      sales_channel_id: salesChannelId,
      order_number: orderNumber,
      sku: item.sku ?? null,
      title: item.title ?? null,
      quantity: toInt(item.quantity),
      sales_value_eur: toNumber(item.price),
      transaction_date: payload.transaction_date || null,
      raw_row: item,
    }));

    const { error: itemsError } = await adminClient
      .from("order_items_global_resend")
      .insert(insertItems);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: orderId });
}

export async function DELETE(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok || !adminCheck.adminClient) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const { adminClient } = adminCheck;
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
    .from("order_items_global_resend")
    .delete()
    .in("order_resend_id", orderIds);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const { error: ordersError } = await adminClient
    .from("orders_global_resend")
    .delete()
    .in("id", orderIds);

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: orderIds.length });
}
