import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { createServerSupabase } from "@/lib/supabase/server";

const HEADERS = [
  "Sales Channel ID",
  "Quantity",
  "Order number",
  "Customer Name",
  "Customer address",
  "Customer zip code",
  "Customer city",
  "Customer cell phone",
  "Sales Channel Readable name",
  "Customer email",
  "Marketplace order number",
  "Sales channel order number",
  "SKU",
  "Ignore",
  "Ignore2",
  "Transaction Date",
  "Sales value EUR",
  "Date shipped",
  "Ignore3",
  "Ignore4",
  "Ignore5",
  "Ignore6",
  "Ignore7",
  "Ignore8",
  "Tracking number",
];

type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;

type OrderRow = {
  id: string;
  sales_channel_id: string | null;
  order_number: string | null;
  sales_channel_name: string | null;
  customer_name: string | null;
  customer_address: string | null;
  customer_zip: string | null;
  customer_city: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  transaction_date: string | null;
  date_shipped: string | null;
};

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

const buildWorkbookResponse = async (
  adminClient: AdminClient,
  orderRows: OrderRow[]
) => {
  if (orderRows.length === 0) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Orders");
    sheet.addRow(HEADERS);
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="orders-export.xlsx"`,
      },
    });
  }

  const orderIdMap = new Map<string, OrderRow>();
  orderRows.forEach((order) => {
    if (!order.id) return;
    orderIdMap.set(order.id, order);
  });

  const orderIds = orderRows.map((order) => order.id).filter(Boolean) as string[];

  const { data: items, error: itemsError } = await adminClient
    .from("order_items_global")
    .select(
      "id,order_id,sku,quantity,sales_value_eur,marketplace_order_number,sales_channel_order_number,transaction_date,date_shipped"
    )
    .in("order_id", orderIds)
    .order("order_id", { ascending: true })
    .order("sku", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const { data: trackingRows, error: trackingError } = await adminClient
    .from("order_tracking_numbers_global")
    .select("order_id,tracking_number")
    .in("order_id", orderIds);

  if (trackingError) {
    return NextResponse.json({ error: trackingError.message }, { status: 500 });
  }

  const trackingMap = new Map<string, string[]>();
  (trackingRows ?? []).forEach((row) => {
    if (!row.order_id || !row.tracking_number) return;
    const list = trackingMap.get(row.order_id) ?? [];
    if (!list.includes(row.tracking_number)) {
      list.push(row.tracking_number);
    }
    trackingMap.set(row.order_id, list);
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Orders");
  sheet.addRow(HEADERS);

  (items ?? []).forEach((item) => {
    if (!item.order_id) return;
    const order = orderIdMap.get(item.order_id);
    if (!order) return;
    const trackingNumbers = trackingMap.get(item.order_id) ?? [];

    const row = [
      order.sales_channel_id ?? "",
      item.quantity ?? "",
      order.order_number ?? "",
      order.customer_name ?? "",
      order.customer_address ?? "",
      order.customer_zip ?? "",
      order.customer_city ?? "",
      order.customer_phone ?? "",
      order.sales_channel_name ?? "",
      order.customer_email ?? "",
      item.marketplace_order_number ?? "",
      item.sales_channel_order_number ?? "",
      item.sku ?? "",
      "",
      "",
      item.transaction_date ?? order.transaction_date ?? "",
      item.sales_value_eur ?? "",
      item.date_shipped ?? order.date_shipped ?? "",
      "",
      "",
      "",
      "",
      "",
      "",
      trackingNumbers.join(", "),
    ];

    sheet.addRow(row);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="orders-export.xlsx"`,
    },
  });
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

  let ordersQuery = adminClient
    .from("orders_global")
    .select(
      "id,sales_channel_id,order_number,sales_channel_name,customer_name,customer_address,customer_zip,customer_city,customer_phone,customer_email,transaction_date,date_shipped",
      { count: "exact" }
    )
    .order("transaction_date", { ascending: false })
    .order("order_number", { ascending: true });

  if (query) {
    const like = `%${query}%`;
    ordersQuery = ordersQuery.or(
      `sales_channel_id.ilike.${like},order_number.ilike.${like},sales_channel_name.ilike.${like},customer_name.ilike.${like},customer_email.ilike.${like}`
    );
  }
  if (transactionFrom) {
    ordersQuery = ordersQuery.gte("transaction_date", transactionFrom);
  }
  if (transactionTo) {
    ordersQuery = ordersQuery.lte("transaction_date", transactionTo);
  }
  if (shippedFrom) {
    ordersQuery = ordersQuery.gte("date_shipped", shippedFrom);
  }
  if (shippedTo) {
    ordersQuery = ordersQuery.lte("date_shipped", shippedTo);
  }

  const { data: orders, error: ordersError } = await ordersQuery;
  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  return buildWorkbookResponse(adminClient, (orders ?? []) as OrderRow[]);
}

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
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

  const { data: orders, error: ordersError } = await adminClient
    .from("orders_global")
    .select(
      "id,sales_channel_id,order_number,sales_channel_name,customer_name,customer_address,customer_zip,customer_city,customer_phone,customer_email,transaction_date,date_shipped",
      { count: "exact" }
    )
    .in("id", orderIds)
    .order("transaction_date", { ascending: false })
    .order("order_number", { ascending: true });

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  return buildWorkbookResponse(adminClient, (orders ?? []) as OrderRow[]);
}
