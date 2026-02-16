"use client";

import {
  Badge,
  Button,
  Card,
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
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  type: string | null;
  updated_at: string;
  project: { id: string; title: string } | null;
  candidate: { id: string; title: string | null } | null;
};

const useStyles = makeStyles({
  layout: { display: "flex", flexDirection: "column", gap: "16px" },
  card: { padding: "16px", borderRadius: "var(--app-radius)" },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  subtitle: { color: tokens.colorNeutralForeground3 },
  table: { width: "100%" },
  linkButton: {
    padding: 0,
    minWidth: 0,
    height: "auto",
    justifyContent: "flex-start",
    fontWeight: tokens.fontWeightSemibold,
  },
});

export default function B2BTasksPage() {
  const styles = useStyles();
  const router = useRouter();

  const [items, setItems] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/b2b/tasks?mine=true");
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || "Unable to load tasks.");
        setItems((payload?.items ?? []) as TaskRow[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load tasks.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={styles.layout}>
      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div>
            <Text weight="semibold">My tasks</Text>
            <Text size={200} className={styles.subtitle}>
              Tasks assigned to your account (due soon first).
            </Text>
          </div>
          <Button appearance="secondary" onClick={load}>
            Refresh
          </Button>
        </div>

        {error ? (
          <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{error}</Text>
        ) : null}

        {loading ? (
          <Spinner label="Loading tasks…" />
        ) : items.length === 0 ? (
          <Text className={styles.subtitle}>No tasks assigned to you.</Text>
        ) : (
          <Table size="small" className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Task</TableHeaderCell>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Candidate</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Due</TableHeaderCell>
                <TableHeaderCell>Updated</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.title}</TableCell>
                  <TableCell>
                    {t.project ? (
                      <Button
                        appearance="subtle"
                        className={styles.linkButton}
                        onClick={() => router.push(`/app/b2b/projects/${t.project!.id}`)}
                      >
                        {t.project.title}
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {t.candidate ? (
                      <Button
                        appearance="subtle"
                        className={styles.linkButton}
                        onClick={() => router.push(`/app/b2b/candidates/${t.candidate!.id}`)}
                      >
                        {t.candidate.title ?? "Candidate"}
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
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
      </Card>
    </div>
  );
}

