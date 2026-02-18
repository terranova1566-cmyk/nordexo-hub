import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

const OPENCLAW_ROOT = "/srv/openclaw";
const LAB_ROOT = path.join(OPENCLAW_ROOT, "labs", "ecom-agent-lab");
const LAB_CONFIG_PATH = path.join(LAB_ROOT, "config", "openclaw.ecom-lab.json5");
const LAB_STATE_DIR = path.join(LAB_ROOT, "runtime", "state");
const HIERARCHY_PATH = path.join(LAB_ROOT, "hierarchy.json");
const MISSIONS_DIR = path.join(LAB_ROOT, "missions");
const BUDGET_LEDGER_PATH = path.join(LAB_ROOT, "runtime", "budget-ledger.json");
const WORKSPACES_DIR = path.join(LAB_ROOT, "workspaces");
const API_KEY_STORE_PATH = path.join(LAB_STATE_DIR, "keys.local.json");

const SUPPORTED_API_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "BRAVE_API_KEY",
  "PERPLEXITY_API_KEY",
  "OPENROUTER_API_KEY",
] as const;

type SupportedApiKey = (typeof SUPPORTED_API_KEYS)[number];

type KeySource = "process" | "vault" | "env-file";

type ApiKeyStatus = {
  key: SupportedApiKey;
  present: boolean;
  masked: string | null;
  source: KeySource | null;
};

type MissionSpec = {
  id: string;
  title: string;
  agentId: string;
  priority?: string;
  schedule?: string;
  maxRunsPerDay: number;
  budgetUsdPerRun: number;
  timeoutSeconds?: number;
  objective: string;
};

type GuardrailCheck = {
  agentId: string;
  passed: boolean;
  checks: {
    sandboxAllMode: boolean;
    workspaceIsIsolated: boolean;
    writesBlocked: boolean;
    runtimeExecBlocked: boolean;
    elevatedDisabled: boolean;
  };
};

type StatusSnapshot = {
  generatedAt: string;
  configPath: string;
  stateDir: string;
  missionCount: number;
  ledger: {
    date: string;
    dailyBudgetUsd: number;
    spentUsd: number;
    remainingUsd: number;
    runsToday: number;
  };
  agents: Array<{
    id: string;
    name?: string;
    workspace?: string;
    agentDir?: string;
    model?: string;
  }>;
  guardrails: GuardrailCheck[];
  sessions: {
    count: number;
    recent: Array<{
      key: string;
      updatedAt?: number;
      model?: string;
      totalTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
    }>;
  };
  warnings: string[];
};

type LedgerRecord = {
  runId: string;
  missionId: string;
  missionTitle: string;
  agentId: string;
  status: "success" | "failed";
  startedAt: string;
  completedAt: string;
  estimatedCostUsd: number;
  reportPath: string;
  handoff?: {
    manifestPath: string;
    csvPath: string | null;
    reviewedCsvPath?: string | null;
    txtPath: string;
    findingCount: number;
    quality?: {
      accepted: number;
      review: number;
      rejected: number;
      staleGeneratedAt: boolean;
    };
  };
};

type HierarchyFile = {
  version: number;
  updatedAt: string;
  objective: string;
  command: {
    primary: string;
    workers: string[];
    handoff: string;
  };
  agents: Array<{
    id: string;
    role: string;
    responsibilities?: string[];
    canSpawn?: string[];
    cannot?: string[];
  }>;
  exportContract?: {
    stagingOnly?: boolean;
    path?: string;
    format?: string;
    requiredFields?: string[];
  };
};

type ExecResult<T = unknown> = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  data?: T;
};

type ApiUserContext = {
  userId: string;
  isAdmin: boolean;
};

function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return "********";
  }
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

function parseJsonLoose<T>(raw: string): T {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Expected JSON output but received empty response.");
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const firstBracket = trimmed.indexOf("[");
    const starts = [firstBrace, firstBracket].filter((value) => value >= 0);
    if (starts.length === 0) {
      throw new Error("Unable to locate JSON payload in command output.");
    }
    const start = Math.min(...starts);
    const candidate = trimmed.slice(start);
    const lastBrace = candidate.lastIndexOf("}");
    const lastBracket = candidate.lastIndexOf("]");
    const end = Math.max(lastBrace, lastBracket);
    if (end < 0) {
      throw new Error("Unable to parse JSON payload from command output.");
    }
    return JSON.parse(candidate.slice(0, end + 1)) as T;
  }
}

function parseEnvFile(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function loadEnvFile(filePath: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return parseEnvFile(raw);
  } catch {
    return {};
  }
}

async function loadKeyVault(): Promise<Partial<Record<SupportedApiKey, string>>> {
  try {
    const raw = await fs.readFile(API_KEY_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Partial<Record<SupportedApiKey, string>> = {};
    for (const key of SUPPORTED_API_KEYS) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim().length > 0) {
        result[key] = value.trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

async function resolveApiKeys() {
  const sources = new Map<SupportedApiKey, KeySource>();
  const values = new Map<SupportedApiKey, string>();

  const envFiles = [
    "/srv/.env.local",
    path.join(OPENCLAW_ROOT, ".env"),
    path.join(OPENCLAW_ROOT, ".env.local"),
  ];

  for (const envFile of envFiles) {
    const parsed = await loadEnvFile(envFile);
    for (const key of SUPPORTED_API_KEYS) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim().length > 0) {
        values.set(key, value.trim());
        sources.set(key, "env-file");
      }
    }
  }

  const vault = await loadKeyVault();
  for (const key of SUPPORTED_API_KEYS) {
    const value = vault[key];
    if (typeof value === "string" && value.trim().length > 0) {
      values.set(key, value.trim());
      sources.set(key, "vault");
    }
  }

  for (const key of SUPPORTED_API_KEYS) {
    const envValue = process.env[key];
    if (typeof envValue === "string" && envValue.trim().length > 0) {
      values.set(key, envValue.trim());
      sources.set(key, "process");
    }
  }

  const keyEnv: Record<string, string> = {};
  const keyStatus: ApiKeyStatus[] = SUPPORTED_API_KEYS.map((key) => {
    const value = values.get(key);
    if (value) {
      keyEnv[key] = value;
    }
    return {
      key,
      present: Boolean(value),
      masked: value ? maskSecret(value) : null,
      source: (sources.get(key) ?? null) as KeySource | null,
    };
  });

  return { keyEnv, keyStatus };
}

async function runMissionControl<T = unknown>(
  args: string[],
  options: { expectJson?: boolean } = {},
): Promise<ExecResult<T>> {
  const { keyEnv } = await resolveApiKeys();
  const expectJson = options.expectJson !== false;

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", "tsx", "scripts/ecom-mission-control.ts", ...args],
      {
        cwd: OPENCLAW_ROOT,
        maxBuffer: 12 * 1024 * 1024,
        env: {
          ...process.env,
          ...keyEnv,
        },
      },
    );

    return {
      ok: true,
      exitCode: 0,
      stdout,
      stderr,
      data: expectJson ? parseJsonLoose<T>(stdout) : undefined,
    };
  } catch (error) {
    const err = error as Error & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };

    const stdout = err.stdout ?? "";
    const stderr = err.stderr ?? err.message;
    let parsed: T | undefined;
    if (expectJson && stdout.trim()) {
      try {
        parsed = parseJsonLoose<T>(stdout);
      } catch {
        parsed = undefined;
      }
    }

    return {
      ok: false,
      exitCode: typeof err.code === "number" ? err.code : 1,
      stdout,
      stderr,
      data: parsed,
    };
  }
}

async function runOpenClawCli(args: string[]): Promise<ExecResult> {
  const { keyEnv } = await resolveApiKeys();
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["scripts/run-node.mjs", ...args],
      {
        cwd: OPENCLAW_ROOT,
        maxBuffer: 12 * 1024 * 1024,
        env: {
          ...process.env,
          ...keyEnv,
          OPENCLAW_CONFIG_PATH: LAB_CONFIG_PATH,
          OPENCLAW_STATE_DIR: LAB_STATE_DIR,
          OPENCLAW_RUNNER_LOG: "0",
          FORCE_COLOR: "0",
        },
      },
    );
    return { ok: true, exitCode: 0, stdout, stderr };
  } catch (error) {
    const err = error as Error & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      ok: false,
      exitCode: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message,
    };
  }
}

async function requireApiUser(): Promise<ApiUserContext | NextResponse> {
  const supabase = await createServerSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (settingsError) {
    return NextResponse.json({ error: "Unable to verify permissions." }, { status: 500 });
  }

  return {
    userId: userData.user.id,
    isAdmin: Boolean(settings?.is_admin),
  };
}

async function loadHierarchy(): Promise<HierarchyFile> {
  const raw = await fs.readFile(HIERARCHY_PATH, "utf8");
  return JSON.parse(raw) as HierarchyFile;
}

async function saveHierarchy(hierarchy: HierarchyFile) {
  const next: HierarchyFile = {
    ...hierarchy,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(HIERARCHY_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

async function loadMissions(): Promise<MissionSpec[]> {
  const entries = await fs.readdir(MISSIONS_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(MISSIONS_DIR, entry.name))
    .sort();

  const missions: MissionSpec[] = [];
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    missions.push(JSON.parse(raw) as MissionSpec);
  }
  return missions;
}

async function loadRecentRuns(limit = 20): Promise<LedgerRecord[]> {
  try {
    const raw = await fs.readFile(BUDGET_LEDGER_PATH, "utf8");
    const parsed = JSON.parse(raw) as {
      days?: Record<string, { runs?: LedgerRecord[] }>;
    };
    const runs = Object.values(parsed.days ?? {})
      .flatMap((day) => day.runs ?? [])
      .sort((a, b) => {
        const aTs = Date.parse(a.completedAt || a.startedAt || "");
        const bTs = Date.parse(b.completedAt || b.startedAt || "");
        return bTs - aTs;
      })
      .slice(0, limit);
    return runs;
  } catch {
    return [];
  }
}

function normalizeRoleId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function createRole(params: {
  roleId: string;
  roleName: string;
  responsibilities: string[];
  model: string;
  cannot?: string[];
}) {
  const roleId = normalizeRoleId(params.roleId);
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(roleId)) {
    throw new Error("Role id must be 2-32 chars and contain only lowercase letters, numbers, and hyphens.");
  }

  const hierarchy = await loadHierarchy();
  if (hierarchy.agents.some((agent) => agent.id === roleId)) {
    throw new Error(`Role ${roleId} already exists.`);
  }

  const workspaceDir = path.join(WORKSPACES_DIR, roleId);
  await fs.mkdir(workspaceDir, { recursive: true });

  const rolePrompt = [
    `# ${params.roleName}`,
    "",
    "You are an NX Agents role in the e-commerce lab.",
    "",
    "## Responsibilities",
    ...(params.responsibilities.length > 0
      ? params.responsibilities.map((item) => `- ${item}`)
      : ["- Execute assigned missions with evidence-backed outputs."]),
    "",
    "## Rules",
    "- Use only approved tools.",
    "- Return structured JSON whenever possible.",
    "- Include source URLs for all important claims.",
  ].join("\n");

  await fs.writeFile(path.join(workspaceDir, "AGENTS.md"), `${rolePrompt}\n`, "utf8");

  const addAgentResult = await runOpenClawCli([
    "agents",
    "add",
    roleId,
    "--workspace",
    workspaceDir,
    "--model",
    params.model,
    "--non-interactive",
    "--json",
  ]);

  if (!addAgentResult.ok) {
    throw new Error(`Unable to add OpenClaw agent: ${addAgentResult.stderr || addAgentResult.stdout}`);
  }

  const updatedWorkers = Array.from(new Set([...(hierarchy.command.workers ?? []), roleId]));
  hierarchy.command.workers = updatedWorkers;

  hierarchy.agents.push({
    id: roleId,
    role: params.roleName,
    responsibilities: params.responsibilities,
    cannot: params.cannot ?? ["file writes", "runtime execution"],
  });
  await saveHierarchy(hierarchy);

  const currentAllow = await runOpenClawCli([
    "config",
    "get",
    "agents.list[0].subagents.allowAgents",
    "--json",
  ]);

  let allowAgents: string[] = [];
  if (currentAllow.ok && currentAllow.stdout.trim()) {
    try {
      allowAgents = parseJsonLoose<string[]>(currentAllow.stdout);
    } catch {
      allowAgents = [];
    }
  }
  const nextAllowAgents = Array.from(new Set([...allowAgents, roleId]));

  const setAllow = await runOpenClawCli([
    "config",
    "set",
    "agents.list[0].subagents.allowAgents",
    JSON.stringify(nextAllowAgents),
    "--json",
  ]);
  if (!setAllow.ok) {
    throw new Error(`Created role but failed to update orchestrator spawn allowlist: ${setAllow.stderr || setAllow.stdout}`);
  }

  return {
    roleId,
    roleName: params.roleName,
    workspaceDir,
    model: params.model,
    responsibilities: params.responsibilities,
  };
}

async function syncAuthProfiles() {
  const sourceCandidates = [
    "/root/.openclaw/agents/main/agent/auth-profiles.json",
    "/root/.openclaw/agents/codex/agent/auth-profiles.json",
    "/root/.openclaw/auth-profiles.json",
  ];

  let sourcePath: string | null = null;
  for (const candidate of sourceCandidates) {
    try {
      await fs.access(candidate);
      sourcePath = candidate;
      break;
    } catch {
      // Try next source.
    }
  }

  if (!sourcePath) {
    throw new Error("No source auth-profiles.json file was found in default OpenClaw locations.");
  }

  const agentsResult = await runMissionControl<StatusSnapshot>(["status", "--json"]);
  if (!agentsResult.ok || !agentsResult.data) {
    throw new Error(`Unable to load agents before profile sync: ${agentsResult.stderr || agentsResult.stdout}`);
  }

  const copiedTo: string[] = [];
  for (const agent of agentsResult.data.agents ?? []) {
    const agentDir = agent.agentDir;
    if (!agentDir) {
      continue;
    }
    const targetPath = path.join(agentDir, "auth-profiles.json");
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    copiedTo.push(targetPath);
  }

  return { sourcePath, copiedTo };
}

async function upsertApiKeys(keys: Partial<Record<SupportedApiKey, string>>) {
  await fs.mkdir(path.dirname(API_KEY_STORE_PATH), { recursive: true });
  const existing = await loadKeyVault();
  const merged: Partial<Record<SupportedApiKey, string>> = { ...existing };

  for (const key of SUPPORTED_API_KEYS) {
    if (!(key in keys)) {
      continue;
    }
    const value = keys[key];
    if (typeof value === "string" && value.trim().length > 0) {
      merged[key] = value.trim();
    } else {
      delete merged[key];
    }
  }

  await fs.writeFile(API_KEY_STORE_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  await fs.chmod(API_KEY_STORE_PATH, 0o600);
}

export async function GET() {
  const userContext = await requireApiUser();
  if (userContext instanceof NextResponse) {
    return userContext;
  }

  const bootstrapResult = await runMissionControl(["bootstrap"], { expectJson: false });
  if (!bootstrapResult.ok) {
    return NextResponse.json(
      { error: `Unable to bootstrap NX Agents lab: ${bootstrapResult.stderr || bootstrapResult.stdout}` },
      { status: 500 },
    );
  }

  const [statusResult, missions, hierarchy, recentRuns, keyInfo] = await Promise.all([
    runMissionControl<StatusSnapshot>(["status", "--json"]),
    loadMissions(),
    loadHierarchy(),
    loadRecentRuns(20),
    resolveApiKeys(),
  ]);

  if (!statusResult.ok || !statusResult.data) {
    return NextResponse.json(
      { error: `Unable to load NX Agents status: ${statusResult.stderr || statusResult.stdout}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    user: {
      userId: userContext.userId,
      isAdmin: userContext.isAdmin,
    },
    status: statusResult.data,
    missions,
    hierarchy,
    recentRuns,
    keyStatus: keyInfo.keyStatus,
  });
}

export async function POST(request: Request) {
  const userContext = await requireApiUser();
  if (userContext instanceof NextResponse) {
    return userContext;
  }

  const body = (await request.json().catch(() => null)) as
    | {
        action?: string;
        missionId?: string;
        useGateway?: boolean;
        roleId?: string;
        roleName?: string;
        responsibilities?: string[];
        model?: string;
        keys?: Partial<Record<SupportedApiKey, string>>;
      }
    | null;

  const action = (body?.action ?? "").trim();

  if (action === "runMission") {
    if (!userContext.isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    const missionId = String(body?.missionId ?? "").trim();
    if (!missionId) {
      return NextResponse.json({ error: "missionId is required." }, { status: 400 });
    }

    const args = ["run", missionId];
    if (body?.useGateway) {
      args.push("--gateway");
    }

    const result = await runMissionControl(args);
    const payload = result.data ?? { stdout: result.stdout, stderr: result.stderr };
    return NextResponse.json(payload, { status: result.ok ? 200 : 500 });
  }

  if (action === "createRole") {
    if (!userContext.isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const roleId = String(body?.roleId ?? "").trim();
    const roleName = String(body?.roleName ?? "").trim();
    const model = String(body?.model ?? "openai/gpt-4.1-mini").trim();
    const responsibilities = (body?.responsibilities ?? [])
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 12);

    if (!roleId || !roleName) {
      return NextResponse.json(
        { error: "roleId and roleName are required." },
        { status: 400 },
      );
    }

    try {
      const created = await createRole({
        roleId,
        roleName,
        model,
        responsibilities,
      });
      return NextResponse.json({ ok: true, created });
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
  }

  if (action === "saveKeys") {
    if (!userContext.isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const inputKeys = body?.keys ?? {};
    const sanitized: Partial<Record<SupportedApiKey, string>> = {};
    for (const key of SUPPORTED_API_KEYS) {
      if (!(key in inputKeys)) {
        continue;
      }
      const value = inputKeys[key];
      sanitized[key] = typeof value === "string" ? value : "";
    }

    await upsertApiKeys(sanitized);
    const { keyStatus } = await resolveApiKeys();
    return NextResponse.json({ ok: true, keyStatus });
  }

  if (action === "syncProfiles") {
    if (!userContext.isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    try {
      const synced = await syncAuthProfiles();
      return NextResponse.json({ ok: true, synced });
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
  }

  if (action === "bootstrap") {
    if (!userContext.isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const result = await runMissionControl(["bootstrap"], { expectJson: false });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.stderr || result.stdout || "Bootstrap failed." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "Unsupported action." },
    { status: 400 },
  );
}
