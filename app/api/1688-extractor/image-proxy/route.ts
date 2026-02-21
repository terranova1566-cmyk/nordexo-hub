import { NextResponse } from "next/server";
import {
  getQueueImageCache,
  isAllowedQueueImageHost,
} from "@/lib/queue-image-cache";

export const runtime = "nodejs";

const parseDimension = (raw: string | null) => {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 16 || rounded > 2048) return null;
  return rounded;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = String(searchParams.get("url") || "").trim();
  const width = parseDimension(searchParams.get("w"));
  const height = parseDimension(searchParams.get("h"));
  if (!raw) {
    return NextResponse.json({ error: "Missing url." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url." }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Invalid protocol." }, { status: 400 });
  }
  if (!isAllowedQueueImageHost(parsed.hostname)) {
    return NextResponse.json({ error: "Host not allowed." }, { status: 403 });
  }

  try {
    if (width || height) {
      const resized = await getQueueImageCache({
        sourceUrl: parsed.toString(),
        width,
        height,
      });
      return new NextResponse(new Uint8Array(resized.buffer), {
        status: 200,
        headers: {
          "Content-Type": resized.contentType,
          "Cache-Control":
            "public, max-age=604800, stale-while-revalidate=604800, immutable",
        },
      });
    }

    const upstream = await fetch(parsed.toString(), {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: "https://www.1688.com/",
      },
      redirect: "follow",
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Image source returned ${upstream.status}.` },
        { status: 502 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control":
          "public, max-age=86400, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch image." },
      { status: 502 }
    );
  }
}
