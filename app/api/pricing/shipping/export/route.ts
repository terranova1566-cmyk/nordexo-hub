import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
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

  const { data, error } = await adminClient
    .from("b2b_pricing_shipping_classes")
    .select(
      "market, shipping_class, rate_low, rate_high, base_low, base_high, mult_low, mult_high"
    )
    .order("market", { ascending: true })
    .order("shipping_class", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Shipping Classes");
  sheet.columns = [
    { header: "Market", key: "market", width: 12 },
    { header: "Shipping Class", key: "shipping_class", width: 16 },
    { header: "Rate Low", key: "rate_low", width: 12 },
    { header: "Rate High", key: "rate_high", width: 12 },
    { header: "Base Low", key: "base_low", width: 12 },
    { header: "Base High", key: "base_high", width: 12 },
    { header: "Mult Low", key: "mult_low", width: 12 },
    { header: "Mult High", key: "mult_high", width: 12 },
  ];

  (data ?? []).forEach((row) => {
    sheet.addRow({
      market: row.market,
      shipping_class: row.shipping_class,
      rate_low: row.rate_low,
      rate_high: row.rate_high,
      base_low: row.base_low,
      base_high: row.base_high,
      mult_low: row.mult_low,
      mult_high: row.mult_high,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"b2b-shipping-classes.xlsx\"",
    },
  });
}
