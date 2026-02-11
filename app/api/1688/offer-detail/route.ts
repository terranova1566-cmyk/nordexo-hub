import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { spawnSync } from "node:child_process";

export const runtime = "nodejs";

const TOOL_PATH = "/srv/node-tools/1688-extractor/src/offer_detail_cli.js";

const isTruthy = (value: unknown) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
};

const parseNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const offerId =
    typeof payload.offer_id === "string"
      ? payload.offer_id.trim()
      : typeof payload.offerId === "string"
        ? payload.offerId.trim()
        : typeof payload.offer === "string"
          ? payload.offer.trim()
          : null;

  const url =
    typeof payload.url === "string"
      ? payload.url.trim()
      : typeof payload.url_1688 === "string"
        ? payload.url_1688.trim()
        : typeof payload.url1688 === "string"
          ? payload.url1688.trim()
          : null;

  if (!offerId && !url) {
    return NextResponse.json(
      { error: "Provide offer_id (offerId) or url." },
      { status: 400 }
    );
  }

  const includeText =
    payload.include_text === undefined ? true : isTruthy(payload.include_text);
  const includeVariations =
    payload.include_variations === undefined
      ? true
      : isTruthy(payload.include_variations);
  const downloadImages =
    payload.download_images === undefined
      ? false
      : isTruthy(payload.download_images);
  const maxTextChars = parseNumber(payload.max_text_chars, 250_000);

  const args: string[] = [
    "--pretty",
    "false",
    "--includeText",
    includeText ? "true" : "false",
    "--includeVariations",
    includeVariations ? "true" : "false",
    "--downloadImages",
    downloadImages ? "true" : "false",
    "--maxTextChars",
    String(maxTextChars),
  ];

  if (offerId) {
    args.push("--offer-id", offerId);
  } else if (url) {
    args.push("--url", url);
  }

  const result = spawnSync(process.execPath, [TOOL_PATH, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      HEADLESS: "1",
    },
    maxBuffer: 50 * 1024 * 1024,
    timeout: 180_000,
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
    return NextResponse.json(parsed);
  }

  const status = result.status === 2 ? 400 : 500;
  return NextResponse.json(
    { error: stderr || "1688 offer detail failed.", detail: stdout.slice(0, 500) },
    { status }
  );
}

