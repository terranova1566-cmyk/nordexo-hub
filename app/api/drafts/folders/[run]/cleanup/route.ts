import path from "path";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, safeRemoveDraftPath } from "@/lib/drafts";

export const runtime = "nodejs";

const escapeLikeToken = (value: string) => value.replace(/[%_]/g, "\\$&");

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

const toRelativeDraftFolder = (value: string) => {
  const raw = String(value || "");
  if (!raw) return "";
  const normalized = raw.replace(/^\/+/, "");
  const marker = "images/draft_products/";
  const idx = normalized.indexOf(marker);
  const relative = idx >= 0 ? normalized.slice(idx + marker.length) : normalized;
  return relative;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ run: string }> }
) {
  const { run } = await context.params;
  const folder = String(run || "").trim();
  if (!folder) {
    return NextResponse.json({ error: "Missing folder." }, { status: 400 });
  }
  if (folder.includes("/") || folder.includes("\\") || folder.includes("..")) {
    return NextResponse.json({ error: "Invalid folder." }, { status: 400 });
  }

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

  const prefix = `images/draft_products/${folder}/`;
  const escapedPrefix = escapeLikeToken(prefix);
  const escapedAlt = escapeLikeToken(`${folder}/`);
  const folderFilter = `draft_image_folder.like.${escapedPrefix}%,draft_image_folder.like.${escapedAlt}%`;

  const { data: scopedRows, error: scopedError } = await adminClient
    .from("draft_products")
    .select("draft_spu,draft_image_folder")
    .or(folderFilter);

  if (scopedError) {
    return NextResponse.json({ error: scopedError.message }, { status: 500 });
  }

  const scoped = (scopedRows ?? [])
    .map((row) => row as { draft_spu?: string | null; draft_image_folder?: string | null })
    .filter((row) => Boolean(row.draft_spu))
    .map((row) => ({
      draft_spu: row.draft_spu as string,
      draft_image_folder: row.draft_image_folder ?? null,
    }));

  const allowedSpus = Array.from(new Set(scoped.map((row) => row.draft_spu)));
  const allowedSet = new Set(allowedSpus);
  const requested = Array.from(new Set(spus)).filter((spu) => allowedSet.has(spu));

  if (requested.length === 0) {
    return NextResponse.json({ ok: true, deleted_products: 0, deleted_variants: 0, removed_folders: [] });
  }

  let deletedVariants = 0;
  const chunkSize = 200;
  for (let i = 0; i < requested.length; i += chunkSize) {
    const chunk = requested.slice(i, i + chunkSize);
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
    .in("draft_spu", requested);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const removedFolders: string[] = [];
  for (const row of scoped) {
    if (!requested.includes(row.draft_spu)) continue;
    const relativeFolder = row.draft_image_folder
      ? toRelativeDraftFolder(row.draft_image_folder)
      : `${folder}/${row.draft_spu}`;
    const absolute = resolveDraftPath(relativeFolder);
    if (!absolute) continue;
    if (!absolute.startsWith(`${DRAFT_ROOT}${path.sep}`)) continue;
    safeRemoveDraftPath(absolute);
    removedFolders.push(relativeFolder);
  }

  return NextResponse.json({
    ok: true,
    deleted_products: deletedProducts ?? 0,
    deleted_variants: deletedVariants,
    removed_folders: removedFolders,
  });
}

