import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const { adminClient } = adminCheck;
  const { batchId } = await context.params;

  const { data: batch, error: batchError } = await adminClient
    .from("batch_image_editor_batches")
    .select("id,name,created_at,created_by,source_filename,source_sha256")
    .eq("id", batchId)
    .maybeSingle();

  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 500 });
  }

  if (!batch) {
    return NextResponse.json({ error: "Batch not found." }, { status: 404 });
  }

  const { data: items, error: itemsError } = await adminClient
    .from("batch_image_editor_batch_products")
    .select("product_id,position,done_at")
    .eq("batch_id", batchId)
    .order("position", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const productIds = (items ?? [])
    .map((row: any) => row.product_id)
    .filter(Boolean) as string[];

  const { data: products, error: productsError } = productIds.length
    ? await adminClient
        .from("catalog_products")
        .select("id,spu,title,image_folder,updated_at,created_at")
        .in("id", productIds)
    : { data: [], error: null };

  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }

  const productMap = new Map<string, any>();
  (products ?? []).forEach((product: any) => {
    if (!product?.id) return;
    productMap.set(String(product.id), product);
  });

  const hydrated = (items ?? []).map((item: any) => {
    const productId = String(item.product_id);
    const product = productMap.get(productId) ?? null;
    return {
      product_id: productId,
      position: item.position ?? null,
      done_at: item.done_at ?? null,
      product,
    };
  });

  return NextResponse.json({ batch, items: hydrated });
}
