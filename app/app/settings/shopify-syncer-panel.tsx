"use client";

import {
  Button,
  Card,
  Dropdown,
  Field,
  Input,
  MessageBar,
  Option,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDateTime } from "@/lib/format";

type SyncEvent = {
  id: number;
  created_at: string;
  level: string;
  source: string | null;
  event_type: string | null;
  cause_code: string | null;
  recovery_status: string | null;
  sku: string | null;
  spu: string | null;
  object_type: string | null;
  object_id: string | null;
  outbox_id: string | null;
  message: string | null;
  details: unknown;
};

type HealthResponse = {
  since: string;
  event_levels?: Record<string, number>;
  top_causes?: Array<{ cause_code: string; count: number }>;
  top_skus?: Array<{ sku: string; count: number }>;
  syncer_metrics?: {
    queue?: Record<string, number>;
    running_health?: Record<string, unknown>;
    outbox_observability?: {
      dead_cause_counts?: Record<string, number>;
      active_cause_counts?: Record<string, number>;
      recovery_status_counts?: Record<string, number>;
    };
    last_success_at?: string | null;
  } | null;
  syncer_metrics_error?: string | null;
  worker_health?: {
    id?: string;
    last_beat?: string;
    processed?: number;
    age_seconds?: number;
  } | null;
  worker_health_error?: string | null;
  warning?: string | null;
};

type EventsResponse = {
  events: SyncEvent[];
  next_cursor: string | null;
  has_more: boolean;
  warning?: string | null;
};

type LiveResponse = {
  source: "file" | "db" | "none";
  cursor: number;
  lines: string[];
  warning?: string | null;
};

const useStyles = makeStyles({
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  summaryGrid: {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  },
  card: {
    padding: "14px",
    borderRadius: "12px",
    backgroundColor: "#fafafa",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  filterGrid: {
    display: "grid",
    gap: "10px",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  },
  liveBox: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#111",
    color: "#d7f7da",
    borderRadius: "10px",
    padding: "10px",
    fontFamily: "monospace",
    fontSize: tokens.fontSizeBase100,
    lineHeight: "1.45",
    minHeight: "240px",
    maxHeight: "380px",
    overflowY: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  listRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
  },
  listLabel: {
    color: tokens.colorNeutralForeground2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  listValue: {
    fontWeight: tokens.fontWeightSemibold,
  },
  tableWrap: {
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  topList: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    maxHeight: "210px",
    overflowY: "auto",
  },
});

const levelOptionValues = ["all", "info", "warn", "error", "critical"];

function mergeLines(previous: string[], next: string[]) {
  const merged = [...previous];
  for (const line of next) {
    if (!line) continue;
    if (merged.length > 0 && merged[merged.length - 1] === line) continue;
    merged.push(line);
  }
  return merged.slice(-500);
}

export default function ShopifySyncerPanel() {
  const styles = useStyles();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [eventsCursor, setEventsCursor] = useState<string | null>(null);
  const [liveCursor, setLiveCursor] = useState(0);
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const liveCursorRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [sku, setSku] = useState("");
  const [causeCode, setCauseCode] = useState("");
  const [level, setLevel] = useState("all");

  const buildEventQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("limit", "150");
    params.set("hours", "72");
    if (q.trim()) params.set("q", q.trim());
    if (sku.trim()) params.set("sku", sku.trim());
    if (causeCode.trim()) params.set("cause_code", causeCode.trim());
    if (level !== "all") params.set("level", level);
    return params.toString();
  }, [causeCode, level, q, sku]);

  const loadHealth = useCallback(async () => {
    const response = await fetch("/api/settings/shopify-syncer/health?hours=72", {
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Failed to fetch syncer health.");
    }
    const payload = (await response.json()) as HealthResponse;
    setHealth(payload);
    if (payload.warning) {
      setWarning(payload.warning);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    const qs = buildEventQuery();
    const response = await fetch(`/api/settings/shopify-syncer/events?${qs}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Failed to fetch syncer events.");
    }
    const payload = (await response.json()) as EventsResponse;
    setEvents(payload.events || []);
    setEventsCursor(payload.next_cursor || null);
    if (payload.warning) {
      setWarning(payload.warning);
    }
  }, [buildEventQuery]);

  const loadLive = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("cursor", String(liveCursorRef.current));
    params.set("max_bytes", "65536");

    const response = await fetch(`/api/settings/shopify-syncer/live?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Failed to read live syncer feed.");
    }
    const payload = (await response.json()) as LiveResponse;
    if (typeof payload.cursor === "number") {
      setLiveCursor(payload.cursor);
      liveCursorRef.current = payload.cursor;
    }
    if (Array.isArray(payload.lines) && payload.lines.length > 0) {
      setLiveLines((prev) => mergeLines(prev, payload.lines));
    }
    if (payload.warning) {
      setWarning(payload.warning);
    }
  }, []);

  const refreshAll = useCallback(
    async (firstLoad = false) => {
      if (firstLoad) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        await Promise.all([loadHealth(), loadEvents(), loadLive()]);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        if (firstLoad) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [loadEvents, loadHealth, loadLive]
  );

  useEffect(() => {
    void refreshAll(true);
  }, [refreshAll]);

  useEffect(() => {
    if (loading) return;
    const id = setInterval(() => {
      void loadLive().catch((err) => setError((err as Error).message));
    }, 2500);
    return () => clearInterval(id);
  }, [loadLive, loading]);

  useEffect(() => {
    if (loading) return;
    const id = setInterval(() => {
      void loadHealth().catch((err) => setError((err as Error).message));
    }, 15000);
    return () => clearInterval(id);
  }, [loadHealth, loading]);

  useEffect(() => {
    if (loading) return;
    const id = setInterval(() => {
      void loadEvents().catch((err) => setError((err as Error).message));
    }, 7000);
    return () => clearInterval(id);
  }, [loadEvents, loading]);

  useEffect(() => {
    if (loading) return;
    const timeout = setTimeout(() => {
      void loadEvents().catch((err) => setError((err as Error).message));
    }, 180);
    return () => clearTimeout(timeout);
  }, [causeCode, level, loadEvents, loading, q, sku]);

  const queue = health?.syncer_metrics?.queue || {};
  const levelCounts = health?.event_levels || {};
  const topCauses = health?.top_causes || [];
  const topSkus = health?.top_skus || [];

  const lastSuccess = useMemo(() => {
    const value = health?.syncer_metrics?.last_success_at;
    if (!value) return "-";
    return formatDateTime(value);
  }, [health?.syncer_metrics?.last_success_at]);

  const workerAge = health?.worker_health?.age_seconds;

  const download24h = () => {
    window.open("/api/settings/shopify-syncer/download?hours=24&format=ndjson", "_blank");
  };

  const clearLive = () => {
    setLiveLines([]);
    setLiveCursor(0);
    liveCursorRef.current = 0;
  };

  if (loading) {
    return (
      <Card className={styles.card}>
        <Spinner label="Loading Shopify Syncer monitoring…" />
      </Card>
    );
  }

  return (
    <div className={styles.section}>
      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div>
            <Text weight="semibold">Shopify Syncer</Text>
            <div className={styles.muted}>
              Live operations feed, searchable incidents, and health counters.
            </div>
          </div>
          <div className={styles.headerRow}>
            <Button onClick={() => void refreshAll(false)} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            <Button appearance="secondary" onClick={download24h}>
              Download 24h Log
            </Button>
          </div>
        </div>

        {error ? <MessageBar intent="error">{error}</MessageBar> : null}
        {warning ? <MessageBar>{warning}</MessageBar> : null}

        <div className={styles.summaryGrid}>
          <Card className={styles.card}>
            <Text weight="semibold">Queue Snapshot</Text>
            <div className={styles.listRow}>
              <span className={styles.listLabel}>Pending</span>
              <span className={styles.listValue}>{queue.pending ?? 0}</span>
            </div>
            <div className={styles.listRow}>
              <span className={styles.listLabel}>Running</span>
              <span className={styles.listValue}>{queue.running ?? 0}</span>
            </div>
            <div className={styles.listRow}>
              <span className={styles.listLabel}>Dead</span>
              <span className={styles.listValue}>{queue.dead ?? 0}</span>
            </div>
            <div className={styles.listRow}>
              <span className={styles.listLabel}>Last success</span>
              <span className={styles.listValue}>{lastSuccess}</span>
            </div>
          </Card>

          <Card className={styles.card}>
            <Text weight="semibold">Worker Health</Text>
            <div className={styles.listRow}>
              <span className={styles.listLabel}>Worker ID</span>
              <span className={styles.listValue}>{health?.worker_health?.id || "-"}</span>
            </div>
            <div className={styles.listRow}>
              <span className={styles.listLabel}>Heartbeat age</span>
              <span className={styles.listValue}>
                {Number.isFinite(workerAge) ? `${workerAge}s` : "-"}
              </span>
            </div>
            <div className={styles.listRow}>
              <span className={styles.listLabel}>Processed</span>
              <span className={styles.listValue}>{health?.worker_health?.processed ?? 0}</span>
            </div>
            <div className={styles.listRow}>
              <span className={styles.listLabel}>API status</span>
              <span className={styles.listValue}>
                {health?.syncer_metrics_error || health?.worker_health_error
                  ? "degraded"
                  : "healthy"}
              </span>
            </div>
          </Card>

          <Card className={styles.card}>
            <Text weight="semibold">Event Levels (72h)</Text>
            <div className={styles.listRow}>
              <span className={styles.listLabel}>Critical</span>
              <span className={styles.listValue}>{levelCounts.critical ?? 0}</span>
            </div>
            <div className={styles.listRow}>
              <span className={styles.listLabel}>Error</span>
              <span className={styles.listValue}>{levelCounts.error ?? 0}</span>
            </div>
            <div className={styles.listRow}>
              <span className={styles.listLabel}>Warn</span>
              <span className={styles.listValue}>{levelCounts.warn ?? 0}</span>
            </div>
            <div className={styles.listRow}>
              <span className={styles.listLabel}>Info</span>
              <span className={styles.listValue}>{levelCounts.info ?? 0}</span>
            </div>
          </Card>

          <Card className={styles.card}>
            <Text weight="semibold">Top Error Causes</Text>
            <div className={styles.topList}>
              {topCauses.length === 0 ? (
                <div className={styles.muted}>No warn/error causes in selected window.</div>
              ) : (
                topCauses.map((entry) => (
                  <div className={styles.listRow} key={entry.cause_code}>
                    <span className={styles.listLabel}>{entry.cause_code}</span>
                    <span className={styles.listValue}>{entry.count}</span>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className={styles.card}>
            <Text weight="semibold">Top Problem SKUs/SPUs</Text>
            <div className={styles.topList}>
              {topSkus.length === 0 ? (
                <div className={styles.muted}>No SKU/SPU-linked issues yet.</div>
              ) : (
                topSkus.map((entry) => (
                  <div className={styles.listRow} key={entry.sku}>
                    <span className={styles.listLabel}>{entry.sku}</span>
                    <span className={styles.listValue}>{entry.count}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </Card>

      <Card className={styles.card}>
        <Text weight="semibold">Live Broadcast</Text>
        <div className={styles.muted}>
          Polling server log stream in near real time (updates every ~2.5 seconds).
        </div>
        <div className={styles.headerRow}>
          <div className={styles.muted}>Lines: {liveLines.length}</div>
          <Button appearance="secondary" onClick={clearLive}>
            Clear
          </Button>
        </div>
        <div className={styles.liveBox}>{liveLines.join("\n") || "(No live lines yet)"}</div>
      </Card>

      <Card className={styles.card}>
        <Text weight="semibold">Searchable Events</Text>
        <div className={styles.filterGrid}>
          <Field label="Search text">
            <Input
              value={q}
              placeholder="error text, cause code, object id"
              onChange={(_, data) => setQ(data.value)}
            />
          </Field>
          <Field label="SKU/SPU">
            <Input
              value={sku}
              placeholder="e.g. NX-12345"
              onChange={(_, data) => setSku(data.value)}
            />
          </Field>
          <Field label="Cause code">
            <Input
              value={causeCode}
              placeholder="shopify_network_error"
              onChange={(_, data) => setCauseCode(data.value)}
            />
          </Field>
          <Field label="Level">
            <Dropdown
              selectedOptions={[level]}
              value={level}
              onOptionSelect={(_, data) => {
                const next = String(data.optionValue || "all");
                if (levelOptionValues.includes(next)) {
                  setLevel(next);
                }
              }}
            >
              <Option value="all">All levels</Option>
              <Option value="critical">Critical</Option>
              <Option value="error">Error</Option>
              <Option value="warn">Warn</Option>
              <Option value="info">Info</Option>
            </Dropdown>
          </Field>
        </div>

        <div className={styles.tableWrap}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Time</TableHeaderCell>
                <TableHeaderCell>Level</TableHeaderCell>
                <TableHeaderCell>Event</TableHeaderCell>
                <TableHeaderCell>Cause</TableHeaderCell>
                <TableHeaderCell>SKU/SPU</TableHeaderCell>
                <TableHeaderCell>Object</TableHeaderCell>
                <TableHeaderCell>Message</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <span className={styles.muted}>No events found for current filters.</span>
                  </TableCell>
                </TableRow>
              ) : (
                events.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDateTime(row.created_at)}</TableCell>
                    <TableCell>{row.level}</TableCell>
                    <TableCell>{row.event_type || "-"}</TableCell>
                    <TableCell>{row.cause_code || "-"}</TableCell>
                    <TableCell>{row.sku || row.spu || "-"}</TableCell>
                    <TableCell>{`${row.object_type || "-"}:${row.object_id || "-"}`}</TableCell>
                    <TableCell>{row.message || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className={styles.muted}>
          Showing {events.length} events{eventsCursor ? " (newer-first cursor active)" : ""}.
        </div>
      </Card>
    </div>
  );
}
