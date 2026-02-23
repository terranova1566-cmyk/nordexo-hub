import fs from "fs";
import path from "path";
import {
  restoreDraftImageUpscaleUndoMarker,
  saveDraftImageUpscaleUndoMarker,
} from "@/lib/draft-image-upscale";

const UNDO_FILE_SUFFIX = ".undo-last";

const buildUndoAbsolutePath = (imageAbsolutePath: string) => {
  const parsed = path.parse(imageAbsolutePath);
  return path.join(
    parsed.dir,
    `.${parsed.name}${UNDO_FILE_SUFFIX}${parsed.ext.toLowerCase()}`
  );
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

const createTempPath = (imageAbsolutePath: string, label: string) => {
  const parsed = path.parse(imageAbsolutePath);
  return path.join(
    parsed.dir,
    `.${parsed.name}${label}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 10)}.tmp${parsed.ext.toLowerCase()}`
  );
};

export const saveDraftImageUndoBackup = (imageAbsolutePath: string) => {
  if (!fs.existsSync(imageAbsolutePath) || !fs.statSync(imageAbsolutePath).isFile()) {
    throw new Error("Source image not found.");
  }

  const undoAbsolutePath = buildUndoAbsolutePath(imageAbsolutePath);
  const tempPath = createTempPath(imageAbsolutePath, ".undo-backup");
  fs.copyFileSync(imageAbsolutePath, tempPath);
  if (!replaceFileWithFallback(tempPath, undoAbsolutePath)) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup.
    }
    throw new Error("Unable to create undo backup.");
  }
  saveDraftImageUpscaleUndoMarker(imageAbsolutePath);
  return undoAbsolutePath;
};

export const restoreDraftImageUndoBackup = (imageAbsolutePath: string) => {
  const undoAbsolutePath = buildUndoAbsolutePath(imageAbsolutePath);
  if (!fs.existsSync(undoAbsolutePath) || !fs.statSync(undoAbsolutePath).isFile()) {
    throw new Error("No previous version is available for this image.");
  }

  const tempPath = createTempPath(imageAbsolutePath, ".undo-restore");
  fs.copyFileSync(undoAbsolutePath, tempPath);
  if (!replaceFileWithFallback(tempPath, imageAbsolutePath)) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup.
    }
    throw new Error("Unable to restore the previous image version.");
  }
  restoreDraftImageUpscaleUndoMarker(imageAbsolutePath);

  try {
    fs.unlinkSync(undoAbsolutePath);
  } catch {
    // Best-effort cleanup; successful restore is the primary goal.
  }
};
