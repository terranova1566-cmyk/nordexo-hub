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

type CustomerRow = {
  id: string;
  name: string;
  main_currency: string;
  created_at: string;
  updated_at: string;
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
  dialogSurface: { padding: "20px", width: "min(560px, 96vw)" },
});

export default function B2BCustomersPage() {
  const styles = useStyles();
  const router = useRouter();

  const [items, setItems] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("SEK");
  const [creating, setCreating] = useState(false);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/b2b/customers");
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || "Unable to load customers.");
        setItems((payload?.items ?? []) as CustomerRow[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load customers.");
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
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/b2b/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, main_currency: currency.trim() }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to create customer.");
      setCreateOpen(false);
      setName("");
      setCurrency("SEK");
      await load();
      if (payload?.id) router.push(`/app/b2b/customers/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create customer.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.layout}>
      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div>
            <Text weight="semibold">Customers</Text>
            <div>
              <Text size={200} className={styles.subtitle}>
                Manage customer organizations and their B2B projects.
              </Text>
            </div>
          </div>
          <Button appearance="primary" onClick={() => setCreateOpen(true)}>
            New customer
          </Button>
        </div>

        {error ? (
          <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{error}</Text>
        ) : null}

        {loading ? (
          <Spinner label="Loading customers…" />
        ) : items.length === 0 ? (
          <Text className={styles.subtitle}>No customers yet.</Text>
        ) : (
          <Table size="small" className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Currency</TableHeaderCell>
                <TableHeaderCell>Updated</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Button
                      appearance="subtle"
                      className={styles.linkButton}
                      onClick={() => router.push(`/app/b2b/customers/${c.id}`)}
                    >
                      {c.name}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Badge appearance="outline">{c.main_currency || "SEK"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Text size={200} className={styles.subtitle}>
                      {new Date(c.updated_at).toLocaleString()}
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
            <DialogTitle>New customer</DialogTitle>
            <Field label="Customer name" required>
              <Input value={name} onChange={(_, data) => setName(data.value)} />
            </Field>
            <Field label="Main currency (ISO)">
              <Input
                value={currency}
                onChange={(_, data) => setCurrency(data.value)}
                placeholder="SEK"
              />
            </Field>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button appearance="primary" disabled={creating || !name.trim()} onClick={handleCreate}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

