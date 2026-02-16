"use client";

import {
  Badge,
  Button,
  Card,
  Field,
  Image,
  Input,
  Spinner,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type SharePayload = any;

const useStyles = makeStyles({
  page: {
    minHeight: "100vh",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: {
    padding: "18px 20px",
    borderRadius: "16px",
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: "var(--app-shadow)",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  title: { fontWeight: tokens.fontWeightSemibold },
  subtitle: { color: tokens.colorNeutralForeground3, whiteSpace: "pre-line" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "14px",
    alignItems: "stretch",
  },
  itemCard: {
    padding: "12px",
    borderRadius: "16px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  itemImage: {
    width: "100%",
    height: "170px",
    objectFit: "cover",
    borderRadius: "14px",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  itemTitle: {
    fontWeight: tokens.fontWeightSemibold,
    overflowWrap: "anywhere",
  },
  pillRow: { display: "flex", gap: "6px", flexWrap: "wrap" },
  actions: { display: "flex", gap: "8px", flexWrap: "wrap" },
  commentBox: { display: "flex", flexDirection: "column", gap: "8px" },
});

const selectionLabel = (state?: string | null) => {
  if (!state) return "Not selected";
  if (state === "favorited") return "Favorited";
  if (state === "selected") return "Selected";
  if (state === "rejected") return "Rejected";
  if (state === "unselected") return "Not selected";
  return state;
};

export default function SharePage() {
  const styles = useStyles();
  const params = useParams();
  const token = String(params?.token || "");

  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const load = useMemo(
    () => async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(token)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Unable to load share link.");
        setPayload(body);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load share link.");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load();
  }, [load]);

  const link = payload?.link ?? null;
  const permissions: string[] = link?.permissions ?? ["view"];
  const canSelect = permissions.includes("select");
  const canComment = permissions.includes("comment");

  const selections = payload?.selections ?? { candidates: {}, lookbook_items: {} };

  const postSelection = async (args: {
    id: string;
    kind: "candidate" | "lookbook_item";
    selection_state?: string;
    comment?: string | null;
  }) => {
    if (!token) return;
    setSavingIds((prev) => new Set(prev).add(args.id));
    setError(null);
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_candidate_id: args.kind === "candidate" ? args.id : undefined,
          lookbook_item_id: args.kind === "lookbook_item" ? args.id : undefined,
          selection_state: args.selection_state,
          comment: args.comment,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Unable to save selection.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save selection.");
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(args.id);
        return next;
      });
    }
  };

  const renderItem = (item: any, kind: "candidate" | "lookbook_item") => {
    const id = String(item.id);
    const selection =
      kind === "candidate" ? selections?.candidates?.[id] : selections?.lookbook_items?.[id];
    const state = selection?.selection_state ?? "unselected";
    const currentComment = selection?.comment ?? "";

    const draft = commentDrafts[id] ?? currentComment;
    const isSaving = savingIds.has(id);

    return (
      <Card key={`${kind}-${id}`} className={styles.itemCard}>
        {item.image ? (
          <Image src={item.image} alt={item.title ?? "Item"} className={styles.itemImage} />
        ) : (
          <div className={styles.itemImage} />
        )}

        <div>
          <Text className={styles.itemTitle}>{item.title ?? "Item"}</Text>
          <div className={styles.pillRow}>
            <Badge appearance="outline">{selectionLabel(state)}</Badge>
            {item.moq !== null && item.moq !== undefined ? (
              <Badge appearance="outline">MOQ: {item.moq}</Badge>
            ) : null}
            {item.customer_unit_price !== null && item.customer_unit_price !== undefined ? (
              <Badge appearance="filled">
                {item.customer_unit_price.toFixed(2)} {item.currency}
              </Badge>
            ) : null}
          </div>
        </div>

        {canSelect ? (
          <div className={styles.actions}>
            <Button
              appearance={state === "selected" ? "primary" : "secondary"}
              disabled={isSaving}
              onClick={() =>
                postSelection({
                  id,
                  kind,
                  selection_state: state === "selected" ? "unselected" : "selected",
                  comment: canComment ? (draft || null) : undefined,
                })
              }
            >
              {state === "selected" ? "Selected" : "Select"}
            </Button>
            <Button
              appearance={state === "favorited" ? "primary" : "secondary"}
              disabled={isSaving}
              onClick={() =>
                postSelection({
                  id,
                  kind,
                  selection_state: state === "favorited" ? "unselected" : "favorited",
                  comment: canComment ? (draft || null) : undefined,
                })
              }
            >
              {state === "favorited" ? "Favorited" : "Favorite"}
            </Button>
            <Button
              appearance="subtle"
              disabled={isSaving}
              onClick={() =>
                postSelection({
                  id,
                  kind,
                  selection_state: "unselected",
                  comment: canComment ? (draft || null) : undefined,
                })
              }
            >
              Clear
            </Button>
          </div>
        ) : (
          <Text size={200} className={styles.subtitle}>
            Selections are disabled on this link.
          </Text>
        )}

        {canComment ? (
          <div className={styles.commentBox}>
            <Field label="Comment">
              <Textarea
                value={draft}
                onChange={(_, data) =>
                  setCommentDrafts((prev) => ({ ...prev, [id]: data.value }))
                }
                resize="vertical"
              />
            </Field>
            <Button
              appearance="secondary"
              disabled={isSaving}
              onClick={() =>
                postSelection({
                  id,
                  kind,
                  selection_state: state,
                  comment: (commentDrafts[id] ?? currentComment ?? "").trim() || null,
                })
              }
            >
              Save comment
            </Button>
          </div>
        ) : null}
      </Card>
    );
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <Spinner label="Loading…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <Card className={styles.header}>
          <Text className={styles.title}>Share link</Text>
          <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{error}</Text>
        </Card>
      </div>
    );
  }

  if (!payload || !link) {
    return (
      <div className={styles.page}>
        <Card className={styles.header}>
          <Text className={styles.title}>Share link</Text>
          <Text className={styles.subtitle}>Not found.</Text>
        </Card>
      </div>
    );
  }

  if (link.type === "project") {
    const project = payload.project;
    const items = (payload.items ?? []) as any[];
    return (
      <div className={styles.page}>
        <Card className={styles.header}>
          <Text className={styles.title}>{project?.title ?? "Project shortlist"}</Text>
          <Text className={styles.subtitle}>
            Browse the curated shortlist and select/favorite items. Supplier information is hidden.
          </Text>
        </Card>

        <div className={styles.grid}>
          {items.map((item) => renderItem(item, "candidate"))}
        </div>
      </div>
    );
  }

  if (link.type === "product") {
    const item = payload.item;
    return (
      <div className={styles.page}>
        <Card className={styles.header}>
          <Text className={styles.title}>{item?.title ?? "Product"}</Text>
          <Text className={styles.subtitle}>
            Supplier information is hidden. You can select/favorite and add a comment.
          </Text>
        </Card>

        <div className={styles.grid}>{item ? renderItem(item, "candidate") : null}</div>
      </div>
    );
  }

  if (link.type === "lookbook") {
    const lookbook = payload.lookbook;
    const items = (payload.items ?? []) as any[];
    return (
      <div className={styles.page}>
        <Card className={styles.header}>
          <Text className={styles.title}>{lookbook?.title ?? "Lookbook"}</Text>
          <Text className={styles.subtitle}>
            Curated supplier products. Supplier identity and supplier URLs are hidden.
          </Text>
        </Card>

        <div className={styles.grid}>
          {items.map((item) => renderItem(item, "lookbook_item"))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Card className={styles.header}>
        <Text className={styles.title}>Share link</Text>
        <Text className={styles.subtitle}>Unsupported link type.</Text>
      </Card>
    </div>
  );
}

