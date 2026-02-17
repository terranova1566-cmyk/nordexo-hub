import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { spawn } from "child_process";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { convertImageFileToJpegInPlace } from "@/lib/image-jpeg";
import { saveDraftImageUndoBackup } from "@/lib/draft-image-undo";

export type AiEditProvider = "chatgpt" | "gemini" | "zimage";
export type AiPromptMode =
  | "template"
  | "direct"
  | "white_background"
  | "auto_center_white"
  | "eraser"
  | "upscale";

export type AiTemplatePreset = "standard" | "digideal_main" | "product_scene";

export type PendingAiEditRecord = {
  id: string;
  originalPath: string;
  pendingPath: string;
  provider: AiEditProvider;
  mode: AiPromptMode;
  prompt: string;
  status: "pending";
  createdAt: string;
  updatedAt: string;
};

type AiEditStateFile = {
  version: 1;
  edits: PendingAiEditRecord[];
};

type RunScriptOptions = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  cwd?: string;
};

type ResolveDecision = "keep_original" | "replace_with_ai" | "keep_both";

type CreatePendingAiEditInput = {
  relativePath: string;
  provider: AiEditProvider;
  mode: AiPromptMode;
  prompt: string;
  templatePreset?: AiTemplatePreset;
  requestedBy: string | null;
};

type CreateTemplatePresetOutputsInput = {
  relativePath: string;
  provider: Exclude<AiEditProvider, "zimage">;
  templatePreset: Exclude<AiTemplatePreset, "standard">;
  count: number;
  prompt?: string;
  requestedBy: string | null;
};

type ResolvePendingAiEditInput = {
  originalPath: string;
  decision: ResolveDecision;
  requestedBy: string | null;
};

const PROCESSOR_ROOT = "/srv/node-tools/product-processor";
const PROCESSOR_ENV_PATH = path.join(PROCESSOR_ROOT, ".env");
const CHATGPT_SCRIPT_PATH = path.join(PROCESSOR_ROOT, "chatgpt_edit.js");
const GEMINI_SCRIPT_PATH = path.join(PROCESSOR_ROOT, "gemini_edit.py");
const DIGIDEAL_MAIN_PROMPT_PATH = path.join(
  PROCESSOR_ROOT,
  "prompts",
  "digideal-main-image-prompt.txt"
);
const ENVIORMENT_SCENE_PROMPT_PATH = path.join(
  PROCESSOR_ROOT,
  "prompts",
  "enviorment-scene-image-prompt.txt"
);
const ZIMAGE_ROOT = "/srv/node-tools/zimage-api";
const ZIMAGE_ENV_PATH = path.join(ZIMAGE_ROOT, ".env");
const ZIMAGE_IMAGE_TO_IMAGE_SCRIPT_PATH = path.join(ZIMAGE_ROOT, "image_to_image.js");
const ZIMAGE_BG_REMOVAL_SCRIPT_PATH = path.join(ZIMAGE_ROOT, "background_removal.js");
const ZIMAGE_ERASER_SCRIPT_PATH = path.join(ZIMAGE_ROOT, "image_eraser.js");
const ZIMAGE_UPSCALE_SCRIPT_PATH = path.join(ZIMAGE_ROOT, "upscale.js");
const AUTO_CENTER_SCRIPT_PATH = path.join(PROCESSOR_ROOT, "auto_center_white.py");
const ZIMAGE_INPUT_DIR = path.join(ZIMAGE_ROOT, "input");
const ZIMAGE_OUTPUT_DIR = path.join(ZIMAGE_ROOT, "output");
const GEMINI_PYTHON_CANDIDATES = [
  path.join(PROCESSOR_ROOT, ".venv", "bin", "python"),
  path.join(PROCESSOR_ROOT, ".venv", "Scripts", "python.exe"),
  "python3",
  "python",
];
const AI_EDIT_STATE_FILE = ".ai-edits.json";
const AI_EDIT_LOG_PATH = path.join(process.cwd(), "logs", "draft-ai-edits.log");
const SUPPORTED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const CONTEXT_CACHE_TTL_MS = 10 * 60 * 1000;
const PROMPT_VERSION_CACHE_TTL_MS = 2 * 60 * 1000;

let editQueueTail: Promise<void> = Promise.resolve();
const digidealContextCache = new Map<
  string,
  {
    key: string;
    createdAtMs: number;
    value: { product_description: string; usage_environments: string[]; target_user: string };
  }
>();
const promptVersionCache = new Map<
  string,
  {
    fetchedAtMs: number;
    value: string | null;
  }
>();
let supabaseAdminClient: SupabaseClient<any, "public", any> | null = null;

const normalizeRelativePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/^\/+/, "");

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const stripHtmlToText = (value: string | null | undefined) => {
  if (!value) return "";
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const buildHash = (value: string) =>
  createHash("sha1").update(String(value || "")).digest("hex");

const isProvider = (value: string): value is AiEditProvider =>
  value === "chatgpt" || value === "gemini" || value === "zimage";

const isPromptMode = (value: string): value is AiPromptMode =>
  value === "template" ||
  value === "direct" ||
  value === "white_background" ||
  value === "auto_center_white" ||
  value === "eraser" ||
  value === "upscale";

const isModeSupported = (provider: AiEditProvider, mode: AiPromptMode) => {
  if (provider === "zimage") {
    return (
      mode === "direct" ||
      mode === "white_background" ||
      mode === "auto_center_white" ||
      mode === "eraser" ||
      mode === "upscale"
    );
  }
  return mode === "template" || mode === "direct";
};

const isWithinDraftRoot = (absolutePath: string) =>
  absolutePath === DRAFT_ROOT || absolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`);

const getSupabaseAdminClient = () => {
  if (supabaseAdminClient) return supabaseAdminClient;
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  supabaseAdminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseAdminClient;
};

const parseEnvFile = (content: string): Record<string, string> => {
  const values: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
    const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
    if (isDoubleQuoted) {
      // Settings write quoted values using JSON.stringify(). Parse back to avoid escaped
      // backslashes leaking into prompts (e.g. "\\n" and "\\\"").
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (isSingleQuoted || isQuoted) {
      value = value.slice(1, -1);
    } else {
      // Support inline comments in .env values: KEY=value # comment
      value = value.replace(/\s+#.*$/, "").trim();
    }
    values[key] = value;
  }
  return values;
};

const loadEnvFromFile = (envPath: string): Record<string, string> => {
  try {
    if (!fs.existsSync(envPath)) return {};
    return parseEnvFile(fs.readFileSync(envPath, "utf8"));
  } catch {
    return {};
  }
};

const loadProcessorEnv = () => loadEnvFromFile(PROCESSOR_ENV_PATH);
const loadZImageEnv = () => loadEnvFromFile(ZIMAGE_ENV_PATH);

const loadPromptTemplateFromVersions = async (promptId: string) => {
  const id = String(promptId || "").trim().toUpperCase();
  if (!id) return null;

  const cached = promptVersionCache.get(id);
  if (cached && Date.now() - cached.fetchedAtMs < PROMPT_VERSION_CACHE_TTL_MS) {
    return cached.value;
  }

  const client = getSupabaseAdminClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("ai_image_edit_prompt_versions")
      .select("template_text,created_at")
      .eq("prompt_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      promptVersionCache.set(id, { fetchedAtMs: Date.now(), value: null });
      return null;
    }

    const value = String(data.template_text ?? "").trim() || null;
    promptVersionCache.set(id, { fetchedAtMs: Date.now(), value });
    return value;
  } catch {
    return null;
  }
};

const hydrateTemplateFromPromptManager = async (
  env: NodeJS.ProcessEnv,
  provider: Exclude<AiEditProvider, "zimage">,
  templatePreset: AiTemplatePreset,
  skip: boolean
) => {
  if (skip) return;

  if (templatePreset === "digideal_main") {
    const value = await loadPromptTemplateFromVersions("DDMAINIM");
    if (value) {
      env.DIGIDEAL_MAIN_IMAGE_PROMPT_TEMPLATE = value;
    }
    return;
  }

  if (templatePreset === "product_scene") {
    const value = await loadPromptTemplateFromVersions("ENVSCNIM");
    if (value) {
      env.ENVIORMENT_SCENE_IMAGE_PROMPT_TEMPLATE = value;
    }
    return;
  }

  const promptId = provider === "chatgpt" ? "OAIIMGED" : "GEMIMGED";
  const value = await loadPromptTemplateFromVersions(promptId);
  if (!value) return;
  if (provider === "chatgpt") {
    env.OPENAI_IMAGE_PROMPT_TEMPLATE = value;
  } else {
    env.GEMINI_IMAGE_PROMPT_TEMPLATE = value;
  }
};

const extractJsonFromText = (text: string) => {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const readPositiveInt = (
  env: Record<string, string>,
  key: string,
  fallback: number
) => {
  const raw = String(env[key] ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const appendAiEditLog = (payload: Record<string, unknown>) => {
  try {
    fs.mkdirSync(path.dirname(AI_EDIT_LOG_PATH), { recursive: true });
    fs.appendFileSync(
      AI_EDIT_LOG_PATH,
      `${new Date().toISOString()} ${JSON.stringify(payload)}\n`,
      "utf8"
    );
  } catch {}
};

const ensureImageFile = (absolutePath: string) => {
  const ext = path.extname(absolutePath).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error("Only .jpg, .jpeg, .png and .webp files are supported.");
  }
};

const resolveImagePath = (relativePath: string) => {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid path.");
  }
  const absolute = resolveDraftPath(normalized);
  if (!absolute || !isWithinDraftRoot(absolute)) {
    throw new Error("Invalid path.");
  }
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error("File not found.");
  }
  ensureImageFile(absolute);
  return {
    absolutePath: absolute,
    relativePath: toRelativePath(absolute),
  };
};

const resolveFolderPath = (relativeFolder: string) => {
  const normalized = normalizeRelativePath(relativeFolder);
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid folder.");
  }
  const absolute = resolveDraftPath(normalized);
  if (!absolute || !isWithinDraftRoot(absolute)) {
    throw new Error("Invalid folder.");
  }
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    throw new Error("Folder not found.");
  }
  return absolute;
};

const resolveGeminiPython = () => {
  for (const candidate of GEMINI_PYTHON_CANDIDATES) {
    if (candidate.includes(path.sep)) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }
    return candidate;
  }
  return "python3";
};

const uniqueSiblingPath = (sourceAbsPath: string, suffix: string) => {
  const parsed = path.parse(sourceAbsPath);
  let index = 1;
  while (true) {
    const candidateName =
      index === 1
        ? `${parsed.name}${suffix}${parsed.ext}`
        : `${parsed.name}${suffix}-${index}${parsed.ext}`;
    const candidateAbs = path.join(parsed.dir, candidateName);
    if (!fs.existsSync(candidateAbs)) return candidateAbs;
    index += 1;
  }
};

const moveFileWithFallback = (sourceAbsPath: string, targetAbsPath: string) => {
  try {
    fs.renameSync(sourceAbsPath, targetAbsPath);
    return true;
  } catch {}
  try {
    fs.copyFileSync(sourceAbsPath, targetAbsPath);
    fs.unlinkSync(sourceAbsPath);
    return true;
  } catch {
    return false;
  }
};

const runScript = async ({
  command,
  args,
  env,
  timeoutMs,
  cwd,
}: RunScriptOptions): Promise<void> =>
  new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env,
      cwd,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            try {
              proc.kill("SIGKILL");
            } catch {}
          }, timeoutMs)
        : null;

    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
      if (timedOut) {
        reject(
          new Error(
            `Image edit timed out after ${timeoutMs}ms${
              detail ? `: ${detail}` : ""
            }`
          )
        );
        return;
      }
      reject(new Error(detail || `Image edit process exited with code ${code}.`));
    });
  });

export const runAutoCenterWhiteInPlace = async (absolutePath: string) => {
  const processorEnv = loadProcessorEnv();
  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...processorEnv,
  };
  const timeoutMs = readPositiveInt(processorEnv, "IMAGE_EDIT_TIMEOUT_MS", 180000);
  await runScript({
    command: resolveGeminiPython(),
    args: [AUTO_CENTER_SCRIPT_PATH, "--file", absolutePath],
    env: mergedEnv,
    timeoutMs,
    cwd: PROCESSOR_ROOT,
  });
};

const buildPendingImageName = (originalAbsPath: string, provider: AiEditProvider) => {
  const parsed = path.parse(originalAbsPath);
  const shortId = randomUUID().slice(0, 8);
  const ts = Date.now();
  return `.${parsed.name}.ai-pending-${provider}-${ts}-${shortId}${parsed.ext.toLowerCase()}`;
};

const findNewestOutputForBase = (baseName: string, sinceMs: number) => {
  if (!fs.existsSync(ZIMAGE_OUTPUT_DIR)) return null;
  const files = fs
    .readdirSync(ZIMAGE_OUTPUT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(`${baseName}-`) || name === baseName)
    .map((name) => path.join(ZIMAGE_OUTPUT_DIR, name))
    .map((absolutePath) => ({
      absolutePath,
      mtimeMs: fs.statSync(absolutePath).mtimeMs,
    }))
    .filter((entry) => entry.mtimeMs >= sinceMs - 1000)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return files[0]?.absolutePath ?? null;
};

const readZImageFailureReason = (
  scriptPath: string,
  fileName: string,
  startedAtMs: number
) => {
  const scriptName = path.parse(scriptPath).name;
  const logsDir = path.join(ZIMAGE_ROOT, "logs");
  const queuePath = path.join(logsDir, `${scriptName}-queue.json`);
  const eventsPath = path.join(logsDir, `${scriptName}.jsonl`);

  try {
    if (fs.existsSync(queuePath)) {
      const raw = JSON.parse(fs.readFileSync(queuePath, "utf8")) as {
        failed?: Array<{ file?: string; error?: string; status?: number }>;
      };
      const failed = Array.isArray(raw.failed) ? raw.failed : [];
      for (let index = failed.length - 1; index >= 0; index -= 1) {
        const row = failed[index];
        if (String(row?.file ?? "") !== fileName) continue;
        const message = String(row?.error ?? "").trim();
        if (!message) continue;
        const status = Number(row?.status);
        if (Number.isFinite(status)) {
          return `${message} (status ${status})`;
        }
        return message;
      }
    }
  } catch {}

  try {
    if (!fs.existsSync(eventsPath)) return null;
    const lines = fs
      .readFileSync(eventsPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      let payload: {
        ts?: string;
        type?: string;
        file?: string;
        error?: string;
        status?: number;
      } | null = null;
      try {
        payload = JSON.parse(line) as {
          ts?: string;
          type?: string;
          file?: string;
          error?: string;
          status?: number;
        };
      } catch {
        continue;
      }
      if (!payload || payload.type !== "failed") continue;
      if (String(payload.file ?? "") !== fileName) continue;
      const ts = Date.parse(String(payload.ts ?? ""));
      if (Number.isFinite(ts) && ts < startedAtMs - 1000) continue;
      const message = String(payload.error ?? "").trim();
      if (!message) continue;
      const status = Number(payload.status);
      if (Number.isFinite(status)) {
        return `${message} (status ${status})`;
      }
      return message;
    }
  } catch {}

  return null;
};

const runZImageTool = async (input: {
  scriptPath: string;
  originalAbsPath: string;
  pendingAbsPath: string;
  prompt?: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}) => {
  fs.mkdirSync(ZIMAGE_INPUT_DIR, { recursive: true });
  fs.mkdirSync(ZIMAGE_OUTPUT_DIR, { recursive: true });

  const ext = path.extname(input.originalAbsPath).toLowerCase() || ".jpg";
  const baseName = `draft-ai-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const tempInputPath = path.join(ZIMAGE_INPUT_DIR, `${baseName}${ext}`);
  const inputFileName = path.basename(tempInputPath);
  const startMs = Date.now();

  try {
    fs.copyFileSync(input.originalAbsPath, tempInputPath);
    const args = [input.scriptPath, "--image", tempInputPath];
    if (input.prompt) {
      args.push("--prompt", input.prompt);
    }
    const zimageEnv: NodeJS.ProcessEnv = {
      ...input.env,
      ZIMAGE_STOP_ON_ERROR: "true",
      ZIMAGE_BATCH: "false",
      ZIMAGE_STRICT_QUEUE: "true",
      ZIMAGE_CONCURRENCY: "1",
    };
    await runScript({
      command: process.execPath,
      args,
      env: zimageEnv,
      timeoutMs: input.timeoutMs,
      cwd: ZIMAGE_ROOT,
    });

    const producedOutputPath = findNewestOutputForBase(baseName, startMs);
    if (!producedOutputPath || !fs.existsSync(producedOutputPath)) {
      const reason = readZImageFailureReason(input.scriptPath, inputFileName, startMs);
      if (reason) {
        throw new Error(`ZImage edit failed: ${reason}`);
      }
      throw new Error("ZImage edit returned no image.");
    }
    fs.copyFileSync(producedOutputPath, input.pendingAbsPath);
    removeFileQuietly(producedOutputPath);
  } catch (error) {
    const reason = readZImageFailureReason(input.scriptPath, inputFileName, startMs);
    if (reason) {
      if (reason.toLowerCase().includes("no auth")) {
        throw new Error(
          "ZImage authentication failed: no auth, please sign in. Update ZImage cookie in Hub Settings and try again."
        );
      }
      throw new Error(`ZImage edit failed: ${reason}`);
    }
    throw error;
  } finally {
    removeFileQuietly(tempInputPath);
  }
};

const getStatePath = (folderAbsPath: string) =>
  path.join(folderAbsPath, AI_EDIT_STATE_FILE);

const normalizeStateRecord = (
  raw: unknown,
  folderAbsPath: string
): PendingAiEditRecord | null => {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<PendingAiEditRecord>;
  const providerRaw = String(row.provider ?? "").trim().toLowerCase();
  const modeRaw = String(row.mode ?? "").trim().toLowerCase();
  const statusRaw = String(row.status ?? "").trim().toLowerCase();
  if (!isProvider(providerRaw) || !isPromptMode(modeRaw) || statusRaw !== "pending") {
    return null;
  }
  if (!isModeSupported(providerRaw, modeRaw)) {
    return null;
  }
  const originalPath = normalizeRelativePath(String(row.originalPath ?? ""));
  const pendingPath = normalizeRelativePath(String(row.pendingPath ?? ""));
  if (!originalPath || !pendingPath || originalPath.includes("..") || pendingPath.includes("..")) {
    return null;
  }
  const originalAbs = resolveDraftPath(originalPath);
  const pendingAbs = resolveDraftPath(pendingPath);
  if (!originalAbs || !pendingAbs || !isWithinDraftRoot(originalAbs) || !isWithinDraftRoot(pendingAbs)) {
    return null;
  }
  if (path.dirname(originalAbs) !== folderAbsPath || path.dirname(pendingAbs) !== folderAbsPath) {
    return null;
  }
  if (!fs.existsSync(originalAbs) || !fs.statSync(originalAbs).isFile()) {
    removeFileQuietly(pendingAbs);
    return null;
  }
  if (!fs.existsSync(pendingAbs) || !fs.statSync(pendingAbs).isFile()) return null;

  const id = String(row.id ?? "").trim() || randomUUID();
  const prompt = String(row.prompt ?? "");
  const createdAt = String(row.createdAt ?? "").trim() || new Date().toISOString();
  const updatedAt = String(row.updatedAt ?? "").trim() || createdAt;

  return {
    id,
    originalPath,
    pendingPath,
    provider: providerRaw,
    mode: modeRaw,
    prompt,
    status: "pending",
    createdAt,
    updatedAt,
  };
};

const readFolderState = (folderAbsPath: string): AiEditStateFile => {
  const statePath = getStatePath(folderAbsPath);
  if (!fs.existsSync(statePath)) {
    return { version: 1, edits: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      edits?: unknown;
    };
    const source = Array.isArray(raw.edits) ? raw.edits : [];
    const edits = source
      .map((entry) => normalizeStateRecord(entry, folderAbsPath))
      .filter((entry): entry is PendingAiEditRecord => Boolean(entry));
    return { version: 1, edits };
  } catch {
    return { version: 1, edits: [] };
  }
};

const writeFolderState = (folderAbsPath: string, state: AiEditStateFile) => {
  const statePath = getStatePath(folderAbsPath);
  if (state.edits.length === 0) {
    removeFileQuietly(statePath);
    return;
  }
  const payload = {
    version: 1 as const,
    edits: state.edits,
  };
  fs.writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const removeFileQuietly = (absolutePath: string) => {
  try {
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch {}
};

const withEditQueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = editQueueTail.then(task, task);
  editQueueTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};

const loadPromptTemplate = (
  env: NodeJS.ProcessEnv,
  key: string,
  fallbackPath: string
) => {
  const raw = String(env[key] ?? "").trim();
  if (raw) return raw.replace(/\\n/g, "\n");
  try {
    return fs.readFileSync(fallbackPath, "utf8").trim();
  } catch {
    return "";
  }
};

const looksLikeSpu = (value: string) => /^[a-z0-9]{1,8}-\d{3,}$/i.test(value);

const extractSpuFromRelativePath = (relativePath: string) => {
  const parts = normalizeRelativePath(relativePath).split("/").filter(Boolean);
  const folderParts = parts.slice(0, -1);
  if (folderParts.length === 0) return null;
  // Prefer the segment right under the run folder when possible.
  if (folderParts.length >= 2 && looksLikeSpu(folderParts[1])) {
    return folderParts[1];
  }
  // Fallback: find the first segment that looks like an SPU code.
  for (const segment of folderParts) {
    if (looksLikeSpu(segment)) return segment;
  }
  return null;
};

const loadDraftProductContext = async (spu: string) => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  const { data, error } = await client
    .from("draft_products")
    .select(
      "draft_spu,draft_title,draft_description_html,draft_product_description_main_html,draft_mf_product_short_title,draft_mf_product_long_title",
      { count: "exact" }
    )
    .eq("draft_status", "draft")
    .eq("draft_spu", spu)
    .maybeSingle();

  if (error || !data) return null;

  const title =
    String(
      data.draft_mf_product_long_title ||
        data.draft_title ||
        data.draft_mf_product_short_title ||
        data.draft_spu ||
        spu
    ).trim() || spu;

  const description =
    stripHtmlToText(
      (data.draft_product_description_main_html as string | null) ||
        (data.draft_description_html as string | null) ||
        ""
    ).slice(0, 5000);

  return { spu, title, description };
};

const buildOpenAiChatCompletionsUrl = (env: NodeJS.ProcessEnv) => {
  const base = String(env.OPENAI_BASE_URL || env.OPENAI_IMAGE_BASE_URL || "").trim();
  if (!base) return "https://api.openai.com/v1/chat/completions";
  const trimmed = base.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
};

const generateDigidealMainPackage = async (input: {
  title: string;
  description: string;
  env: NodeJS.ProcessEnv;
}) => {
  const apiKey = String(input.env.OPENAI_API_KEY || input.env.OPENAI_IMAGE_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY (required for DigiDeal context generation).");
  }

  const model =
    String(
      input.env.DIGIDEAL_MAIN_CONTEXT_MODEL ||
        input.env.OPENAI_EDIT_MODEL ||
        "gpt-5.2"
    ).trim() || "gpt-5.2";

  const key = buildHash(`${model}\n${input.title}\n${input.description}`);
  const cached = digidealContextCache.get(key);
  if (cached && Date.now() - cached.createdAtMs < CONTEXT_CACHE_TTL_MS) {
    return cached.value;
  }

  const prompt = [
    "You create a short product context package for generating Swedish-market lifestyle product images.",
    "Use the provided title and description as the only source of truth.",
    "Tasks:",
    "1) Provide a short, concrete, visual description answering only: \"What is this product?\"",
    "   - Keep it to 1 sentence.",
    "   - Focus on physical/visual identity and intended use context at a high level (e.g. what it is for), without listing features.",
    "   - Avoid specs, numbers, connectivity, materials lists, brand/model names, or marketing phrasing.",
    "2) Provide 3-5 realistic Swedish-market usage environments/scenes where this product would naturally be used (each as one sentence).",
    "   - Each environment MUST be meaningfully different from the others (no repeats).",
    "   - Vary: room/location, time-of-day/lighting (e.g. bright daytime vs evening), and context (home/travel/outdoor if plausible).",
    "   - Prefer modern Nordic/Swedish settings when describing interiors (clean, contemporary home vibe).",
    "   - IMPORTANT: Prefix each usage environment with an explicit number like: \"1. ...\", \"2. ...\", \"3. ...\".",
    '3) Identify the best target user for the scene as one of: "male", "female", "child", "unisex".',
    "",
    "Return strict JSON only with this shape:",
    '{ "product_description": string, "usage_environments": string[], "target_user": "male"|"female"|"child"|"unisex" }',
    "No markdown, no extra keys.",
    "",
    `Title: ${input.title}`,
    "",
    `Main description: ${input.description || "-"}`,
  ].join("\n");

  const controller = new AbortController();
  const timeoutMs = 45000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(buildOpenAiChatCompletionsUrl(input.env), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI error (${response.status}): ${errText.slice(0, 300)}`);
    }

    const result = await response.json().catch(() => null);
    const content = String(result?.choices?.[0]?.message?.content || "").trim();
    const parsed = extractJsonFromText(content);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Unable to parse DigiDeal context response.");
    }

    const rawProduct = String((parsed as any).product_description || "").trim();
    const rawUser = String((parsed as any).target_user || "").trim().toLowerCase();
    const rawEnvs = Array.isArray((parsed as any).usage_environments)
      ? ((parsed as any).usage_environments as unknown[])
      : [];

    const usageEnvironments = rawEnvs
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .slice(0, 5);

    const targetUser =
      rawUser === "male" || rawUser === "female" || rawUser === "child" || rawUser === "unisex"
        ? rawUser
        : "unisex";

    const value = {
      product_description: rawProduct || input.title,
      usage_environments:
        usageEnvironments.length > 0
          ? usageEnvironments
          : ["A realistic Swedish everyday setting where the product is naturally used."],
      target_user: targetUser,
    };

    digidealContextCache.set(key, { key, createdAtMs: Date.now(), value });
    return value;
  } finally {
    clearTimeout(timer);
  }
};

const applyDigidealMainPackageToTemplate = (
  template: string,
  payload: {
    product_description: string;
    usage_environments: string[];
    target_user: string;
  },
  options?: {
    targetUserOverride?: "male" | "female" | "child" | "unisex";
    preferredEnvironmentIndex?: number;
  }
) => {
  const safeProduct = String(payload.product_description || "").trim();
  const safeUserRaw = String(payload.target_user || "").trim().toLowerCase();
  const safeUser =
    safeUserRaw === "male" ||
    safeUserRaw === "female" ||
    safeUserRaw === "child" ||
    safeUserRaw === "unisex"
      ? safeUserRaw
      : "unisex";
  const effectiveUser = options?.targetUserOverride ?? safeUser;
  const safeEnvs = Array.isArray(payload.usage_environments)
    ? payload.usage_environments.map((v) => String(v || "").trim()).filter(Boolean)
    : [];

  // Reinforce that the image is the source of truth and the product must remain unchanged.
  // This lives inside the context block so it always travels with the template preset.
  const productIntegrityNote = [
    "IMPORTANT: The input image is the source of truth.",
    "The product on the left-side studio shot must be identical to the original input image (100% unchanged).",
    "Do NOT redesign, replace, or infer product details from description alone; this description is only context.",
  ].join("\n");

  const preferredEnvironmentIndex = Number.isFinite(options?.preferredEnvironmentIndex)
    ? Math.max(1, Math.floor(options!.preferredEnvironmentIndex!))
    : null;
  const preferredEnvironmentNote =
    preferredEnvironmentIndex != null
      ? `For this output, prefer usage environment #${preferredEnvironmentIndex} from the list below.`
      : "";
  const sceneUserNote =
    effectiveUser === "male" || effectiveUser === "female" || effectiveUser === "child"
      ? `For this output, the person in the lifestyle scene should be: ${effectiveUser}.`
      : "";

  const productBlock = [
    productIntegrityNote,
    preferredEnvironmentNote,
    sceneUserNote,
    "",
    safeProduct,
    effectiveUser ? `Target user: ${effectiveUser}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const alreadyNumbered =
    safeEnvs.length > 0 && safeEnvs.every((line) => /^\s*\d+\.\s+/.test(line));
  const envBlock = alreadyNumbered
    ? safeEnvs.join("\n")
    : safeEnvs.map((line, idx) => `${idx + 1}. ${line}`).join("\n");

  const hasPlaceholders =
    /{{\s*INSERT_PRODUCT_DESCRIPTION_HERE\s*}}/.test(template) ||
    /{{\s*INSERT_ENVIRONMENT_SUGGESTIONS_HERE\s*}}/.test(template);

  let next = template
    .replace(/{{\s*INSERT_PRODUCT_DESCRIPTION_HERE\s*}}/g, productBlock)
    .replace(/{{\s*INSERT_ENVIRONMENT_SUGGESTIONS_HERE\s*}}/g, envBlock);
  if (!hasPlaceholders) {
    next = [
      "<Product_Description>",
      productBlock,
      "</Product_Description>",
      "",
      "<Product_Usage_Environments>",
      envBlock,
      "</Product_Usage_Environments>",
      "",
      next,
    ].join("\n");
  }
  return next;
};

const applyAdditionalGuidanceToTemplate = (template: string, guidance: string) => {
  const prompt = String(guidance || "").trim();
  if (!prompt) return template;

  const placeholders = [
    /{{\s*INSERT_MICRO_PROMPT_HERE\s*}}/g,
    /{{\s*INSERT_NANO_PROMPT_HERE\s*}}/g,
    /{{\s*INSERT_USER_PROMPT_HERE\s*}}/g,
    /{{\s*INSERT_USER_GUIDANCE_HERE\s*}}/g,
    /{{\s*INSERT_ADDITIONAL_GUIDANCE_HERE\s*}}/g,
  ];

  let next = template;
  let replaced = false;
  for (const pattern of placeholders) {
    if (pattern.test(next)) {
      next = next.replace(pattern, prompt);
      replaced = true;
    }
  }

  if (replaced) return next;

  return [
    next,
    "",
    "<Additional_User_Guidance>",
    prompt,
    "</Additional_User_Guidance>",
  ].join("\n");
};

const formatTimestampForFilename = (date: Date) => {
  const iso = date.toISOString(); // 2026-02-13T15:21:18.880Z
  const compact = iso.replace(/\.\d{3}Z$/, "Z");
  const y = compact.slice(0, 4);
  const mo = compact.slice(5, 7);
  const d = compact.slice(8, 10);
  const hh = compact.slice(11, 13);
  const mm = compact.slice(14, 16);
  const ss = compact.slice(17, 19);
  return `${y}${mo}${d}-${hh}${mm}${ss}`;
};

const detectImageExtension = (absolutePath: string) => {
  try {
    const fd = fs.openSync(absolutePath, "r");
    const header = Buffer.alloc(16);
    const bytes = fs.readSync(fd, header, 0, header.length, 0);
    fs.closeSync(fd);
    if (bytes >= 12) {
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      if (
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47
      ) {
        return ".png";
      }
      // JPEG: FF D8 FF
      if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
        return ".jpg";
      }
      // WEBP: RIFF....WEBP
      if (
        header[0] === 0x52 &&
        header[1] === 0x49 &&
        header[2] === 0x46 &&
        header[3] === 0x46 &&
        header[8] === 0x57 &&
        header[9] === 0x45 &&
        header[10] === 0x42 &&
        header[11] === 0x50
      ) {
        return ".webp";
      }
    }
  } catch {}
  return path.extname(absolutePath) || ".png";
};

const uniqueChildPath = (folderAbsPath: string, baseName: string, ext: string) => {
  const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
  let candidate = path.join(folderAbsPath, `${baseName}${safeExt}`);
  if (!fs.existsSync(candidate)) return candidate;
  let idx = 2;
  while (idx < 1000) {
    candidate = path.join(folderAbsPath, `${baseName}-${idx}${safeExt}`);
    if (!fs.existsSync(candidate)) return candidate;
    idx += 1;
  }
  return path.join(folderAbsPath, `${baseName}-${randomUUID()}${safeExt}`);
};

export const createTemplatePresetOutputs = (input: CreateTemplatePresetOutputsInput) =>
  withEditQueue(async () => {
    if (input.provider !== "chatgpt" && input.provider !== "gemini") {
      throw new Error("Template preset outputs only support ChatGPT or Gemini.");
    }
    if (input.templatePreset !== "digideal_main" && input.templatePreset !== "product_scene") {
      throw new Error("Unsupported template preset.");
    }
    const count = Math.max(1, Math.min(3, Math.floor(Number(input.count || 1))));

    const { absolutePath: originalAbsPath, relativePath: originalPath } = resolveImagePath(
      input.relativePath
    );
    const folderAbsPath = path.dirname(originalAbsPath);

    const now = new Date();
    const stamp = formatTimestampForFilename(now);
    const prefix = input.templatePreset === "digideal_main" ? "DD" : "SCENE";
    const suffixTag = input.templatePreset === "product_scene" ? " (ENV)" : "";
    const additionalPrompt = String(input.prompt || "").trim();

    const providerEnv = loadProcessorEnv();
    const mergedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...providerEnv,
    };
    await hydrateTemplateFromPromptManager(
      mergedEnv,
      input.provider,
      input.templatePreset,
      false
    );

    const presetKey =
      input.templatePreset === "digideal_main"
        ? "DIGIDEAL_MAIN_IMAGE_PROMPT_TEMPLATE"
        : "ENVIORMENT_SCENE_IMAGE_PROMPT_TEMPLATE";
    const presetFallbackPath =
      input.templatePreset === "digideal_main"
        ? DIGIDEAL_MAIN_PROMPT_PATH
        : ENVIORMENT_SCENE_PROMPT_PATH;
    const presetTemplate = loadPromptTemplate(mergedEnv, presetKey, presetFallbackPath);
    if (!presetTemplate.trim()) {
      throw new Error(`Prompt template "${input.templatePreset}" is missing or empty.`);
    }

    let digidealPkg:
      | { product_description: string; usage_environments: string[]; target_user: string }
      | null = null;
    if (input.templatePreset === "digideal_main") {
      const relative = toRelativePath(originalAbsPath);
      const spu = extractSpuFromRelativePath(relative);
      const context = spu ? await loadDraftProductContext(spu) : null;
      const title = context?.title || spu || path.parse(originalAbsPath).name;
      const description = context?.description || "";
      digidealPkg = await generateDigidealMainPackage({
        title,
        description,
        env: mergedEnv,
      });
    }

    const clampUser = (value: string | null | undefined) => {
      const raw = String(value || "").trim().toLowerCase();
      if (raw === "male" || raw === "female" || raw === "child" || raw === "unisex") return raw;
      return "unisex";
    };

    const oppositeUser = (value: "male" | "female" | "child" | "unisex") => {
      if (value === "male") return "female";
      if (value === "female") return "male";
      return value;
    };

    const buildUserPlan = (base: "male" | "female" | "child" | "unisex", outputs: number) => {
      if (outputs <= 1) return [base];
      if (base === "child") return Array.from({ length: outputs }, () => "child" as const);
      if (base === "unisex") {
        if (outputs === 2) return ["female", "male"] as const;
        return ["female", "male", "unisex"] as const;
      }
      // If the model leans male/female, still include an opposite-sex variant at least once.
      if (outputs === 2) return [base, oppositeUser(base)] as const;
      return [base, oppositeUser(base), base] as const;
    };

    const baseUser =
      input.templatePreset === "digideal_main" && digidealPkg
        ? (clampUser(digidealPkg.target_user) as "male" | "female" | "child" | "unisex")
        : "unisex";
    const userPlan = buildUserPlan(baseUser, count);

    const planned: { tmpAbs: string; finalAbs: string | null; idx: number }[] = [];
    for (let i = 1; i <= count; i += 1) {
      // Use .png as a safe temporary extension; we'll correct it after the tool returns.
      const baseName = `${prefix}-${i}-${stamp}${suffixTag}`;
      const tmpAbs = uniqueChildPath(folderAbsPath, baseName, ".png");
      planned.push({ tmpAbs, finalAbs: null, idx: i });
    }

    planned.forEach((row) => removeFileQuietly(row.tmpAbs));

    const tasks = planned.map(async (row) => {
      let promptTemplateOverride = presetTemplate;
      if (input.templatePreset === "digideal_main" && digidealPkg) {
        const envCount = digidealPkg.usage_environments?.length || 0;
        const preferredEnvironmentIndex =
          envCount > 0 ? ((row.idx - 1) % envCount) + 1 : row.idx;
        promptTemplateOverride = applyDigidealMainPackageToTemplate(presetTemplate, digidealPkg, {
          targetUserOverride: userPlan[Math.min(userPlan.length - 1, row.idx - 1)],
          preferredEnvironmentIndex,
        });
      } else if (input.templatePreset === "product_scene" && count > 1) {
        promptTemplateOverride = [
          presetTemplate,
          "",
          `Variation directive: Output ${row.idx}/${count}. Choose a distinct Swedish lifestyle environment and lighting/time-of-day compared to the other outputs.`,
        ].join("\n");
      }
      if (input.templatePreset === "digideal_main" && additionalPrompt) {
        promptTemplateOverride = applyAdditionalGuidanceToTemplate(
          promptTemplateOverride,
          additionalPrompt
        );
      }

      const runtimeConfig = await runImageEditScript({
        originalAbsPath,
        pendingAbsPath: row.tmpAbs,
        provider: input.provider,
        mode: "template",
        prompt: "",
        templatePreset: "standard",
        promptTemplateOverride,
      });

      if (!fs.existsSync(row.tmpAbs) || fs.statSync(row.tmpAbs).size <= 0) {
        throw new Error("AI edit returned no image.");
      }

      const detectedExt = detectImageExtension(row.tmpAbs);
      const parsed = path.parse(row.tmpAbs);
      const desiredAbs = detectedExt === parsed.ext
        ? row.tmpAbs
        : uniqueChildPath(folderAbsPath, parsed.name, detectedExt);

      if (desiredAbs !== row.tmpAbs) {
        if (!moveFileWithFallback(row.tmpAbs, desiredAbs)) {
          // Keep the temporary file rather than losing output.
          row.finalAbs = row.tmpAbs;
        } else {
          row.finalAbs = desiredAbs;
        }
      } else {
        row.finalAbs = row.tmpAbs;
      }

      return { runtimeConfig };
    });

    // Run the requested outputs in parallel (max 3) within the global edit queue.
    await Promise.all(tasks);

    const createdPaths = planned
      .map((row) => row.finalAbs)
      .filter((abs): abs is string => Boolean(abs))
      .map((abs) => toRelativePath(abs));

    appendAiEditLog({
      action: "preset_outputs",
      requested_by: input.requestedBy,
      provider: input.provider,
      template_preset: input.templatePreset,
      guidance_length: additionalPrompt.length,
      original_path: originalPath,
      created_paths: createdPaths,
    });

    return createdPaths;
  });

const runImageEditScript = async (input: {
  originalAbsPath: string;
  pendingAbsPath: string;
  provider: AiEditProvider;
  mode: AiPromptMode;
  prompt: string;
  templatePreset?: AiTemplatePreset;
  promptTemplateOverride?: string;
}) => {
  const providerEnv = input.provider === "zimage" ? loadZImageEnv() : loadProcessorEnv();
  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...providerEnv,
  };
  if (input.provider === "chatgpt" || input.provider === "gemini") {
    await hydrateTemplateFromPromptManager(
      mergedEnv,
      input.provider,
      input.templatePreset ?? "standard",
      Boolean(String(input.promptTemplateOverride || "").trim())
    );
  }
  const maxAttempts = readPositiveInt(providerEnv, "IMAGE_EDIT_MAX_ATTEMPTS", 2);
  const timeoutMs = readPositiveInt(providerEnv, "IMAGE_EDIT_TIMEOUT_MS", 180000);
  const retryBackoffMs = readPositiveInt(providerEnv, "IMAGE_EDIT_RETRY_BACKOFF_MS", 1500);

  if (!isModeSupported(input.provider, input.mode)) {
    throw new Error(`Mode "${input.mode}" is not supported for provider "${input.provider}".`);
  }

  if (
    input.provider === "chatgpt" &&
    !String(mergedEnv.OPENAI_API_KEY ?? mergedEnv.OPENAI_IMAGE_API_KEY ?? "").trim()
  ) {
    throw new Error("OPENAI_API_KEY (or OPENAI_IMAGE_API_KEY) is missing.");
  }
  if (input.provider === "gemini" && !String(mergedEnv.GEMINI_API_KEY ?? "").trim()) {
    throw new Error("GEMINI_API_KEY is missing.");
  }
  if (
    input.provider === "zimage" &&
    input.mode !== "auto_center_white" &&
    !String(mergedEnv.ZIMAGE_COOKIE ?? "").trim()
  ) {
    throw new Error("ZIMAGE_COOKIE is missing.");
  }

  const templatePreset: AiTemplatePreset = input.templatePreset ?? "standard";

  // Allow the caller to fully override the template prompt (used for multi-output presets).
  if (
    (input.provider === "chatgpt" || input.provider === "gemini") &&
    input.mode === "template" &&
    String(input.promptTemplateOverride || "").trim()
  ) {
    const nextTemplate = String(input.promptTemplateOverride || "").trim();
    if (input.provider === "chatgpt") {
      mergedEnv.OPENAI_IMAGE_PROMPT_TEMPLATE = nextTemplate;
    } else {
      mergedEnv.GEMINI_IMAGE_PROMPT_TEMPLATE = nextTemplate;
    }
  } else if (
    (input.provider === "chatgpt" || input.provider === "gemini") &&
    input.mode === "template" &&
    templatePreset !== "standard"
  ) {
    const presetKey =
      templatePreset === "digideal_main"
        ? "DIGIDEAL_MAIN_IMAGE_PROMPT_TEMPLATE"
        : "ENVIORMENT_SCENE_IMAGE_PROMPT_TEMPLATE";
    const presetFallbackPath =
      templatePreset === "digideal_main"
        ? DIGIDEAL_MAIN_PROMPT_PATH
        : ENVIORMENT_SCENE_PROMPT_PATH;
    const presetTemplate = loadPromptTemplate(mergedEnv, presetKey, presetFallbackPath);
    if (!presetTemplate.trim()) {
      throw new Error(`Prompt template "${templatePreset}" is missing or empty.`);
    }

    let nextTemplate = presetTemplate;
    if (templatePreset === "digideal_main") {
      const relative = toRelativePath(input.originalAbsPath);
      const spu = extractSpuFromRelativePath(relative);
      const context = spu ? await loadDraftProductContext(spu) : null;
      const title = context?.title || spu || path.parse(input.originalAbsPath).name;
      const description = context?.description || "";

      const pkg = await generateDigidealMainPackage({
        title,
        description,
        env: mergedEnv,
      });
      nextTemplate = applyDigidealMainPackageToTemplate(nextTemplate, pkg);
      if (String(input.prompt || "").trim()) {
        nextTemplate = applyAdditionalGuidanceToTemplate(nextTemplate, input.prompt);
      }
    }

    if (input.provider === "chatgpt") {
      mergedEnv.OPENAI_IMAGE_PROMPT_TEMPLATE = nextTemplate;
    } else {
      mergedEnv.GEMINI_IMAGE_PROMPT_TEMPLATE = nextTemplate;
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (input.provider === "chatgpt") {
        const args = [
          CHATGPT_SCRIPT_PATH,
          "--image",
          input.originalAbsPath,
          "--prompt",
          input.prompt,
          "--output",
          input.pendingAbsPath,
        ];
        const model = String(mergedEnv.OPENAI_IMAGE_MODEL ?? "").trim();
        if (model) args.push("--model", model);
        if (input.mode === "direct") args.push("--direct");
        await runScript({
          command: process.execPath,
          args,
          env: mergedEnv,
          timeoutMs,
        });
        await convertImageFileToJpegInPlace(input.pendingAbsPath);
      } else if (input.provider === "gemini") {
        const args = [
          GEMINI_SCRIPT_PATH,
          "--image",
          input.originalAbsPath,
          "--prompt",
          input.prompt,
          "--output",
          input.pendingAbsPath,
        ];
        const model = String(mergedEnv.GEMINI_IMAGE_MODEL ?? "").trim();
        if (model) args.push("--model", model);
        if (input.mode === "direct") args.push("--direct");
        await runScript({
          command: resolveGeminiPython(),
          args,
          env: mergedEnv,
          timeoutMs,
        });
        await convertImageFileToJpegInPlace(input.pendingAbsPath);
      } else if (input.mode === "white_background") {
        await runZImageTool({
          scriptPath: ZIMAGE_BG_REMOVAL_SCRIPT_PATH,
          originalAbsPath: input.originalAbsPath,
          pendingAbsPath: input.pendingAbsPath,
          env: mergedEnv,
          timeoutMs,
        });
        await convertImageFileToJpegInPlace(input.pendingAbsPath);
      } else if (input.mode === "upscale") {
        await runZImageTool({
          scriptPath: ZIMAGE_UPSCALE_SCRIPT_PATH,
          originalAbsPath: input.originalAbsPath,
          pendingAbsPath: input.pendingAbsPath,
          env: mergedEnv,
          timeoutMs,
        });
        await convertImageFileToJpegInPlace(input.pendingAbsPath);
      } else if (input.mode === "auto_center_white") {
        fs.copyFileSync(input.originalAbsPath, input.pendingAbsPath);
        try {
          await runAutoCenterWhiteInPlace(input.pendingAbsPath);
        } catch (err) {
          removeFileQuietly(input.pendingAbsPath);
          throw err;
        }
        await convertImageFileToJpegInPlace(input.pendingAbsPath);
      } else if (input.mode === "eraser") {
        await runZImageTool({
          scriptPath: ZIMAGE_ERASER_SCRIPT_PATH,
          originalAbsPath: input.originalAbsPath,
          pendingAbsPath: input.pendingAbsPath,
          prompt: input.prompt,
          env: mergedEnv,
          timeoutMs,
        });
        await convertImageFileToJpegInPlace(input.pendingAbsPath);
      } else {
        await runZImageTool({
          scriptPath: ZIMAGE_IMAGE_TO_IMAGE_SCRIPT_PATH,
          originalAbsPath: input.originalAbsPath,
          pendingAbsPath: input.pendingAbsPath,
          prompt: input.prompt,
          env: mergedEnv,
          timeoutMs,
        });
        await convertImageFileToJpegInPlace(input.pendingAbsPath);
      }

      // Every AI-generated output should pass through auto-center white background.
      // auto_center_white mode already ran it above.
      if (input.mode !== "auto_center_white") {
        await runAutoCenterWhiteInPlace(input.pendingAbsPath);
        await convertImageFileToJpegInPlace(input.pendingAbsPath);
      }

      return {
        maxAttempts,
        timeoutMs,
        retryBackoffMs,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        await delay(retryBackoffMs);
      }
    }
  }

  throw lastError ?? new Error("Image edit failed.");
};

export const listPendingAiEdits = (relativeFolderPath: string) => {
  const folderAbsPath = resolveFolderPath(relativeFolderPath);
  const state = readFolderState(folderAbsPath);
  writeFolderState(folderAbsPath, state);
  return state.edits;
};

export const createPendingAiEdit = (input: CreatePendingAiEditInput) =>
  withEditQueue(async () => {
    if (!isModeSupported(input.provider, input.mode)) {
      throw new Error(`Mode "${input.mode}" is not supported for provider "${input.provider}".`);
    }
    const prompt = String(input.prompt ?? "").trim();
    if ((input.mode === "direct" || input.mode === "eraser") && !prompt) {
      throw new Error(
        input.mode === "eraser"
          ? "Prompt is required for Z-image eraser."
          : "Prompt is required in direct mode."
      );
    }

    const { absolutePath: originalAbsPath, relativePath: originalPath } = resolveImagePath(
      input.relativePath
    );
    const folderAbsPath = path.dirname(originalAbsPath);
    const pendingName = buildPendingImageName(originalAbsPath, input.provider);
    const pendingAbsPath = path.join(folderAbsPath, pendingName);
    const pendingPath = toRelativePath(pendingAbsPath);

    removeFileQuietly(pendingAbsPath);

    const runtimeConfig = await runImageEditScript({
      originalAbsPath,
      pendingAbsPath,
      provider: input.provider,
      mode: input.mode,
      prompt,
      templatePreset: input.templatePreset,
    });

    if (!fs.existsSync(pendingAbsPath) || fs.statSync(pendingAbsPath).size <= 0) {
      throw new Error("AI edit returned no image.");
    }

    const state = readFolderState(folderAbsPath);
    const nextEdits: PendingAiEditRecord[] = [];
    for (const row of state.edits) {
      if (row.originalPath === originalPath) {
        const oldPendingAbs = resolveDraftPath(row.pendingPath);
        if (oldPendingAbs) {
          removeFileQuietly(oldPendingAbs);
        }
        continue;
      }
      nextEdits.push(row);
    }

    const now = new Date().toISOString();
    const record: PendingAiEditRecord = {
      id: randomUUID(),
      originalPath,
      pendingPath,
      provider: input.provider,
      mode: input.mode,
      prompt,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    nextEdits.push(record);
    writeFolderState(folderAbsPath, { version: 1, edits: nextEdits });

    appendAiEditLog({
      action: "create",
      requested_by: input.requestedBy,
      provider: input.provider,
      mode: input.mode,
      template_preset: input.mode === "template" ? input.templatePreset ?? "standard" : undefined,
      original_path: originalPath,
      pending_path: pendingPath,
      timeout_ms: runtimeConfig.timeoutMs,
      max_attempts: runtimeConfig.maxAttempts,
      retry_backoff_ms: runtimeConfig.retryBackoffMs,
    });

    return record;
  });

export const resolvePendingAiEdit = (input: ResolvePendingAiEditInput) =>
  withEditQueue(async () => {
    const { absolutePath: originalAbsPath, relativePath: originalPath } = resolveImagePath(
      input.originalPath
    );
    const folderAbsPath = path.dirname(originalAbsPath);
    const state = readFolderState(folderAbsPath);
    const index = state.edits.findIndex((row) => row.originalPath === originalPath);
    if (index < 0) {
      throw new Error("No pending AI edit found for this image.");
    }

    const record = state.edits[index];
    const pendingAbsPath = resolveDraftPath(record.pendingPath);
    if (!pendingAbsPath || !isWithinDraftRoot(pendingAbsPath)) {
      throw new Error("Pending AI image path is invalid.");
    }

    if (input.decision === "replace_with_ai") {
      if (!fs.existsSync(pendingAbsPath) || !fs.statSync(pendingAbsPath).isFile()) {
        throw new Error("Pending AI image was not found.");
      }
      saveDraftImageUndoBackup(originalAbsPath);
      fs.copyFileSync(pendingAbsPath, originalAbsPath);
    } else if (input.decision === "keep_both") {
      if (!fs.existsSync(pendingAbsPath) || !fs.statSync(pendingAbsPath).isFile()) {
        throw new Error("Pending AI image was not found.");
      }
      const providerSuffix =
        record.provider === "chatgpt"
          ? "-ChatGPT-edit"
          : record.provider === "gemini"
            ? "-Gemini-edit"
            : "-ZImage-edit";
      const uneditedAbsPath = uniqueSiblingPath(originalAbsPath, "-unedited");
      const editedAbsPath = uniqueSiblingPath(originalAbsPath, providerSuffix);
      if (!moveFileWithFallback(originalAbsPath, uneditedAbsPath)) {
        throw new Error("Unable to preserve the original image.");
      }
      if (!moveFileWithFallback(pendingAbsPath, editedAbsPath)) {
        moveFileWithFallback(uneditedAbsPath, originalAbsPath);
        throw new Error("Unable to keep the AI-edited image.");
      }
    }

    removeFileQuietly(pendingAbsPath);
    const next = [...state.edits];
    next.splice(index, 1);
    writeFolderState(folderAbsPath, { version: 1, edits: next });

    appendAiEditLog({
      action: "resolve",
      requested_by: input.requestedBy,
      decision: input.decision,
      original_path: originalPath,
      pending_path: record.pendingPath,
    });

    return record;
  });

export const createCopyOfDraftFile = (relativePath: string) => {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath || normalizedPath.includes("..")) {
    throw new Error("Invalid path.");
  }
  const absolutePath = resolveDraftPath(normalizedPath);
  if (!absolutePath || !isWithinDraftRoot(absolutePath)) {
    throw new Error("Invalid path.");
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error("File not found.");
  }

  const folderAbsPath = path.dirname(absolutePath);
  const parsed = path.parse(path.basename(absolutePath));
  let suffix = "";
  let index = 1;
  let targetAbsPath = "";
  while (true) {
    suffix = index === 1 ? "-copy" : `-copy-${index}`;
    targetAbsPath = path.join(folderAbsPath, `${parsed.name}${suffix}${parsed.ext}`);
    if (!fs.existsSync(targetAbsPath)) break;
    index += 1;
  }
  fs.copyFileSync(absolutePath, targetAbsPath);
  const relativeCopyPath = toRelativePath(targetAbsPath);
  appendAiEditLog({
    action: "copy",
    source_path: toRelativePath(absolutePath),
    copy_path: relativeCopyPath,
  });
  return {
    name: path.basename(targetAbsPath),
    path: relativeCopyPath,
  };
};
