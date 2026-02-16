"use client";

import {
  Badge,
  Button,
  Card,
  Checkbox,
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

type Lookbook = {
  id: string;
  title: string;
  description: string | null;
  supplier: { id: string; internal_name: string; platform: string } | null;
  curated_for_customer: { id: string; name: string } | null;
};

type LookbookItem = {
  id: string;
  title: string | null;
  image_url: string | null;
  preview_price_cny: number | null;
  exposed_to_customer: boolean;
  position: number | null;
  product_candidate_id: string | null;
  candidate: { id: string; title: string | null; images: string[]; status: string } | null;
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
  table: { width: "100%" },
  itemImage: {
    width: "56px",
    height: "56px",
    borderRadius: "12px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
  },
});

export default function B2BLookbookDetailPage() {
  const styles = useStyles();
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");

  const [lookbook, setLookbook] = useState<Lookbook | null>(null);
  const [items, setItems] = useState<LookbookItem[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLinkRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingShare, setCreatingShare] = useState(false);

  const origin =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";

  const load = useMemo(
    () => async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/b2b/lookbooks/${id}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || "Unable to load lookbook.");
        setLookbook(payload?.lookbook ?? null);
        setItems((payload?.items ?? []) as LookbookItem[]);

        const linksRes = await fetch(
          `/api/b2b/share-links?type=lookbook&entityId=${encodeURIComponent(id)}`
        );
        const linksPayload = await linksRes.json();
        if (!linksRes.ok) throw new Error(linksPayload?.error || "Unable to load share links.");
        setShareLinks((linksPayload?.items ?? []) as ShareLinkRow[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load lookbook.");
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleExpose = async (item: LookbookItem) => {
    setError(null);
    try {
      const res = await fetch(`/api/b2b/lookbooks/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exposed_to_customer: !item.exposed_to_customer }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to update item.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update item.");
    }
  };

  const handleCreateShare = async () => {
    if (!id) return;
    setCreatingShare(true);
    setError(null);
    try {
      const res = await fetch("/api/b2b/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "lookbook",
          entity_id: id,
          permissions: ["view", "select", "comment"],
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Unable to create share link.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create share link.");
    } finally {
      setCreatingShare(false);
    }
  };

  return (
    <div className={styles.layout}>
      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div>
            <Text weight="semibold">Lookbook</Text>
            <div>
              <Text size={600} weight="semibold">
                {lookbook?.title ?? "…"}
              </Text>
              <Text size={200} className={styles.subtitle}>
                Supplier: {lookbook?.supplier?.internal_name ?? "—"}{"\n"}
                Curated for: {lookbook?.curated_for_customer?.name ?? "—"}
              </Text>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button appearance="secondary" onClick={() => router.push("/app/b2b/lookbooks")}>
              Back to lookbooks
            </Button>
            <Button appearance="primary" disabled={creatingShare} onClick={handleCreateShare}>
              {creatingShare ? "Creating…" : "New share link"}
            </Button>
          </div>
        </div>

        {error ? (
          <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{error}</Text>
        ) : null}
        {loading ? <Spinner label="Loading…" /> : null}
      </Card>

      <Card className={styles.card}>
        <Text weight="semibold">Items</Text>
        <Text size={200} className={styles.subtitle}>
          Toggle “Expose” to include items on customer share links. Public pages are sanitized.
        </Text>

        {items.length === 0 ? (
          <Text className={styles.subtitle}>No items yet. Use “Scan supplier shop” in Imports.</Text>
        ) : (
          <Table size="small" className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Preview</TableHeaderCell>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Candidate</TableHeaderCell>
                <TableHeaderCell>Expose</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const img =
                  item.image_url ??
                  (item.candidate?.images && item.candidate.images.length > 0
                    ? item.candidate.images[0]
                    : null);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="Item" className={styles.itemImage} />
                      ) : (
                        <div className={styles.itemImage} />
                      )}
                    </TableCell>
                    <TableCell>{item.title ?? item.candidate?.title ?? "—"}</TableCell>
                    <TableCell>
                      {item.product_candidate_id ? (
                        <Button
                          appearance="subtle"
                          onClick={() =>
                            router.push(`/app/b2b/candidates/${item.product_candidate_id}`)
                          }
                          style={{ padding: 0, minWidth: 0, height: "auto" }}
                        >
                          <Badge appearance="outline">
                            {item.candidate?.status ?? "candidate"}
                          </Badge>
                        </Button>
                      ) : (
                        <Text className={styles.subtitle}>—</Text>
                      )}
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={item.exposed_to_customer}
                        onChange={() => handleToggleExpose(item)}
                        label=""
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className={styles.card}>
        <Text weight="semibold">Share links</Text>
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
    </div>
  );
}

