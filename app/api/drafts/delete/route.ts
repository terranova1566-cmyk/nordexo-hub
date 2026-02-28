import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveDraftPath, safeRemoveDraftPath } from "@/lib/drafts";
import { archiveDraftImageVersion } from "@/lib/draft-image-versions";
import {
  clearDraftVariantImageLinksForRemovedImage,
  createDraftAdminClient,
} from "@/lib/draft-variant-image-links";

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

const isImageFileName = (value: string) =>
  IMAGE_EXTENSIONS.has(path.extname(String(value || "")).toLowerCase());

const toDraftRelativePath = (absolutePath: string) => {
  const marker = "/draft_products/";
  const normalized = String(absolutePath || "").replace(/\\/g, "/");
  const index = normalized.indexOf(marker);
  if (index < 0) return "";
  return normalized.slice(index + marker.length).replace(/^\/+/, "");
};

const collectImageRelativePathsForDeletion = (absolutePath: string) => {
  const out: string[] = [];
  if (!fs.existsSync(absolutePath)) return out;
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) {
    const fileName = path.basename(absolutePath);
    if (!fileName.startsWith(".") && isImageFileName(fileName)) {
      const relative = toDraftRelativePath(absolutePath);
      if (relative) out.push(relative);
    }
    return out;
  }

  if (!stat.isDirectory()) return out;
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach((entry) => {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        return;
      }
      if (!entry.isFile()) return;
      if (entry.name.startsWith(".") || !isImageFileName(entry.name)) return;
      const relative = toDraftRelativePath(abs);
      if (relative) out.push(relative);
    });
  };
  walk(absolutePath);
  return out;
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
  const removedImagePaths = new Set<string>();

  paths.forEach((relativePath) => {
    const resolved = resolveDraftPath(String(relativePath));
    if (!resolved) {
      invalid.push(String(relativePath));
      return;
    }
    collectImageRelativePathsForDeletion(resolved).forEach((pathValue) =>
      removedImagePaths.add(pathValue)
    );
    try {
      archiveDraftImageVersion({
        imageAbsolutePath: resolved,
        reason: "before-delete",
      });
    } catch {
      // Best effort; do not block delete if archive copy fails.
    }
    safeRemoveDraftPath(resolved);
    deleted += 1;
  });

  let unlockedVariantLinks = 0;
  const unlockErrors: string[] = [];
  if (removedImagePaths.size > 0) {
    const adminClient = createDraftAdminClient();
    if (!adminClient) {
      unlockErrors.push("Server is missing Supabase credentials.");
    } else {
      for (const relativePath of removedImagePaths) {
        try {
          const cleared = await clearDraftVariantImageLinksForRemovedImage({
            relativePath,
            adminClient,
          });
          unlockedVariantLinks += cleared.clearedCount;
        } catch (err) {
          unlockErrors.push(
            err instanceof Error ? err.message : "Unable to unlock variant links."
          );
        }
      }
    }
  }

  return NextResponse.json({
    deleted,
    invalid,
    unlockedVariantLinks,
    unlockErrors: Array.from(new Set(unlockErrors)).slice(0, 10),
  });
}
