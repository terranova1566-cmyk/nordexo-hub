import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";
import { moveDraftImageUpscaleMarkers } from "@/lib/draft-image-upscale";

export const runtime = "nodejs";

const normalizeRelativePath = (value: string) => value.replace(/\\/g, "/").replace(/^\/+/, "");

const isSafeRelativePath = (value: string) => {
  if (!value) return false;
  const normalized = normalizeRelativePath(value);
  if (!normalized) return false;
  if (normalized.includes("..")) return false;
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
  const sourcePath = normalizeRelativePath(String(body?.sourcePath || "").trim());
  const targetPath = normalizeRelativePath(String(body?.targetPath || "").trim());

  if (!isSafeRelativePath(sourcePath) || !isSafeRelativePath(targetPath)) {
    return NextResponse.json({ error: "Invalid source or target path." }, { status: 400 });
  }

  const sourceAbsolutePath = resolveDraftPath(sourcePath);
  const targetAbsolutePath = resolveDraftPath(targetPath);

  if (
    !sourceAbsolutePath ||
    !targetAbsolutePath ||
    !sourceAbsolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`) ||
    !targetAbsolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`)
  ) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  if (!fs.existsSync(sourceAbsolutePath)) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 });
  }

  if (!fs.existsSync(targetAbsolutePath)) {
    fs.mkdirSync(targetAbsolutePath, { recursive: true });
  } else if (!fs.statSync(targetAbsolutePath).isDirectory()) {
    return NextResponse.json({ error: "Target folder not found." }, { status: 404 });
  }

  if (sourceAbsolutePath === targetAbsolutePath) {
    return NextResponse.json({ error: "Source and target are the same." }, { status: 400 });
  }

  const sourceStat = fs.statSync(sourceAbsolutePath);
  if (sourceStat.isDirectory() && targetAbsolutePath.startsWith(`${sourceAbsolutePath}${path.sep}`)) {
    return NextResponse.json({ error: "Cannot move a folder into itself." }, { status: 400 });
  }

  const destinationAbsolutePath = path.join(
    targetAbsolutePath,
    path.basename(sourceAbsolutePath)
  );

  if (!destinationAbsolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid destination." }, { status: 400 });
  }

  if (destinationAbsolutePath === sourceAbsolutePath) {
    return NextResponse.json({ ok: true, path: sourcePath });
  }

  if (fs.existsSync(destinationAbsolutePath)) {
    return NextResponse.json({ error: "Destination already exists." }, { status: 409 });
  }

  fs.renameSync(sourceAbsolutePath, destinationAbsolutePath);
  if (sourceStat.isFile()) {
    moveDraftImageUpscaleMarkers(sourceAbsolutePath, destinationAbsolutePath);
  }

  return NextResponse.json({
    ok: true,
    path: toRelativePath(destinationAbsolutePath),
    name: path.basename(destinationAbsolutePath),
  });
}
