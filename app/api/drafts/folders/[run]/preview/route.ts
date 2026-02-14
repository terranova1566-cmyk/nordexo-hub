import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

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

export async function GET(
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

  const prefix = `images/draft_products/${folder}/`;
  const escapedPrefix = escapeLikeToken(prefix);
  const escapedAlt = escapeLikeToken(`${folder}/`);
  const folderFilter = `draft_image_folder.like.${escapedPrefix}%,draft_image_folder.like.${escapedAlt}%`;

  const { data, error } = await adminClient
    .from("draft_products")
    .select(
      "draft_spu,draft_mf_product_long_title,draft_title,draft_main_image_url,draft_image_folder"
    )
    .or(folderFilter);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? [])
    .map((row) => row as Record<string, unknown>)
    .map((row) => ({
      draft_spu: String(row.draft_spu ?? ""),
      title: String(row.draft_mf_product_long_title ?? row.draft_title ?? ""),
      draft_main_image_url: row.draft_main_image_url
        ? String(row.draft_main_image_url)
        : null,
      draft_image_folder: row.draft_image_folder ? String(row.draft_image_folder) : null,
    }))
    .filter((row) => Boolean(row.draft_spu))
    .sort((a, b) => a.draft_spu.localeCompare(b.draft_spu));

  return NextResponse.json({ ok: true, items });
}

