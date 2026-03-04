import path from "path";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import { spawnSync } from "child_process";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const EXPORT_DIR = path.join(process.cwd(), "exports", "digideal");
const IMAGE_ROOT = "/srv/resources/media/images";
const CATALOG_ROOT =
  process.env.CATALOG_IMAGE_ROOT || "/srv/resources/media/images/catalog";

const sanitizeFilePart = (value: string) => {
  const sanitized = value
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "export";
};

const formatTimestamp = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const resolveImageFolder = (folder: string | null, spu: string | null) => {
  if (folder) {
    return folder.startsWith("/") ? folder : path.join(IMAGE_ROOT, folder);
  }
  if (spu) {
    return path.join(CATALOG_ROOT, spu);
  }
  return null;
};

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userSettings } = await supabase
    .from("partner_user_settings")
    .select("active_markets, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const activeMarkets = (
    userSettings?.active_markets && userSettings.active_markets.length > 0
      ? userSettings.active_markets
      : ["SE"]
  ).map((market: string) => market.toUpperCase());
  const isAdmin = Boolean(userSettings?.is_admin);

  if (!activeMarkets.includes("SE")) {
    return NextResponse.json(
      { error: "SE market is not enabled for this user." },
      { status: 403 }
    );
  }

  let requestedName = "";
  let listId: string | null = null;
  let imageMode = "all";
  try {
    const body = await request.json();
    if (body?.name) {
      requestedName = String(body.name).trim();
    }
    if (body?.listId) {
      listId = String(body.listId).trim() || null;
    }
    if (body?.imageMode) {
      imageMode = String(body.imageMode).trim().toLowerCase() || "all";
    }
  } catch {
    requestedName = "";
    listId = null;
  }

  if (!isAdmin && imageMode === "all") {
    imageMode = "original";
  }

  if (imageMode !== "all" && imageMode !== "original") {
    return NextResponse.json(
      { error: "Unsupported image export mode." },
      { status: 400 }
    );
  }

  const emailPrefix = user.email?.split("@")[0] ?? "export";
  const defaultName = `${emailPrefix} products ${new Date()
    .toISOString()
    .slice(0, 10)}`;
  const exportName = requestedName || defaultName;

  let listName: string | null = null;
  let productIds: string[] = [];

  if (listId) {
    const { data: listRow, error: listError } = await supabase
      .from("product_manager_wishlists")
      .select("id, name")
      .eq("id", listId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    if (!listRow) {
      return NextResponse.json({ error: "List not found." }, { status: 404 });
    }

    listName = listRow.name ?? null;

    const { data: listItems, error: listItemsError } = await supabase
      .from("product_manager_wishlist_items")
      .select("product_id")
      .eq("wishlist_id", listId);

    if (listItemsError) {
      return NextResponse.json({ error: listItemsError.message }, { status: 500 });
    }

    productIds = (listItems ?? [])
      .map((row) => row.product_id)
      .filter(Boolean) as string[];
  } else {
    const { data: savedRows, error: savedError } = await supabase
      .from("partner_saved_products")
      .select("product_id")
      .eq("user_id", user.id);

    if (savedError) {
      return NextResponse.json({ error: savedError.message }, { status: 500 });
    }

    productIds = (savedRows ?? []).map((row) => row.product_id);
  }

  productIds = Array.from(new Set(productIds));

  let productQuery = supabase
    .from("catalog_products")
    .select("id, spu, image_folder, nordic_partner_enabled")
    .in("id", productIds);

  if (!isAdmin) {
    productQuery = productQuery.eq("nordic_partner_enabled", true);
  }

  const { data: products, error: productError } = await productQuery;
  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  const entries =
    (products ?? [])
      .map((product) => {
        const folder = resolveImageFolder(product.image_folder, product.spu);
        if (!folder || !product.spu) return null;
        return { spu: product.spu, path: folder };
      })
      .filter(Boolean) ?? [];

  await fs.mkdir(EXPORT_DIR, { recursive: true });
  const timestamp = formatTimestamp();
  const filename = `digideal_${sanitizeFilePart(
    exportName
  )}_${timestamp}_${randomUUID().slice(0, 8)}.zip`;
  const storedPath = path.join("digideal", filename);
  const filePath = path.join(EXPORT_DIR, filename);

  const script = [
    "import zipfile, os",
    `entries = ${JSON.stringify(entries)}`,
    `zip_path = ${JSON.stringify(filePath)}`,
    `mode = ${JSON.stringify(imageMode)}`,
    "img_exts = {'.jpg','.jpeg','.png','.webp'}",
    "with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:",
    "  for entry in entries:",
    "    spu = entry.get('spu') or 'product'",
    "    folder = entry.get('path') or ''",
    "    if not folder or not os.path.isdir(folder):",
    "      continue",
    "    if mode == 'all':",
    "      for root, dirs, files in os.walk(folder):",
    "        for name in files:",
    "          full = os.path.join(root, name)",
    "          rel = os.path.relpath(full, folder)",
    "          arc = os.path.join(spu, rel)",
    "          zf.write(full, arcname=arc)",
    "    else:",
    "      video_dir = os.path.join(folder, 'video')",
    "      if os.path.isdir(video_dir):",
    "        for root, dirs, files in os.walk(video_dir):",
    "          for name in files:",
    "            full = os.path.join(root, name)",
    "            rel = os.path.relpath(full, video_dir)",
    "            arc = os.path.join(spu, 'video', rel)",
    "            zf.write(full, arcname=arc)",
    "      original_dir = os.path.join(folder, 'original')",
    "      source_dir = original_dir if os.path.isdir(original_dir) else folder",
    "      for name in os.listdir(source_dir):",
    "        full = os.path.join(source_dir, name)",
    "        if os.path.isdir(full):",
    "          continue",
    "        if name == 'media-manifest.json':",
    "          continue",
    "        ext = os.path.splitext(name)[1].lower()",
    "        if ext in img_exts:",
    "          arc = os.path.join(spu, name)",
    "          zf.write(full, arcname=arc)",
  ].join("\n");

  const res = spawnSync("python", ["-c", script]);
  if (res.status !== 0) {
    return NextResponse.json(
      { error: "Unable to create image export zip." },
      { status: 500 }
    );
  }

  const buffer = await fs.readFile(filePath);

  const { data: exportRow } = await supabase
    .from("partner_exports")
    .insert({
      status: "generated",
      file_path: storedPath,
      meta: {
        template: "digideal_images",
        export_name: exportName,
        image_mode: imageMode,
        product_count: productIds.length,
        spu_count: productIds.length,
        list_id: listId,
        list_name: listName,
      },
    })
    .select("id")
    .maybeSingle();

  if (exportRow?.id) {
    const exportItems = productIds.map((productId) => ({
      export_id: exportRow.id,
      product_id: productId,
    }));
    await supabase.from("partner_export_items").insert(exportItems);
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
