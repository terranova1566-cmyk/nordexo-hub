import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const INGEST_DIR =
  process.env.NODEXO_SUPPLIER_LISTING_INGEST_DIR ||
  "/srv/node-files/1688-supplier-listing-ingest";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-API-Key, X-Nodexo-Token",
};

type ListingIngestPayload = {
  runId?: unknown;
  supplierId?: unknown;
  storeUrl?: unknown;
  pageUrl?: unknown;
  pageNo?: unknown;
  items?: unknown;
  stats?: unknown;
  checkpoint?: unknown;
  finishedStore?: unknown;
  [key: string]: unknown;
};

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const parseTokens = () => {
  const raw =
    process.env.NODEXO_SUPPLIER_LISTING_INGEST_TOKENS ||
    process.env.NODEXO_SUPPLIER_LISTING_INGEST_TOKEN ||
    process.env.NODEXO_EXTRACTOR_UPLOAD_TOKENS ||
    process.env.NODEXO_EXTRACTOR_UPLOAD_TOKEN ||
    "";

  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
};

const getAuthToken = (request: Request) => {
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return (
    request.headers.get("x-api-key") || request.headers.get("x-nodexo-token") || ""
  );
};

const sanitizePart = (value: string, fallback: string) => {
  const clean = asText(value)
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return clean || fallback;
};

const formatStamp = (date: Date) => {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}${pad(
    date.getMilliseconds(),
    3
  )}`;
};

const normalizePayload = (payload: unknown): ListingIngestPayload | null => {
  if (Array.isArray(payload)) {
    return {
      runId: "",
      supplierId: "",
      storeUrl: "",
      pageUrl: "",
      pageNo: 0,
      items: payload,
      stats: {},
      checkpoint: false,
      finishedStore: false,
      sourceType: "array_payload",
    };
  }

  if (!payload || typeof payload !== "object") return null;
  return payload as ListingIngestPayload;
};

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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const payload = normalizePayload(rawBody);
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid payload object." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const runId = asText(payload.runId);
  const storeUrl = asText(payload.storeUrl);
  const supplierId = asText(payload.supplierId);
  const pageNoRaw = Number(payload.pageNo);
  const pageNo = Number.isFinite(pageNoRaw) ? pageNoRaw : 0;
  const checkpoint = Boolean(payload.checkpoint);
  const finishedStore = Boolean(payload.finishedStore);
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!storeUrl && !runId) {
    return NextResponse.json(
      {
        error:
          "Payload is missing run/store identifiers. Expected at least runId or storeUrl.",
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  fs.mkdirSync(INGEST_DIR, { recursive: true });

  const stamp = formatStamp(new Date());
  const runPart = sanitizePart(runId || "no-run", "no-run");
  const supplierPart = sanitizePart(supplierId || "no-supplier", "no-supplier");
  const pagePart = Number.isFinite(pageNo) ? `p${pageNo}` : "p0";
  const statePart = finishedStore ? "finished" : checkpoint ? "checkpoint" : "chunk";
  const fileName = `${stamp}_${runPart}_${supplierPart}_${pagePart}_${statePart}.json`;
  const targetPath = path.join(INGEST_DIR, fileName);

  const envelope = {
    receivedAt: new Date().toISOString(),
    remoteAddress: request.headers.get("x-forwarded-for") || "",
    userAgent: request.headers.get("user-agent") || "",
    payload,
  };

  fs.writeFileSync(targetPath, JSON.stringify(envelope, null, 2), "utf8");

  return NextResponse.json(
    {
      ok: true,
      fileName,
      savedTo: INGEST_DIR,
      runId,
      supplierId,
      pageNo,
      itemCount: items.length,
      checkpoint,
      finishedStore,
    },
    { headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
