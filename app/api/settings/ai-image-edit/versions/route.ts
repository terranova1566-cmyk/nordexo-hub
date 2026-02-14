import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TABLE = "ai_image_edit_prompt_versions";

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase,
    };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
      supabase,
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
    };
  }

  return { ok: true as const, supabase };
};

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const promptId =
    url.searchParams.get("prompt_id") ?? url.searchParams.get("promptId") ?? "";
  const id = String(promptId || "").trim();
  if (!id) {
    return NextResponse.json(
      { error: "prompt_id is required." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from(TABLE)
    .select("id,prompt_id,template_text,created_at")
    .eq("prompt_id", id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ versions: data ?? [] });
}

