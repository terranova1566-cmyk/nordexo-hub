import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { recalculateB2BPricesForSpus } from "@/lib/pricing/recalculate-b2b-spus";
import { recalculateB2CPricesForSpus } from "@/lib/pricing/recalculate-b2c-spus";

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

const loadAllSpus = async (
  adminClient: NonNullable<ReturnType<typeof getAdminClient>>
) => {
  const seen = new Set<string>();
  const pageSize = 2000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await adminClient
      .from("catalog_products")
      .select("spu")
      .order("id", { ascending: true })
      .range(from, to);
    if (error) {
      throw new Error(`Unable to load catalog products: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    data.forEach((row) => {
      const spu = String(row.spu || "").trim();
      if (spu) seen.add(spu);
    });
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return Array.from(seen);
};

export async function POST() {
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

  let spus: string[] = [];
  try {
    spus = await loadAllSpus(adminClient);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }

  if (spus.length === 0) {
    return NextResponse.json({
      ok: true,
      totalSpus: 0,
      processedVariants: 0,
      skippedVariants: 0,
      updatedRows: 0,
      updatedVariantPrices: 0,
      b2b: {
        consideredVariants: 0,
        processedVariants: 0,
        skippedVariants: 0,
        updatedRows: 0,
      },
      b2c: {
        consideredVariants: 0,
        processedVariants: 0,
        skippedVariants: 0,
        updatedRows: 0,
        updatedVariantPrices: 0,
      },
    });
  }

  let b2bResult: Awaited<ReturnType<typeof recalculateB2BPricesForSpus>>;
  try {
    b2bResult = await recalculateB2BPricesForSpus(adminClient, spus);
  } catch (error) {
    return NextResponse.json(
      { error: `B2B recalc failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }

  let b2cResult: Awaited<ReturnType<typeof recalculateB2CPricesForSpus>>;
  try {
    b2cResult = await recalculateB2CPricesForSpus(adminClient, spus);
  } catch (error) {
    return NextResponse.json(
      { error: `B2C recalc failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    totalSpus: spus.length,
    processedVariants: Math.max(
      b2bResult.processedVariants,
      b2cResult.processedVariants
    ),
    skippedVariants: Math.max(
      b2bResult.skippedVariants,
      b2cResult.skippedVariants
    ),
    updatedRows: b2bResult.updatedRows + b2cResult.updatedRows,
    updatedVariantPrices: b2cResult.updatedVariantPrices,
    b2b: b2bResult,
    b2c: b2cResult,
  });
}
