"use client";

import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Spinner,
  Tab,
  TabList,
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
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Project = {
  id: string;
  title: string;
  status: string;
  description: string | null;
  brief: string | null;
  currency: string;
  exchange_rate_cny: number;
  margin_percent_default: number;
  margin_fixed_default: number;
  customer: { id: string; name: string; main_currency: string } | null;
};

type CandidateRow = {
  id: string;
  title: string | null;
  images: string[];
  gallery_images: string[];
  description_images: string[];
  status: string;
  moq: number | null;
  source_price_min_cny: number | null;
  source_price_max_cny: number | null;
  final_price_without_logo_cny: number | null;
  final_price_with_logo_cny: number | null;
  updated_at: string;
  is_shortlisted: boolean;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  product_candidate_id: string | null;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  action: string;
  diff: any;
  created_at: string;
  created_by: string | null;
};

type ShareLinkRow = {
  id: string;
  token: string;
  type: string;
  permissions: string[];
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
  last_accessed_at: string | null;
};

const useStyles = makeStyles({
  layout: { display: "flex", flexDirection: "column", gap: "16px" },
  card: { padding: "16px", borderRadius: "var(--app-radius)" },
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  subtitle: { color: tokens.colorNeutralForeground3, whiteSpace: "pre-line" },
  tabsCard: {
    padding: "8px 16px",
    borderRadius: "var(--app-radius)",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "12px",
  },
  candidateCard: {
    padding: "12px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  candidateImage: {
    width: "100%",
    height: "160px",
    objectFit: "cover",
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  candidateTitle: {
    fontWeight: tokens.fontWeightSemibold,
    overflowWrap: "anywhere",
  },
  pillRow: { display: "flex", gap: "6px", flexWrap: "wrap" },
  cardActions: { display: "flex", gap: "8px", flexWrap: "wrap" },
  table: { width: "100%" },
  dialogSurface: { padding: "20px", width: "min(640px, 96vw)" },
});

export default function B2BProjectDetailPage() {
  const styles = useStyles();
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");

  const [tab, setTab] = useState("candidates");
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<{ candidate_count: number; task_count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLinkRow[]>([]);

  const [creatingShare, setCreatingShare] = useState(false);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  const loadProject = useMemo(
    () => async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/b2b/projects/${id}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || "Unable to load project.");
        setProject(payload?.project ?? null);
        setStats(payload?.stats ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load project.");
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  const loadCandidates = useMemo(
    () => async () => {
      if (!id) return;
      const res = await fetch(`/api/b2b/projects/${id}/candidates`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to load candidates.");
      setCandidates((payload?.items ?? []) as CandidateRow[]);
    },
    [id]
  );

  const loadTasks = useMemo(
    () => async () => {
      if (!id) return;
      const res = await fetch(`/api/b2b/tasks?projectId=${encodeURIComponent(id)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to load tasks.");
      setTasks((payload?.items ?? []) as TaskRow[]);
    },
    [id]
  );

  const loadActivity = useMemo(
    () => async () => {
      if (!id) return;
      const res = await fetch(
        `/api/b2b/activity?entityType=project&entityId=${encodeURIComponent(id)}&limit=120`
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to load activity.");
      setActivity((payload?.items ?? []) as ActivityRow[]);
    },
    [id]
  );

  const loadShareLinks = useMemo(
    () => async () => {
      if (!id) return;
      const res = await fetch(
        `/api/b2b/share-links?type=project&entityId=${encodeURIComponent(id)}`
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to load share links.");
      setShareLinks((payload?.items ?? []) as ShareLinkRow[]);
    },
    [id]
  );

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (!project) return;
    // Preload main tab data.
    loadCandidates().catch(() => null);
    loadShareLinks().catch(() => null);
  }, [project, loadCandidates, loadShareLinks]);

  const ensureTabData = async (nextTab: string) => {
    try {
      if (nextTab === "candidates") await loadCandidates();
      if (nextTab === "tasks") await loadTasks();
      if (nextTab === "activity") await loadActivity();
      if (nextTab === "share") await loadShareLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load.");
    }
  };

  const handleToggleShortlist = async (candidate: CandidateRow) => {
    try {
      const res = await fetch(`/api/b2b/product-candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_shortlisted: !candidate.is_shortlisted }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to update candidate.");
      await loadCandidates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update candidate.");
    }
  };

  const handleCreateShareLink = async () => {
    if (!id) return;
    setCreatingShare(true);
    setError(null);
    try {
      const res = await fetch("/api/b2b/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "project",
          entity_id: id,
          permissions: ["view", "select", "comment"],
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to create share link.");
      await loadShareLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create share link.");
    } finally {
      setCreatingShare(false);
    }
  };

  const handleCreateTask = async () => {
    const trimmed = taskTitle.trim();
    if (!trimmed || !id) return;
    setCreatingTask(true);
    setError(null);
    try {
      const res = await fetch("/api/b2b/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, title: trimmed }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to create task.");
      setTaskDialogOpen(false);
      setTaskTitle("");
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create task.");
    } finally {
      setCreatingTask(false);
    }
  };

  const origin =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";

  return (
    <div className={styles.layout}>
      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div>
            <Text weight="semibold">Project</Text>
            <div>
              <Text size={600} weight="semibold">
                {project?.title ?? "…"}
              </Text>
              <Text size={200} className={styles.subtitle}>
                Customer: {project?.customer?.name ?? "—"}{"\n"}
                Status: {project?.status ?? "—"}{"\n"}
                Currency: {project?.currency ?? "—"} (rate: {project?.exchange_rate_cny ?? "—"} CNY→
                {project?.currency ?? "—"}){"\n"}
                Default margin: {project?.margin_percent_default ?? 0}% + {project?.margin_fixed_default ?? 0}{" "}
                {project?.currency ?? ""}
              </Text>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button appearance="secondary" onClick={() => router.push("/app/b2b/projects")}>
              Back to projects
            </Button>
            <Button appearance="primary" onClick={() => router.push(`/app/b2b/imports?projectId=${encodeURIComponent(id)}`)}>
              Import 1688 URL
            </Button>
          </div>
        </div>

        {error ? (
          <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{error}</Text>
        ) : null}

        {loading ? <Spinner label="Loading…" /> : null}
      </Card>

      <Card className={styles.tabsCard}>
        <TabList
          selectedValue={tab}
          onTabSelect={(_, data) => {
            const next = String(data.value);
            setTab(next);
            ensureTabData(next).catch(() => null);
          }}
        >
          <Tab value="overview">Overview</Tab>
          <Tab value="candidates">Candidates ({stats?.candidate_count ?? candidates.length})</Tab>
          <Tab value="tasks">Tasks ({stats?.task_count ?? tasks.length})</Tab>
          <Tab value="activity">Activity</Tab>
          <Tab value="exports">Offers/Invoices</Tab>
          <Tab value="share">Share links</Tab>
        </TabList>
      </Card>

      {tab === "overview" ? (
        <Card className={styles.card}>
          <Text weight="semibold">Overview</Text>
          <Text size={200} className={styles.subtitle}>
            MVP placeholder: add richer brief fields, timeline, team members, and follow-ups in v2.
          </Text>
        </Card>
      ) : null}

      {tab === "candidates" ? (
        <Card className={styles.card}>
          <div className={styles.headerRow}>
            <div>
              <Text weight="semibold">Product candidates</Text>
              <Text size={200} className={styles.subtitle}>
                Use shortlist toggles to control which products appear in project share links.
              </Text>
            </div>
            <Button
              appearance="secondary"
              onClick={() => router.push(`/app/b2b/imports?projectId=${encodeURIComponent(id)}`)}
            >
              Import
            </Button>
          </div>

          {candidates.length === 0 ? (
            <Text className={styles.subtitle}>No candidates yet. Import a 1688 URL to start.</Text>
          ) : (
            <div className={styles.grid}>
              {candidates.map((c) => {
                const image = Array.isArray(c.images) ? c.images[0] : null;
                const sourceRange =
                  c.source_price_min_cny !== null && c.source_price_max_cny !== null
                    ? `¥${c.source_price_min_cny}–${c.source_price_max_cny}`
                    : c.source_price_min_cny !== null
                      ? `¥${c.source_price_min_cny}`
                      : "—";
                const finalPrice =
                  c.final_price_without_logo_cny ?? c.final_price_with_logo_cny ?? null;
                const galleryCount = Array.isArray(c.gallery_images) ? c.gallery_images.length : 0;
                const descriptionCount = Array.isArray(c.description_images)
                  ? c.description_images.length
                  : 0;
                return (
                  <Card key={c.id} className={styles.candidateCard}>
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt={c.title ?? "Candidate"} className={styles.candidateImage} />
                    ) : (
                      <div className={styles.candidateImage} />
                    )}
                    <div>
                      <Text className={styles.candidateTitle}>
                        {c.title ?? "Untitled candidate"}
                      </Text>
                      <div className={styles.pillRow}>
                        <Badge appearance="outline">{c.status}</Badge>
                        <Badge appearance="outline">MOQ: {c.moq ?? "—"}</Badge>
                        <Badge appearance="outline">{sourceRange}</Badge>
                        <Badge appearance="outline">
                          Img: {galleryCount}
                          {descriptionCount > 0 ? ` + desc ${descriptionCount}` : ""}
                        </Badge>
                        {finalPrice !== null ? (
                          <Badge appearance="filled">Final ¥{finalPrice}</Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      <Button appearance="primary" onClick={() => router.push(`/app/b2b/candidates/${c.id}`)}>
                        Open
                      </Button>
                      <Button
                        appearance={c.is_shortlisted ? "primary" : "secondary"}
                        onClick={() => handleToggleShortlist(c)}
                      >
                        {c.is_shortlisted ? "Shortlisted" : "Shortlist"}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}

      {tab === "tasks" ? (
        <Card className={styles.card}>
          <div className={styles.headerRow}>
            <div>
              <Text weight="semibold">Tasks</Text>
              <Text size={200} className={styles.subtitle}>
                Minimal task list. Worker dashboard aggregates tasks across projects.
              </Text>
            </div>
            <Button appearance="primary" onClick={() => setTaskDialogOpen(true)}>
              New task
            </Button>
          </div>

          {tasks.length === 0 ? (
            <Text className={styles.subtitle}>No tasks yet.</Text>
          ) : (
            <Table size="small" className={styles.table}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Task</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Due</TableHeaderCell>
                  <TableHeaderCell>Updated</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.title}</TableCell>
                    <TableCell>
                      <Badge appearance="outline">{t.status}</Badge>
                    </TableCell>
                    <TableCell>{t.due_date ?? "—"}</TableCell>
                    <TableCell>
                      <Text size={200} className={styles.subtitle}>
                        {new Date(t.updated_at).toLocaleString()}
                      </Text>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Dialog open={taskDialogOpen} onOpenChange={(_, data) => setTaskDialogOpen(data.open)}>
            <DialogSurface className={styles.dialogSurface}>
              <DialogBody>
                <DialogTitle>New task</DialogTitle>
                <Field label="Title" required>
                  <Input value={taskTitle} onChange={(_, data) => setTaskTitle(data.value)} />
                </Field>
                <DialogActions>
                  <Button appearance="secondary" onClick={() => setTaskDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button appearance="primary" disabled={creatingTask || !taskTitle.trim()} onClick={handleCreateTask}>
                    {creatingTask ? "Creating…" : "Create"}
                  </Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        </Card>
      ) : null}

      {tab === "activity" ? (
        <Card className={styles.card}>
          <Text weight="semibold">Activity</Text>
          {activity.length === 0 ? (
            <Text className={styles.subtitle}>No activity yet.</Text>
          ) : (
            <Table size="small" className={styles.table}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>When</TableHeaderCell>
                  <TableHeaderCell>Action</TableHeaderCell>
                  <TableHeaderCell>Diff</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Text size={200} className={styles.subtitle}>
                        {new Date(a.created_at).toLocaleString()}
                      </Text>
                    </TableCell>
                    <TableCell>{a.action}</TableCell>
                    <TableCell>
                      <Text size={200} className={styles.subtitle}>
                        {a.diff ? JSON.stringify(a.diff).slice(0, 180) : "—"}
                      </Text>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : null}

      {tab === "exports" ? (
        <Card className={styles.card}>
          <Text weight="semibold">Offers / invoices</Text>
          <Text size={200} className={styles.subtitle}>
            Placeholder endpoints that return structured JSON. TODO: build PDF/Excel templates.
          </Text>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button
              appearance="primary"
              onClick={async () => {
                const res = await fetch(`/api/b2b/projects/${id}/export-offer`, { method: "POST" });
                const payload = await res.json();
                if (!res.ok) {
                  setError(payload?.error || "Unable to export offer.");
                  return;
                }
                navigator.clipboard?.writeText(JSON.stringify(payload.payload, null, 2)).catch(() => null);
                alert("Offer JSON copied to clipboard (MVP).");
              }}
            >
              Generate offer (JSON)
            </Button>
            <Button
              appearance="secondary"
              onClick={async () => {
                const res = await fetch(`/api/b2b/projects/${id}/export-invoice`, { method: "POST" });
                const payload = await res.json();
                if (!res.ok) {
                  setError(payload?.error || "Unable to export invoice.");
                  return;
                }
                navigator.clipboard?.writeText(JSON.stringify(payload.payload, null, 2)).catch(() => null);
                alert("Invoice JSON copied to clipboard (MVP).");
              }}
            >
              Generate invoice (JSON)
            </Button>
          </div>
        </Card>
      ) : null}

      {tab === "share" ? (
        <Card className={styles.card}>
          <div className={styles.headerRow}>
            <div>
              <Text weight="semibold">Share links</Text>
              <Text size={200} className={styles.subtitle}>
                Public links are sanitized: no supplier identity, no supplier URLs, no internal margins. Project share links show shortlisted items only.
              </Text>
            </div>
            <Button appearance="primary" disabled={creatingShare} onClick={handleCreateShareLink}>
              {creatingShare ? "Creating…" : "New share link"}
            </Button>
          </div>

          {shareLinks.length === 0 ? (
            <Text className={styles.subtitle}>No share links yet.</Text>
          ) : (
            <Table size="small" className={styles.table}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Link</TableHeaderCell>
                  <TableHeaderCell>Permissions</TableHeaderCell>
                  <TableHeaderCell>Last accessed</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shareLinks.map((l) => {
                  const url = origin ? `${origin}/share/${l.token}` : `/share/${l.token}`;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Text size={200} className={styles.subtitle}>
                          {url}
                        </Text>
                      </TableCell>
                      <TableCell>{Array.isArray(l.permissions) ? l.permissions.join(", ") : "view"}</TableCell>
                      <TableCell>
                        <Text size={200} className={styles.subtitle}>
                          {l.last_accessed_at ? new Date(l.last_accessed_at).toLocaleString() : "—"}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <Button appearance="secondary" onClick={() => window.open(url, "_blank")}>
                            Open
                          </Button>
                          <Button appearance="subtle" onClick={() => router.push(`/app/b2b/share-links/${l.id}`)}>
                            View selections
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : null}
    </div>
  );
}
