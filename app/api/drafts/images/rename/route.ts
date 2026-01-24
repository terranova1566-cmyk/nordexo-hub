import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";

export const runtime = "nodejs";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const isSafeName = (value: string) => {
  if (!value || value === "." || value === "..") return false;
  const base = path.basename(value);
  if (base !== value) return false;
  if (value.includes("/") || value.includes("\\")) return false;
  return true;
};

const normalizeForMatch = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

const replaceFilename = (value: string | null, from: string, to: string) => {
  if (!value) return value;
  if (value === from) return to;
  if (value.endsWith(`/${from}`) || value.endsWith(`\\${from}`)) {
    return value.slice(0, value.length - from.length) + to;
  }
  return value;
};

const replaceFilenameInArray = (value: string[] | null, from: string, to: string) => {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => replaceFilename(entry, from, to) ?? entry);
};

const hasFilename = (value: string[] | null, name: string) => {
  if (!Array.isArray(value)) return false;
  return value.some(
    (entry) =>
      entry === name ||
      entry.endsWith(`/${name}`) ||
      entry.endsWith(`\\${name}`)
  );
};

const replaceTail = (value: string | null, nextName: string) => {
  if (!value) return nextName;
  const normalized = value.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx === -1) return nextName;
  const prefix = value.slice(0, value.length - (normalized.length - idx - 1));
  return `${prefix}${nextName}`;
};

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

const appendAuditLog = (payload: {
  spu: string;
  oldName: string;
  newName: string;
  userId: string | null;
  userEmail: string | null;
}) => {
  const logDir = path.join(process.cwd(), "logs");
  const logPath = path.join(logDir, "draft-image-rename.log");
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      logPath,
      `${new Date().toISOString()} ${JSON.stringify(payload)}\n`
    );
  } catch {}
};

const getColorSe = (raw: Record<string, unknown> | null | undefined) => {
  if (!raw || typeof raw !== "object") return "";
  const value = (raw as Record<string, unknown>).variation_color_se;
  if (value == null) return "";
  return String(value).trim();
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

  const body = await request.json().catch(() => ({}));
  const relativePath = String(body?.path || "").trim();
  const newName = String(body?.name || "").trim();

  if (!relativePath || !newName) {
    return NextResponse.json({ error: "Missing path or name." }, { status: 400 });
  }
  if (!isSafeName(newName)) {
    return NextResponse.json({ error: "Invalid name." }, { status: 400 });
  }

  const absolute = resolveDraftPath(relativePath);
  if (!absolute || !absolute.startsWith(`${DRAFT_ROOT}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }
  if (!fs.existsSync(absolute)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const stat = fs.statSync(absolute);
  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file." }, { status: 400 });
  }

  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length < 3) {
    return NextResponse.json(
      { error: "Only draft product images can be renamed." },
      { status: 400 }
    );
  }

  const spu = parts[1];
  if (!spu) {
    return NextResponse.json({ error: "Missing SPU." }, { status: 400 });
  }

  const oldName = path.basename(absolute);
  const oldExt = path.extname(oldName).toLowerCase();
  const newExt = path.extname(newName).toLowerCase();

  if (!IMAGE_EXTENSIONS.has(oldExt)) {
    return NextResponse.json(
      { error: "Only image files can be renamed here." },
      { status: 400 }
    );
  }
  if (!newExt || newExt !== oldExt) {
    return NextResponse.json(
      { error: "File extension must stay the same." },
      { status: 400 }
    );
  }
  if (!newName.toUpperCase().startsWith(`${spu.toUpperCase()}-`)) {
    return NextResponse.json(
      { error: `Filename must start with ${spu}-` },
      { status: 400 }
    );
  }

  const dest = path.join(path.dirname(absolute), newName);
  if (!dest.startsWith(`${DRAFT_ROOT}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid destination." }, { status: 400 });
  }
  if (dest === absolute) {
    return NextResponse.json({ ok: true, name: newName, path: relativePath });
  }
  if (fs.existsSync(dest)) {
    return NextResponse.json({ error: "Name already exists." }, { status: 409 });
  }

  fs.renameSync(absolute, dest);

  const revertRename = () => {
    try {
      if (fs.existsSync(dest)) {
        fs.renameSync(dest, absolute);
      }
    } catch {}
  };

  try {
    const { data: product, error: productError } = await adminClient
      .from("draft_products")
      .select(
        "id,draft_spu,draft_image_files,draft_variant_image_files,draft_image_urls,draft_variant_image_urls,draft_main_image_url"
      )
      .eq("draft_spu", spu)
      .maybeSingle();

    if (productError || !product) {
      revertRename();
      return NextResponse.json(
        { error: productError?.message || "Draft product not found." },
        { status: 500 }
      );
    }

    const updatedProduct: Record<string, unknown> = {};
    const nextImageFiles = replaceFilenameInArray(
      product.draft_image_files,
      oldName,
      newName
    );
    const nextVariantImageFiles = replaceFilenameInArray(
      product.draft_variant_image_files,
      oldName,
      newName
    );
    const nextImageUrls = replaceFilenameInArray(
      product.draft_image_urls,
      oldName,
      newName
    );
    const nextVariantImageUrls = replaceFilenameInArray(
      product.draft_variant_image_urls,
      oldName,
      newName
    );
    const nextMainImageUrl = replaceFilename(
      product.draft_main_image_url,
      oldName,
      newName
    );

    if (
      JSON.stringify(nextImageFiles) !== JSON.stringify(product.draft_image_files)
    ) {
      updatedProduct.draft_image_files = nextImageFiles;
    }
    if (
      JSON.stringify(nextVariantImageFiles) !==
      JSON.stringify(product.draft_variant_image_files)
    ) {
      updatedProduct.draft_variant_image_files = nextVariantImageFiles;
    }
    if (
      JSON.stringify(nextImageUrls) !== JSON.stringify(product.draft_image_urls)
    ) {
      updatedProduct.draft_image_urls = nextImageUrls;
    }
    if (
      JSON.stringify(nextVariantImageUrls) !==
      JSON.stringify(product.draft_variant_image_urls)
    ) {
      updatedProduct.draft_variant_image_urls = nextVariantImageUrls;
    }
    if (nextMainImageUrl !== product.draft_main_image_url) {
      updatedProduct.draft_main_image_url = nextMainImageUrl;
    }

    const isVariantFile =
      hasFilename(product.draft_variant_image_files, oldName) ||
      hasFilename(product.draft_variant_image_urls, oldName) ||
      oldName.toUpperCase().includes("VAR");

    const { data: variants, error: variantError } = await adminClient
      .from("draft_variants")
      .select("id,draft_variant_image_url,draft_raw_row")
      .eq("draft_spu", spu);

    if (variantError) {
      revertRename();
      return NextResponse.json({ error: variantError.message }, { status: 500 });
    }

    const normalizedNewName = normalizeForMatch(newName);
    const variantUpdates: Array<{ id: string; url: string | null }> = [];
    const originalVariantUrls = new Map<string, string | null>();

    (variants || []).forEach((row) => {
      const currentUrl = row.draft_variant_image_url as string | null;
      originalVariantUrls.set(row.id as string, currentUrl ?? null);
      let nextUrl = replaceFilename(currentUrl, oldName, newName);
      const color = normalizeForMatch(getColorSe(row.draft_raw_row));
      const colorMatch =
        isVariantFile && color.length > 0 && normalizedNewName.includes(color);
      if (colorMatch) {
        nextUrl = replaceTail(currentUrl, newName);
      }
      if (nextUrl !== currentUrl) {
        variantUpdates.push({ id: row.id as string, url: nextUrl });
      }
    });

    const updatedVariantIds: string[] = [];
    try {
      for (const update of variantUpdates) {
        const { error: updateError } = await adminClient
          .from("draft_variants")
          .update({ draft_variant_image_url: update.url })
          .eq("id", update.id);
        if (updateError) throw updateError;
        updatedVariantIds.push(update.id);
      }

      if (Object.keys(updatedProduct).length > 0) {
        const { error: updateError } = await adminClient
          .from("draft_products")
          .update(updatedProduct)
          .eq("id", product.id);
        if (updateError) throw updateError;
      }
    } catch (updateError) {
      const rollbackVariantIds = updatedVariantIds.length
        ? updatedVariantIds
        : [];
      for (const id of rollbackVariantIds) {
        const originalUrl = originalVariantUrls.get(id) ?? null;
        try {
          await adminClient
            .from("draft_variants")
            .update({ draft_variant_image_url: originalUrl })
            .eq("id", id);
        } catch {}
      }
      if (Object.keys(updatedProduct).length > 0) {
        try {
          await adminClient
            .from("draft_products")
            .update({
              draft_image_files: product.draft_image_files,
              draft_variant_image_files: product.draft_variant_image_files,
              draft_image_urls: product.draft_image_urls,
              draft_variant_image_urls: product.draft_variant_image_urls,
              draft_main_image_url: product.draft_main_image_url,
            })
            .eq("id", product.id);
        } catch {}
      }
      revertRename();
      return NextResponse.json(
        { error: (updateError as Error).message || "Update failed." },
        { status: 500 }
      );
    }

    try {
      const { error: auditError } = await adminClient
        .from("draft_image_rename_audit")
        .insert({
          draft_spu: spu,
          old_name: oldName,
          new_name: newName,
          user_id: user.id,
          user_email: user.email,
        });
      if (auditError) {
        throw auditError;
      }
    } catch {}

    appendAuditLog({
      spu,
      oldName,
      newName,
      userId: user.id,
      userEmail: user.email ?? null,
    });
  } catch (error) {
    revertRename();
    return NextResponse.json(
      { error: (error as Error).message || "Rename failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    name: newName,
    path: toRelativePath(dest),
  });
}
