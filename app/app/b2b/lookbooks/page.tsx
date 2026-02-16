"use client";

import {
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

type LookbookRow = {
  id: string;
  title: string;
  description: string | null;
  updated_at: string;
  supplier: { id: string; internal_name: string; platform: string } | null;
  curated_for_customer: { id: string; name: string } | null;
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
  dialogSurface: { padding: "20px", width: "min(640px, 96vw)" },
});

export default function B2BLookbooksPage() {
  const styles = useStyles();
  const router = useRouter();

  const [items, setItems] = useState<LookbookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/b2b/lookbooks");
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || "Unable to load lookbooks.");
        setItems((payload?.items ?? []) as LookbookRow[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load lookbooks.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/b2b/lookbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, description: description.trim() || null }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to create lookbook.");
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      await load();
      if (payload?.id) router.push(`/app/b2b/lookbooks/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create lookbook.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.layout}>
      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div>
            <Text weight="semibold">Supplier lookbooks</Text>
            <Text size={200} className={styles.subtitle}>
              Curate supplier products and share sanitized public links with customers.
            </Text>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button appearance="secondary" onClick={() => router.push("/app/b2b/imports")}>
              Scan supplier shop
            </Button>
            <Button appearance="primary" onClick={() => setCreateOpen(true)}>
              New lookbook
            </Button>
          </div>
        </div>

        {error ? (
          <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{error}</Text>
        ) : null}

        {loading ? (
          <Spinner label="Loading lookbooks…" />
        ) : items.length === 0 ? (
          <Text className={styles.subtitle}>No lookbooks yet.</Text>
        ) : (
          <Table size="small" className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Lookbook</TableHeaderCell>
                <TableHeaderCell>Supplier</TableHeaderCell>
                <TableHeaderCell>Curated for</TableHeaderCell>
                <TableHeaderCell>Updated</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Button
                      appearance="subtle"
                      className={styles.linkButton}
                      onClick={() => router.push(`/app/b2b/lookbooks/${l.id}`)}
                    >
                      {l.title}
                    </Button>
                  </TableCell>
                  <TableCell>{l.supplier?.internal_name ?? "—"}</TableCell>
                  <TableCell>{l.curated_for_customer?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Text size={200} className={styles.subtitle}>
                      {new Date(l.updated_at).toLocaleString()}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={(_, data) => setCreateOpen(data.open)}>
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody>
            <DialogTitle>New lookbook</DialogTitle>
            <Field label="Title" required>
              <Input value={title} onChange={(_, data) => setTitle(data.value)} />
            </Field>
            <Field label="Description">
              <Input
                value={description}
                onChange={(_, data) => setDescription(data.value)}
                placeholder="Optional"
              />
            </Field>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button appearance="primary" disabled={creating || !title.trim()} onClick={handleCreate}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

