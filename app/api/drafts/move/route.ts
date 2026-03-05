import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";
import { moveDraftImageUpscaleMarkers } from "@/lib/draft-image-upscale";
import {
  clearDraftVariantImageLinksForMovedImage,
  createDraftAdminClient,
  repointDraftVariantImageLinksForMovedImage,
} from "@/lib/draft-variant-image-links";

export const runtime = "nodejs";

const normalizeRelativePath = (value: string) => value.replace(/\\/g, "/").replace(/^\/+/, "");

const isSafeRelativePath = (value: string) => {
  if (!value) return false;
  const normalized = normalizeRelativePath(value);
  if (!normalized) return false;
  if (normalized.includes("..")) return false;
  return true;
};

const ensureUniqueFileDestination = (initialPath: string) => {
  if (!fs.existsSync(initialPath)) return initialPath;
  const dir = path.dirname(initialPath);
  const ext = path.extname(initialPath);
  const base = ext ? path.basename(initialPath, ext) : path.basename(initialPath);
  let index = 2;
  while (true) {
    const candidate = path.join(dir, `${base}-${index}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    index += 1;
  }
};

const normalizeFolderToken = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const isDeletedImagesFolderToken = (value: string) => {
  const normalized = normalizeFolderToken(value);
  return normalized === "deletedimages" || normalized === "deletedimagesd";
};

const resolveDeletedImagesTargetFolder = (targetAbsolutePath: string) => {
  const folderName = path.basename(targetAbsolutePath);
  if (!isDeletedImagesFolderToken(folderName)) {
    return targetAbsolutePath;
  }
  const parentAbsolutePath = path.dirname(targetAbsolutePath);
  const candidates = ["deleted images", "Deleted Images (D)"];
  for (const candidate of candidates) {
    const candidateAbsolutePath = path.join(parentAbsolutePath, candidate);
    if (fs.existsSync(candidateAbsolutePath) && fs.statSync(candidateAbsolutePath).isDirectory()) {
      return candidateAbsolutePath;
    }
  }
  return path.join(parentAbsolutePath, "deleted images");
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
  const allowRenameOnConflict = Boolean(body?.allowRenameOnConflict);

  if (!isSafeRelativePath(sourcePath) || !isSafeRelativePath(targetPath)) {
    return NextResponse.json({ error: "Invalid source or target path." }, { status: 400 });
  }

  const sourceAbsolutePath = resolveDraftPath(sourcePath);
  const targetAbsolutePathRaw = resolveDraftPath(targetPath);

  if (
    !sourceAbsolutePath ||
    !targetAbsolutePathRaw ||
    !sourceAbsolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`) ||
    !targetAbsolutePathRaw.startsWith(`${DRAFT_ROOT}${path.sep}`)
  ) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  const targetAbsolutePath = resolveDeletedImagesTargetFolder(targetAbsolutePathRaw);
  if (!targetAbsolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`)) {
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
  const sourceRelativePath = toRelativePath(sourceAbsolutePath) || sourcePath;
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

  let finalDestinationAbsolutePath = destinationAbsolutePath;
  if (fs.existsSync(finalDestinationAbsolutePath)) {
    if (allowRenameOnConflict && sourceStat.isFile()) {
      finalDestinationAbsolutePath = ensureUniqueFileDestination(finalDestinationAbsolutePath);
    } else {
      return NextResponse.json({ error: "Destination already exists." }, { status: 409 });
    }
  }

  fs.renameSync(sourceAbsolutePath, finalDestinationAbsolutePath);
  if (sourceStat.isFile()) {
    moveDraftImageUpscaleMarkers(sourceAbsolutePath, finalDestinationAbsolutePath);
  }
  const destinationRelativePath =
    toRelativePath(finalDestinationAbsolutePath) ||
    `${targetPath}/${path.basename(finalDestinationAbsolutePath)}`;

  let unlockedVariantLinks = 0;
  let remappedVariantLinks = 0;
  let unlockVariantLinksError: string | null = null;
  if (sourceStat.isFile()) {
    try {
      const adminClient = createDraftAdminClient();
      const repointed = await repointDraftVariantImageLinksForMovedImage({
        sourcePath: sourceRelativePath,
        destinationPath: destinationRelativePath,
        adminClient: adminClient ?? undefined,
      });
      remappedVariantLinks = repointed.updatedCount;
      const cleared = await clearDraftVariantImageLinksForMovedImage({
        sourcePath: sourceRelativePath,
        destinationPath: destinationRelativePath,
        adminClient: adminClient ?? undefined,
      });
      unlockedVariantLinks = cleared.clearedCount;
    } catch (err) {
      unlockVariantLinksError =
        err instanceof Error ? err.message : "Unable to unlock variant links.";
    }
  }

  return NextResponse.json({
    ok: true,
    path: destinationRelativePath,
    name: path.basename(finalDestinationAbsolutePath),
    unlockedVariantLinks,
    remappedVariantLinks,
    unlockVariantLinksError,
  });
}
