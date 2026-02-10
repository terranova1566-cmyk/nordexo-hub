import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ZIMAGE_ENV_PATH = "/srv/node-tools/zimage-api/.env";

const maskSecret = (value: string) => {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= 8) return "********";
  return `${raw.slice(0, 2)}...${raw.slice(-4)}`;
};

const parseEnvFile = (content: string) => {
  const lines = content.split(/\r?\n/);
  const values: Record<string, string> = {};
  const lineIndexByKey: Record<string, number> = {};
  for (let i = 0; i < lines.length; i += 1) {
    const original = lines[i];
    const trimmed = original.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
    lineIndexByKey[key] = i;
  }
  return { lines, values, lineIndexByKey };
};

const serializeEnvValue = (value: string) => {
  const raw = String(value ?? "");
  if (raw === "") return "";
  // Quote if value has whitespace or common shell-sensitive characters.
  if (/[\s#"']/u.test(raw)) {
    return JSON.stringify(raw);
  }
  return raw;
};

const readEnv = () => {
  try {
    if (!fs.existsSync(ZIMAGE_ENV_PATH)) return {};
    const content = fs.readFileSync(ZIMAGE_ENV_PATH, "utf8");
    return parseEnvFile(content).values;
  } catch {
    return {};
  }
};

const writeEnv = (updates: Record<string, string>) => {
  const dir = path.dirname(ZIMAGE_ENV_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const existingContent = fs.existsSync(ZIMAGE_ENV_PATH)
    ? fs.readFileSync(ZIMAGE_ENV_PATH, "utf8")
    : "";
  const parsed = parseEnvFile(existingContent);
  let lines = parsed.lines;
  const { lineIndexByKey, values } = parsed;
  if (lines.length === 1 && lines[0] === "") {
    lines = [];
  }

  for (const [key, value] of Object.entries(updates)) {
    values[key] = value;
    const serialized = serializeEnvValue(value);
    const nextLine = `${key}=${serialized}`;
    const idx = lineIndexByKey[key];
    if (idx !== undefined) {
      lines[idx] = nextLine;
    } else {
      lines.push(nextLine);
    }
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const nextContent = `${lines.join("\n")}\n`;
  fs.writeFileSync(ZIMAGE_ENV_PATH, nextContent, { mode: 0o600 });
  try {
    fs.chmodSync(ZIMAGE_ENV_PATH, 0o600);
  } catch {}
};

const buildResponse = (env: Record<string, string>) => {
  const baseUrl = (env.ZIMAGE_BASE_URL || "https://z-image.ai").replace(/\/+$/, "");
  const resolution = (env.ZIMAGE_RESOLUTION || "4k").toLowerCase();
  const format = (env.ZIMAGE_FORMAT || "jpeg").toLowerCase();
  const finalSizeRaw = Number(env.ZIMAGE_FINAL_SIZE);
  const finalSize = Number.isFinite(finalSizeRaw) && finalSizeRaw > 0 ? finalSizeRaw : 1000;
  const autoCenter =
    env.ZIMAGE_AUTO_CENTER === undefined
      ? true
      : ["1", "true", "yes", "y", "on"].includes(String(env.ZIMAGE_AUTO_CENTER).toLowerCase());

  const cookie = env.ZIMAGE_COOKIE || "";
  const apiKey = env.ZIMAGE_API_KEY || "";

  return {
    base_url: baseUrl,
    resolution,
    format,
    final_size: finalSize,
    auto_center: autoCenter,
    cookie: {
      is_set: Boolean(cookie),
      preview: cookie ? maskSecret(cookie) : "",
    },
    api_key: {
      is_set: Boolean(apiKey),
      preview: apiKey ? maskSecret(apiKey) : "",
    },
  };
};

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
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
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const };
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json(buildResponse(readEnv()));
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

  const updates: Record<string, string> = {};

  if (typeof payload.base_url === "string") {
    const trimmed = payload.base_url.trim();
    if (trimmed) updates.ZIMAGE_BASE_URL = trimmed;
  }

  if (typeof payload.resolution === "string") {
    const next = payload.resolution.trim().toLowerCase();
    if (next === "2k" || next === "4k" || next === "8k") {
      updates.ZIMAGE_RESOLUTION = next;
    }
  }

  if (typeof payload.format === "string") {
    const next = payload.format.trim().toLowerCase();
    if (next === "jpeg" || next === "png" || next === "webp") {
      updates.ZIMAGE_FORMAT = next;
    }
  }

  if (typeof payload.final_size === "number" || typeof payload.final_size === "string") {
    const parsed = Number(payload.final_size);
    if (Number.isFinite(parsed) && parsed >= 200 && parsed <= 5000) {
      updates.ZIMAGE_FINAL_SIZE = String(Math.round(parsed));
    }
  }

  if (typeof payload.auto_center === "boolean") {
    updates.ZIMAGE_AUTO_CENTER = payload.auto_center ? "true" : "false";
  }

  if (typeof payload.cookie === "string") {
    const trimmed = payload.cookie.trim();
    if (trimmed) updates.ZIMAGE_COOKIE = trimmed;
  }

  if (typeof payload.api_key === "string") {
    const trimmed = payload.api_key.trim();
    if (trimmed) updates.ZIMAGE_API_KEY = trimmed;
  }

  try {
    if (Object.keys(updates).length > 0) {
      writeEnv(updates);
    }
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error)?.message || "Failed to write settings." },
      { status: 500 }
    );
  }

  return NextResponse.json(buildResponse(readEnv()));
}
