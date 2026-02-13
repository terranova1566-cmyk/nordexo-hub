import fs from "fs";
import fsPromises from "node:fs/promises";
import path from "path";

export const DRAFT_IMAGE_ORDER_MANIFEST_FILE = ".nordexo-image-order.json";

type DraftImageOrderManifest = {
  version: 1;
  updatedAt: string;
  order: string[];
};

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

const isImageFileName = (name: string) =>
  IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase());

const normalizeFileName = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const base = path.basename(raw);
  if (!base || base !== raw) return "";
  if (base.startsWith(".")) return "";
  return base;
};

export const normalizeImageOrderList = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  const out: string[] = [];
  value.forEach((entry) => {
    const name = normalizeFileName(entry);
    if (!name || !isImageFileName(name)) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  });
  return out;
};

const getManifestPath = (folderAbsolutePath: string) =>
  path.join(folderAbsolutePath, DRAFT_IMAGE_ORDER_MANIFEST_FILE);

const parseManifest = (raw: string) => {
  try {
    const parsed = JSON.parse(raw) as Partial<DraftImageOrderManifest>;
    return normalizeImageOrderList(parsed.order);
  } catch {
    return [] as string[];
  }
};

export const readDraftImageOrderSync = (folderAbsolutePath: string) => {
  const manifestPath = getManifestPath(folderAbsolutePath);
  if (!fs.existsSync(manifestPath)) return [] as string[];
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    return parseManifest(raw);
  } catch {
    return [] as string[];
  }
};

export const readDraftImageOrder = async (folderAbsolutePath: string) => {
  const manifestPath = getManifestPath(folderAbsolutePath);
  try {
    const raw = await fsPromises.readFile(manifestPath, "utf8");
    return parseManifest(raw);
  } catch {
    return [] as string[];
  }
};

const writeManifestSync = (folderAbsolutePath: string, order: string[]) => {
  const manifestPath = getManifestPath(folderAbsolutePath);
  if (order.length === 0) {
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
    }
    return;
  }
  const payload: DraftImageOrderManifest = {
    version: 1,
    updatedAt: new Date().toISOString(),
    order,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const writeManifest = async (folderAbsolutePath: string, order: string[]) => {
  const manifestPath = getManifestPath(folderAbsolutePath);
  if (order.length === 0) {
    try {
      await fsPromises.unlink(manifestPath);
    } catch {}
    return;
  }
  const payload: DraftImageOrderManifest = {
    version: 1,
    updatedAt: new Date().toISOString(),
    order,
  };
  await fsPromises.writeFile(
    manifestPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
};

export const writeDraftImageOrderSync = (
  folderAbsolutePath: string,
  order: string[]
) => {
  writeManifestSync(folderAbsolutePath, normalizeImageOrderList(order));
};

export const writeDraftImageOrder = async (
  folderAbsolutePath: string,
  order: string[]
) => {
  await writeManifest(folderAbsolutePath, normalizeImageOrderList(order));
};

export const applyDraftImageOrder = (imageNames: string[], order: string[]) => {
  if (!Array.isArray(imageNames) || imageNames.length === 0) return [] as string[];
  const normalizedOrder = normalizeImageOrderList(order);
  if (normalizedOrder.length === 0) {
    return [...imageNames].sort((a, b) => a.localeCompare(b));
  }

  const indexByName = new Map<string, number>();
  normalizedOrder.forEach((name, index) => {
    indexByName.set(name.toLowerCase(), index);
  });

  return [...imageNames].sort((left, right) => {
    const leftIndex = indexByName.get(left.toLowerCase());
    const rightIndex = indexByName.get(right.toLowerCase());
    const leftHas = leftIndex !== undefined;
    const rightHas = rightIndex !== undefined;
    if (leftHas && rightHas && leftIndex !== rightIndex) {
      return (leftIndex as number) - (rightIndex as number);
    }
    if (leftHas !== rightHas) return leftHas ? -1 : 1;
    return left.localeCompare(right);
  });
};

export const rewriteDraftImageOrderNamesSync = (
  folderAbsolutePath: string,
  renames: Record<string, string>
) => {
  const current = readDraftImageOrderSync(folderAbsolutePath);
  if (current.length === 0) return;
  const renameEntries = Object.entries(renames).filter(
    ([from, to]) => normalizeFileName(from) && normalizeFileName(to)
  );
  if (renameEntries.length === 0) return;
  const next = current.map((name) => {
    const found = renameEntries.find(
      ([from]) => from.toLowerCase() === name.toLowerCase()
    );
    return found ? found[1] : name;
  });
  writeManifestSync(folderAbsolutePath, normalizeImageOrderList(next));
};
