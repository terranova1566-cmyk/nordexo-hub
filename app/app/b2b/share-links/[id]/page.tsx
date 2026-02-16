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
import { useParams, useRouter } from "next/navigation";

type ShareLink = {
  id: string;
  token: string;
  type: string;
  entity_id: string;
  permissions: string[];
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
};

type SelectionRow = {
  id: string;
  external_user_session_id: string;
  selection_state: string;
  comment: string | null;
  updated_at: string;
  product_candidate_id: string | null;
  lookbook_item_id: string | null;
  candidate: { id: string; title: string | null } | null;
  lookbook_item: { id: string; title: string | null } | null;
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
});

export default function B2BShareLinkDetailPage() {
  const styles = useStyles();
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");

  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [selections, setSelections] = useState<SelectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";

  const load = useMemo(
    () => async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const [linkRes, selRes] = await Promise.all([
          fetch(`/api/b2b/share-links/${id}`),
          fetch(`/api/b2b/share-links/${id}/selections`),
        ]);
        const linkPayload = await linkRes.json();
        const selPayload = await selRes.json();
        if (!linkRes.ok) throw new Error(linkPayload?.error || "Unable to load share link.");
        if (!selRes.ok) throw new Error(selPayload?.error || "Unable to load selections.");
        setShareLink(linkPayload?.shareLink ?? null);
        setSelections((selPayload?.items ?? []) as SelectionRow[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load share link.");
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    load();
  }, [load]);

  const shareUrl =
    shareLink?.token ? (origin ? `${origin}/share/${shareLink.token}` : `/share/${shareLink.token}`) : "";

  return (
    <div className={styles.layout}>
      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div>
            <Text weight="semibold">Share link</Text>
            <Text size={200} className={styles.subtitle}>
              Type: {shareLink?.type ?? "—"}{"\n"}
              URL: {shareUrl || "—"}
            </Text>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button appearance="secondary" onClick={() => router.back()}>
              Back
            </Button>
            {shareUrl ? (
              <Button appearance="primary" onClick={() => window.open(shareUrl, "_blank")}>
                Open public view
              </Button>
            ) : null}
          </div>
        </div>

        {error ? (
          <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{error}</Text>
        ) : null}
        {loading ? <Spinner label="Loading…" /> : null}
      </Card>

      <Card className={styles.card}>
        <Text weight="semibold">Customer selections</Text>
        <Text size={200} className={styles.subtitle}>
          Selections are tied to a cookie-backed external session id.
        </Text>

        {selections.length === 0 ? (
          <Text className={styles.subtitle}>No selections yet.</Text>
        ) : (
          <Table size="small" className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>When</TableHeaderCell>
                <TableHeaderCell>Session</TableHeaderCell>
                <TableHeaderCell>Item</TableHeaderCell>
                <TableHeaderCell>State</TableHeaderCell>
                <TableHeaderCell>Comment</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selections.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Text size={200} className={styles.subtitle}>
                      {new Date(s.updated_at).toLocaleString()}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text size={200} className={styles.subtitle}>
                      {s.external_user_session_id.slice(0, 8)}
                    </Text>
                  </TableCell>
                  <TableCell>
                    {s.product_candidate_id ? (
                      <Button
                        appearance="subtle"
                        onClick={() => router.push(`/app/b2b/candidates/${s.product_candidate_id}`)}
                        style={{ padding: 0, minWidth: 0, height: "auto" }}
                      >
                        {s.candidate?.title ?? "Candidate"}
                      </Button>
                    ) : s.lookbook_item_id ? (
                      <Text>{s.lookbook_item?.title ?? "Lookbook item"}</Text>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge appearance="outline">{s.selection_state}</Badge>
                  </TableCell>
                  <TableCell>{s.comment ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

