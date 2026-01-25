import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_BASE = "1688_product_extraction";
const UPLOAD_DIR =
  process.env.NODEXO_EXTRACTOR_UPLOAD_DIR || "/srv/node-files/1688-extractor";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Nodexo-Token",
};

function parseTokens() {
  const raw =
    process.env.NODEXO_EXTRACTOR_UPLOAD_TOKENS ||
    process.env.NODEXO_EXTRACTOR_UPLOAD_TOKEN ||
    "";
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function getAuthToken(request: Request) {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return request.headers.get("x-nodexo-token") || "";
}

function sanitizeBaseName(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const dashed = raw.replace(/\s+/g, "-");
  return dashed.replace(/[^a-zA-Z0-9._-]/g, "").replace(/^-+|-+$/g, "");
}

function buildTimestamp() {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(
    d.getMilliseconds(),
    3
  )}`;
  return { date, time };
}

export async function POST(request: Request) {
  const tokens = parseTokens();
  if (tokens.length) {
    const provided = getAuthToken(request);
    if (!provided || !tokens.includes(provided)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS_HEADERS }
      );
    }
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const items = Array.isArray(payload) ? payload : payload?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "Missing items array." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const baseRaw =
    (payload?.filenameBase || payload?.filename || payload?.name || "").toString();
  const base = sanitizeBaseName(baseRaw) || DEFAULT_BASE;
  const { date, time } = buildTimestamp();
  const filename = `${base}_${date}_${time}.json`;

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const safeName = path.basename(filename);
  const targetPath = path.join(UPLOAD_DIR, safeName);
  fs.writeFileSync(targetPath, JSON.stringify(items, null, 2), "utf8");

  return NextResponse.json(
    {
      ok: true,
      filename: safeName,
      savedTo: UPLOAD_DIR,
      count: items.length,
    },
    { headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
