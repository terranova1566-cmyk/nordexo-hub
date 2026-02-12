import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PROCESSOR_ENV_PATH = "/srv/node-tools/product-processor/.env";
const CHATGPT_SCRIPT_PATH = "/srv/node-tools/product-processor/chatgpt_edit.js";
const GEMINI_SCRIPT_PATH = "/srv/node-tools/product-processor/gemini_edit.py";

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
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) {
      value = value.slice(1, -1);
    } else {
      // Support inline comments in .env values: KEY=value # comment
      value = value.replace(/\s+#.*$/, "").trim();
    }

    values[key] = value;
    lineIndexByKey[key] = i;
  }

  return { lines, values, lineIndexByKey };
};

const serializeEnvValue = (value: string) => {
  const raw = String(value ?? "");
  if (raw === "") return "";
  if (/[\s#"']/u.test(raw)) {
    return JSON.stringify(raw);
  }
  return raw;
};

const readEnv = () => {
  try {
    if (!fs.existsSync(PROCESSOR_ENV_PATH)) return {};
    const content = fs.readFileSync(PROCESSOR_ENV_PATH, "utf8");
    return parseEnvFile(content).values;
  } catch {
    return {};
  }
};

const writeEnv = (updates: Record<string, string>) => {
  const dir = path.dirname(PROCESSOR_ENV_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const existingContent = fs.existsSync(PROCESSOR_ENV_PATH)
    ? fs.readFileSync(PROCESSOR_ENV_PATH, "utf8")
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
  fs.writeFileSync(PROCESSOR_ENV_PATH, nextContent, { mode: 0o600 });
  try {
    fs.chmodSync(PROCESSOR_ENV_PATH, 0o600);
  } catch {}
};

const envMultilineToText = (value: string) => {
  if (!value) return "";
  return String(value).replace(/\\n/g, "\n");
};

const textToEnvMultiline = (value: string) => {
  if (!value) return "";
  return String(value).replace(/\r\n/g, "\n").replace(/\n/g, "\\n");
};

const extractJsTemplate = (filePath: string) => {
  try {
    const source = fs.readFileSync(filePath, "utf8");
    const match = source.match(/const\s+BASE_PROMPT_FALLBACK\s*=\s*`([\s\S]*?)`;?/);
    return match ? String(match[1] || "").trim() : "";
  } catch {
    return "";
  }
};

const extractPyTemplate = (filePath: string) => {
  try {
    const source = fs.readFileSync(filePath, "utf8");
    const match = source.match(/BASE_PROMPT_TEMPLATE\s*=\s*"""([\s\S]*?)"""/);
    return match ? String(match[1] || "").trim() : "";
  } catch {
    return "";
  }
};

const buildResponse = (env: Record<string, string>) => {
  const modeRaw = String(env.IMAGE_EDIT_PROMPT_MODE || "template").trim().toLowerCase();
  const promptMode = modeRaw === "direct" ? "direct" : "template";

  const chatgptPrompt = env.OPENAI_IMAGE_PROMPT_TEMPLATE
    ? envMultilineToText(env.OPENAI_IMAGE_PROMPT_TEMPLATE)
    : extractJsTemplate(CHATGPT_SCRIPT_PATH);

  const geminiPrompt = env.GEMINI_IMAGE_PROMPT_TEMPLATE
    ? envMultilineToText(env.GEMINI_IMAGE_PROMPT_TEMPLATE)
    : extractPyTemplate(GEMINI_SCRIPT_PATH);

  return {
    prompt_mode: promptMode,
    chatgpt_prompt_template: chatgptPrompt,
    gemini_prompt_template: geminiPrompt,
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

  if (typeof payload.prompt_mode === "string") {
    const mode = payload.prompt_mode.trim().toLowerCase();
    if (mode === "template" || mode === "direct") {
      updates.IMAGE_EDIT_PROMPT_MODE = mode;
    }
  }

  if (typeof payload.chatgpt_prompt_template === "string") {
    updates.OPENAI_IMAGE_PROMPT_TEMPLATE = textToEnvMultiline(payload.chatgpt_prompt_template);
  }

  if (typeof payload.gemini_prompt_template === "string") {
    updates.GEMINI_IMAGE_PROMPT_TEMPLATE = textToEnvMultiline(payload.gemini_prompt_template);
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
