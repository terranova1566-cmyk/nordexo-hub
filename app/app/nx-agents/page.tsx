"use client";

import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Spinner,
  Text,
  Textarea,
  Title2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime } from "@/lib/format";

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

type ApiKeyStatus = {
  key: string;
  present: boolean;
  masked: string | null;
  source: "process" | "vault" | "env-file" | null;
};

type NxAgentsPayload = {
  user: {
    userId: string;
    isAdmin: boolean;
  };
  status: StatusSnapshot;
  missions: MissionSpec[];
  hierarchy: HierarchyFile;
  recentRuns: LedgerRecord[];
  keyStatus: ApiKeyStatus[];
};

const useStyles = makeStyles({
  layout: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  card: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  cardTitle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: "pre-line",
  },
  metaText: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "10px",
  },
  statCard: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    padding: "10px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  statLabel: {
    display: "block",
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    marginBottom: "6px",
  },
  statValue: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
  },
  splitGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "12px",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  listItem: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "8px",
    alignItems: "center",
    padding: "10px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  listItemBody: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  missionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "10px",
  },
  missionCard: {
    padding: "12px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  missionMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  actionRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    padding: "8px 6px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "8px 6px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase200,
    verticalAlign: "top",
  },
  mono: {
    fontFamily: "Consolas, 'Courier New', monospace",
    fontSize: tokens.fontSizeBase200,
  },
  keyInput: {
    minWidth: "220px",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
    alignItems: "start",
  },
  fullSpan: {
    gridColumn: "1 / -1",
  },
  notice: {
    color: tokens.colorPaletteGreenForeground1,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
  warning: {
    color: tokens.colorPaletteDarkOrangeForeground1,
  },
  keyHint: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  pre: {
    margin: 0,
    whiteSpace: "pre-wrap",
    maxHeight: "340px",
    overflowY: "auto",
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: "8px",
    padding: "12px",
  },
});

const MODEL_DEFAULT = "openai/gpt-4.1-mini";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error.";
}

function normalizeRoleId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

export default function NxAgentsPage() {
  const styles = useStyles();

  const [payload, setPayload] = useState<NxAgentsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string>("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [roleId, setRoleId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleModel, setRoleModel] = useState(MODEL_DEFAULT);
  const [responsibilitiesRaw, setResponsibilitiesRaw] = useState("");

  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [keyTouched, setKeyTouched] = useState<Record<string, boolean>>({});

  const loadPayload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/nx-agents", { cache: "no-store" });
      const data = await parseJsonResponse<NxAgentsPayload & { error?: string }>(response);
      if (!response.ok) {
        throw new Error(data.error || "Unable to load NX Agents.");
      }
      setPayload(data);
      setActionError(null);
    } catch (loadError) {
      setError(toErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayload();
  }, [loadPayload]);

  const isAdmin = Boolean(payload?.user.isAdmin);

  const status = payload?.status ?? null;
  const missions = payload?.missions ?? [];
  const hierarchyAgents = payload?.hierarchy.agents ?? [];
  const recentRuns = payload?.recentRuns ?? [];
  const keyStatus = payload?.keyStatus ?? [];

  const guardrailPassCount = status?.guardrails.filter((check) => check.passed).length ?? 0;
  const presentKeysCount = keyStatus.filter((item) => item.present).length;
  const suggestedRoleId = useMemo(() => normalizeRoleId(roleName), [roleName]);

  const dirtyKeyCount = Object.values(keyTouched).filter(Boolean).length;

  const setKeyDraft = (key: string, value: string) => {
    setKeyDrafts((current) => ({ ...current, [key]: value }));
    setKeyTouched((current) => ({ ...current, [key]: true }));
  };

  const clearKeyEdits = () => {
    setKeyDrafts({});
    setKeyTouched({});
  };

  const runPostAction = useCallback(
    async (action: string, extraBody: Record<string, unknown>, busyKey: string, notice: string) => {
      setBusyAction(busyKey);
      setActionError(null);
      setActionNotice(null);
      try {
        const response = await fetch("/api/nx-agents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action, ...extraBody }),
        });

        const result = await parseJsonResponse<Record<string, unknown> & { error?: string }>(
          response,
        );

        if (!response.ok) {
          throw new Error(result.error || `Action failed with status ${response.status}.`);
        }

        setLastAction(JSON.stringify(result, null, 2));
        setActionNotice(notice);
        await loadPayload();
        return result;
      } catch (actionFailure) {
        setActionError(toErrorMessage(actionFailure));
        return null;
      } finally {
        setBusyAction(null);
      }
    },
    [loadPayload],
  );

  const handleRunMission = async (missionId: string, useGateway: boolean) => {
    const busyKey = `run:${missionId}:${useGateway ? "gateway" : "local"}`;
    const label = useGateway ? "gateway" : "local";
    await runPostAction(
      "runMission",
      { missionId, useGateway },
      busyKey,
      `Mission ${missionId} completed (${label}).`,
    );
  };

  const handleBootstrap = async () => {
    await runPostAction("bootstrap", {}, "bootstrap", "NX Agents lab bootstrapped.");
  };

  const handleSyncProfiles = async () => {
    await runPostAction("syncProfiles", {}, "syncProfiles", "Auth profiles synced to agent directories.");
  };

  const handleSaveKeys = async () => {
    const keys: Record<string, string> = {};
    for (const item of keyStatus) {
      if (!keyTouched[item.key]) {
        continue;
      }
      keys[item.key] = (keyDrafts[item.key] ?? "").trim();
    }

    if (Object.keys(keys).length === 0) {
      setActionError("No key changes selected.");
      return;
    }

    await runPostAction("saveKeys", { keys }, "saveKeys", "API key vault updated.");
    clearKeyEdits();
  };

  const handleCreateRole = async () => {
    const finalRoleId = normalizeRoleId(roleId || suggestedRoleId);
    const finalRoleName = roleName.trim();
    const responsibilities = responsibilitiesRaw
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!finalRoleId || !finalRoleName) {
      setActionError("Role name is required. Role ID can be typed or generated from the role name.");
      return;
    }

    await runPostAction(
      "createRole",
      {
        roleId: finalRoleId,
        roleName: finalRoleName,
        model: roleModel.trim() || MODEL_DEFAULT,
        responsibilities,
      },
      "createRole",
      `Role ${finalRoleId} created and added to hierarchy.`,
    );

    setRoleId("");
    setRoleName("");
    setRoleModel(MODEL_DEFAULT);
    setResponsibilitiesRaw("");
  };

  if (isLoading && !payload) {
    return (
      <div className={styles.layout}>
        <Card className={styles.card}>
          <Text>
            <Spinner size="small" /> Loading NX Agents...
          </Text>
        </Card>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className={styles.layout}>
        <Card className={styles.card}>
          <Text className={styles.error}>{error || "Unable to load NX Agents."}</Text>
          <div className={styles.buttonRow}>
            <Button appearance="primary" onClick={() => void loadPayload()}>
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <Card className={styles.card}>
        <div className={styles.cardTitle}>
          <div>
            <Title2>NX Agents</Title2>
            <Text className={styles.subtitle}>
              Mission control for autonomous OpenClaw roles. Agents can gather and organize external intelligence,
              while write access remains blocked until approved export workflows are used.
            </Text>
          </div>
          <div className={styles.buttonRow}>
            <Button appearance="secondary" onClick={() => void loadPayload()} disabled={Boolean(busyAction)}>
              Refresh
            </Button>
            {isAdmin ? (
              <>
                <Button
                  appearance="secondary"
                  onClick={() => void handleBootstrap()}
                  disabled={busyAction !== null}
                >
                  {busyAction === "bootstrap" ? "Bootstrapping..." : "Bootstrap Lab"}
                </Button>
                <Button
                  appearance="secondary"
                  onClick={() => void handleSyncProfiles()}
                  disabled={busyAction !== null}
                >
                  {busyAction === "syncProfiles" ? "Syncing..." : "Sync Profiles"}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <Text className={styles.metaText}>
          Last generated: {formatDateTime(status?.generatedAt) || "n/a"}
          {isLoading ? " (refreshing...)" : ""}
        </Text>
        <Text className={styles.metaText}>Config: {status?.configPath ?? "n/a"}</Text>

        <div className={styles.summaryGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Budget Used</span>
            <div className={styles.statValue}>
              ${status?.ledger.spentUsd.toFixed(2) ?? "0.00"} / ${status?.ledger.dailyBudgetUsd.toFixed(2) ?? "0.00"}
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Remaining</span>
            <div className={styles.statValue}>${status?.ledger.remainingUsd.toFixed(2) ?? "0.00"}</div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Guardrails</span>
            <div className={styles.statValue}>
              {guardrailPassCount}/{status?.guardrails.length ?? 0}
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Sessions (24h)</span>
            <div className={styles.statValue}>{status?.sessions.count ?? 0}</div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Mission Catalog</span>
            <div className={styles.statValue}>{missions.length || status?.missionCount || 0}</div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>API Keys Ready</span>
            <div className={styles.statValue}>
              {presentKeysCount}/{keyStatus.length}
            </div>
          </div>
        </div>

        {actionNotice ? <Text className={styles.notice}>{actionNotice}</Text> : null}
        {actionError ? <Text className={styles.error}>{actionError}</Text> : null}
        {error ? <Text className={styles.error}>{error}</Text> : null}
      </Card>

      <div className={styles.splitGrid}>
        <Card className={styles.card}>
          <Text weight="semibold">Guardrail checks</Text>
          <div className={styles.list}>
            {(status?.guardrails ?? []).map((check) => {
              const failedChecks = Object.entries(check.checks)
                .filter(([, passed]) => !passed)
                .map(([name]) => name);
              return (
                <div key={check.agentId} className={styles.listItem}>
                  <div className={styles.listItemBody}>
                    <Text weight="semibold">{check.agentId}</Text>
                    <Text className={styles.metaText}>
                      {failedChecks.length === 0
                        ? "All hard checks passing"
                        : `Failed: ${failedChecks.join(", ")}`}
                    </Text>
                  </div>
                  <Badge appearance={check.passed ? "filled" : "outline"}>
                    {check.passed ? "PASS" : "FAIL"}
                  </Badge>
                </div>
              );
            })}
            {(status?.guardrails.length ?? 0) === 0 ? (
              <Text className={styles.metaText}>No guardrail checks found.</Text>
            ) : null}
          </div>
        </Card>

        <Card className={styles.card}>
          <Text weight="semibold">Hierarchy and command chain</Text>
          <Text className={styles.metaText}>Objective: {payload.hierarchy.objective}</Text>
          <Text className={styles.metaText}>Primary: {payload.hierarchy.command.primary}</Text>
          <Text className={styles.metaText}>Workers: {payload.hierarchy.command.workers.join(", ") || "none"}</Text>
          <Text className={styles.metaText}>Handoff: {payload.hierarchy.command.handoff}</Text>

          <div className={styles.list}>
            {hierarchyAgents.map((agent) => (
              <div key={agent.id} className={styles.listItem}>
                <div className={styles.listItemBody}>
                  <Text weight="semibold">{agent.role}</Text>
                  <Text className={styles.metaText}>{agent.id}</Text>
                  {agent.responsibilities && agent.responsibilities.length > 0 ? (
                    <Text className={styles.metaText}>
                      Responsibilities: {agent.responsibilities.join("; ")}
                    </Text>
                  ) : null}
                  {agent.cannot && agent.cannot.length > 0 ? (
                    <Text className={styles.warning}>Blocked: {agent.cannot.join(", ")}</Text>
                  ) : null}
                </div>
                <Badge appearance="tint">Role</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className={styles.card}>
        <Text weight="semibold">Mission control</Text>
        <div className={styles.missionGrid}>
          {missions.map((mission) => {
            const runLocalKey = `run:${mission.id}:local`;
            const runGatewayKey = `run:${mission.id}:gateway`;
            return (
              <article key={mission.id} className={styles.missionCard}>
                <Text weight="semibold">{mission.title}</Text>
                <Text className={styles.missionMeta}>{mission.id}</Text>
                <Text className={styles.missionMeta}>Agent: {mission.agentId}</Text>
                <Text className={styles.missionMeta}>
                  Max/day: {mission.maxRunsPerDay} | Budget/run: ${mission.budgetUsdPerRun}
                </Text>
                {mission.schedule ? <Text className={styles.missionMeta}>Schedule: {mission.schedule}</Text> : null}
                <Text>{mission.objective}</Text>
                <div className={styles.actionRow}>
                  <Button
                    appearance="primary"
                    disabled={!isAdmin || busyAction !== null}
                    onClick={() => void handleRunMission(mission.id, false)}
                  >
                    {busyAction === runLocalKey ? "Running..." : "Run Local"}
                  </Button>
                  <Button
                    appearance="secondary"
                    disabled={!isAdmin || busyAction !== null}
                    onClick={() => void handleRunMission(mission.id, true)}
                  >
                    {busyAction === runGatewayKey ? "Running..." : "Run Gateway"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
        {!isAdmin ? (
          <Text className={styles.metaText}>Admin access is required for mission execution.</Text>
        ) : null}
      </Card>

      <Card className={styles.card}>
        <Text weight="semibold">Recent runs</Text>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Started</th>
                <th className={styles.th}>Mission</th>
                <th className={styles.th}>Agent</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Cost (USD)</th>
                <th className={styles.th}>Report</th>
                <th className={styles.th}>Handoff</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={run.runId}>
                  <td className={styles.td}>{formatDateTime(run.startedAt) || "n/a"}</td>
                  <td className={styles.td}>
                    <div>{run.missionTitle || run.missionId}</div>
                    <div className={styles.metaText}>{run.missionId}</div>
                  </td>
                  <td className={styles.td}>{run.agentId}</td>
                  <td className={styles.td}>
                    <Badge appearance={run.status === "success" ? "filled" : "outline"}>
                      {run.status}
                    </Badge>
                  </td>
                  <td className={styles.td}>${run.estimatedCostUsd.toFixed(4)}</td>
                  <td className={styles.td}>
                    <span className={styles.mono}>{run.reportPath}</span>
                  </td>
                  <td className={styles.td}>
                    {run.handoff ? (
                      <div className={styles.listItemBody}>
                        <span className={styles.mono}>{run.handoff.txtPath}</span>
                        {run.handoff.csvPath ? (
                          <span className={styles.mono}>{run.handoff.csvPath}</span>
                        ) : (
                          <span className={styles.metaText}>No CSV findings</span>
                        )}
                        {run.handoff.reviewedCsvPath ? (
                          <span className={styles.mono}>{run.handoff.reviewedCsvPath}</span>
                        ) : null}
                        <span className={styles.mono}>{run.handoff.manifestPath}</span>
                        <span className={styles.metaText}>
                          rows: {run.handoff.findingCount}
                        </span>
                        {run.handoff.quality ? (
                          <span className={styles.metaText}>
                            accepted: {run.handoff.quality.accepted}, review: {run.handoff.quality.review}, rejected:{" "}
                            {run.handoff.quality.rejected}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className={styles.metaText}>No handoff files</span>
                    )}
                  </td>
                </tr>
              ))}
              {recentRuns.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={7}>
                    No runs captured yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.card}>
        <Text weight="semibold">API key control</Text>
        <Text className={styles.metaText}>
          Keys are resolved in this order: process env, local key vault, then env files. Entering a blank value and
          saving clears that key from the local vault.
        </Text>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Key</th>
                <th className={styles.th}>Detected</th>
                <th className={styles.th}>Source</th>
                <th className={styles.th}>Set/Clear</th>
              </tr>
            </thead>
            <tbody>
              {keyStatus.map((item) => (
                <tr key={item.key}>
                  <td className={styles.td}>
                    <span className={styles.mono}>{item.key}</span>
                  </td>
                  <td className={styles.td}>{item.present ? item.masked || "present" : "missing"}</td>
                  <td className={styles.td}>{item.source || "none"}</td>
                  <td className={styles.td}>
                    <Field label="" validationMessage={keyTouched[item.key] ? "Pending change" : undefined}>
                      <Input
                        type="password"
                        value={keyDrafts[item.key] ?? ""}
                        onChange={(_, data) => setKeyDraft(item.key, data.value)}
                        className={styles.keyInput}
                        disabled={!isAdmin || busyAction !== null}
                        placeholder="Enter new value or leave blank to clear"
                      />
                    </Field>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.buttonRow}>
          <Button
            appearance="primary"
            onClick={() => void handleSaveKeys()}
            disabled={!isAdmin || busyAction !== null || dirtyKeyCount === 0}
          >
            {busyAction === "saveKeys" ? "Saving..." : "Save Key Changes"}
          </Button>
          <Button
            appearance="secondary"
            onClick={clearKeyEdits}
            disabled={busyAction !== null || dirtyKeyCount === 0}
          >
            Clear Edits
          </Button>
          <Text className={styles.keyHint}>{dirtyKeyCount} key changes pending.</Text>
        </div>
      </Card>

      <Card className={styles.card}>
        <Text weight="semibold">Create role</Text>
        <Text className={styles.metaText}>
          Add a new worker role, generate its workspace prompt, and automatically attach it to the orchestrator worker
          list and spawn allowlist.
        </Text>

        <div className={styles.formGrid}>
          <Field label="Role name">
            <Input
              value={roleName}
              onChange={(_, data) => setRoleName(data.value)}
              placeholder="Example: Supplier Expansion Scout"
              disabled={!isAdmin || busyAction !== null}
            />
          </Field>

          <Field label="Role ID">
            <Input
              value={roleId}
              onChange={(_, data) => setRoleId(data.value)}
              placeholder={suggestedRoleId || "supplier-expansion-scout"}
              disabled={!isAdmin || busyAction !== null}
            />
          </Field>

          <Field label="Model">
            <Input
              value={roleModel}
              onChange={(_, data) => setRoleModel(data.value)}
              placeholder={MODEL_DEFAULT}
              disabled={!isAdmin || busyAction !== null}
            />
          </Field>

          <Field label="Responsibilities (one per line)" className={styles.fullSpan}>
            <Textarea
              value={responsibilitiesRaw}
              onChange={(_, data) => setResponsibilitiesRaw(data.value)}
              placeholder={"Find partner leads\nCollect evidence links\nSummarize opportunities"}
              resize="vertical"
              rows={5}
              disabled={!isAdmin || busyAction !== null}
            />
          </Field>
        </div>

        <div className={styles.buttonRow}>
          <Button
            appearance="primary"
            onClick={() => void handleCreateRole()}
            disabled={!isAdmin || busyAction !== null}
          >
            {busyAction === "createRole" ? "Creating..." : "Create Role"}
          </Button>
          <Text className={styles.metaText}>
            Final role ID: {normalizeRoleId(roleId || suggestedRoleId) || "(required)"}
          </Text>
        </div>
      </Card>

      <Card className={styles.card}>
        <Text weight="semibold">Warnings</Text>
        {(status?.warnings.length ?? 0) > 0 ? (
          status?.warnings.map((warning, index) => (
            <Text key={`${warning}-${index}`} className={styles.warning}>
              {warning}
            </Text>
          ))
        ) : (
          <Text className={styles.metaText}>No warnings.</Text>
        )}
      </Card>

      <Card className={styles.card}>
        <Text weight="semibold">Last action payload</Text>
        <pre className={styles.pre}>{lastAction || "No action executed yet."}</pre>
      </Card>
    </div>
  );
}
