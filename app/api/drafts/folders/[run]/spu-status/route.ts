import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  computeDisplayPixelQualityScore,
  resolveDraftPath,
  toRelativePath,
} from "@/lib/drafts";

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

const TAG_REGEX = /(?:\(\s*(MAIN|ENV|VAR|INF|DIGI)\s*\)|(?:^|[-_ ])(MAIN|ENV|VAR|INF|DIGI)(?=$|[-_ .)]))/i;
const DIGI_REGEX = /(?:\(\s*DIGI\s*\)|(?:^|[-_ ])DIGI(?=$|[-_ .)]))/i;
const AI_STATE_FILE = ".ai-edits.json";
const IMAGE_SCORE_FILE_CANDIDATES = [
  "Files (F)/image_scores.json",
  "files/image_scores.json",
  "Files (F)/image_engine_v2/image_scores.json",
  "files/image_engine_v2/image_scores.json",
  "Files (F)/image-engine-v2/image_scores.json",
  "files/image-engine-v2/image_scores.json",
];
const MIN_IMAGE_DIMENSION_PX = 800;
const MIN_PIXEL_QUALITY_SCORE = 30;
const SQUARE_MARGIN_RATIO = 0.05;

const isChunksDirectory = (value: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "") === "chunks";

const isImageFileName = (name: string) =>
  IMAGE_EXTENSIONS.has(path.extname(String(name || "")).toLowerCase());

const hasPendingAiInFolder = (folderAbsPath: string) => {
  const statePath = path.join(folderAbsPath, AI_STATE_FILE);
  if (!fs.existsSync(statePath)) return false;
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw) as { edits?: unknown };
    return Array.isArray(parsed?.edits) && parsed.edits.length > 0;
  } catch {
    return false;
  }
};

const collectDirectChildDirs = (folderAbsPath: string) => {
  try {
    return fs
      .readdirSync(folderAbsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => path.join(folderAbsPath, entry.name));
  } catch {
    return [] as string[];
  }
};

const toFiniteNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const hasImageIssueBySignals = (row: Record<string, unknown>) => {
  const score = computeDisplayPixelQualityScore(row);
  if (score !== null && score < MIN_PIXEL_QUALITY_SCORE) {
    return true;
  }

  const width = toFiniteNumber(row.normalized_width) ?? toFiniteNumber(row.width);
  const height = toFiniteNumber(row.normalized_height) ?? toFiniteNumber(row.height);
  if (width !== null && height !== null && width > 0 && height > 0) {
    if (Math.min(width, height) < MIN_IMAGE_DIMENSION_PX) {
      return true;
    }
    const squareDelta = Math.abs(width - height) / Math.max(width, height);
    if (squareDelta > SQUARE_MARGIN_RATIO) {
      return true;
    }
    return false;
  }

  const aspectRatio = toFiniteNumber(row.aspect_ratio);
  if (aspectRatio !== null && aspectRatio > 0) {
    const squareDelta = Math.abs(aspectRatio - 1);
    if (squareDelta > SQUARE_MARGIN_RATIO) {
      return true;
    }
  }
  return false;
};

const collectScoreFiles = (foldersAbsPaths: string[]) => {
  const files = new Set<string>();
  for (const folderAbsPath of foldersAbsPaths) {
    for (const candidate of IMAGE_SCORE_FILE_CANDIDATES) {
      const scorePath = path.join(folderAbsPath, candidate);
      if (!fs.existsSync(scorePath)) continue;
      try {
        if (fs.statSync(scorePath).isFile()) {
          files.add(scorePath);
        }
      } catch {
        // Ignore stat failures and continue scanning.
      }
    }
  }
  return [...files];
};

const hasImageIssueInFolders = (foldersAbsPaths: string[]) => {
  const scoreFiles = collectScoreFiles(foldersAbsPaths);
  if (scoreFiles.length === 0) return false;

  for (const scoreFilePath of scoreFiles) {
    try {
      const raw = fs.readFileSync(scoreFilePath, "utf8");
      const parsed = JSON.parse(raw) as { images?: unknown };
      const images = Array.isArray(parsed?.images) ? parsed.images : [];
      for (const image of images) {
        if (!image || typeof image !== "object") continue;
        if (hasImageIssueBySignals(image as Record<string, unknown>)) {
          return true;
        }
      }
    } catch {
      // Ignore malformed score files for status rendering.
    }
  }

  return false;
};

const scanImageTagStatus = (foldersAbsPaths: string[]) => {
  let hasTaggedImage = false;
  let hasDigi = false;

  for (const folderAbsPath of foldersAbsPaths) {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(folderAbsPath, { withFileTypes: true });
    } catch {
      entries = [];
    }

    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith(".")) continue;
      if (!isImageFileName(entry.name)) continue;
      if (TAG_REGEX.test(entry.name)) hasTaggedImage = true;
      if (DIGI_REGEX.test(entry.name)) hasDigi = true;
      if (hasTaggedImage && hasDigi) break;
    }
    if (hasTaggedImage && hasDigi) break;
  }

  return { hasTaggedImage, hasDigi };
};

type SpuStatusItem = {
  name: string;
  path: string;
  hasPendingAi: boolean;
  hasDigi: boolean;
  hasTaggedImage: boolean;
  hasImageIssue: boolean;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ run: string }> }
) {
  const { run } = await context.params;
  const runPath = String(run || "").trim();
  if (!runPath) {
    return NextResponse.json({ error: "Missing run." }, { status: 400 });
  }
  if (runPath.includes("/") || runPath.includes("\\") || runPath.includes("..")) {
    return NextResponse.json({ error: "Invalid run." }, { status: 400 });
  }

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

  const runAbsPath = resolveDraftPath(runPath);
  if (!runAbsPath) {
    return NextResponse.json({ error: "Invalid run." }, { status: 400 });
  }
  if (!fs.existsSync(runAbsPath)) {
    return NextResponse.json({ items: [] });
  }
  if (!fs.statSync(runAbsPath).isDirectory()) {
    return NextResponse.json({ error: "Not a folder." }, { status: 400 });
  }

  const spuDirs = fs
    .readdirSync(runAbsPath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        !isChunksDirectory(entry.name)
    )
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

  const items: SpuStatusItem[] = [];
  for (const spuDir of spuDirs) {
    const spuAbsPath = path.join(runAbsPath, spuDir.name);
    const childFolders = collectDirectChildDirs(spuAbsPath);
    const foldersToScan = [spuAbsPath, ...childFolders];

    const { hasTaggedImage, hasDigi } = scanImageTagStatus(foldersToScan);
    const hasImageIssue = hasImageIssueInFolders(foldersToScan);
    let hasPendingAi = false;
    for (const folderAbsPath of foldersToScan) {
      if (hasPendingAiInFolder(folderAbsPath)) {
        hasPendingAi = true;
        break;
      }
    }

    items.push({
      name: spuDir.name,
      path: toRelativePath(spuAbsPath),
      hasPendingAi,
      hasDigi,
      hasTaggedImage,
      hasImageIssue,
    });
  }

  return NextResponse.json({ items });
}
