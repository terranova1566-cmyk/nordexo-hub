"use client";

import {
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
  Input,
  Option,
  Spinner,
  Switch,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  mergeClasses,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatDate, formatDateTime } from "@/lib/format";

type DraftEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  modifiedAt: string;
};

type DraftFolder = {
  name: string;
  path: string;
  modifiedAt: string;
};

type DraftSpuRow = {
  id: string;
  draft_spu: string;
  draft_title: string | null;
  draft_subtitle: string | null;
  draft_status: string | null;
  draft_source: string | null;
  draft_supplier_1688_url: string | null;
  draft_updated_at: string | null;
  draft_created_at: string | null;
  draft_description_html: string | null;
  draft_product_description_main_html: string | null;
  draft_mf_product_short_title: string | null;
  draft_mf_product_long_title: string | null;
  draft_mf_product_subtitle: string | null;
  draft_mf_product_bullets_short: string | null;
  draft_mf_product_bullets: string | null;
  draft_mf_product_bullets_long: string | null;
  draft_mf_product_specs: string | null;
  draft_image_folder: string | null;
  draft_main_image_url: string | null;
  draft_image_urls: string[] | null;
  draft_variant_image_urls: string[] | null;
  draft_raw_row: Record<string, unknown> | null;
  image_count: number;
  variant_image_count: number;
  video_count: number;
  variant_count: number;
};

type DraftSkuRow = {
  id: string;
  draft_sku: string | null;
  draft_spu: string | null;
  draft_option_combined_zh: string | null;
  draft_price: number | string | null;
  draft_weight: number | string | null;
  draft_weight_unit: string | null;
  draft_variant_image_url: string | null;
  draft_status: string | null;
  draft_updated_at: string | null;
  draft_raw_row: Record<string, unknown> | null;
};

type EditingCell = {
  table: "spu" | "sku";
  id: string;
  field: string;
};

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  uploadCard: {
    padding: "18px",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  uploadRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "flex-end",
  },
  fileInput: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "8px",
    padding: "6px 8px",
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: "240px",
  },
  logCard: {
    padding: "16px",
    borderRadius: "16px",
  },
  explorerHeader: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
    justifyContent: "space-between",
  },
  draftHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  draftSearch: {
    width: "560px",
    maxWidth: "100%",
  },
  explorerControls: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
  },
  explorerControlsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "center",
    justifyContent: "space-between",
  },
  explorerControlsRight: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
    justifyContent: "flex-end",
    marginLeft: "auto",
  },
  viewToggle: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
  },
  explorerTable: {
    marginTop: "8px",
    tableLayout: "fixed",
    width: "100%",
  },
  explorerColName: {
    width: "50%",
  },
  explorerColSize: {
    width: "10%",
  },
  explorerColModified: {
    width: "20%",
  },
  explorerColActions: {
    width: "20%",
  },
  explorerRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  explorerIcon: {
    width: "16px",
    height: "16px",
    color: tokens.colorNeutralForeground3,
  },
  explorerName: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    background: "transparent",
    border: "none",
    padding: 0,
    textAlign: "left",
    cursor: "text",
  },
  explorerMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  explorerPreview: {
    marginTop: "12px",
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "10px",
  },
  previewImage: {
    width: "100%",
    maxHeight: "360px",
    objectFit: "contain",
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  dropZone: {
    marginTop: "10px",
    padding: "12px",
    borderRadius: "10px",
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
  dropZoneActive: {
    border: `1px dashed ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorBrandForeground1,
  },
  previewDialog: {
    width: "min(720px, 92vw)",
    padding: "16px",
  },
  previewDialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  previewImageLarge: {
    width: "100%",
    maxHeight: "70vh",
    objectFit: "contain",
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  thumbGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "12px",
    marginTop: "12px",
  },
  thumbCard: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  thumbImageWrap: {
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "140px",
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  thumbIcon: {
    width: "36px",
    height: "36px",
    color: tokens.colorNeutralForeground3,
  },
  thumbName: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    wordBreak: "break-word",
    display: "block",
    background: "transparent",
    border: "none",
    padding: 0,
    textAlign: "left",
    cursor: "text",
  },
  thumbMeta: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    display: "block",
    marginTop: "4px",
  },
  thumbActions: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  tableCard: {
    padding: "16px",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  tableWrapper: {
    maxHeight: "420px",
    overflow: "auto",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  stickyHeader: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  tableRow: {
    backgroundColor: tokens.colorNeutralBackground1,
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  tableRowAlt: {
    backgroundColor: tokens.colorNeutralBackground2,
  },
  folderRow: {
    cursor: "pointer",
  },
  tableCell: {
    verticalAlign: "top",
  },
  selectionCol: {
    width: "44px",
    maxWidth: "44px",
    paddingLeft: "6px",
    paddingRight: "6px",
  },
  numericCell: {
    textAlign: "right",
  },
  clampTwo: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  clampOne: {
    display: "-webkit-box",
    WebkitLineClamp: 1,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  resizableHeader: {
    resize: "horizontal",
    overflow: "hidden",
  },
  detailsRow: {
    backgroundColor: tokens.colorNeutralBackground1,
  },
  detailsBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
    padding: "8px 0",
  },
  link: {
    color: tokens.colorBrandForeground1,
    textDecoration: "none",
  },
});

const stripHtml = (value: string | null | undefined) => {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
};

const getRawValue = (raw: Record<string, unknown> | null | undefined, key: string) => {
  if (!raw || typeof raw !== "object") return "";
  const value = (raw as Record<string, unknown>)[key];
  return value == null ? "" : String(value);
};

export default function DraftExplorerPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [folders, setFolders] = useState<DraftFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [currentPath, setCurrentPath] = useState<string>("");
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [explorerView, setExplorerView] = useState<"list" | "grid">("list");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamePending, setRenamePending] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [excelStatus, setExcelStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [zipStatus, setZipStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [draftTab, setDraftTab] = useState<"spu" | "sku">("spu");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [spuRows, setSpuRows] = useState<DraftSpuRow[]>([]);
  const [skuRows, setSkuRows] = useState<DraftSkuRow[]>([]);
  const [expandedSpus, setExpandedSpus] = useState<Set<string>>(new Set());
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSpus, setSelectedSpus] = useState<Set<string>>(new Set());
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [skuStatus, setSkuStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [skuMessage, setSkuMessage] = useState<string | null>(null);
  const [skuMissingCount, setSkuMissingCount] = useState<number | null>(null);
  const [skuTotalCount, setSkuTotalCount] = useState<number | null>(null);

  const imageExtensions = useMemo(
    () => [".png", ".jpg", ".jpeg", ".webp", ".gif"],
    []
  );
  const isImage = useCallback(
    (name: string) =>
      imageExtensions.some((ext) => name.toLowerCase().endsWith(ext)),
    [imageExtensions]
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const fetchSpuRows = useCallback(async () => {
    setDraftLoading(true);
    setDraftError(null);
    try {
      const url = new URL("/api/drafts/products", window.location.origin);
      if (searchQuery) url.searchParams.set("q", searchQuery);
      const response = await fetch(url.toString());
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to load drafts.");
      }
      const payload = await response.json();
      setSpuRows(payload.items ?? []);
    } catch (err) {
      setDraftError((err as Error).message);
      setSpuRows([]);
    } finally {
      setDraftLoading(false);
    }
  }, [searchQuery]);

  const fetchSkuRows = useCallback(async () => {
    setDraftLoading(true);
    setDraftError(null);
    try {
      const url = new URL("/api/drafts/variants", window.location.origin);
      if (searchQuery) url.searchParams.set("q", searchQuery);
      const response = await fetch(url.toString());
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to load drafts.");
      }
      const payload = await response.json();
      setSkuRows(payload.items ?? []);
    } catch (err) {
      setDraftError((err as Error).message);
      setSkuRows([]);
    } finally {
      setDraftLoading(false);
    }
  }, [searchQuery]);

  const fetchSkuStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/drafts/sku/status");
      if (!response.ok) {
        const text = await response.text();
        let message = text;
        if (text) {
          try {
            const parsed = JSON.parse(text) as { error?: string };
            if (parsed?.error) message = parsed.error;
          } catch {
            // Keep raw text as message.
          }
        }
        if (!message) {
          message = `Unable to read SKU status (HTTP ${response.status}).`;
        }
        throw new Error(message);
      }
      const payload = await response.json();
      const nextStatus = payload.status ?? "idle";
      const nextMissing =
        typeof payload.missingCount === "number" ? payload.missingCount : null;
      const nextTotal =
        typeof payload.totalCount === "number" ? payload.totalCount : null;
      let nextMessage = payload.message ?? null;
      if (nextStatus === "done" && (!nextTotal || nextTotal === 0)) {
        nextMessage = null;
      }
      setSkuStatus(nextStatus);
      setSkuMessage(nextMessage);
      setSkuMissingCount(nextMissing);
      setSkuTotalCount(nextTotal);
      return payload;
    } catch (err) {
      setSkuStatus("error");
      setSkuMessage((err as Error).message);
      throw err;
    }
  }, []);

  const runSkuPipelineForSpus = useCallback(
    async (spus: string[]) => {
      const response = await fetch("/api/drafts/sku/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spus: spus.length ? spus : undefined,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "SKU generation failed.");
      }
      let payload = await fetchSkuStatus();
      let attempts = 0;
      while (payload?.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        payload = await fetchSkuStatus();
        attempts += 1;
        if (attempts > 360) {
          throw new Error("SKU generation timed out.");
        }
      }
      if (payload?.status === "error") {
        throw new Error(payload?.message || "SKU generation failed.");
      }
    },
    [fetchSkuStatus]
  );

  useEffect(() => {
    if (draftTab === "spu") {
      fetchSpuRows();
    } else {
      fetchSkuRows();
    }
  }, [draftTab, fetchSpuRows, fetchSkuRows]);

  useEffect(() => {
    fetchSkuStatus();
  }, [fetchSkuStatus]);

  useEffect(() => {
    if (skuStatus !== "running") return;
    const handle = setInterval(() => {
      fetchSkuStatus();
    }, 5000);
    return () => clearInterval(handle);
  }, [skuStatus, fetchSkuStatus]);

  useEffect(() => {
    if (skuStatus === "done") {
      if (draftTab === "sku") {
        fetchSkuRows();
      } else {
        fetchSpuRows();
      }
    }
  }, [skuStatus, draftTab, fetchSkuRows, fetchSpuRows]);

  useEffect(() => {
    if (skuStatus !== "done" || !skuMessage) return;
    const handle = setTimeout(() => {
      setSkuMessage(null);
    }, 6000);
    return () => clearTimeout(handle);
  }, [skuStatus, skuMessage]);

  const allSpuSelected = useMemo(
    () => spuRows.length > 0 && spuRows.every((row) => selectedSpus.has(row.id)),
    [spuRows, selectedSpus]
  );

  const someSpuSelected = useMemo(
    () => spuRows.some((row) => selectedSpus.has(row.id)),
    [spuRows, selectedSpus]
  );

  const toggleSelectAllSpus = () => {
    if (allSpuSelected) {
      setSelectedSpus(new Set());
      return;
    }
    setSelectedSpus(new Set(spuRows.map((row) => row.id)));
  };

  const toggleSelectSpu = (id: string) => {
    setSelectedSpus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const skuReady =
    skuMissingCount !== null &&
    skuMissingCount === 0 &&
    (skuTotalCount ?? 0) > 0;

  const handlePublishDrafts = async () => {
    if (draftTab !== "spu") return;
    setPublishMessage(null);
    if (skuStatus === "running") {
      setPublishStatus("error");
      setPublishMessage(t("draftExplorer.publishBlockedSkuRunning"));
      return;
    }
    if (!skuReady) {
      setPublishStatus("error");
      setPublishMessage(t("draftExplorer.publishBlockedSkusMissing"));
      return;
    }
    setPublishStatus("running");
    const selectedRows = spuRows.filter((row) => selectedSpus.has(row.id));
    const selectedSpuValues = selectedRows
      .map((row) => row.draft_spu)
      .filter(Boolean);
    if (selectedSpuValues.length === 0) {
      const confirmAll = window.confirm(
        t("draftExplorer.publishConfirmAll")
      );
      if (!confirmAll) {
        setPublishStatus("idle");
        return;
      }
    } else {
      const confirmSelected = window.confirm(
        t("draftExplorer.publishConfirmSelected", {
          count: selectedSpuValues.length,
        })
      );
      if (!confirmSelected) {
        setPublishStatus("idle");
        return;
      }
    }
    try {
      const response = await fetch("/api/drafts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spus: selectedSpuValues.length ? selectedSpuValues : undefined,
          publishAll: selectedSpuValues.length === 0,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Publish failed.");
      }
      const payload = await response.json();
      const count = Array.isArray(payload?.spus) ? payload.spus.length : 0;
      setPublishMessage(t("draftExplorer.publishSuccess", { count }));
      setPublishStatus("done");
      setSelectedSpus(new Set());
      fetchSpuRows();
    } catch (err) {
      setPublishStatus("error");
      setPublishMessage((err as Error).message);
    }
  };

  const handleGenerateSkus = async () => {
    setSkuMessage(null);
    setSkuStatus("running");
    const selectedRows = spuRows.filter((row) => selectedSpus.has(row.id));
    const selectedSpuValues = selectedRows
      .map((row) => row.draft_spu)
      .filter(Boolean);
    const isRegenerate = skuReady;
    if (selectedSpuValues.length === 0) {
      const confirmAll = window.confirm(
        isRegenerate
          ? t("draftExplorer.regenerateSkuConfirmAll")
          : t("draftExplorer.generateSkuConfirmAll")
      );
      if (!confirmAll) {
        setSkuStatus("idle");
        return;
      }
    } else {
      const confirmSelected = window.confirm(
        isRegenerate
          ? t("draftExplorer.regenerateSkuConfirmSelected", {
              count: selectedSpuValues.length,
            })
          : t("draftExplorer.generateSkuConfirmSelected", {
              count: selectedSpuValues.length,
            })
      );
      if (!confirmSelected) {
        setSkuStatus("idle");
        return;
      }
    }
    try {
      const response = await fetch("/api/drafts/sku/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spus: selectedSpuValues.length ? selectedSpuValues : undefined,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "SKU generation failed.");
      }
      await fetchSkuStatus();
    } catch (err) {
      setSkuStatus("error");
      setSkuMessage((err as Error).message);
    }
  };

  const handleRerunSkuImages = async () => {
    setSkuMessage(null);
    setSkuStatus("running");
    const selectedRows = spuRows.filter((row) => selectedSpus.has(row.id));
    const selectedSpuValues = selectedRows
      .map((row) => row.draft_spu)
      .filter(Boolean);
    if (selectedSpuValues.length === 0) {
      const confirmAll = window.confirm(
        t("draftExplorer.rerunSkuConfirmAll")
      );
      if (!confirmAll) {
        setSkuStatus("idle");
        return;
      }
    } else {
      const confirmSelected = window.confirm(
        t("draftExplorer.rerunSkuConfirmSelected", {
          count: selectedSpuValues.length,
        })
      );
      if (!confirmSelected) {
        setSkuStatus("idle");
        return;
      }
    }
    try {
      await runSkuPipelineForSpus(selectedSpuValues);
    } catch (err) {
      setSkuStatus("error");
      setSkuMessage((err as Error).message);
    }
  };

  const handleImport = async (type: "excel" | "zip") => {
    setError(null);
    const file = type === "excel" ? excelFile : zipFile;
    if (!file) return;
    type === "excel" ? setExcelStatus("uploading") : setZipStatus("uploading");
    try {
      const formData = new FormData();
      if (type === "excel") {
        formData.append("workbook", file);
      } else {
        formData.append("images_zip", file);
      }
      const response = await fetch("/api/drafts/import", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Import failed.");
      }
      const payload = await response.json();
      const errors = Array.isArray(payload?.errors)
        ? payload.errors.filter((entry: unknown) => Boolean(entry))
        : [];
      if (errors.length > 0) {
        setError(`Import completed with errors: ${errors.join(" | ")}`);
        type === "excel" ? setExcelStatus("error") : setZipStatus("error");
      } else {
        type === "excel" ? setExcelStatus("done") : setZipStatus("done");
      }
      if (draftTab === "spu") {
        fetchSpuRows();
      } else {
        fetchSkuRows();
      }
    } catch (err) {
      type === "excel" ? setExcelStatus("error") : setZipStatus("error");
      setError((err as Error).message);
    }
  };

  const fetchFolders = useCallback(async () => {
    try {
      const response = await fetch("/api/drafts/folders");
      if (!response.ok) return;
      const payload = await response.json();
      const items = (payload.items ?? []) as DraftFolder[];
      setFolders(items);
      if (items.length > 0 && !selectedFolder) {
        setSelectedFolder(items[0].path);
        setCurrentPath(items[0].path);
      }
    } catch {
      return;
    }
  }, [selectedFolder]);

  const fetchEntries = useCallback(async (pathValue: string) => {
    if (!pathValue) {
      setEntries([]);
      return;
    }
    setEntriesLoading(true);
    try {
      const [run, ...rest] = pathValue.split("/");
      const subPath = rest.join("/");
      const url = new URL(
        `/api/drafts/folders/${encodeURIComponent(run)}/list`,
        window.location.origin
      );
      if (subPath) url.searchParams.set("path", subPath);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error();
      const payload = await response.json();
      setEntries(payload.items ?? []);
      setSelectedFiles(new Set());
      setPreviewPath(null);
    } catch {
      setEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  const handleExplorerRefresh = useCallback(() => {
    fetchFolders();
    if (currentPath) {
      fetchEntries(currentPath);
    }
  }, [fetchFolders, currentPath, fetchEntries]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  useEffect(() => {
    if (!selectedFolder) return;
    setCurrentPath(selectedFolder);
  }, [selectedFolder]);

  useEffect(() => {
    if (!currentPath) return;
    fetchEntries(currentPath);
  }, [currentPath, fetchEntries]);

  const handleToggleFile = (pathValue: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(pathValue)) {
        next.delete(pathValue);
      } else {
        next.add(pathValue);
      }
      return next;
    });
  };

  const startRename = (entry: DraftEntry) => {
    if (entry.type !== "file") return;
    setRenamingPath(entry.path);
    setRenameValue(entry.name);
  };

  const cancelRename = () => {
    setRenamingPath(null);
    setRenameValue("");
  };

  const commitRename = async (entry: DraftEntry) => {
    if (renamePending) return;
    const nextName = renameValue.trim();
    if (!nextName || nextName === entry.name) {
      cancelRename();
      return;
    }
    setRenamePending(true);
    setError(null);
    try {
      const response = await fetch("/api/drafts/images/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: entry.path, name: nextName }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Rename failed.");
      }
      const payload = await response.json();
      const newPath = String(payload.path || entry.path);
      setSelectedFiles((prev) => {
        if (!prev.has(entry.path)) return prev;
        const next = new Set(prev);
        next.delete(entry.path);
        next.add(newPath);
        return next;
      });
      if (currentPath) {
        await fetchEntries(currentPath);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRenamePending(false);
      cancelRename();
    }
  };

  const formatFileSize = (bytes: number | null | undefined) => {
    if (bytes == null) return "-";
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    const rounded =
      value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
    return `${rounded} ${units[unitIndex]}`;
  };

  const handleDownloadZip = async (paths: string[]) => {
    if (paths.length === 0) return;
    try {
      const response = await fetch("/api/drafts/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Zip failed.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `drafts-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const visibleFiles = entries.filter((entry) => entry.type === "file");

  const handleDeleteSelected = async () => {
    if (selectedFiles.size === 0) return;
    const confirmed = window.confirm(t("bulkProcessing.explorer.deleteConfirm"));
    if (!confirmed) return;
    try {
      const response = await fetch("/api/drafts/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [...selectedFiles] }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Delete failed.");
      }
      setSelectedFiles(new Set());
      fetchEntries(currentPath);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!currentPath || files.length === 0) return;
    try {
      const formData = new FormData();
      formData.append("targetPath", currentPath);
      files.forEach((file) => formData.append("files", file));
      const response = await fetch("/api/drafts/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Upload failed.");
      }
      fetchEntries(currentPath);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleExpanded = (table: "spu" | "sku", id: string) => {
    if (table === "spu") {
      setExpandedSpus((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    } else {
      setExpandedSkus((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    }
  };

  const startEdit = (table: "spu" | "sku", id: string, field: string, value: string | number | null) => {
    setEditingCell({ table, id, field });
    setEditingValue(value == null ? "" : String(value));
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditingValue("");
  };

  const commitEdit = async () => {
    if (!editingCell) return;
    setIsSaving(true);
    setDraftError(null);
    const endpoint =
      editingCell.table === "spu"
        ? "/api/drafts/products/update"
        : "/api/drafts/variants/update";
    const field = editingCell.field;
    const rawValue = editingValue.trim();
    const payloadValue = rawValue === "" ? null : rawValue;
    const isRawField = field.startsWith("raw_");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingCell.id,
          field,
          value:
            editingCell.table === "sku" &&
            (field === "draft_price" || field === "draft_weight")
              ? payloadValue === null
                ? null
                : Number(payloadValue)
              : payloadValue,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Update failed.");
      }
      if (editingCell.table === "spu") {
        setSpuRows((prev) =>
          prev.map((row) =>
            row.id === editingCell.id ? { ...row, [field]: payloadValue } : row
          )
        );
      } else {
        setSkuRows((prev) =>
          prev.map((row) =>
            row.id === editingCell.id
              ? isRawField
                ? {
                    ...row,
                    draft_raw_row: {
                      ...(row.draft_raw_row ?? {}),
                      [field.replace(/^raw_/, "")]: payloadValue ?? "",
                    },
                  }
                : { ...row, [field]: payloadValue }
              : row
          )
        );
      }
      cancelEdit();
    } catch (err) {
      setDraftError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderEditableCell = (
    table: "spu" | "sku",
    rowId: string,
    field: string,
    value: string | number | null,
    options?: { numeric?: boolean; clamp?: boolean }
  ) => {
    const isEditing =
      editingCell?.table === table &&
      editingCell?.id === rowId &&
      editingCell?.field === field;
    const display = value == null ? "" : String(value);

    if (isEditing) {
      return (
        <Input
          value={editingValue}
          onChange={(_, data) => setEditingValue(data.value)}
          onBlur={() => commitEdit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitEdit();
            }
            if (event.key === "Escape") {
              cancelEdit();
            }
          }}
          type={options?.numeric ? "number" : "text"}
          size="small"
          autoFocus
        />
      );
    }

    return (
      <Text
        size={200}
        className={mergeClasses(options?.clamp ? styles.clampTwo : undefined)}
        title={display}
        onClick={() => startEdit(table, rowId, field, value)}
        style={{ cursor: "text" }}
      >
        {display || "-"}
      </Text>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text size={700} weight="semibold">
          {t("draftExplorer.title")}
        </Text>
      </div>

      <Card className={styles.tableCard}>
        <div className={styles.draftHeader}>
          <Text size={500} weight="semibold">
            {t("draftExplorer.tableTitle")}
          </Text>
        </div>
        <div className={styles.explorerControlsRow}>
          <Input
            aria-label={t("draftExplorer.searchLabel")}
            value={searchInput}
            onChange={(_, data) => setSearchInput(data.value)}
            placeholder={t("draftExplorer.searchPlaceholder")}
            className={styles.draftSearch}
          />
          <div className={styles.explorerControlsRight}>
            <Button
              appearance={skuReady ? "outline" : "primary"}
              onClick={handleGenerateSkus}
              disabled={skuStatus === "running"}
            >
              {skuStatus === "running" ? (
                <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                  <Spinner size="tiny" />
                  {skuReady
                    ? t("draftExplorer.regenerateSkuRunning")
                    : t("draftExplorer.generateSkuRunning")}
                </span>
              ) : (
                skuReady
                  ? t("draftExplorer.regenerateSkuButton")
                  : t("draftExplorer.generateSkuButton")
              )}
            </Button>
            <Button
              appearance="primary"
              onClick={handlePublishDrafts}
              disabled={
                draftTab !== "spu" ||
                publishStatus === "running" ||
                !skuReady ||
                skuStatus === "running"
              }
            >
              {t("draftExplorer.publishButton")}
            </Button>
          </div>
        </div>

        <TabList
          selectedValue={draftTab}
          onTabSelect={(_, data) => setDraftTab(data.value as "spu" | "sku")}
        >
          <Tab value="spu">{t("draftExplorer.spuTab")}</Tab>
          <Tab value="sku">{t("draftExplorer.skuTab")}</Tab>
        </TabList>

        {draftError ? (
          <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
            {draftError}
          </Text>
        ) : null}
        {publishMessage ? (
          <Text
            size={200}
            style={{
              color:
                publishStatus === "error"
                  ? tokens.colorStatusDangerForeground1
                  : tokens.colorStatusSuccessForeground1,
            }}
          >
            {publishMessage}
          </Text>
        ) : null}
        {skuMessage ? (
          <Text
            size={200}
            style={{
              color:
                skuStatus === "error"
                  ? tokens.colorStatusDangerForeground1
                  : tokens.colorStatusSuccessForeground1,
            }}
          >
            {skuMessage}
          </Text>
        ) : null}
        {isSaving ? (
          <Text size={200}>{t("draftExplorer.saving")}</Text>
        ) : null}

        <div className={styles.tableWrapper}>
          {draftLoading ? (
            <div style={{ padding: "12px" }}>
              <Spinner size="tiny" />
            </div>
          ) : draftTab === "spu" ? (
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.resizableHeader,
                      styles.selectionCol
                    )}
                  >
                    <Checkbox
                      checked={allSpuSelected ? true : someSpuSelected ? "mixed" : false}
                      onChange={toggleSelectAllSpus}
                      aria-label={t("common.selectAll")}
                    />
                  </TableHeaderCell>
                  {[
                    t("draftExplorer.columns.spu"),
                    t("draftExplorer.columns.title"),
                    t("draftExplorer.columns.subtitle"),
                    t("draftExplorer.columns.status"),
                    t("draftExplorer.columns.source"),
                    t("draftExplorer.columns.supplierUrl"),
                    t("draftExplorer.columns.images"),
                    t("draftExplorer.columns.variantImages"),
                    t("draftExplorer.columns.videos"),
                    t("draftExplorer.columns.variants"),
                    t("draftExplorer.columns.updated"),
                    t("draftExplorer.columns.created"),
                    t("draftExplorer.columns.details"),
                  ].map((label) => (
                    <TableHeaderCell
                      key={label}
                      className={mergeClasses(
                        styles.stickyHeader,
                        styles.resizableHeader
                      )}
                    >
                      {label}
                    </TableHeaderCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {spuRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14}>
                      {t("draftExplorer.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  spuRows.map((row, index) => {
                    const isExpanded = expandedSpus.has(row.id);
                    const altClass = index % 2 === 1 ? styles.tableRowAlt : undefined;
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          key={row.id}
                          className={mergeClasses(styles.tableRow, altClass)}
                        >
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.selectionCol
                            )}
                          >
                            <Checkbox
                              checked={selectedSpus.has(row.id)}
                              onChange={() => toggleSelectSpu(row.id)}
                              aria-label={t("common.selectItem", { item: row.draft_spu })}
                            />
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            <Text size={200}>{row.draft_spu}</Text>
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            {renderEditableCell(
                              "spu",
                              row.id,
                              "draft_title",
                              row.draft_title,
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            {renderEditableCell(
                              "spu",
                              row.id,
                              "draft_subtitle",
                              row.draft_subtitle,
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            <Text size={200}>{row.draft_status ?? ""}</Text>
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            {renderEditableCell(
                              "spu",
                              row.id,
                              "draft_source",
                              row.draft_source
                            )}
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            {editingCell?.table === "spu" &&
                            editingCell?.id === row.id &&
                            editingCell?.field === "draft_supplier_1688_url" ? (
                              <Input
                                value={editingValue}
                                onChange={(_, data) =>
                                  setEditingValue(data.value)
                                }
                                onBlur={() => commitEdit()}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    commitEdit();
                                  }
                                  if (event.key === "Escape") {
                                    cancelEdit();
                                  }
                                }}
                                size="small"
                                autoFocus
                              />
                            ) : (
                              <a
                                className={mergeClasses(
                                  styles.link,
                                  styles.clampOne
                                )}
                                href={row.draft_supplier_1688_url ?? undefined}
                                target="_blank"
                                rel="noreferrer"
                                title={row.draft_supplier_1688_url ?? ""}
                                onClick={(event) => {
                                  event.preventDefault();
                                  startEdit(
                                    "spu",
                                    row.id,
                                    "draft_supplier_1688_url",
                                    row.draft_supplier_1688_url
                                  );
                                }}
                              >
                                {row.draft_supplier_1688_url || "-"}
                              </a>
                            )}
                          </TableCell>
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.numericCell
                            )}
                          >
                            {row.image_count}
                          </TableCell>
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.numericCell
                            )}
                          >
                            {row.variant_image_count}
                          </TableCell>
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.numericCell
                            )}
                          >
                            {row.video_count}
                          </TableCell>
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.numericCell
                            )}
                          >
                            {row.variant_count}
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            <Text size={100}>{formatDate(row.draft_updated_at)}</Text>
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            <Text size={100}>{formatDate(row.draft_created_at)}</Text>
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            <Button
                              size="small"
                              appearance="outline"
                              onClick={() => toggleExpanded("spu", row.id)}
                            >
                              {isExpanded
                                ? t("draftExplorer.collapse")
                                : t("draftExplorer.expand")}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow className={styles.detailsRow}>
                            <TableCell colSpan={14}>
                              <div className={styles.detailsGrid}>
                                <div className={styles.detailsBlock}>
                                  <Text size={200} weight="semibold">
                                    {t("draftExplorer.details.description")}
                                  </Text>
                                  <Text size={100}>
                                    {stripHtml(row.draft_description_html)}
                                  </Text>
                                  <Text size={100}>
                                    {stripHtml(row.draft_product_description_main_html)}
                                  </Text>
                                </div>
                                <div className={styles.detailsBlock}>
                                  <Text size={200} weight="semibold">
                                    {t("draftExplorer.details.titles")}
                                  </Text>
                                  <Text size={100}>
                                    {row.draft_mf_product_short_title ?? ""}
                                  </Text>
                                  <Text size={100}>
                                    {row.draft_mf_product_long_title ?? ""}
                                  </Text>
                                  <Text size={100}>
                                    {row.draft_mf_product_subtitle ?? ""}
                                  </Text>
                                </div>
                                <div className={styles.detailsBlock}>
                                  <Text size={200} weight="semibold">
                                    {t("draftExplorer.details.bullets")}
                                  </Text>
                                  <Text size={100}>
                                    {row.draft_mf_product_bullets_short ?? ""}
                                  </Text>
                                  <Text size={100}>
                                    {row.draft_mf_product_bullets ?? ""}
                                  </Text>
                                  <Text size={100}>
                                    {row.draft_mf_product_bullets_long ?? ""}
                                  </Text>
                                  <Text size={100}>
                                    {row.draft_mf_product_specs ?? ""}
                                  </Text>
                                </div>
                                <div className={styles.detailsBlock}>
                                  <Text size={200} weight="semibold">
                                    {t("draftExplorer.details.images")}
                                  </Text>
                                  <Text size={100}>
                                    {row.draft_image_folder ?? ""}
                                  </Text>
                                  <Text size={100}>
                                    {row.draft_main_image_url ?? ""}
                                  </Text>
                                  <Text size={100}>
                                    {row.draft_image_urls?.join(", ") ?? ""}
                                  </Text>
                                  <Text size={100}>
                                    {row.draft_variant_image_urls?.join(", ") ?? ""}
                                  </Text>
                                </div>
                                <div className={styles.detailsBlock}>
                                  <Text size={200} weight="semibold">
                                    {t("draftExplorer.details.raw")}
                                  </Text>
                                  <Text size={100}>
                                    {JSON.stringify(row.draft_raw_row ?? {}, null, 2)}
                                  </Text>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          ) : (
            <Table size="small">
              <TableHeader>
                <TableRow>
                  {[
                    t("draftExplorer.columns.sku"),
                    t("draftExplorer.columns.spu"),
                    t("draftExplorer.columns.colorSe"),
                    t("draftExplorer.columns.sizeSe"),
                    t("draftExplorer.columns.otherSe"),
                    t("draftExplorer.columns.amountSe"),
                    t("draftExplorer.columns.optionCombined"),
                    t("draftExplorer.columns.price"),
                    t("draftExplorer.columns.weight"),
                    t("draftExplorer.columns.variantImage"),
                    t("draftExplorer.columns.status"),
                    t("draftExplorer.columns.updated"),
                    t("draftExplorer.columns.details"),
                  ].map((label) => (
                    <TableHeaderCell
                      key={label}
                      className={mergeClasses(
                        styles.stickyHeader,
                        styles.resizableHeader
                      )}
                    >
                      {label}
                    </TableHeaderCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {skuRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14}>
                      {t("draftExplorer.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  skuRows.map((row, index) => {
                    const isExpanded = expandedSkus.has(row.id);
                    const altClass = index % 2 === 1 ? styles.tableRowAlt : undefined;
                    const rawRow = row.draft_raw_row ?? {};
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          key={row.id}
                          className={mergeClasses(styles.tableRow, altClass)}
                        >
                          <TableCell className={styles.tableCell}>
                            <Text size={200}>{row.draft_sku ?? ""}</Text>
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            <Text size={200}>{row.draft_spu ?? ""}</Text>
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "raw_variation_color_se",
                              getRawValue(rawRow, "variation_color_se"),
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "raw_variation_size_se",
                              getRawValue(rawRow, "variation_size_se"),
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "raw_variation_other_se",
                              getRawValue(rawRow, "variation_other_se"),
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "raw_variation_amount_se",
                              getRawValue(rawRow, "variation_amount_se"),
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "draft_option_combined_zh",
                              row.draft_option_combined_zh,
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.numericCell
                            )}
                          >
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "draft_price",
                              row.draft_price,
                              { numeric: true }
                            )}
                          </TableCell>
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.numericCell
                            )}
                          >
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "draft_weight",
                              row.draft_weight,
                              { numeric: true }
                            )}
                            {row.draft_weight_unit ? ` ${row.draft_weight_unit}` : ""}
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "draft_variant_image_url",
                              row.draft_variant_image_url,
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            <Text size={200}>{row.draft_status ?? ""}</Text>
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            <Text size={100}>{formatDate(row.draft_updated_at)}</Text>
                          </TableCell>
                          <TableCell className={styles.tableCell}>
                            <Button
                              size="small"
                              appearance="outline"
                              onClick={() => toggleExpanded("sku", row.id)}
                            >
                              {isExpanded
                                ? t("draftExplorer.collapse")
                                : t("draftExplorer.expand")}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow className={styles.detailsRow}>
                            <TableCell colSpan={14}>
                              <div className={styles.detailsGrid}>
                                <div className={styles.detailsBlock}>
                                  <Text size={200} weight="semibold">
                                    {t("draftExplorer.details.raw")}
                                  </Text>
                                  <Text size={100}>
                                    {JSON.stringify(row.draft_raw_row ?? {}, null, 2)}
                                  </Text>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      <Card className={styles.logCard}>
        <div className={styles.explorerHeader}>
          <div>
            <Text size={500} weight="semibold">
              {t("bulkProcessing.explorer.title")}
            </Text>
          </div>
        </div>

        {error ? (
          <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
            {error}
          </Text>
        ) : null}

        <div className={styles.explorerControlsRow}>
          <div className={styles.explorerControls}>
            <Button
              appearance="outline"
              onClick={() => {
                if (!currentPath) return;
                const parts = currentPath.split("/");
                if (parts.length <= 1) return;
                parts.pop();
                setCurrentPath(parts.join("/"));
              }}
              disabled={!currentPath || currentPath === selectedFolder}
            >
              {t("bulkProcessing.explorer.up")}
            </Button>
            <Button
              appearance="outline"
              onClick={() => handleDownloadZip([...selectedFiles])}
              disabled={selectedFiles.size === 0}
            >
              {t("bulkProcessing.explorer.downloadSelected")}
            </Button>
            <Button
              appearance="outline"
              onClick={handleDeleteSelected}
              disabled={selectedFiles.size === 0}
            >
              {t("bulkProcessing.explorer.deleteSelected")}
            </Button>
            <Button
              appearance="outline"
              onClick={() =>
                handleDownloadZip(visibleFiles.map((entry) => entry.path))
              }
              disabled={visibleFiles.length === 0}
            >
              {t("bulkProcessing.explorer.downloadAll")}
            </Button>
          </div>
          <div className={styles.explorerControlsRight}>
            <Dropdown
              value={selectedFolder}
              selectedOptions={selectedFolder ? [selectedFolder] : []}
              placeholder={t("bulkProcessing.explorer.selectFolder")}
              onOptionSelect={(_, data) =>
                setSelectedFolder(String(data.optionValue ?? ""))
              }
            >
              {folders.map((folder) => (
                <Option key={folder.path} value={folder.path}>
                  {folder.name}
                </Option>
              ))}
            </Dropdown>
            <Button
              appearance="outline"
              onClick={handleExplorerRefresh}
              disabled={entriesLoading}
            >
              {t("bulkProcessing.explorer.refresh")}
            </Button>
            <div className={styles.viewToggle}>
              <Text size={100}>{t("bulkProcessing.explorer.viewSmall")}</Text>
              <Switch
                checked={explorerView === "grid"}
                onChange={(_, data) =>
                  setExplorerView(data.checked ? "grid" : "list")
                }
              />
              <Text size={100}>{t("bulkProcessing.explorer.viewLarge")}</Text>
            </div>
          </div>
        </div>

        {explorerView === "list" ? (
          <Table size="small" className={styles.explorerTable}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.explorerColName}>
                  {t("bulkProcessing.explorer.name")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.explorerColSize}>
                  {t("bulkProcessing.explorer.size")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.explorerColModified}>
                  {t("bulkProcessing.explorer.modified")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.explorerColActions}>
                  {t("bulkProcessing.explorer.actions")}
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entriesLoading ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Spinner size="tiny" />
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    {t("bulkProcessing.explorer.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow
                    key={entry.path}
                    className={mergeClasses(
                      entry.type === "dir" ? styles.folderRow : undefined
                    )}
                    onClick={(event) => {
                      if (entry.type !== "dir") return;
                      const target = event.target as HTMLElement;
                      if (target.closest("button, input, a")) return;
                      setCurrentPath(entry.path);
                    }}
                  >
                    <TableCell className={styles.explorerColName}>
                      <div className={styles.explorerRow}>
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(entry.path)}
                          onChange={() => handleToggleFile(entry.path)}
                        />
                        {entry.type === "dir" ? (
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className={styles.explorerIcon}
                          >
                            <path
                              fill="currentColor"
                              d="M9.5 4h-5A2.5 2.5 0 0 0 2 6.5v11A2.5 2.5 0 0 0 4.5 20h15A2.5 2.5 0 0 0 22 17.5v-9A2.5 2.5 0 0 0 19.5 6H12l-2-2.5A2.5 2.5 0 0 0 9.5 4Z"
                            />
                          </svg>
                        ) : null}
                        {renamingPath === entry.path ? (
                          <Input
                            size="small"
                            value={renameValue}
                            onChange={(_, data) => setRenameValue(data.value)}
                            onBlur={() => commitRename(entry)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitRename(entry);
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelRename();
                              }
                            }}
                            autoFocus
                            onClick={(event) => event.stopPropagation()}
                          />
                        ) : (
                          <button
                            type="button"
                            className={styles.explorerName}
                            onClick={(event) => {
                              event.stopPropagation();
                              startRename(entry);
                            }}
                          >
                            {entry.name}
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={styles.explorerColSize}>
                      <Text size={100} className={styles.explorerMeta}>
                        {entry.type === "file" ? formatFileSize(entry.size) : "-"}
                      </Text>
                    </TableCell>
                    <TableCell className={styles.explorerColModified}>
                      <Text size={100} className={styles.explorerMeta}>
                        {formatDateTime(entry.modifiedAt)}
                      </Text>
                    </TableCell>
                    <TableCell className={styles.explorerColActions}>
                      {entry.type === "dir" ? (
                        <Button
                          appearance="outline"
                          size="small"
                          onClick={() => setCurrentPath(entry.path)}
                        >
                          {t("bulkProcessing.explorer.open")}
                        </Button>
                      ) : (
                        <div className={styles.explorerRow}>
                          <Button
                            appearance="outline"
                            size="small"
                            onClick={() =>
                              window.open(
                                `/api/drafts/download?path=${encodeURIComponent(
                                  entry.path
                                )}`,
                                "_blank"
                              )
                            }
                          >
                            {t("bulkProcessing.explorer.download")}
                          </Button>
                          {isImage(entry.name) ? (
                            <Button
                              appearance="subtle"
                              size="small"
                              onClick={() => setPreviewPath(entry.path)}
                            >
                              {t("bulkProcessing.explorer.preview")}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ) : entriesLoading ? (
          <div style={{ padding: "12px" }}>
            <Spinner size="tiny" />
          </div>
        ) : entries.length === 0 ? (
          <Text size={200}>{t("bulkProcessing.explorer.empty")}</Text>
        ) : (
          <div className={styles.thumbGrid}>
            {entries.map((entry) => (
              <div key={entry.path} className={styles.thumbCard}>
                <div className={styles.explorerRow}>
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(entry.path)}
                    onChange={() => handleToggleFile(entry.path)}
                  />
                  <Text size={100} className={styles.explorerMeta}>
                    {entry.type === "dir"
                      ? t("bulkProcessing.explorer.folder")
                      : t("bulkProcessing.explorer.file")}
                  </Text>
                </div>
                <div className={styles.thumbImageWrap}>
                  {entry.type === "dir" ? (
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className={styles.thumbIcon}
                    >
                      <path
                        fill="currentColor"
                        d="M9.5 4h-5A2.5 2.5 0 0 0 2 6.5v11A2.5 2.5 0 0 0 4.5 20h15A2.5 2.5 0 0 0 22 17.5v-9A2.5 2.5 0 0 0 19.5 6H12l-2-2.5A2.5 2.5 0 0 0 9.5 4Z"
                      />
                    </svg>
                  ) : isImage(entry.name) ? (
                    <img
                      src={`/api/drafts/download?path=${encodeURIComponent(
                        entry.path
                      )}`}
                      alt={entry.name}
                      className={styles.thumbImage}
                    />
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className={styles.thumbIcon}
                    >
                      <path
                        fill="currentColor"
                        d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
                      />
                    </svg>
                  )}
                </div>
                <div>
                  {renamingPath === entry.path ? (
                    <Input
                      size="small"
                      value={renameValue}
                      onChange={(_, data) => setRenameValue(data.value)}
                      onBlur={() => commitRename(entry)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename(entry);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.thumbName}
                      onClick={() => startRename(entry)}
                    >
                      {entry.name}
                    </button>
                  )}
                  <Text size={100} className={styles.thumbMeta}>
                    {formatDateTime(entry.modifiedAt)}
                  </Text>
                </div>
                <div className={styles.thumbActions}>
                  {entry.type === "dir" ? (
                    <Button
                      appearance="outline"
                      size="small"
                      onClick={() => setCurrentPath(entry.path)}
                    >
                      {t("bulkProcessing.explorer.open")}
                    </Button>
                  ) : (
                    <Button
                      appearance="outline"
                      size="small"
                      onClick={() =>
                        window.open(
                          `/api/drafts/download?path=${encodeURIComponent(
                            entry.path
                          )}`,
                          "_blank"
                        )
                      }
                    >
                      {t("bulkProcessing.explorer.download")}
                    </Button>
                  )}
                  {entry.type === "file" && isImage(entry.name) ? (
                    <Button
                      appearance="subtle"
                      size="small"
                      onClick={() => setPreviewPath(entry.path)}
                    >
                      {t("bulkProcessing.explorer.preview")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          className={mergeClasses(
            styles.dropZone,
            isDragging ? styles.dropZoneActive : undefined
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            const files = Array.from(event.dataTransfer.files ?? []);
            handleUploadFiles(files);
          }}
        >
          <Text size={200}>{t("bulkProcessing.explorer.drop")}</Text>
          <div>
            <input
              type="file"
              multiple
              onChange={(event) =>
                handleUploadFiles(Array.from(event.target.files ?? []))
              }
            />
          </div>
        </div>

        <Dialog
          open={Boolean(previewPath)}
          onOpenChange={(_, data) => {
            if (!data.open) {
              setPreviewPath(null);
            }
          }}
        >
          <DialogSurface className={styles.previewDialog}>
            <DialogBody className={styles.previewDialogBody}>
              <DialogTitle>{t("bulkProcessing.explorer.previewTitle")}</DialogTitle>
              {previewPath ? (
                <img
                  src={`/api/drafts/download?path=${encodeURIComponent(previewPath)}`}
                  alt={previewPath}
                  className={styles.previewImageLarge}
                />
              ) : null}
              <DialogActions>
                <Button appearance="primary" onClick={() => setPreviewPath(null)}>
                  {t("common.close")}
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </Card>

      <Card className={styles.uploadCard}>
        <div className={styles.header}>
          <Text size={500} weight="semibold">
            {t("bulkProcessing.import.title")}
          </Text>
        </div>
        <div className={styles.uploadRow}>
          <Field label={t("bulkProcessing.import.excel")}>
            <input
              type="file"
              accept=".xlsx"
              className={styles.fileInput}
              onChange={(event) =>
                setExcelFile(event.target.files?.[0] ?? null)
              }
            />
          </Field>
          <Button
            appearance="outline"
            onClick={() => handleImport("excel")}
            disabled={!excelFile || excelStatus === "uploading"}
          >
            {excelStatus === "uploading"
              ? t("bulkProcessing.import.uploading")
              : t("bulkProcessing.import.upload")}
          </Button>
          <Field label={t("bulkProcessing.import.zip")}>
            <input
              type="file"
              accept=".zip"
              className={styles.fileInput}
              onChange={(event) => setZipFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          <Button
            appearance="outline"
            onClick={() => handleImport("zip")}
            disabled={!zipFile || zipStatus === "uploading"}
          >
            {zipStatus === "uploading"
              ? t("bulkProcessing.import.uploading")
              : t("bulkProcessing.import.upload")}
          </Button>
          {excelStatus === "done" ? (
            <Text size={200}>{t("bulkProcessing.import.done")}</Text>
          ) : null}
          {zipStatus === "done" ? (
            <Text size={200}>{t("bulkProcessing.import.done")}</Text>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
