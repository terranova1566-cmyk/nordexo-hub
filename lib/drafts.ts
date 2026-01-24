import fs from "fs";
import path from "path";

export const DRAFT_ROOT = "/srv/resources/media/images/draft_products";

export type DraftEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  modifiedAt: string;
};

const normalizeRelative = (value: string) => {
  const trimmed = value.replace(/^\/+/, "");
  return trimmed.replace(/\.\.+/g, "");
};

export const resolveDraftPath = (relativePath: string) => {
  const safeRel = normalizeRelative(relativePath);
  const target = path.resolve(DRAFT_ROOT, safeRel);
  if (!target.startsWith(`${DRAFT_ROOT}${path.sep}`) && target !== DRAFT_ROOT) {
    return null;
  }
  return target;
};

export const toRelativePath = (absolutePath: string) => {
  const rel = path.relative(DRAFT_ROOT, absolutePath);
  return rel.split(path.sep).join("/");
};

export const listFolders = (): DraftEntry[] => {
  if (!fs.existsSync(DRAFT_ROOT)) return [];
  const entries = fs.readdirSync(DRAFT_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = path.join(DRAFT_ROOT, entry.name);
      const stat = fs.statSync(full);
      return {
        name: entry.name,
        path: entry.name,
        type: "dir" as const,
        size: 0,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
};

export const listEntries = (relativePath: string): DraftEntry[] => {
  const absolute = resolveDraftPath(relativePath);
  if (!absolute) return [];
  if (!fs.existsSync(absolute)) return [];
  const entries = fs.readdirSync(absolute, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => {
      const full = path.join(absolute, entry.name);
      const stat = fs.statSync(full);
      return {
        name: entry.name,
        path: toRelativePath(full),
        type: entry.isDirectory() ? ("dir" as const) : ("file" as const),
        size: entry.isDirectory() ? 0 : stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
};

export const safeRemoveDraftPath = (absolutePath: string) => {
  try {
    if (!fs.existsSync(absolutePath)) return;
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      fs.rmSync(absolutePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(absolutePath);
    }
  } catch {
    return;
  }
};
