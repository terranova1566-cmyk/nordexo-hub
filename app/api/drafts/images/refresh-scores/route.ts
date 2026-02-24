import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";
import { refreshDraftImageScoreByAbsolutePath } from "@/lib/draft-image-score";

export const runtime = "nodejs";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".tif",
  ".tiff",
]);

const isImageAbsolutePath = (absolutePath: string) =>
  IMAGE_EXTENSIONS.has(path.extname(absolutePath).toLowerCase());

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

const normalizePathList = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
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

  const relativePaths = normalizePathList(body.paths).slice(0, 240);
  if (relativePaths.length === 0) {
    return NextResponse.json({ refreshedScores: [], errors: [] });
  }

  const refreshedScores: Array<{ path: string; pixelQualityScore: number | null }> = [];
  const errors: Array<{ path: string; error: string }> = [];

  for (const relativePath of relativePaths) {
    const absolute = resolveDraftPath(relativePath);
    if (
      !absolute ||
      (!absolute.startsWith(`${DRAFT_ROOT}${path.sep}`) && absolute !== DRAFT_ROOT) ||
      !isImageAbsolutePath(absolute)
    ) {
      errors.push({ path: relativePath, error: "Invalid image path." });
      continue;
    }
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      errors.push({ path: relativePath, error: "Image not found." });
      continue;
    }

    try {
      const refreshed = await refreshDraftImageScoreByAbsolutePath(absolute);
      refreshedScores.push({
        path: toRelativePath(absolute),
        pixelQualityScore: refreshed.pixelQualityScore,
      });
    } catch (err) {
      errors.push({
        path: relativePath,
        error: err instanceof Error ? err.message : "Unable to refresh score.",
      });
    }
  }

  return NextResponse.json({
    refreshedScores,
    errors,
  });
}
