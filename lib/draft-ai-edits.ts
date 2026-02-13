import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";

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

let editQueueTail: Promise<void> = Promise.resolve();

const normalizeRelativePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/^\/+/, "");

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (isQuoted) {
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
  if (raw) return raw;
  try {
    return fs.readFileSync(fallbackPath, "utf8").trim();
  } catch {
    return "";
  }
};

const runImageEditScript = async (input: {
  originalAbsPath: string;
  pendingAbsPath: string;
  provider: AiEditProvider;
  mode: AiPromptMode;
  prompt: string;
  templatePreset?: AiTemplatePreset;
}) => {
  const providerEnv = input.provider === "zimage" ? loadZImageEnv() : loadProcessorEnv();
  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...providerEnv,
  };
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
  if (
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
    if (input.provider === "chatgpt") {
      mergedEnv.OPENAI_IMAGE_PROMPT_TEMPLATE = presetTemplate;
    } else {
      mergedEnv.GEMINI_IMAGE_PROMPT_TEMPLATE = presetTemplate;
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
      } else if (input.mode === "white_background") {
        await runZImageTool({
          scriptPath: ZIMAGE_BG_REMOVAL_SCRIPT_PATH,
          originalAbsPath: input.originalAbsPath,
          pendingAbsPath: input.pendingAbsPath,
          env: mergedEnv,
          timeoutMs,
        });
      } else if (input.mode === "upscale") {
        await runZImageTool({
          scriptPath: ZIMAGE_UPSCALE_SCRIPT_PATH,
          originalAbsPath: input.originalAbsPath,
          pendingAbsPath: input.pendingAbsPath,
          env: mergedEnv,
          timeoutMs,
        });
      } else if (input.mode === "auto_center_white") {
        fs.copyFileSync(input.originalAbsPath, input.pendingAbsPath);
        try {
          await runScript({
            command: resolveGeminiPython(),
            args: [AUTO_CENTER_SCRIPT_PATH, "--file", input.pendingAbsPath],
            env: mergedEnv,
            timeoutMs,
            cwd: PROCESSOR_ROOT,
          });
        } catch (err) {
          removeFileQuietly(input.pendingAbsPath);
          throw err;
        }
      } else if (input.mode === "eraser") {
        await runZImageTool({
          scriptPath: ZIMAGE_ERASER_SCRIPT_PATH,
          originalAbsPath: input.originalAbsPath,
          pendingAbsPath: input.pendingAbsPath,
          prompt: input.prompt,
          env: mergedEnv,
          timeoutMs,
        });
      } else {
        await runZImageTool({
          scriptPath: ZIMAGE_IMAGE_TO_IMAGE_SCRIPT_PATH,
          originalAbsPath: input.originalAbsPath,
          pendingAbsPath: input.pendingAbsPath,
          prompt: input.prompt,
          env: mergedEnv,
          timeoutMs,
        });
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
