"use client";

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Image,
  Input,
  MessageBar,
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
import { useI18n } from "@/components/i18n-provider";
import { createClient } from "@/lib/supabase/client";

type Wishlist = {
  id: string;
  name: string;
  created_at: string | null;
  item_count?: number;
};

type ListProduct = {
  id: string;
  spu: string | null;
  title: string | null;
  google_taxonomy_l1?: string | null;
  google_taxonomy_l2?: string | null;
  google_taxonomy_l3?: string | null;
  created_at: string | null;
  updated_at: string | null;
  variant_count: number;
  thumbnail_url?: string | null;
  small_image_url?: string | null;
};

const formatShortDate = (value?: string | null) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const TrashIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" />
    <path d="M4 7l16 0" />
    <path d="M10 11l0 6" />
    <path d="M14 11l0 6" />
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
  </svg>
);

const useStyles = makeStyles({
  card: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "12px",
  },
  listActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  detailHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "12px",
  },
  detailActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  exportButton: {
    fontWeight: tokens.fontWeightSemibold,
  },
  exportField: {
    minWidth: "260px",
  },
  backButton: {
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  table: {
    width: "100%",
    "& .fui-TableCell": {
      paddingTop: "10px",
      paddingBottom: "10px",
    },
  },
  headerCell: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightRegular,
  },
  selectCell: {
    width: "56px",
    textAlign: "right",
  },
  listNameButton: {
    background: "none",
    border: "none",
    padding: 0,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    cursor: "pointer",
    textAlign: "left",
    "&:hover": {
      color: tokens.colorNeutralForeground2,
    },
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "nowrap",
  },
  imageCol: {
    width: "90px",
    paddingLeft: "8px",
    paddingRight: "8px",
  },
  thumbnail: {
    width: "75px",
    height: "75px",
    borderRadius: "12px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  thumbnailWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    "&:hover .previewLayer": {
      opacity: 1,
      transform: "translateY(0)",
    },
    "&:focus-within .previewLayer": {
      opacity: 1,
      transform: "translateY(0)",
    },
  },
  previewLayer: {
    position: "absolute",
    left: "calc(100% + 12px)",
    top: 0,
    zIndex: 10,
    opacity: 0,
    transform: "translateY(-4px)",
    transition: "opacity 120ms ease, transform 120ms ease",
    pointerEvents: "none",
  },
  previewBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow16,
  },
  previewImage: {
    width: "500px",
    height: "500px",
    maxWidth: "70vw",
    maxHeight: "70vh",
    objectFit: "contain",
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: "10px",
  },
  productCol: {
    minWidth: "300px",
  },
  productTitleLink: {
    color: tokens.colorNeutralForeground1,
    textDecorationLine: "none",
    fontWeight: tokens.fontWeightSemibold,
    "&:hover": {
      color: tokens.colorNeutralForeground2,
    },
  },
  breadcrumbRow: {
    display: "block",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: "1.05",
  },
  breadcrumbLink: {
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    color: tokens.colorNeutralForeground3,
    cursor: "pointer",
    fontSize: tokens.fontSizeBase100,
    "&:hover": {
      textDecorationLine: "underline",
    },
  },
  breadcrumbDivider: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  variantBadge: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorBrandForeground2,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `0.5px solid ${tokens.colorBrandStroke2}`,
    borderRadius: "999px",
    paddingInline: "4px",
    paddingBlock: "0px",
    minHeight: "20px",
    minWidth: "20px",
    width: "auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dateStack: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  dateRow: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  dateLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    lineHeight: "1.1",
  },
  dateValue: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    lineHeight: "1.1",
  },
  viewButton: {
    fontWeight: tokens.fontWeightSemibold,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  deleteButton: {
    minWidth: "auto",
    height: "32px",
    padding: 0,
    borderRadius: "6px",
    border: "none",
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground2,
    "&:hover": {
      color: tokens.colorStatusDangerBorder1,
    },
  },
  metaText: {
    color: tokens.colorNeutralForeground3,
  },
  mergeFields: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: "12px",
  },
});

function SavedListsView() {
  const styles = useStyles();
  const router = useRouter();
  const { t } = useI18n();

  const [lists, setLists] = useState<Wishlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Wishlist | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeNameOption, setMergeNameOption] = useState<string>("");
  const [mergeName, setMergeName] = useState("");
  const [isMerging, setIsMerging] = useState(false);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const loadLists = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/products/wishlists", { signal });
      if (!response.ok) {
        throw new Error(t("products.lists.error"));
      }
      const payload = await response.json();
      setLists(Array.isArray(payload.items) ? payload.items : []);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadLists(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => lists.some((list) => list.id === id))
    );
  }, [lists]);

  const selectedLists = useMemo(
    () => lists.filter((list) => selectedIds.includes(list.id)),
    [lists, selectedIds]
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = lists.length > 0 && selectedIds.length === lists.length;
  const someSelected = selectedIds.length > 0 && !allSelected;
  const mergeNameOptions = useMemo(
    () => Array.from(new Set(selectedLists.map((list) => list.name))),
    [selectedLists]
  );

  useEffect(() => {
    if (!mergeDialogOpen) return;
    if (mergeNameOptions.length === 0) return;
    if (!mergeNameOption) {
      setMergeNameOption(mergeNameOptions[0]);
      setMergeName(mergeNameOptions[0]);
    }
  }, [mergeDialogOpen, mergeNameOptions, mergeNameOption]);

  const handleSelectAll = (checked: boolean | string | undefined) => {
    if (checked === true) {
      setSelectedIds(lists.map((list) => list.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (
    listId: string,
    checked: boolean | string | undefined
  ) => {
    if (checked === true) {
      setSelectedIds((prev) => (prev.includes(listId) ? prev : [...prev, listId]));
    } else {
      setSelectedIds((prev) => prev.filter((id) => id !== listId));
    }
  };

  const openMergeDialog = () => {
    if (selectedIds.length < 2) return;
    setMergeDialogOpen(true);
  };

  const handleMerge = async () => {
    const trimmedName = mergeName.trim();
    if (!trimmedName) {
      setError(t("products.lists.mergeNameRequired"));
      return;
    }
    setIsMerging(true);
    setError(null);
    try {
      const response = await fetch("/api/products/wishlists/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listIds: selectedIds, name: trimmedName }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || t("products.lists.mergeError"));
      }
      await loadLists();
      setSelectedIds([]);
      setMergeDialogOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsMerging(false);
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    setError(null);
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch("/api/products/wishlists", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          })
        )
      );
      const failed = results.find((res) => !res.ok);
      if (failed) {
        const message = await failed.text();
        throw new Error(message || t("products.lists.deleteError"));
      }
      await loadLists();
      setSelectedIds([]);
      setDeleteSelectedOpen(false);
      setDeleteAllOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch("/api/products/wishlists", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || t("products.lists.deleteError"));
      }
      setLists((prev) => prev.filter((list) => list.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <Text weight="semibold">{t("products.lists.title")}</Text>
          <div className={styles.listActions}>
            <Button
              appearance="primary"
              onClick={openMergeDialog}
              disabled={selectedIds.length < 2}
            >
              {t("products.lists.merge")}
            </Button>
            <Button
              appearance="outline"
              onClick={() => setDeleteSelectedOpen(true)}
              disabled={selectedIds.length === 0}
            >
              {t("products.lists.deleteSelected")}
            </Button>
            <Button
              appearance="subtle"
              onClick={() => setDeleteAllOpen(true)}
              disabled={lists.length === 0}
            >
              {t("products.lists.deleteAll")}
            </Button>
          </div>
        </div>
        {error ? <MessageBar intent="error">{error}</MessageBar> : null}
        {isLoading ? (
          <Spinner label={t("products.lists.loading")} />
        ) : lists.length === 0 ? (
          <Text className={styles.metaText}>{t("products.lists.empty")}</Text>
        ) : (
          <Table className={styles.table} size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.headerCell}>
                  {t("products.lists.name")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  {t("products.lists.items")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  {t("products.lists.actions")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.selectCell}>
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "mixed" : false}
                    onChange={(_, data) => handleSelectAll(data.checked)}
                    aria-label={t("products.lists.selectAll")}
                  />
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((list) => (
                <TableRow key={list.id}>
                  <TableCell>
                    <button
                      type="button"
                      className={styles.listNameButton}
                      onClick={() => router.push(`/app/saved?listId=${list.id}`)}
                    >
                      {list.name}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge appearance="outline" color="brand" size="small">
                      {list.item_count ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={styles.actions}>
                      <Button
                        appearance="outline"
                        className={styles.viewButton}
                        onClick={() => router.push(`/app/saved?listId=${list.id}`)}
                      >
                        {t("products.lists.view")}
                      </Button>
                      <Button
                        appearance="subtle"
                        className={styles.deleteButton}
                        icon={<TrashIcon />}
                        aria-label={t("products.lists.delete")}
                        onClick={() => setDeleteTarget(list)}
                      />
                    </div>
                  </TableCell>
                  <TableCell className={styles.selectCell}>
                    <Checkbox
                      checked={selectedSet.has(list.id)}
                      onChange={(_, data) => handleSelectOne(list.id, data.checked)}
                      aria-label={t("products.lists.selectRow", { name: list.name })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(_, data) => {
          if (!data.open) setDeleteTarget(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("products.lists.delete")}</DialogTitle>
            <Text>{t("products.lists.deleteConfirm")}</Text>
            <DialogActions>
              <Button appearance="subtle" onClick={() => setDeleteTarget(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {t("products.lists.delete")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={mergeDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) setMergeDialogOpen(false);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("products.lists.mergeTitle")}</DialogTitle>
            <Text>
              {t("products.lists.mergeConfirm", { count: selectedIds.length })}
            </Text>
            <div className={styles.mergeFields}>
              <Field label={t("products.lists.mergeNamePickLabel")}>
                <Dropdown
                  value={
                    mergeNameOption === "__custom__"
                      ? t("products.lists.mergeCustomName")
                      : mergeNameOption || mergeNameOptions[0] || ""
                  }
                  selectedOptions={
                    mergeNameOption
                      ? [mergeNameOption]
                      : mergeNameOptions[0]
                        ? [mergeNameOptions[0]]
                        : []
                  }
                  onOptionSelect={(_, data) => {
                    const value = String(data.optionValue);
                    setMergeNameOption(value);
                    if (value !== "__custom__") {
                      setMergeName(value);
                    }
                  }}
                >
                  {mergeNameOptions.map((name) => (
                    <Option key={name} value={name}>
                      {name}
                    </Option>
                  ))}
                  <Option value="__custom__">
                    {t("products.lists.mergeCustomName")}
                  </Option>
                </Dropdown>
              </Field>
              <Field label={t("products.lists.mergeNameLabel")}>
                <Input
                  value={mergeName}
                  onChange={(_, data) => setMergeName(data.value)}
                  placeholder={t("products.lists.mergeNamePlaceholder")}
                />
              </Field>
            </div>
            <DialogActions>
              <Button appearance="subtle" onClick={() => setMergeDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleMerge}
                disabled={isMerging}
              >
                {isMerging ? t("common.loading") : t("products.lists.merge")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={deleteSelectedOpen}
        onOpenChange={(_, data) => {
          if (!data.open) setDeleteSelectedOpen(false);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("products.lists.deleteSelected")}</DialogTitle>
            <Text>
              {t("products.lists.deleteSelectedConfirm", {
                count: selectedIds.length,
              })}
            </Text>
            <DialogActions>
              <Button appearance="subtle" onClick={() => setDeleteSelectedOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={() => handleBulkDelete(selectedIds)}
                disabled={isBulkDeleting}
              >
                {isBulkDeleting ? t("common.loading") : t("products.lists.delete")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={deleteAllOpen}
        onOpenChange={(_, data) => {
          if (!data.open) setDeleteAllOpen(false);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("products.lists.deleteAll")}</DialogTitle>
            <Text>{t("products.lists.deleteAllConfirm")}</Text>
            <DialogActions>
              <Button appearance="subtle" onClick={() => setDeleteAllOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={() => handleBulkDelete(lists.map((list) => list.id))}
                disabled={isBulkDeleting}
              >
                {isBulkDeleting ? t("common.loading") : t("products.lists.delete")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

function SavedListDetailView({ listId }: { listId: string }) {
  const styles = useStyles();
  const router = useRouter();
  const { t } = useI18n();
  const supabase = useMemo(() => createClient(), []);

  const [list, setList] = useState<Wishlist | null>(null);
  const [listMissing, setListMissing] = useState(false);
  const [items, setItems] = useState<ListProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportName, setExportName] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [listId]);

  const buildDefaultExportName = (email?: string | null) => {
    const prefix = email?.split("@")[0] ?? "export";
    const date = new Date().toISOString().slice(0, 10);
    return `${prefix} products ${date}`;
  };

  const openExportDialog = async () => {
    if (!exportName.trim()) {
      const { data } = await supabase.auth.getUser();
      setExportName(buildDefaultExportName(data.user?.email));
    }
    setExportDialogOpen(true);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const response = await fetch("/api/exports/digideal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: exportName.trim(),
          listId,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || t("products.lists.exportError"));
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
      const filename = match?.[1] ?? "export.xlsx";

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setExportDialogOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const loadList = async () => {
      setListMissing(false);
      try {
        const response = await fetch("/api/products/wishlists", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(t("products.lists.error"));
        }
        const payload = await response.json();
        const lists = Array.isArray(payload.items) ? payload.items : [];
        const found = lists.find((entry: Wishlist) => entry.id === listId) ?? null;
        setList(found);
        setListMissing(!found);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      }
    };

    loadList();
    return () => controller.abort();
  }, [listId, t]);

  useEffect(() => {
    if (listMissing) return;
    const controller = new AbortController();
    const loadItems = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("wishlistId", listId);
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));

        const response = await fetch(`/api/products?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(t("products.error.load"));
        }
        const payload = await response.json();
        setItems(Array.isArray(payload.items) ? payload.items : []);
        setTotal(payload.total ?? 0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadItems();
    return () => controller.abort();
  }, [listId, page, pageSize, t, listMissing]);

  const handleRemove = async (productId: string) => {
    setError(null);
    try {
      const response = await fetch("/api/products/wishlists/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wishlistId: listId, product_id: productId }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || t("products.lists.deleteError"));
      }
      setItems((prev) => prev.filter((item) => item.id !== productId));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const rows = useMemo(
    () =>
      items.map((item) => {
        const title = item.title ?? item.spu ?? t("common.notAvailable");
        const taxonomy = [
          item.google_taxonomy_l1,
          item.google_taxonomy_l2,
          item.google_taxonomy_l3,
        ].filter(Boolean) as string[];
        const preview = item.small_image_url ?? item.thumbnail_url ?? null;

        return (
          <TableRow key={item.id}>
            <TableCell className={styles.imageCol}>
              {item.thumbnail_url ? (
                <span className={styles.thumbnailWrap}>
                  <Image
                    src={item.thumbnail_url}
                    alt={title}
                    className={styles.thumbnail}
                    loading="lazy"
                  />
                  {preview ? (
                    <span className={styles.previewLayer} aria-hidden="true">
                      <span className={styles.previewBox}>
                        <Image
                          src={preview}
                          alt={title}
                          className={styles.previewImage}
                          loading="lazy"
                        />
                      </span>
                    </span>
                  ) : null}
                </span>
              ) : (
                <div className={styles.thumbnail} />
              )}
            </TableCell>
            <TableCell className={styles.productCol}>
              <button
                type="button"
                className={styles.listNameButton}
                onClick={() => router.push(`/app/products/${item.id}`)}
              >
                <span className={styles.productTitleLink}>{title}</span>
              </button>
              {taxonomy.length > 0 ? (
                <div className={styles.breadcrumbRow}>
                  {taxonomy.map((value, index) => (
                    <span key={`${item.id}-tax-${value}`}>
                      <span className={styles.breadcrumbLink}>{value}</span>
                      {index < taxonomy.length - 1 ? (
                        <span className={styles.breadcrumbDivider}> / </span>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : (
                <Text size={200} className={styles.metaText}>
                  {t("products.uncategorized")}
                </Text>
              )}
            </TableCell>
            <TableCell>{item.spu ?? t("common.notAvailable")}</TableCell>
            <TableCell>
              <div className={styles.dateStack}>
                <div className={styles.dateRow}>
                  <Text className={styles.dateLabel}>
                    {t("products.table.createdLabel")}
                  </Text>
                  <Text className={styles.dateValue}>
                    {formatShortDate(item.created_at)}
                  </Text>
                </div>
                <div className={styles.dateRow}>
                  <Text className={styles.dateLabel}>
                    {t("products.table.updated")}
                  </Text>
                  <Text className={styles.dateValue}>
                    {formatShortDate(item.updated_at)}
                  </Text>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge appearance="outline" color="brand" size="small" className={styles.variantBadge}>
                {item.variant_count ?? 0}
              </Badge>
            </TableCell>
            <TableCell>
              <div className={styles.actions}>
                <Button
                  appearance="outline"
                  className={styles.viewButton}
                  onClick={() => router.push(`/app/products/${item.id}`)}
                >
                  {t("common.view")}
                </Button>
                <Button
                  appearance="subtle"
                  className={styles.deleteButton}
                  icon={<TrashIcon />}
                  aria-label={t("products.lists.delete")}
                  onClick={() => handleRemove(item.id)}
                />
              </div>
            </TableCell>
          </TableRow>
        );
      }),
    [items, router, styles, t]
  );

  return (
    <div>
      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div className={styles.detailHeader}>
            <Button
              appearance="subtle"
              className={styles.backButton}
              onClick={() => router.push("/app/saved")}
            >
              {t("products.lists.back")}
            </Button>
            <Text weight="semibold">
              {list?.name ?? t("products.lists.title")}
            </Text>
            <Text size={200} className={styles.metaText}>
              {t("products.lists.items")}: {total}
            </Text>
          </div>
          <div className={styles.detailActions}>
            <Button
              appearance="primary"
              className={styles.exportButton}
              onClick={openExportDialog}
              disabled={listMissing || items.length === 0 || isLoading}
            >
              {t("products.lists.export")}
            </Button>
          </div>
        </div>

        {error ? <MessageBar intent="error">{error}</MessageBar> : null}
        {listMissing ? (
          <Text className={styles.metaText}>{t("products.lists.notFound")}</Text>
        ) : isLoading ? (
          <Spinner label={t("products.loading")} />
        ) : items.length === 0 ? (
          <Text className={styles.metaText}>{t("products.empty")}</Text>
        ) : (
          <Table className={styles.table} size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.imageCol} />
                <TableHeaderCell className={styles.headerCell}>
                  {t("products.table.product")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  {t("products.table.spu")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  {t("products.table.createdUpdated")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  {t("products.table.variants")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  {t("products.lists.actions")}
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>{rows}</TableBody>
          </Table>
        )}

        <div className={styles.pagination}>
          <Text size={200} className={styles.metaText}>
            {t("products.pagination.pageOf", { page, pageCount })}
          </Text>
          <div>
            <Button
              appearance="subtle"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
            >
              {t("common.previous")}
            </Button>
            <Button
              appearance="subtle"
              onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
              disabled={page === pageCount}
            >
              {t("common.next")}
            </Button>
          </div>
        </div>
      </Card>

      <Dialog
        open={exportDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) setExportDialogOpen(false);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("products.lists.exportTitle")}</DialogTitle>
            <Field
              label={t("products.lists.exportNameLabel")}
              className={styles.exportField}
            >
              <Input
                value={exportName}
                onChange={(_, data) => setExportName(data.value)}
                placeholder={t("products.lists.exportNamePlaceholder")}
              />
            </Field>
            <DialogActions>
              <Button appearance="subtle" onClick={() => setExportDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleExport}
                disabled={!exportName.trim() || isExporting}
              >
                {isExporting
                  ? t("products.lists.exporting")
                  : t("products.lists.export")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

function SavedPageInner() {
  const params = useSearchParams();
  const listId = params.get("listId") ?? params.get("wishlistId");

  if (listId) {
    return <SavedListDetailView listId={listId} />;
  }
  return <SavedListsView />;
}

export default function SavedPage() {
  return (
    <Suspense fallback={null}>
      <SavedPageInner />
    </Suspense>
  );
}
