import path from "node:path";
import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { PUBLIC_FILES_ROOT, ensureInsideRoot } from "@/lib/public-files";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const nowIso = new Date().toISOString();
  const { data, error } = await auth.supabase
    .from("partner_public_file_links")
    .select("id,file_path")
    .lt("retain_until", nowIso)
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  let deleted = 0;

  for (const row of rows) {
    const absolute = path.resolve(PUBLIC_FILES_ROOT, String(row.file_path || ""));
    if (ensureInsideRoot(absolute)) {
      try {
        await fs.unlink(absolute);
      } catch {}
    }

    const { error: deleteError } = await auth.supabase
      .from("partner_public_file_links")
      .delete()
      .eq("id", row.id);
    if (!deleteError) deleted += 1;
  }

  return NextResponse.json({ ok: true, scanned: rows.length, deleted });
}
