import fs from "fs";
import path from "path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";
import { saveDraftImageUndoBackup } from "@/lib/draft-image-undo";
import { refreshDraftImageScoreByAbsolutePath } from "@/lib/draft-image-score";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const FIX_MONO_CONTRAST_SCRIPT = "/srv/nordexo-hub/scripts/fix-mono-contrast.mjs";
const MAX_BATCH_IMAGES = 8;

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

const clampLevelPercent = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
};

const clampQuality = (value: unknown) => {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 92;
  if (parsed < 1) return 1;
  if (parsed > 100) return 100;
  return parsed;
};

const mapBounds = (levelPercent: number) => {
  const t = levelPercent / 100;
  return {
    lower: Number((0.4 + 1.2 * t).toFixed(3)),
    upper: Number((99.6 - 1.2 * t).toFixed(3)),
  };
};

const normalizePathList = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map((item) =>
          String(item ?? "")
            .trim()
            .replace(/\\/g, "/")
            .replace(/^\/+/, "")
        )
        .filter(Boolean)
    )
  );
};

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

  const relativePaths = normalizePathList(body.paths).slice(0, MAX_BATCH_IMAGES);
  if (relativePaths.length === 0) {
    return NextResponse.json({ updated: [], errors: [] });
  }

  const levelPercent = clampLevelPercent(body.levelPercent);
  const quality = clampQuality(body.quality);
  const { lower, upper } = mapBounds(levelPercent);

  const updated: Array<{
    path: string;
    name: string;
    size: number;
    modifiedAt: string;
    pixelQualityScore: number | null;
  }> = [];
  const errors: Array<{ path: string; error: string }> = [];

  for (const relativePath of relativePaths) {
    const absolute = resolveDraftPath(relativePath);
    if (
      !absolute ||
      (!absolute.startsWith(`${DRAFT_ROOT}${path.sep}`) && absolute !== DRAFT_ROOT)
    ) {
      errors.push({ path: relativePath, error: "Invalid path outside draft root." });
      continue;
    }

    if (!IMAGE_EXTENSIONS.has(path.extname(absolute).toLowerCase())) {
      errors.push({ path: relativePath, error: "Unsupported image extension." });
      continue;
    }
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      errors.push({ path: relativePath, error: "Image not found." });
      continue;
    }

    try {
      saveDraftImageUndoBackup(absolute);

      await execFileAsync(
        process.execPath,
        [
          FIX_MONO_CONTRAST_SCRIPT,
          "--file",
          absolute,
          "--lower",
          String(lower),
          "--upper",
          String(upper),
          "--quality",
          String(quality),
        ],
        {
          cwd: "/srv/nordexo-hub",
          maxBuffer: 1024 * 1024,
        }
      );

      const stat = fs.statSync(absolute);
      let pixelQualityScore: number | null = null;
      try {
        const refreshed = await refreshDraftImageScoreByAbsolutePath(absolute);
        pixelQualityScore = refreshed.pixelQualityScore;
      } catch {
        pixelQualityScore = null;
      }

      updated.push({
        path: toRelativePath(absolute),
        name: path.basename(absolute),
        size: stat.size,
        modifiedAt: new Date(stat.mtimeMs).toISOString(),
        pixelQualityScore,
      });
    } catch (err) {
      errors.push({
        path: relativePath,
        error: err instanceof Error ? err.message : "Auto levels failed.",
      });
    }
  }

  return NextResponse.json({
    updated,
    errors,
    settings: {
      levelPercent,
      quality,
      lower,
      upper,
    },
  });
}

