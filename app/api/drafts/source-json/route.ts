import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { DRAFT_ROOT, resolveDraftPath } from "@/lib/drafts";

export const runtime = "nodejs";

type OriginalSourceRecord = {
  sourcePath: string;
  content: Record<string, unknown>;
};

type RunChunkIndex = {
  signature: string;
  recordsBySpu: Map<string, OriginalSourceRecord>;
};

const runChunkCache = new Map<string, RunChunkIndex>();

const normalizeRelative = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\.\.+/g, "");

const normalizeSpu = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const parseRunFromFolder = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = normalizeRelative(raw);
  if (!normalized) return "";
  const marker = "images/draft_products/";
  const markerIdx = normalized.indexOf(marker);
  const relative = markerIdx >= 0 ? normalized.slice(markerIdx + marker.length) : normalized;
  const parts = relative.split("/").filter(Boolean);
  return String(parts[0] || "").trim();
};

const extractSpuFromRecord = (record: Record<string, unknown>) => {
  const directCandidates = [
    record.spu,
    record.draft_spu,
    record.SPU,
    record.sku,
    record.SKU,
    record.product_spu,
    record.productSpu,
  ];
  for (const candidate of directCandidates) {
    const normalized = normalizeSpu(candidate);
    if (normalized) return normalized;
  }
  return "";
};

const getChunkFilesSignature = (chunkEntries: fs.Dirent[], chunksDir: string) => {
  return chunkEntries
    .map((entry) => {
      const absolute = path.join(chunksDir, entry.name);
      const stat = fs.statSync(absolute);
      return `${entry.name}:${stat.size}:${Math.floor(stat.mtimeMs)}`;
    })
    .join("|");
};

const buildRunChunkIndex = (run: string) => {
  const runAbsolutePath = resolveDraftPath(run);
  if (!runAbsolutePath || !runAbsolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`)) {
    return null;
  }
  if (!fs.existsSync(runAbsolutePath)) return null;

  const chunksAbsolutePath = path.join(runAbsolutePath, "_chunks");
  if (!fs.existsSync(chunksAbsolutePath)) return null;
  const chunksStat = fs.statSync(chunksAbsolutePath);
  if (!chunksStat.isDirectory()) return null;

  const chunkEntries = fs
    .readdirSync(chunksAbsolutePath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".json")
    .sort((left, right) => left.name.localeCompare(right.name));

  const signature = getChunkFilesSignature(chunkEntries, chunksAbsolutePath);
  const cached = runChunkCache.get(run);
  if (cached && cached.signature === signature) {
    return cached;
  }

  const recordsBySpu = new Map<string, OriginalSourceRecord>();

  for (const entry of chunkEntries) {
    const chunkRelativePath = `${run}/_chunks/${entry.name}`;
    const chunkAbsolutePath = path.join(chunksAbsolutePath, entry.name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(chunkAbsolutePath, "utf8"));
    } catch {
      continue;
    }

    const records = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of records) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const spu = extractSpuFromRecord(record);
      if (!spu || recordsBySpu.has(spu)) continue;
      recordsBySpu.set(spu, {
        sourcePath: chunkRelativePath,
        content: record,
      });
    }
  }

  const nextIndex: RunChunkIndex = {
    signature,
    recordsBySpu,
  };
  runChunkCache.set(run, nextIndex);
  return nextIndex;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedSpu = normalizeSpu(searchParams.get("spu"));
  const runFromQuery = parseRunFromFolder(searchParams.get("run") || "");
  const runFromFolder = parseRunFromFolder(searchParams.get("folder") || "");
  const resolvedRun = runFromQuery || runFromFolder;

  if (!requestedSpu) {
    return NextResponse.json({ error: "Missing spu query parameter." }, { status: 400 });
  }
  if (!resolvedRun) {
    return NextResponse.json(
      { error: "Missing run context (provide run or folder)." },
      { status: 400 }
    );
  }

  const index = buildRunChunkIndex(resolvedRun);
  if (!index) {
    return NextResponse.json(
      { error: "Original input chunk files were not found for this run." },
      { status: 404 }
    );
  }

  const matched = index.recordsBySpu.get(requestedSpu);
  if (!matched) {
    return NextResponse.json(
      { error: `No original input JSON found for ${requestedSpu} in ${resolvedRun}.` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    run: resolvedRun,
    spu: requestedSpu,
    sourcePath: matched.sourcePath,
    content: matched.content,
  });
}
