import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import crypto from "crypto";

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
  | { ok: true; adminClient: AdminClient; userId: string }
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

  return { ok: true, adminClient: adminClient as AdminClient, userId: user.id };
};

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const { adminClient } = adminCheck;

  const { data: batches, error } = await adminClient
    .from("batch_image_editor_batches")
    .select("id,name,created_at,created_by,source_filename,source_sha256")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withCounts = await Promise.all(
    (batches ?? []).map(async (batch) => {
      const { count } = await adminClient
        .from("batch_image_editor_batch_products")
        .select("product_id", { count: "exact", head: true })
        .eq("batch_id", batch.id);
      return { ...batch, product_count: count ?? 0 };
    })
  );

  return NextResponse.json({ batches: withCounts });
}

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const { adminClient, userId } = adminCheck;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data." },
      { status: 400 }
    );
  }

  const rawName = String(form.get("name") ?? "").trim();
  const fileValue = form.get("file");
  if (!fileValue || typeof (fileValue as any).text !== "function") {
    return NextResponse.json({ error: "Missing TXT file." }, { status: 400 });
  }

  const file = fileValue as File;
  const sourceFilename = file.name ? String(file.name) : null;

  const rawText = await file.text();
  const normalizedText = rawText.replace(/\r\n/g, "\n");
  const sha256 = crypto.createHash("sha256").update(normalizedText).digest("hex");

  const inferredName = sourceFilename
    ? sourceFilename.replace(/\.[^.]+$/, "")
    : "";
  const name =
    rawName ||
    inferredName ||
    `Batch ${new Date().toISOString().slice(0, 10)}`;

  const rawLines = normalizedText.split("\n");
  const lines = rawLines
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const unique = Array.from(new Set(lines));
  const variantMap = new Map<string, string>();
  const spuMap = new Map<string, string>();

  if (unique.length > 0) {
    for (const part of chunk(unique, 200)) {
      const { data } = await adminClient
        .from("catalog_variants")
        .select("sku,product_id")
        .in("sku", part);

      (data ?? []).forEach((row: any) => {
        if (!row?.sku || !row?.product_id) return;
        variantMap.set(String(row.sku), String(row.product_id));
      });
    }

    const remainingForSpu = unique.filter(
      (value) => !variantMap.has(value) && !UUID_RE.test(value)
    );
    for (const part of chunk(remainingForSpu, 200)) {
      const { data } = await adminClient
        .from("catalog_products")
        .select("id,spu")
        .in("spu", part);

      (data ?? []).forEach((row: any) => {
        if (!row?.spu || !row?.id) return;
        spuMap.set(String(row.spu), String(row.id));
      });
    }
  }

  const uuidCandidates = unique.filter((value) => UUID_RE.test(value));
  const validProductIds = new Set<string>();
  for (const part of chunk(uuidCandidates, 200)) {
    const { data } = await adminClient
      .from("catalog_products")
      .select("id")
      .in("id", part);
    (data ?? []).forEach((row: any) => {
      if (!row?.id) return;
      validProductIds.add(String(row.id));
    });
  }

  const productIds: string[] = [];
  const seenProducts = new Set<string>();
  const unresolved: string[] = [];

  for (const line of lines) {
    const productId =
      variantMap.get(line) || spuMap.get(line) || (validProductIds.has(line) ? line : null);
    if (!productId) {
      unresolved.push(line);
      continue;
    }
    if (seenProducts.has(productId)) continue;
    seenProducts.add(productId);
    productIds.push(productId);
  }

  const { data: batch, error: batchError } = await adminClient
    .from("batch_image_editor_batches")
    .insert({
      name,
      created_by: userId,
      source_filename: sourceFilename,
      source_sha256: sha256,
    })
    .select("id,name,created_at,created_by,source_filename,source_sha256")
    .single();

  if (batchError || !batch) {
    return NextResponse.json(
      { error: batchError?.message ?? "Failed to create batch." },
      { status: 500 }
    );
  }

  const batchRows = productIds.map((productId, idx) => ({
    batch_id: (batch as any).id,
    product_id: productId,
    position: idx + 1,
  }));

  for (const part of chunk(batchRows, 500)) {
    const { error: insertError } = await adminClient
      .from("batch_image_editor_batch_products")
      .insert(part);

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    batch,
    inserted_products: productIds.length,
    unresolved_count: unresolved.length,
    unresolved_preview: unresolved.slice(0, 50),
  });
}
