import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_DIR = "/srv/resources/scraping/images";

const getContentType = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
};

const normalizeSource = (source: string) =>
  source.toLowerCase().replace(/[^a-z0-9_-]/g, "");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get("path");
  const source = searchParams.get("source");
  const productId = searchParams.get("product_id");

  let filePath = rawPath ?? null;
  if (!filePath && source && productId) {
    const safeSource = normalizeSource(source);
    filePath = path.join(BASE_DIR, safeSource, `${productId}.jpg`);
  }

  if (!filePath) {
    return NextResponse.json({ error: "Missing image path." }, { status: 400 });
  }

  const resolved = path.resolve(filePath);
  const baseResolved = path.resolve(BASE_DIR);
  if (!resolved.startsWith(`${baseResolved}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid image path." }, { status: 400 });
  }

  try {
    const file = await fs.readFile(resolved);
    return new NextResponse(file, {
      headers: {
        "Content-Type": getContentType(resolved),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }
}
