import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

const IMAGE_ROOT = "/srv/resources/media/images";
const SIZE_DIRS = ["", "standard", "small", "thumb", "original"] as const;

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

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function safeUnlink(filePath: string) {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err: any) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

function resolveFolderPath(imageFolder: string | null) {
  if (!imageFolder) return null;
  const folderPath = imageFolder.startsWith("/")
    ? imageFolder
    : path.join(IMAGE_ROOT, imageFolder);
  if (!folderPath.startsWith(IMAGE_ROOT)) return null;
  return folderPath;
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const { adminClient } = adminCheck;
  const { productId } = await context.params;

  const { data: product, error: productError } = await adminClient
    .from("catalog_products")
    .select("id,spu")
    .eq("id", productId)
    .maybeSingle();

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  const { data: roles, error } = await adminClient
    .from("batch_image_editor_image_roles")
    .select("filename,role,updated_at")
    .eq("product_id", productId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const spu = (product as any)?.spu ? String((product as any).spu) : null;
  const { data: legacyTags, error: legacyError } = spu
    ? await adminClient
        .from("batch_image_editor_legacy_image_tags")
        .select("filename,decision_tags,checked_at,decision")
        .eq("spu", spu)
    : { data: [], error: null };

  if (legacyError) {
    return NextResponse.json({ error: legacyError.message }, { status: 500 });
  }

  return NextResponse.json({
    roles: roles ?? [],
    legacy_tags: legacyTags ?? [],
    spu,
  });
}

type ActionPayload =
  | { action: "delete_images"; filenames: string[] }
  | { action: "set_main"; filename: string }
  | { action: "set_role"; role: string; filenames: string[] }
  | { action: "clear_role"; role: string; filenames?: string[] }
  | { action: "assign_variant_image"; variant_ids: string[]; filename: string }
  | { action: "clear_variant_image"; variant_ids: string[] };

export async function POST(
  request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const { adminClient, userId } = adminCheck;
  const { productId } = await context.params;

  let payload: ActionPayload | null = null;
  try {
    payload = (await request.json()) as ActionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || !("action" in payload)) {
    return NextResponse.json({ error: "Missing action." }, { status: 400 });
  }

  const { data: product, error: productError } = await adminClient
    .from("catalog_products")
    .select("id,image_folder")
    .eq("id", productId)
    .maybeSingle();

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }
  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const folderPath = resolveFolderPath((product as any).image_folder ?? null);

  if (payload.action === "delete_images") {
    const filenames = Array.isArray(payload.filenames) ? payload.filenames : [];
    if (!filenames.length) {
      return NextResponse.json(
        { error: "Missing filenames." },
        { status: 400 }
      );
    }
    if (!folderPath) {
      return NextResponse.json(
        { error: "Product is missing a local image folder." },
        { status: 400 }
      );
    }

    const safeNames = filenames.map((name) => path.basename(String(name)));
    let removed = 0;

    for (const name of safeNames) {
      for (const dir of SIZE_DIRS) {
        const fullPath = path.join(folderPath, dir, name);
        const didRemove = await safeUnlink(fullPath);
        if (didRemove) removed += 1;
      }
    }

    // Avoid broken variant thumbnails after deletion.
    for (const part of chunk(safeNames, 100)) {
      await adminClient
        .from("catalog_variants")
        .update({ variant_image_url: null })
        .eq("product_id", productId)
        .in("variant_image_url", part);

      await adminClient
        .from("batch_image_editor_image_roles")
        .delete()
        .eq("product_id", productId)
        .in("filename", part);
    }

    return NextResponse.json({ ok: true, removed_files: removed });
  }

  if (payload.action === "set_main") {
    const filename = path.basename(String(payload.filename ?? ""));
    if (!filename) {
      return NextResponse.json({ error: "Missing filename." }, { status: 400 });
    }
    if (!folderPath) {
      return NextResponse.json(
        { error: "Product is missing a local image folder." },
        { status: 400 }
      );
    }

    const base = `main_${filename}`;
    let target = base;

    const wouldCollide = await Promise.all(
      ["standard", ""].map((dir) => exists(path.join(folderPath, dir, target)))
    );
    if (wouldCollide.some(Boolean)) {
      target = `main_${Date.now()}_${filename}`;
    }

    let renamedAny = false;
    for (const dir of SIZE_DIRS) {
      const from = path.join(folderPath, dir, filename);
      const to = path.join(folderPath, dir, target);
      if (!(await exists(from))) continue;
      await fs.rename(from, to);
      renamedAny = true;
    }

    if (!renamedAny) {
      return NextResponse.json(
        { error: "File not found on disk." },
        { status: 404 }
      );
    }

    // Keep variant locks pointing at the renamed file.
    await adminClient
      .from("catalog_variants")
      .update({ variant_image_url: target })
      .eq("product_id", productId)
      .eq("variant_image_url", filename);

    // Enforce single "main" per product.
    await adminClient
      .from("batch_image_editor_image_roles")
      .delete()
      .eq("product_id", productId)
      .eq("role", "main");

    // Preserve any existing tags for this image by moving them to the new filename.
    await adminClient
      .from("batch_image_editor_image_roles")
      .update({
        filename: target,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("product_id", productId)
      .eq("filename", filename);

    // Store role for the new filename.
    await adminClient
      .from("batch_image_editor_image_roles")
      .upsert(
        {
          product_id: productId,
          filename: target,
          role: "main",
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: "product_id,filename,role" }
      );

    // Remove any old role rows that were not migrated (defensive).
    await adminClient
      .from("batch_image_editor_image_roles")
      .delete()
      .eq("product_id", productId)
      .eq("filename", filename);

    return NextResponse.json({ ok: true, filename: target });
  }

  if (payload.action === "set_role") {
    const role = String(payload.role ?? "").trim().toLowerCase();
    const filenames = Array.isArray(payload.filenames) ? payload.filenames : [];
    if (!role) {
      return NextResponse.json({ error: "Missing role." }, { status: 400 });
    }
    if (!filenames.length) {
      return NextResponse.json({ error: "Missing filenames." }, { status: 400 });
    }

    const safeNames = filenames.map((name) => path.basename(String(name)));
    const rows = safeNames.map((name) => ({
      product_id: productId,
      filename: name,
      role,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    }));

    for (const part of chunk(rows, 500)) {
      const { error } = await adminClient
        .from("batch_image_editor_image_roles")
        .upsert(part, { onConflict: "product_id,filename,role" });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  }

  if (payload.action === "clear_role") {
    const role = String(payload.role ?? "").trim().toLowerCase();
    const filenames = Array.isArray((payload as any).filenames)
      ? ((payload as any).filenames as string[])
      : [];
    if (!role) {
      return NextResponse.json({ error: "Missing role." }, { status: 400 });
    }

    let q = adminClient
      .from("batch_image_editor_image_roles")
      .delete()
      .eq("product_id", productId)
      .eq("role", role);

    if (filenames.length > 0) {
      const safeNames = filenames.map((name) => path.basename(String(name)));
      q = q.in("filename", safeNames);
    }

    const { error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (payload.action === "assign_variant_image") {
    const filename = path.basename(String(payload.filename ?? ""));
    const variantIds = Array.isArray(payload.variant_ids) ? payload.variant_ids : [];
    if (!filename) {
      return NextResponse.json({ error: "Missing filename." }, { status: 400 });
    }
    if (!variantIds.length) {
      return NextResponse.json(
        { error: "Missing variant_ids." },
        { status: 400 }
      );
    }

    const { error } = await adminClient
      .from("catalog_variants")
      .update({ variant_image_url: filename })
      .eq("product_id", productId)
      .in("id", variantIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (payload.action === "clear_variant_image") {
    const variantIds = Array.isArray(payload.variant_ids) ? payload.variant_ids : [];
    if (!variantIds.length) {
      return NextResponse.json(
        { error: "Missing variant_ids." },
        { status: 400 }
      );
    }

    const { error } = await adminClient
      .from("catalog_variants")
      .update({ variant_image_url: null })
      .eq("product_id", productId)
      .in("id", variantIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
