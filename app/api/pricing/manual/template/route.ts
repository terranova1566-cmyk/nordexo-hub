import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

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

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pricing");
  sheet.addRow([
    "SPU",
    "SKU",
    "Short Title",
    "Shipping Class",
    "Weight (kg)",
    "Stock",
    "B2B SE",
    "B2B NO",
    "B2B DK",
    "B2B FI",
    "B2C",
    "Shopify Tingelo Price",
    "Shopify Tingelo Compare",
    "Shopify Wellando Price",
    "Shopify Wellando Compare",
    "Shopify Sparklar Price",
    "Shopify Sparklar Compare",
    "Shopify Price",
    "Shopify Compare",
  ]);

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"pricing-import-template.xlsx\"`,
    },
  });
}
