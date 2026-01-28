import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveDraftPath, safeRemoveDraftPath } from "@/lib/drafts";

export const runtime = "nodejs";

const escapeLikeToken = (value: string) =>
  value.replace(/[%_]/g, "\\$&");

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

export async function DELETE(
  _request: Request,
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

  const absolutePath = resolveDraftPath(folder);
  if (!absolutePath) {
    return NextResponse.json({ error: "Invalid folder." }, { status: 400 });
  }

  const prefix = `images/draft_products/${folder}/`;
  const escapedPrefix = escapeLikeToken(prefix);
  const escapedAlt = escapeLikeToken(`${folder}/`);
  const folderFilter = `draft_image_folder.like.${escapedPrefix}%,draft_image_folder.like.${escapedAlt}%`;

  const { data: draftRows, error: draftError } = await adminClient
    .from("draft_products")
    .select("draft_spu")
    .or(folderFilter);

  if (draftError) {
    return NextResponse.json({ error: draftError.message }, { status: 500 });
  }

  const spus = Array.from(
    new Set(
      (draftRows ?? [])
        .map((row) => (row as { draft_spu?: string | null }).draft_spu)
        .filter(Boolean) as string[]
    )
  );

  let deletedVariants = 0;
  if (spus.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < spus.length; i += chunkSize) {
      const chunk = spus.slice(i, i + chunkSize);
      const { error: variantError, count } = await adminClient
        .from("draft_variants")
        .delete({ count: "exact" })
        .in("draft_spu", chunk);
      if (variantError) {
        return NextResponse.json(
          { error: variantError.message },
          { status: 500 }
        );
      }
      deletedVariants += count ?? 0;
    }
  }

  const { error: deleteError, count: deletedProducts } = await adminClient
    .from("draft_products")
    .delete({ count: "exact" })
    .or(folderFilter);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  safeRemoveDraftPath(absolutePath);

  return NextResponse.json({
    ok: true,
    deleted_products: deletedProducts ?? 0,
    deleted_variants: deletedVariants,
  });
}
