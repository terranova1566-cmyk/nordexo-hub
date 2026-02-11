import { NextResponse } from "next/server";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const ROOT_DIR = "/srv/incoming-scripts/uploads/public-temp-images";
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"] as const;

const parseId = (raw: string) => {
  const text = String(raw || "").trim();
  // Accept both `/api/public/temp-images/<id>` and `/api/public/temp-images/<id>.jpg`
  // because some upstream fetchers expect a file extension.
  const match = text.match(/^([a-f0-9]{32})(?:\.(jpg|jpeg|png|webp))?$/i);
  return match?.[1] ? match[1] : null;
};

const metaPathFor = (id: string) => path.join(ROOT_DIR, `${id}.json`);

const findImagePath = (id: string) => {
  for (const ext of ALLOWED_EXT) {
    const candidate = path.join(ROOT_DIR, `${id}.${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const contentTypeForExt = (ext: string) => {
  const normalized = ext.replace(/^\./, "").toLowerCase();
  if (normalized === "png") return "image/png";
  if (normalized === "webp") return "image/webp";
  return "image/jpeg";
};

const safeUnlink = async (filePath: string) => {
  try {
    await fsp.unlink(filePath);
  } catch {}
};

type TempImageMeta = {
  expiresAt?: string;
  contentType?: string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const metaPath = metaPathFor(id);
  if (!fs.existsSync(metaPath)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let meta: TempImageMeta | null = null;
  try {
    meta = JSON.parse(await fsp.readFile(metaPath, "utf8")) as TempImageMeta;
  } catch {
    meta = null;
  }

  const expiresAtMs = Date.parse(meta?.expiresAt || "");
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    const imagePath = findImagePath(id);
    if (imagePath) await safeUnlink(imagePath);
    await safeUnlink(metaPath);
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const imagePath = findImagePath(id);
  if (!imagePath) {
    await safeUnlink(metaPath);
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const resolved = path.resolve(imagePath);
  const rootResolved = path.resolve(ROOT_DIR);
  if (!resolved.startsWith(rootResolved)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const buf = await fsp.readFile(resolved);
    const ext = path.extname(resolved);
    const contentType = meta?.contentType || contentTypeForExt(ext);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=60",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
