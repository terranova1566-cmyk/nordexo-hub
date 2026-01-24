import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const HEADER_MAP: Record<string, string> = {
  market: "market",
  "shipping class": "shipping_class",
  "shipping_class": "shipping_class",
  "rate low": "rate_low",
  "rate high": "rate_high",
  "base low": "base_low",
  "base high": "base_high",
  "mult low": "mult_low",
  "mult high": "mult_high",
};

const normalizeHeader = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

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
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

  const form = await request.formData();
  const file = form.get("workbook");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing workbook." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "Workbook is empty." }, { status: 400 });
  }

  const headerRow = sheet.getRow(1);
  const headerIndex = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    const key = normalizeHeader(String(cell.value ?? ""));
    const mapped = HEADER_MAP[key];
    if (mapped) headerIndex.set(mapped, col);
  });

  const required = [
    "market",
    "shipping_class",
    "rate_low",
    "rate_high",
    "base_low",
    "base_high",
    "mult_low",
    "mult_high",
  ];
  const missing = required.filter((key) => !headerIndex.has(key));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing columns: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const rows: Array<Record<string, unknown>> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const market = String(
      row.getCell(headerIndex.get("market")!).value ?? ""
    )
      .trim()
      .toUpperCase();
    const shippingClass = String(
      row.getCell(headerIndex.get("shipping_class")!).value ?? ""
    )
      .trim()
      .toUpperCase();
    if (!market || !shippingClass) return;
    rows.push({
      market,
      shipping_class: shippingClass,
      rate_low: toNumber(row.getCell(headerIndex.get("rate_low")!).value),
      rate_high: toNumber(row.getCell(headerIndex.get("rate_high")!).value),
      base_low: toNumber(row.getCell(headerIndex.get("base_low")!).value),
      base_high: toNumber(row.getCell(headerIndex.get("base_high")!).value),
      mult_low: toNumber(row.getCell(headerIndex.get("mult_low")!).value),
      mult_high: toNumber(row.getCell(headerIndex.get("mult_high")!).value),
      updated_at: new Date().toISOString(),
    });
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  }

  const { error } = await adminClient
    .from("b2b_pricing_shipping_classes")
    .upsert(rows, { onConflict: "market,shipping_class" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: rows.length });
}
