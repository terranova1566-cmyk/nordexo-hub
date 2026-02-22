import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getPublicBaseUrlFromRequest,
  run1688ImageSearch,
} from "@/shared/1688/image-search-runner";

export const runtime = "nodejs";

const UPLOAD_DIR = "/srv/incoming-scripts/uploads/1688-image-search";

const isTruthy = (value: unknown) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
};

const parseNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampInt = (value: number, min: number, max: number) => {
  const v = Math.trunc(value);
  return Math.min(max, Math.max(min, v));
};

const normalizeFields = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    const out = value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    return out.length ? out.join(",") : null;
  }
  if (typeof value === "string") {
    const out = value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    return out.length ? out.join(",") : null;
  }
  return null;
};

const guessExtension = (file: File) => {
  const type = (file.type || "").toLowerCase();
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  return ".jpg";
};

const getPublicBaseUrl = (request: Request) =>
  getPublicBaseUrlFromRequest(request);

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const contentType = request.headers.get("content-type") || "";

  let imageUrl: string | null = null;
  let file: File | null = null;

  let limit = 3;
  let page = 1;
  let cpsFirst = false;
  let sortFields = "";
  let fields: string | null = null;
  let includeRaw = true;

  if (contentType.includes("application/json")) {
    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as typeof payload;
    } catch {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }
    imageUrl =
      typeof payload.image_url === "string"
        ? payload.image_url.trim()
        : typeof payload.imageUrl === "string"
          ? payload.imageUrl.trim()
          : null;
    limit = clampInt(parseNumber(payload.limit, limit), 1, 10);
    page = parseNumber(payload.page, page);
    cpsFirst = isTruthy(payload.cps_first ?? payload.cpsFirst);
    sortFields = typeof payload.sort_fields === "string" ? payload.sort_fields : "";
    fields = normalizeFields(payload.fields);
    includeRaw = payload.include_raw === undefined ? includeRaw : isTruthy(payload.include_raw);
  } else if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const fileEntry = form.get("file");
    if (fileEntry instanceof File) {
      file = fileEntry;
    }
    const urlEntry = form.get("image_url") || form.get("imageUrl");
    if (typeof urlEntry === "string") {
      imageUrl = urlEntry.trim();
    }
    limit = clampInt(parseNumber(form.get("limit"), limit), 1, 10);
    page = parseNumber(form.get("page"), page);
    cpsFirst = isTruthy(form.get("cps_first") ?? form.get("cpsFirst"));
    const sortEntry = form.get("sort_fields") ?? form.get("sortFields");
    if (typeof sortEntry === "string") sortFields = sortEntry;
    fields = normalizeFields(form.get("fields"));
    const includeEntry = form.get("include_raw");
    if (includeEntry !== null) includeRaw = isTruthy(includeEntry);
  } else {
    return NextResponse.json(
      { error: "Unsupported content-type." },
      { status: 415 }
    );
  }

  if (!file && !imageUrl) {
    return NextResponse.json(
      { error: "Provide image_url or upload a file." },
      { status: 400 }
    );
  }

  const baseUrl = getPublicBaseUrl(request);
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Unable to determine public base URL." },
      { status: 500 }
    );
  }

  let tempFilePath: string | null = null;
  try {
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: "File too large (max 10MB)." },
          { status: 400 }
        );
      }
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const id = crypto.randomBytes(16).toString("hex");
      const ext = guessExtension(file);
      tempFilePath = path.join(UPLOAD_DIR, `upload-${id}${ext}`);
      const buf = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(tempFilePath, buf);
    }

    const run = run1688ImageSearch({
      publicBaseUrl: baseUrl,
      imagePath: tempFilePath,
      imageUrl: tempFilePath ? null : imageUrl,
      limit,
      page,
      cpsFirst,
      includeRaw,
      pretty: false,
      sortFields,
      fields,
    });

    if (run.ok) {
      return NextResponse.json(run.payload);
    }

    return NextResponse.json(
      { error: run.error || "1688 image search failed." },
      { status: run.status ?? 500 }
    );
  } finally {
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch {}
    }
  }
}
