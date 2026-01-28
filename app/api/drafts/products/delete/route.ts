import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { removeSpuFolders } from "@/lib/drafts";

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

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  let payload: { spus?: string[] };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const spus = Array.isArray(payload?.spus)
    ? payload.spus.map((spu) => String(spu ?? "").trim()).filter(Boolean)
    : [];

  if (spus.length === 0) {
    return NextResponse.json({ error: "Missing spus." }, { status: 400 });
  }

  let deletedVariants = 0;
  const chunkSize = 200;
  for (let i = 0; i < spus.length; i += chunkSize) {
    const chunk = spus.slice(i, i + chunkSize);
    const { error: variantError, count } = await adminClient
      .from("draft_variants")
      .delete({ count: "exact" })
      .in("draft_spu", chunk);
    if (variantError) {
      return NextResponse.json({ error: variantError.message }, { status: 500 });
    }
    deletedVariants += count ?? 0;
  }

  const { error: deleteError, count: deletedProducts } = await adminClient
    .from("draft_products")
    .delete({ count: "exact" })
    .in("draft_spu", spus);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const removedFolders = removeSpuFolders(spus);

  return NextResponse.json({
    ok: true,
    deleted_products: deletedProducts ?? 0,
    deleted_variants: deletedVariants,
    removed_folders: removedFolders,
  });
}
