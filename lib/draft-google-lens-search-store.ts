import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";

export type StoredLensSearchResultItem = {
  rank: number;
  source: string | null;
  websiteName: string | null;
  title: string | null;
  link: string | null;
  thumbnail: string | null;
  image: string | null;
  sourceIcon: string | null;
  sourceDomain: string | null;
  exactMatches: unknown[] | null;
  serpapiExactMatchesLink: string | null;
  metadata: Record<string, unknown> | null;
  originalImage: string | null;
  originalWidth: number | null;
  originalHeight: number | null;
  domain: string | null;
  isAmazon: boolean;
  bucket: "visualMatches" | "imageResults" | "inlineImages";
};

export type StoredLensSearchRecord = {
  version: 1;
  imageHash: string;
  linkedPaths: string[];
  createdAt: string;
  updatedAt: string;
  sourceImagePath: string | null;
  sourceImageUrl: string | null;
  searchId: string | null;
  serpApiSearchId: string | null;
  providerCreatedAt: string | null;
  requestedLimit: number | null;
  serviceOptions: Record<string, unknown> | null;
  inputPayload: Record<string, unknown> | null;
  debugPayload: Record<string, unknown> | null;
  items: StoredLensSearchResultItem[];
  amazonLinks: string[];
  error: string | null;
};

type SaveRecordInput = {
  imagePath: string;
  sourceImagePath?: string | null;
  sourceImageUrl?: string | null;
  searchId?: string | null;
  serpApiSearchId?: string | null;
  providerCreatedAt?: string | null;
  requestedLimit?: number | null;
  serviceOptions?: Record<string, unknown> | null;
  inputPayload?: Record<string, unknown> | null;
  debugPayload?: Record<string, unknown> | null;
  items?: StoredLensSearchResultItem[];
  amazonLinks?: string[];
  error?: string | null;
};

type StoredRecordLookup = {
  imagePath: string;
  imageHash: string;
  record: StoredLensSearchRecord | null;
};

const STORE_ROOT = path.join(DRAFT_ROOT, ".draftx", "google-lens");
const STORE_RECORDS_DIR = path.join(STORE_ROOT, "records");

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const toStringOrNull = (value: unknown) => {
  const normalized = normalizeText(value);
  return normalized || null;
};

const toNumberOrNull = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeImageItem = (
  value: unknown
): StoredLensSearchResultItem | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const bucketRaw = normalizeText(row.bucket).toLowerCase();
  let bucket: "visualMatches" | "imageResults" | "inlineImages" = "imageResults";
  if (bucketRaw === "inlineimages") {
    bucket = "inlineImages";
  } else if (bucketRaw === "visualmatches") {
    bucket = "visualMatches";
  }
  const exactMatches = Array.isArray(row.exactMatches)
    ? (row.exactMatches as unknown[])
    : null;
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;
  const image = toStringOrNull(row.image) || toStringOrNull(row.originalImage);
  return {
    rank: toNumberOrNull(row.rank) ?? 0,
    source: toStringOrNull(row.source),
    websiteName: toStringOrNull(row.websiteName),
    title: toStringOrNull(row.title),
    link: toStringOrNull(row.link),
    thumbnail: toStringOrNull(row.thumbnail),
    image,
    sourceIcon: toStringOrNull(row.sourceIcon),
    sourceDomain: toStringOrNull(row.sourceDomain),
    exactMatches,
    serpapiExactMatchesLink: toStringOrNull(row.serpapiExactMatchesLink),
    metadata,
    originalImage: image,
    originalWidth: toNumberOrNull(row.originalWidth ?? row.imageWidth),
    originalHeight: toNumberOrNull(row.originalHeight ?? row.imageHeight),
    domain: toStringOrNull(row.domain),
    isAmazon: Boolean(row.isAmazon),
    bucket,
  };
};

const normalizeLinkedPaths = (values: string[]) =>
  Array.from(
    new Set(
      values
        .map((value) => normalizeText(value).replace(/\\/g, "/"))
        .filter(Boolean)
    )
  ).slice(0, 64);

const normalizeAmazonLinks = (values: unknown) => {
  if (!Array.isArray(values)) return [] as string[];
  return Array.from(
    new Set(values.map((value) => normalizeText(value)).filter(Boolean))
  ).slice(0, 256);
};

const normalizeRecord = (value: unknown): StoredLensSearchRecord | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const imageHash = normalizeText(row.imageHash);
  if (!imageHash) return null;
  const linkedPathsRaw = Array.isArray(row.linkedPaths) ? row.linkedPaths : [];
  const linkedPaths = normalizeLinkedPaths(linkedPathsRaw.map((entry) => String(entry || "")));
  const itemsRaw = Array.isArray(row.items) ? row.items : [];
  const items = itemsRaw
    .map((item) => normalizeImageItem(item))
    .filter((item): item is StoredLensSearchResultItem => Boolean(item));
  return {
    version: 1,
    imageHash,
    linkedPaths,
    createdAt: normalizeText(row.createdAt) || new Date(0).toISOString(),
    updatedAt: normalizeText(row.updatedAt) || new Date(0).toISOString(),
    sourceImagePath: toStringOrNull(row.sourceImagePath),
    sourceImageUrl: toStringOrNull(row.sourceImageUrl),
    searchId: toStringOrNull(row.searchId),
    serpApiSearchId: toStringOrNull(row.serpApiSearchId),
    providerCreatedAt: toStringOrNull(row.providerCreatedAt),
    requestedLimit: toNumberOrNull(row.requestedLimit),
    serviceOptions:
      row.serviceOptions && typeof row.serviceOptions === "object"
        ? (row.serviceOptions as Record<string, unknown>)
        : null,
    inputPayload:
      row.inputPayload && typeof row.inputPayload === "object"
        ? (row.inputPayload as Record<string, unknown>)
        : null,
    debugPayload:
      row.debugPayload && typeof row.debugPayload === "object"
        ? (row.debugPayload as Record<string, unknown>)
        : null,
    items,
    amazonLinks: normalizeAmazonLinks(row.amazonLinks),
    error: toStringOrNull(row.error),
  };
};

const ensureDraftImagePath = async (relativePath: string) => {
  const absolutePath = resolveDraftPath(relativePath);
  if (!absolutePath) return null;
  const normalizedRoot = `${DRAFT_ROOT}${path.sep}`;
  if (!absolutePath.startsWith(normalizedRoot)) return null;
  try {
    const stat = await fsp.stat(absolutePath);
    if (!stat.isFile()) return null;
    return {
      absolutePath,
      relativePath: toRelativePath(absolutePath),
    };
  } catch {
    return null;
  }
};

const hashFileSha256 = async (absolutePath: string) =>
  await new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(absolutePath);
    stream.on("error", reject);
    stream.on("data", (chunk: Buffer | string) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });

const recordPathForHash = (imageHash: string) =>
  path.join(STORE_RECORDS_DIR, `${imageHash}.json`);

const readRecordByHash = async (imageHash: string) => {
  const recordPath = recordPathForHash(imageHash);
  try {
    const raw = await fsp.readFile(recordPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizeRecord(parsed);
  } catch {
    return null;
  }
};

const writeJsonAtomic = async (targetPath: string, value: unknown) => {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fsp.rename(tempPath, targetPath);
};

export async function getStoredLensSearchRecordForImagePath(
  imagePath: string
): Promise<StoredRecordLookup | null> {
  const resolved = await ensureDraftImagePath(imagePath);
  if (!resolved) return null;
  const imageHash = await hashFileSha256(resolved.absolutePath);
  const record = await readRecordByHash(imageHash);
  if (!record) {
    return {
      imagePath: resolved.relativePath,
      imageHash,
      record: null,
    };
  }
  if (!record.linkedPaths.includes(resolved.relativePath)) {
    const nextRecord: StoredLensSearchRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
      linkedPaths: normalizeLinkedPaths([...record.linkedPaths, resolved.relativePath]),
    };
    await writeJsonAtomic(recordPathForHash(imageHash), nextRecord);
    return {
      imagePath: resolved.relativePath,
      imageHash,
      record: nextRecord,
    };
  }
  return {
    imagePath: resolved.relativePath,
    imageHash,
    record,
  };
}

export async function saveStoredLensSearchRecordForImagePath(
  input: SaveRecordInput
): Promise<StoredRecordLookup | null> {
  const resolved = await ensureDraftImagePath(input.imagePath);
  if (!resolved) return null;
  const imageHash = await hashFileSha256(resolved.absolutePath);
  const nowIso = new Date().toISOString();
  const existing = await readRecordByHash(imageHash);
  const normalizedItems = Array.isArray(input.items)
    ? input.items
        .map((item) => normalizeImageItem(item))
        .filter((item): item is StoredLensSearchResultItem => Boolean(item))
    : existing?.items ?? [];
  const normalizedSourceImagePath = toStringOrNull(
    input.sourceImagePath ?? existing?.sourceImagePath ?? null
  );
  const linkedPaths = normalizeLinkedPaths([
    ...(existing?.linkedPaths ?? []),
    resolved.relativePath,
    normalizedSourceImagePath || "",
  ]);
  const record: StoredLensSearchRecord = {
    version: 1,
    imageHash,
    linkedPaths,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
    sourceImagePath: normalizedSourceImagePath,
    sourceImageUrl: toStringOrNull(input.sourceImageUrl ?? existing?.sourceImageUrl ?? null),
    searchId: toStringOrNull(input.searchId ?? existing?.searchId ?? null),
    serpApiSearchId: toStringOrNull(
      input.serpApiSearchId ?? existing?.serpApiSearchId ?? null
    ),
    providerCreatedAt: toStringOrNull(
      input.providerCreatedAt ?? existing?.providerCreatedAt ?? null
    ),
    requestedLimit:
      toNumberOrNull(input.requestedLimit) ?? existing?.requestedLimit ?? null,
    serviceOptions:
      input.serviceOptions && typeof input.serviceOptions === "object"
        ? input.serviceOptions
        : existing?.serviceOptions ?? null,
    inputPayload:
      input.inputPayload && typeof input.inputPayload === "object"
        ? input.inputPayload
        : existing?.inputPayload ?? null,
    debugPayload:
      input.debugPayload && typeof input.debugPayload === "object"
        ? input.debugPayload
        : existing?.debugPayload ?? null,
    items: normalizedItems,
    amazonLinks: normalizeAmazonLinks(input.amazonLinks ?? existing?.amazonLinks ?? []),
    error: toStringOrNull(input.error ?? existing?.error ?? null),
  };
  await writeJsonAtomic(recordPathForHash(imageHash), record);
  return {
    imagePath: resolved.relativePath,
    imageHash,
    record,
  };
}
