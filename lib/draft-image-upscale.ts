import fs from "fs";
import path from "path";

const UPSCALE_MARKER_SUFFIX = ".zimage-upscaled";
const UPSCALE_MARKER_UNDO_SUFFIX = ".zimage-upscaled.undo-last";

const stripImageTagSuffixes = (fileName: string) => {
  const raw = String(fileName || "");
  if (!raw) return raw;
  const ext = path.extname(raw);
  const base = ext ? raw.slice(0, -ext.length) : raw;
  let cleanedBase = base.trim();
  let changed = true;
  while (changed) {
    changed = false;
    const noParen = cleanedBase
      .replace(/\s*\((?:MAIN|ENV|INF|VAR|DIGI)\)\s*$/i, "")
      .trim();
    if (noParen !== cleanedBase) {
      cleanedBase = noParen;
      changed = true;
      continue;
    }
    const noToken = cleanedBase
      .replace(/(?:[-_ ]+)(?:MAIN|ENV|INF|VAR|DIGI)\s*$/i, "")
      .trim();
    if (noToken !== cleanedBase) {
      cleanedBase = noToken;
      changed = true;
    }
  }
  return `${cleanedBase || base}${ext.toLowerCase()}`;
};

const buildUpscaleMarkerAbsolutePath = (
  imageAbsolutePath: string,
  kind: "current" | "undo" = "current"
) => {
  const normalizedName = stripImageTagSuffixes(path.basename(imageAbsolutePath));
  const suffix = kind === "undo" ? UPSCALE_MARKER_UNDO_SUFFIX : UPSCALE_MARKER_SUFFIX;
  return path.join(path.dirname(imageAbsolutePath), `.${normalizedName}${suffix}`);
};

const removeFileQuietly = (absolutePath: string) => {
  try {
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch {}
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

const persistMarker = (absolutePath: string) => {
  try {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, `${new Date().toISOString()}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
};

export const isDraftImageUpscaled = (imageAbsolutePath: string) =>
  fs.existsSync(buildUpscaleMarkerAbsolutePath(imageAbsolutePath, "current"));

export const markDraftImageUpscaled = (imageAbsolutePath: string) =>
  persistMarker(buildUpscaleMarkerAbsolutePath(imageAbsolutePath, "current"));

export const clearDraftImageUpscaled = (imageAbsolutePath: string) => {
  removeFileQuietly(buildUpscaleMarkerAbsolutePath(imageAbsolutePath, "current"));
};

export const saveDraftImageUpscaleUndoMarker = (imageAbsolutePath: string) => {
  const currentMarker = buildUpscaleMarkerAbsolutePath(imageAbsolutePath, "current");
  const undoMarker = buildUpscaleMarkerAbsolutePath(imageAbsolutePath, "undo");
  if (fs.existsSync(currentMarker)) {
    persistMarker(undoMarker);
    return;
  }
  removeFileQuietly(undoMarker);
};

export const restoreDraftImageUpscaleUndoMarker = (imageAbsolutePath: string) => {
  const currentMarker = buildUpscaleMarkerAbsolutePath(imageAbsolutePath, "current");
  const undoMarker = buildUpscaleMarkerAbsolutePath(imageAbsolutePath, "undo");
  if (fs.existsSync(undoMarker)) {
    persistMarker(currentMarker);
    removeFileQuietly(undoMarker);
    return;
  }
  removeFileQuietly(currentMarker);
};

export const moveDraftImageUpscaleMarkers = (
  sourceImageAbsolutePath: string,
  targetImageAbsolutePath: string
) => {
  const markerMoves: Array<["current" | "undo", string, string]> = [
    [
      "current",
      buildUpscaleMarkerAbsolutePath(sourceImageAbsolutePath, "current"),
      buildUpscaleMarkerAbsolutePath(targetImageAbsolutePath, "current"),
    ],
    [
      "undo",
      buildUpscaleMarkerAbsolutePath(sourceImageAbsolutePath, "undo"),
      buildUpscaleMarkerAbsolutePath(targetImageAbsolutePath, "undo"),
    ],
  ];

  for (const [, sourceMarkerPath, targetMarkerPath] of markerMoves) {
    if (!fs.existsSync(sourceMarkerPath)) continue;
    if (sourceMarkerPath === targetMarkerPath) continue;
    try {
      fs.mkdirSync(path.dirname(targetMarkerPath), { recursive: true });
    } catch {}
    if (!replaceFileWithFallback(sourceMarkerPath, targetMarkerPath)) {
      persistMarker(targetMarkerPath);
      removeFileQuietly(sourceMarkerPath);
    }
  }
};

export const copyDraftImageUpscaledMarker = (
  sourceImageAbsolutePath: string,
  targetImageAbsolutePath: string
) => {
  const sourceMarkerPath = buildUpscaleMarkerAbsolutePath(
    sourceImageAbsolutePath,
    "current"
  );
  const targetMarkerPath = buildUpscaleMarkerAbsolutePath(
    targetImageAbsolutePath,
    "current"
  );
  if (!fs.existsSync(sourceMarkerPath)) {
    removeFileQuietly(targetMarkerPath);
    return false;
  }
  return persistMarker(targetMarkerPath);
};
