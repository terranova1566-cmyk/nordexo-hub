import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath } from "@/lib/drafts";
import { convertBufferToJpeg } from "@/lib/image-jpeg";
import { runAutoCenterWhiteInPlace } from "@/lib/draft-ai-edits";
import { saveDraftImageUndoBackup } from "@/lib/draft-image-undo";
import { refreshDraftImageScoreByAbsolutePath } from "@/lib/draft-image-score";
import {
  clearDraftImageUpscaled,
  isDraftImageUpscaled,
} from "@/lib/draft-image-upscale";

export const runtime = "nodejs";

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const };
};

const isJpegExt = (ext: string) => {
  const lower = ext.toLowerCase();
  return lower === ".jpg" || lower === ".jpeg";
};

const replaceFileWithFallback = (sourcePath: string, targetPath: string) => {
  try {
    fs.renameSync(sourcePath, targetPath);
    return true;
  } catch {}
  try {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    fs.copyFileSync(sourcePath, targetPath);
    fs.unlinkSync(sourcePath);
    return true;
  } catch {
    return false;
  }
};

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const targetRelative = String(formData.get("path") || "").trim();
  const file = formData.get("file");
  if (!targetRelative) {
    return NextResponse.json({ error: "Missing path." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }

  const absolute = resolveDraftPath(targetRelative);
  if (!absolute || !absolute.startsWith(`${DRAFT_ROOT}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  if (!fs.existsSync(absolute)) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 });
  }
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const jpeg = await convertBufferToJpeg(buffer);
  const dir = path.dirname(absolute);
  fs.mkdirSync(dir, { recursive: true });

  const parsed = path.parse(absolute);
  const oldExt = parsed.ext || "";
  const nowIso = new Date().toISOString();

  let finalAbsolute = absolute;
  let finalRelative = targetRelative;

  // Our draft pipeline expects images to be stored as JPG. If the original file is
  // not a jpg/jpeg, write a sibling .jpg and remove the old file.
  if (!isJpegExt(oldExt)) {
    finalAbsolute = path.join(dir, `${parsed.name}.jpg`);
    const parts = targetRelative.split("/").filter(Boolean);
    finalRelative =
      (parts.length > 1 ? `${parts.slice(0, -1).join("/")}/` : "") + `${parsed.name}.jpg`;
  }

  const tempAbsolute = path.join(
    dir,
    `.${parsed.name}.photopea-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 10)}.tmp.jpg`
  );

  fs.writeFileSync(tempAbsolute, jpeg);
  try {
    // Always normalize Photopea saves through the auto-center white script.
    await runAutoCenterWhiteInPlace(tempAbsolute);
  } catch (err) {
    try {
      fs.unlinkSync(tempAbsolute);
    } catch {
      // Best-effort cleanup.
    }
    return NextResponse.json(
      {
        error: `Auto-center white failed after Photopea save: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      },
      { status: 400 }
    );
  }

  try {
    if (fs.existsSync(finalAbsolute) && fs.statSync(finalAbsolute).isFile()) {
      saveDraftImageUndoBackup(finalAbsolute);
    }
  } catch (err) {
    try {
      fs.unlinkSync(tempAbsolute);
    } catch {
      // Best-effort cleanup.
    }
    return NextResponse.json(
      {
        error: `Unable to create undo backup: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      },
      { status: 500 }
    );
  }

  if (!replaceFileWithFallback(tempAbsolute, finalAbsolute)) {
    try {
      fs.unlinkSync(tempAbsolute);
    } catch {
      // Best-effort cleanup.
    }
    return NextResponse.json({ error: "Unable to persist edited image." }, { status: 500 });
  }
  if (finalAbsolute !== absolute) {
    try {
      fs.unlinkSync(absolute);
    } catch {
      // Best-effort cleanup.
    }
  }
  clearDraftImageUpscaled(finalAbsolute);
  if (finalAbsolute !== absolute) {
    clearDraftImageUpscaled(absolute);
  }

  const finalStat = fs.statSync(finalAbsolute);
  let pixelQualityScore: number | null = null;
  let scoreRefreshError: string | null = null;
  try {
    const refreshed = await refreshDraftImageScoreByAbsolutePath(finalAbsolute);
    pixelQualityScore = refreshed.pixelQualityScore;
  } catch (err) {
    scoreRefreshError = err instanceof Error ? err.message : "score refresh failed";
  }
  return NextResponse.json({
    ok: true,
    oldPath: targetRelative,
    path: finalRelative.replace(/\\/g, "/"),
    name: path.basename(finalAbsolute),
    size: finalStat.size,
    modifiedAt: nowIso,
    pixelQualityScore,
    zimageUpscaled: isDraftImageUpscaled(finalAbsolute),
    scoreRefreshError,
  });
}
