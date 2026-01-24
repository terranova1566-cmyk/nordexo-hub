import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { listEntries } from "@/lib/drafts";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ run: string }> }
) {
  const { run } = await context.params;
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

  const url = new URL(request.url);
  const subPath = url.searchParams.get("path") ?? "";
  const fullPath = [run, subPath].filter(Boolean).join("/");
  return NextResponse.json({
    path: fullPath,
    items: listEntries(fullPath),
  });
}

