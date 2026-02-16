"use client";

import {
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
import { useParams, useRouter } from "next/navigation";

type CustomerRow = {
  id: string;
  name: string;
  main_currency: string;
  created_at: string;
  updated_at: string;
};

type ProjectRow = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
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
  table: { width: "100%" },
  linkButton: {
    padding: 0,
    minWidth: 0,
    height: "auto",
    justifyContent: "flex-start",
    fontWeight: tokens.fontWeightSemibold,
  },
});

export default function B2BCustomerDetailPage() {
  const styles = useStyles();
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(
    () => async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/b2b/customers/${id}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || "Unable to load customer.");
        setCustomer(payload?.customer ?? null);
        setProjects((payload?.projects ?? []) as ProjectRow[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load customer.");
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={styles.layout}>
      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div>
            <Text weight="semibold">Customer</Text>
            <div>
              <Text size={500} weight="semibold">
                {customer?.name ?? "…"}
              </Text>
              <Text size={200} className={styles.subtitle}>
                Currency: {customer?.main_currency ?? "SEK"}
              </Text>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button appearance="secondary" onClick={() => router.push("/app/b2b/customers")}>
              Back to customers
            </Button>
            <Button
              appearance="primary"
              onClick={() => router.push(`/app/b2b/projects?customerId=${encodeURIComponent(id)}`)}
            >
              New project
            </Button>
          </div>
        </div>

        {error ? (
          <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{error}</Text>
        ) : null}

        {loading ? <Spinner label="Loading…" /> : null}
      </Card>

      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div>
            <Text weight="semibold">Projects</Text>
            <Text size={200} className={styles.subtitle}>
              {projects.length} total
            </Text>
          </div>
        </div>

        {loading ? (
          <Spinner label="Loading projects…" />
        ) : projects.length === 0 ? (
          <Text className={styles.subtitle}>No projects yet.</Text>
        ) : (
          <Table size="small" className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Updated</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Button
                      appearance="subtle"
                      className={styles.linkButton}
                      onClick={() => router.push(`/app/b2b/projects/${p.id}`)}
                    >
                      {p.title}
                    </Button>
                  </TableCell>
                  <TableCell>{p.status}</TableCell>
                  <TableCell>
                    <Text size={200} className={styles.subtitle}>
                      {new Date(p.updated_at).toLocaleString()}
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

