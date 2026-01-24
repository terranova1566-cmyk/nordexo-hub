import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";

export const runtime = "nodejs";

const isSafeName = (value: string) => {
  if (!value || value === "." || value === "..") return false;
  const base = path.basename(value);
  if (base !== value) return false;
  if (value.includes("/") || value.includes("\\")) return false;
  return true;
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

  return NextResponse.json({
    ok: true,
    name: newName,
    path: toRelativePath(dest),
  });
}
