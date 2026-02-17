import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath } from "@/lib/drafts";
import { restoreDraftImageUndoBackup } from "@/lib/draft-image-undo";

export const runtime = "nodejs";

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const };
};

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const targetRelative = String(body.path || "").trim();
  if (!targetRelative) {
    return NextResponse.json({ error: "Missing path." }, { status: 400 });
  }

  const absolute = resolveDraftPath(targetRelative);
  if (!absolute || !absolute.startsWith(`${DRAFT_ROOT}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 });
  }

  try {
    restoreDraftImageUndoBackup(absolute);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to undo image change." },
      { status: 400 }
    );
  }

  const stat = fs.statSync(absolute);
  return NextResponse.json({
    ok: true,
    path: targetRelative,
    name: path.basename(absolute),
    size: stat.size,
    modifiedAt: new Date().toISOString(),
  });
}

