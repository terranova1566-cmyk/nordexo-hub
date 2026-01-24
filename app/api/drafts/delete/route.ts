import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveDraftPath, safeRemoveDraftPath } from "@/lib/drafts";

export const runtime = "nodejs";

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

  let payload: { paths?: string[] };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const paths = Array.isArray(payload?.paths) ? payload.paths : [];
  if (paths.length === 0) {
    return NextResponse.json({ error: "No paths provided." }, { status: 400 });
  }

  let deleted = 0;
  const invalid: string[] = [];

  paths.forEach((relativePath) => {
    const resolved = resolveDraftPath(String(relativePath));
    if (!resolved) {
      invalid.push(String(relativePath));
      return;
    }
    safeRemoveDraftPath(resolved);
    deleted += 1;
  });

  return NextResponse.json({ deleted, invalid });
}

