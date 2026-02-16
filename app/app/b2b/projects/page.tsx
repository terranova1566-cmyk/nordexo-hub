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
  Dropdown,
  Field,
  Input,
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
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type CustomerOption = { id: string; name: string; main_currency: string };
type ProjectRow = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  customer: { id: string; name: string; main_currency: string } | null;
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
  dialogSurface: { padding: "20px", width: "min(720px, 96vw)" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
});

export default function B2BProjectsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <B2BProjectsPageInner />
    </Suspense>
  );
}

function B2BProjectsPageInner() {
  const styles = useStyles();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const preCustomerId = searchParams.get("customerId") || "";

  const [customerId, setCustomerId] = useState(preCustomerId);
  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState("");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [marginPercent, setMarginPercent] = useState("0");
  const [marginFixed, setMarginFixed] = useState("0");

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const [projectsRes, customersRes] = await Promise.all([
          fetch("/api/b2b/projects"),
          fetch("/api/b2b/customers"),
        ]);

        const projectsPayload = await projectsRes.json();
        const customersPayload = await customersRes.json();

        if (!projectsRes.ok) throw new Error(projectsPayload?.error || "Unable to load projects.");
        if (!customersRes.ok)
          throw new Error(customersPayload?.error || "Unable to load customers.");

        setProjects((projectsPayload?.items ?? []) as ProjectRow[]);
        setCustomers((customersPayload?.items ?? []) as CustomerOption[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load projects.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!preCustomerId) return;
    setCustomerId(preCustomerId);
  }, [preCustomerId]);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  const openCreate = () => {
    setCreateOpen(true);
    if (selectedCustomer) {
      setCurrency(selectedCustomer.main_currency || "SEK");
    }
  };

  const handleCreate = async () => {
    const trimmedTitle = title.trim();
    if (!customerId || !trimmedTitle) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/b2b/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          title: trimmedTitle,
          currency: currency.trim() || undefined,
          exchange_rate_cny: Number(exchangeRate),
          margin_percent_default: Number(marginPercent),
          margin_fixed_default: Number(marginFixed),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to create project.");
      setCreateOpen(false);
      setTitle("");
      await load();
      if (payload?.id) router.push(`/app/b2b/projects/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create project.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.layout}>
      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div>
            <Text weight="semibold">Projects</Text>
            <div>
              <Text size={200} className={styles.subtitle}>
                Customer projects with end-to-end sourcing, negotiation, production, and shipping.
              </Text>
            </div>
          </div>
          <Button appearance="primary" onClick={openCreate}>
            New project
          </Button>
        </div>

        {error ? (
          <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{error}</Text>
        ) : null}

        {loading ? (
          <Spinner label="Loading projects…" />
        ) : projects.length === 0 ? (
          <Text className={styles.subtitle}>No projects yet.</Text>
        ) : (
          <Table size="small" className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Customer</TableHeaderCell>
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
                  <TableCell>{p.customer?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge appearance="outline">{p.status}</Badge>
                  </TableCell>
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

      <Dialog open={createOpen} onOpenChange={(_, data) => setCreateOpen(data.open)}>
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody>
            <DialogTitle>New project</DialogTitle>

            <Field label="Customer" required>
              <Dropdown
                selectedOptions={customerId ? [customerId] : []}
                value={selectedCustomer ? selectedCustomer.name : ""}
                placeholder="Select a customer"
                onOptionSelect={(_, data) => {
                  const next = String(data.optionValue || "");
                  setCustomerId(next);
                  const customer = customers.find((c) => c.id === next) ?? null;
                  if (customer && !currency) setCurrency(customer.main_currency || "SEK");
                }}
              >
                {customers.map((c) => (
                  <Option
                    key={c.id}
                    value={c.id}
                    text={`${c.name} (${c.main_currency || "SEK"})`}
                  >
                    {c.name} ({c.main_currency || "SEK"})
                  </Option>
                ))}
              </Dropdown>
            </Field>

            <Field label="Project title" required>
              <Input value={title} onChange={(_, data) => setTitle(data.value)} />
            </Field>

            <div className={styles.formGrid}>
              <Field label="Currency (customer-facing)">
                <Input
                  value={currency}
                  onChange={(_, data) => setCurrency(data.value)}
                  placeholder={selectedCustomer?.main_currency || "SEK"}
                />
              </Field>
              <Field label="Exchange rate (CNY → currency)">
                <Input
                  value={exchangeRate}
                  onChange={(_, data) => setExchangeRate(data.value)}
                  placeholder="1.0"
                />
              </Field>
              <Field label="Default margin (%)">
                <Input
                  value={marginPercent}
                  onChange={(_, data) => setMarginPercent(data.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Default margin (fixed, currency)">
                <Input
                  value={marginFixed}
                  onChange={(_, data) => setMarginFixed(data.value)}
                  placeholder="0"
                />
              </Field>
            </div>

            <DialogActions>
              <Button appearance="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                disabled={creating || !customerId || !title.trim()}
                onClick={handleCreate}
              >
                {creating ? "Creating…" : "Create"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
