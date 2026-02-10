import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const runtime = "nodejs";

const TOOL_PATH = "/srv/node-tools/1688-image-search/index.js";
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

const getPublicBaseUrl = (request: Request) => {
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return null;
  return `${proto}://${host}`;
};

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
    limit = parseNumber(payload.limit, limit);
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
    limit = parseNumber(form.get("limit"), limit);
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

    const args: string[] = [
      "--pretty",
      "false",
      "--limit",
      String(limit),
      "--page",
      String(page),
      "--cpsFirst",
      cpsFirst ? "true" : "false",
      "--includeRaw",
      includeRaw ? "true" : "false",
    ];
    if (sortFields) {
      args.push("--sortFields", sortFields);
    }
    if (fields) {
      args.push("--fields", fields);
    }
    if (tempFilePath) {
      args.push("--image", tempFilePath);
    } else if (imageUrl) {
      args.push("--image-url", imageUrl);
    }

    const result = spawnSync(process.execPath, [TOOL_PATH, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        PUBLIC_BASE_URL: baseUrl,
      },
      maxBuffer: 20 * 1024 * 1024,
      timeout: 60_000,
    });

    const stdout = String(result.stdout || "").trim();
    const stderr = String(result.stderr || "").trim();

    let parsed: unknown = null;
    if (stdout) {
      try {
        parsed = JSON.parse(stdout);
      } catch {}
    }

    if (parsed) {
      // Always return the tool's structured payload (even if the tool exited non-zero).
      return NextResponse.json(parsed);
    }

    if (result.status !== 0) {
      const status = result.status === 2 ? 400 : 500;
      return NextResponse.json(
        { error: stderr || "1688 image search failed." },
        { status }
      );
    }

    return NextResponse.json(
      { error: "Invalid response from 1688 tool.", detail: (stderr || stdout).slice(0, 500) },
      { status: 500 }
    );
  } finally {
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch {}
    }
  }
}
