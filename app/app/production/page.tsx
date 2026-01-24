"use client";

import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Image,
  MessageBar,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Textarea,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatDateTime } from "@/lib/format";

type ProductionItem = {
  provider: string;
  product_id: string;
  title: string | null;
  product_url: string | null;
  image_url: string | null;
  image_local_path: string | null;
  image_local_url: string | null;
  source_url: string | null;
  taxonomy_l1: string | null;
  taxonomy_l2: string | null;
  taxonomy_l3: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  sold_today: number | null;
  sold_7d: number | null;
  sold_all_time: number | null;
  created_at: string | null;
  comment_count?: number | null;
};

type ProductionComment = {
  id: string;
  user_label: string;
  comment: string;
  created_at: string;
};

const useStyles = makeStyles({
  card: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
  },
  table: {
    width: "100%",
    "& .fui-TableCell": {
      paddingTop: "10px",
      paddingBottom: "10px",
      verticalAlign: "top",
    },
  },
  imageCol: {
    width: "83px",
    paddingLeft: "8px",
    paddingRight: 0,
    boxSizing: "border-box",
  },
  productCol: {
    width: "450px",
    maxWidth: "450px",
    minWidth: "450px",
    paddingLeft: "15px",
    paddingRight: "20px",
  },
  providerCol: {
    width: "150px",
  },
  salesCol: {
    width: "150px",
  },
  categoryCol: {
    width: "300px",
    maxWidth: "300px",
  },
  linkCol: {
    width: "100px",
  },
  commentsCol: {
    width: "160px",
  },
  thumb: {
    width: "75px",
    height: "75px",
    borderRadius: "12px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  productTitle: {
    fontWeight: 600,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    lineHeight: "1.35",
  },
  providerBadge: {
    textTransform: "uppercase",
  },
  cdonBadge: {
    backgroundColor: tokens.colorPaletteLightGreenBackground1,
    color: tokens.colorPaletteGreenForeground2,
  },
  fyndiqBadge: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground2,
  },
  digidealBadge: {
    backgroundColor: "#ebf7ff",
    color: tokens.colorPaletteBlueForeground2,
  },
  categoryText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  categoryLink: {
    color: tokens.colorNeutralForeground3,
    textDecorationLine: "none",
    "&:hover": {
      color: tokens.colorNeutralForeground2,
      textDecorationLine: "underline",
    },
  },
  salesText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  salesWrap: {
    display: "inline-flex",
    flexDirection: "column",
    gap: "4px",
  },
  salesGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  },
  salesButton: {
    borderRadius: "999px",
    border: `1px solid ${tokens.colorBrandStroke1}`,
    color: tokens.colorBrandForeground1,
    minWidth: "20px",
    height: "20px",
    paddingInline: "4px",
    paddingBlock: "0px",
    backgroundColor: "transparent",
    fontSize: "11px",
    fontWeight: tokens.fontWeightBold,
    lineHeight: "14px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "default",
    userSelect: "none",
  },
  cardMeta: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
  actionCell: {
    width: "auto",
  },
  actionRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  commentDialog: {
    minWidth: "520px",
    maxWidth: "720px",
  },
  commentList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxHeight: "320px",
    overflowY: "auto",
    padding: "2px",
  },
  commentItem: {
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "10px 12px",
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  commentHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "12px",
  },
  commentMeta: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
  commentBody: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: "pre-wrap",
  },
  commentSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
});

export default function ProductionPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [items, setItems] = useState<ProductionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoaded, setAdminLoaded] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [commentTarget, setCommentTarget] = useState<ProductionItem | null>(null);
  const [commentItems, setCommentItems] = useState<ProductionComment[]>([]);
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  useEffect(() => {
    let isActive = true;
    const loadAdmin = async () => {
      try {
        const response = await fetch("/api/settings/profile");
        if (!response.ok) return;
        const payload = await response.json();
        if (isActive) {
          setIsAdmin(Boolean(payload?.is_admin));
        }
      } catch {
        // ignore admin fetch errors
      } finally {
        if (isActive) setAdminLoaded(true);
      }
    };

    loadAdmin();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/discovery/production");
        if (!response.ok) {
          throw new Error(t("production.error.load"));
        }
        const payload = await response.json();
        if (!isActive) return;
        setItems(payload.items ?? []);
      } catch (err) {
        if (!isActive) return;
        setError((err as Error).message);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    load();

    return () => {
      isActive = false;
    };
  }, [t]);

  const handleRemove = async (item: ProductionItem) => {
    const key = `${item.provider}:${item.product_id}`;
    setRemovingKey(key);
    setError(null);
    const previous = items;
    setItems((prev) => prev.filter((entry) => entry !== item));
    try {
      const response = await fetch("/api/discovery/production", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: item.provider,
          product_id: item.product_id,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || t("production.error.remove"));
      }
    } catch (err) {
      setItems(previous);
      setError((err as Error).message);
    } finally {
      setRemovingKey(null);
    }
  };

  const closeCommentDialog = useCallback(() => {
    setCommentDialogOpen(false);
    setCommentTarget(null);
    setCommentItems([]);
    setCommentError(null);
    setCommentDraft("");
    setCommentLoading(false);
    setCommentSaving(false);
  }, []);

  const openCommentDialog = useCallback(
    async (item: ProductionItem) => {
      setCommentTarget(item);
      setCommentDialogOpen(true);
      setCommentError(null);
      setCommentDraft("");
      setCommentItems([]);
      setCommentLoading(true);
      try {
        const params = new URLSearchParams({
          provider: item.provider,
          product_id: item.product_id,
        });
        const response = await fetch(
          `/api/discovery/production/comments?${params.toString()}`
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || t("production.comments.errorLoad"));
        }
        const payload = await response.json();
        setCommentItems(payload.items ?? []);
      } catch (err) {
        setCommentError(
          err instanceof Error ? err.message : t("production.comments.errorLoad")
        );
      } finally {
        setCommentLoading(false);
      }
    },
    [t]
  );

  const handleSaveComment = useCallback(async () => {
    if (!commentTarget) return;
    const trimmed = commentDraft.trim();
    if (!trimmed) return;
    setCommentSaving(true);
    setCommentError(null);
    try {
      const response = await fetch("/api/discovery/production/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: commentTarget.provider,
          product_id: commentTarget.product_id,
          comment: trimmed,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("production.comments.errorSave"));
      }
      const nextItem: ProductionComment = payload?.item ?? {
        id: `${commentTarget.provider}:${commentTarget.product_id}:${Date.now()}`,
        user_label: t("production.comments.you"),
        comment: trimmed,
        created_at: new Date().toISOString(),
      };
      setCommentItems((prev) => [...prev, nextItem]);
      setCommentDraft("");
      setItems((prev) =>
        prev.map((entry) =>
          entry.provider === commentTarget.provider &&
          entry.product_id === commentTarget.product_id
            ? {
                ...entry,
                comment_count: (entry.comment_count ?? 0) + 1,
              }
            : entry
        )
      );
    } catch (err) {
      setCommentError(
        err instanceof Error ? err.message : t("production.comments.errorSave")
      );
    } finally {
      setCommentSaving(false);
    }
  }, [commentDraft, commentTarget, t]);

  const content = useMemo(() => {
    if (loading) {
      return <Spinner label={t("production.loading")} />;
    }
    if (items.length === 0) {
      return <Text>{t("production.empty")}</Text>;
    }
    return (
      <Table className={styles.table}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell className={styles.imageCol} />
            <TableHeaderCell className={styles.productCol}>
              {t("production.table.product")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.providerCol}>
              {t("production.table.provider")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.salesCol}>
              {t("production.table.sales")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.categoryCol}>
              {t("production.table.category")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.linkCol}>
              {t("production.table.link")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.commentsCol}>
              {t("production.table.comments")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.actionCell}>
              {t("production.table.actions")}
            </TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const title = item.title ?? item.product_id;
            const providerLabel =
              item.provider === "digideal"
                ? "DigiDeal"
                : item.provider.toUpperCase();
            const localImageUrl =
              item.image_local_url ||
              (item.image_local_path
                ? `/api/discovery/local-image?path=${encodeURIComponent(
                    item.image_local_path
                  )}`
                : null);
            const imageSrc = localImageUrl || item.image_url;
            const category = [
              item.taxonomy_l1,
              item.taxonomy_l2,
              item.taxonomy_l3,
            ]
              .filter(Boolean)
              .join(" / ");
            const categoryParam = item.taxonomy_l3
              ? `l3:${encodeURIComponent(item.taxonomy_l3)}`
              : item.taxonomy_l2
                ? `l2:${encodeURIComponent(item.taxonomy_l2)}`
                : item.taxonomy_l1
                  ? `l1:${encodeURIComponent(item.taxonomy_l1)}`
                  : "";
            const link = item.product_url || item.source_url;
            const commentCount = item.comment_count ?? 0;
            const hasComments = commentCount > 0;
            const commentLabel = hasComments
              ? t("production.comments.view")
              : t("production.comments.none");
            return (
              <TableRow key={`${item.provider}:${item.product_id}`}>
                <TableCell className={styles.imageCol}>
                  {imageSrc ? (
                    <Image src={imageSrc} alt={title} className={styles.thumb} />
                  ) : null}
                </TableCell>
                <TableCell className={mergeClasses(styles.productCol)}>
                  <Text className={styles.productTitle}>{title}</Text>
                </TableCell>
                <TableCell className={styles.providerCol}>
                  <Badge
                    appearance="outline"
                    className={mergeClasses(
                      styles.providerBadge,
                      item.provider === "cdon"
                        ? styles.cdonBadge
                        : item.provider === "fyndiq"
                          ? styles.fyndiqBadge
                          : item.provider === "digideal"
                            ? styles.digidealBadge
                            : undefined
                    )}
                  >
                    {providerLabel}
                  </Badge>
                </TableCell>
                <TableCell className={styles.salesCol}>
                  <div className={styles.salesWrap}>
                    <span className={styles.salesGroup}>
                      <Text size={200} className={styles.cardMeta}>
                        1d
                      </Text>
                      <span className={styles.salesButton}>
                        {item.sold_today ?? 0}
                      </span>
                    </span>
                    <span className={styles.salesGroup}>
                      <Text size={200} className={styles.cardMeta}>
                        7d
                      </Text>
                      <span className={styles.salesButton}>
                        {item.sold_7d ?? 0}
                      </span>
                    </span>
                    <span className={styles.salesGroup}>
                      <Text size={200} className={styles.cardMeta}>
                        {t("discovery.sales.all")}
                      </Text>
                      <span className={styles.salesButton}>
                        {item.sold_all_time ?? 0}
                      </span>
                    </span>
                  </div>
                </TableCell>
                <TableCell className={styles.categoryCol}>
                  {category ? (
                    <a
                      href={`/app/discovery?categories=${categoryParam}`}
                      className={styles.categoryLink}
                    >
                      <Text className={styles.categoryText}>{category}</Text>
                    </a>
                  ) : (
                    <Text className={styles.categoryText}>-</Text>
                  )}
                </TableCell>
                <TableCell className={styles.linkCol}>
                  {link ? (
                    <Button
                      appearance="outline"
                      size="small"
                      as="a"
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("production.link.view")}
                    </Button>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className={styles.commentsCol}>
                  <Button
                    appearance={hasComments ? "primary" : "outline"}
                    size="small"
                    onClick={() => openCommentDialog(item)}
                    disabled={!hasComments}
                  >
                    {commentLabel}
                  </Button>
                </TableCell>
                <TableCell className={styles.actionCell}>
                  <div className={styles.actionRow}>
                    <Button
                      appearance="outline"
                      size="small"
                      onClick={() => handleRemove(item)}
                      disabled={removingKey === `${item.provider}:${item.product_id}`}
                    >
                      {t("production.action.remove")}
                    </Button>
                    <Button appearance="outline" size="small" disabled>
                      {t("production.action.produce")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }, [items, loading, removingKey, openCommentDialog, styles, t]);

  return (
    <>
      <Card className={styles.card}>
        <Text size={600} weight="semibold">
          {t("production.title")}
        </Text>
        <Text size={200} className={styles.categoryText}>
          {t("production.subtitle")}
        </Text>
        {!adminLoaded ? <Spinner /> : null}
        {adminLoaded && !isAdmin ? (
          <MessageBar>{t("production.error.adminOnly")}</MessageBar>
        ) : null}
        {error ? <MessageBar intent="error">{error}</MessageBar> : null}
        {adminLoaded && isAdmin ? content : null}
      </Card>
      <Dialog
        open={commentDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closeCommentDialog();
          }
        }}
      >
        <DialogSurface className={styles.commentDialog}>
          <DialogBody>
            <DialogTitle>{t("production.comments.title")}</DialogTitle>
            <DialogContent className={styles.commentSection}>
              {commentTarget ? (
                <Text size={200}>
                  {commentTarget.title ?? commentTarget.product_id}
                </Text>
              ) : null}
              {commentError ? (
                <MessageBar intent="error">{commentError}</MessageBar>
              ) : null}
              {commentLoading ? (
                <Spinner label={t("production.comments.loading")} />
              ) : commentItems.length === 0 ? (
                <Text>{t("production.comments.empty")}</Text>
              ) : (
                <div className={styles.commentList}>
                  {commentItems.map((comment) => (
                    <div key={comment.id} className={styles.commentItem}>
                      <div className={styles.commentHeader}>
                        <Text weight="semibold">{comment.user_label}</Text>
                        <Text className={styles.commentMeta}>
                          {formatDateTime(comment.created_at)}
                        </Text>
                      </div>
                      <Text className={styles.commentBody}>{comment.comment}</Text>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.commentSection}>
                <Field label={t("production.comments.addLabel")}>
                  <Textarea
                    value={commentDraft}
                    onChange={(_, data) => setCommentDraft(data.value)}
                    placeholder={t("production.comments.addPlaceholder")}
                    resize="vertical"
                  />
                </Field>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeCommentDialog}>
                {t("production.comments.close")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleSaveComment}
                disabled={commentSaving || commentDraft.trim().length === 0}
              >
                {t("production.comments.save")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
