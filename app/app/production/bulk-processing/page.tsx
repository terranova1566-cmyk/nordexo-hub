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
  Field,
  Input,
  Spinner,
  Tab,
  TabList,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatDateTime } from "@/lib/format";

type BulkJobStatus = "queued" | "running" | "completed" | "failed" | "killed";

type BulkJobSummary = {
  spuCount: number;
  imageFolderCount: number | null;
  outputExcelPath: string | null;
  outputZipPath: string | null;
};

type BulkJob = {
  jobId: string;
  status: BulkJobStatus;
  inputName: string;
  itemCount: number;
  workerCount: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  summary?: BulkJobSummary | null;
};

type ExtractorFileSummary = {
  name: string;
  receivedAt: string;
  urlCount: number;
  productCount: number;
  missingSpuCount: number;
};

type ExtractorPreviewItem = {
  index: number;
  url: string;
  title: string;
  imageUrl: string | null;
  spu: string;
  variantCount: number;
  titleZh?: string;
  titleEn?: string;
  supplierUrl?: string;
  platformLabel?: string;
};

type ExtractorPreview = {
  name: string;
  receivedAt: string;
  urlCount: number;
  productCount: number;
  missingSpuCount: number;
  items: ExtractorPreviewItem[];
  previewItems?: ExtractorPreviewItem[];
};

type QueueKeywordPayload = {
  label?: string;
  keywords?: string[];
};

type DeckHoverPreview = {
  fileName: string;
  index: number;
  imageUrl: string;
  x: number;
  y: number;
};

const toImageProxyUrl = (rawUrl: string | null | undefined) => {
  const value = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!value) return "";
  return `/api/1688-extractor/image-proxy?url=${encodeURIComponent(value)}`;
};

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  chromeCard: {
    padding: "18px",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  chromeTable: {
    marginTop: "4px",
  },
  chromeActions: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  chromeHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  chromeHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  chromeColSelect: {
    width: "44px",
  },
  chromeColCreated: {
    width: "170px",
  },
  chromeColProducts: {
    width: "75px",
  },
  chromeColDeck: {
    width: "190px",
  },
  chromeColKeywords: {
    minWidth: "260px",
    maxWidth: "360px",
  },
  chromeColJson: {
    width: "108px",
  },
  chromeColActions: {
    width: "280px",
  },
  chromeActionsCell: {
    width: "280px",
  },
  chromeButton: {
    minWidth: "120px",
  },
  chromeBadge: {
    minWidth: "140px",
  },
  assignedButton: {
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground2,
  },
  chromeLink: {
    paddingInline: 0,
    minWidth: "unset",
    color: tokens.colorBrandForeground1,
  },
  chromeEmpty: {
    color: tokens.colorNeutralForeground2,
  },
  queueDeckWrap: {
    position: "relative",
    width: "155px",
    height: "95px",
    paddingBlock: "10px",
  },
  queueDeckThumb: {
    position: "absolute",
    top: "10px",
    width: "75px",
    height: "75px",
    borderRadius: "10px",
    overflow: "hidden",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    cursor: "default",
    boxShadow: tokens.shadow4,
  },
  queueDeckImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  queueDeckPlaceholder: {
    width: "75px",
    height: "75px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  queueKeywords: {
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  queueKeywordsLoading: {
    color: tokens.colorNeutralForeground3,
  },
  queueZoomPreview: {
    position: "fixed",
    width: "300px",
    height: "300px",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: 2000,
  },
  queueZoomImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  previewDialog: {
    maxWidth: "960px",
    width: "min(960px, 92vw)",
  },
  mergeDialog: {
    maxWidth: "520px",
  },
  previewBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  mergeBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  mergeMeta: {
    color: tokens.colorNeutralForeground2,
  },
  previewMeta: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    color: tokens.colorNeutralForeground2,
  },
  previewTableWrap: {
    maxHeight: "560px",
    overflow: "auto",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  previewTable: {
    width: "100%",
  },
  previewRow: {
    minHeight: "72px",
  },
  previewCell: {
    verticalAlign: "middle",
    paddingTop: "8px",
    paddingBottom: "8px",
  },
  previewColImage: {
    width: "92px",
  },
  previewColSpu: {
    width: "88px",
  },
  previewColCn: {
    minWidth: "150px",
  },
  previewColEn: {
    minWidth: "170px",
  },
  previewColPlatform: {
    width: "130px",
  },
  previewColLink: {
    width: "118px",
    textAlign: "right",
  },
  previewColAction: {
    width: "92px",
    textAlign: "right",
  },
  previewImageCell: {
    textAlign: "center",
  },
  previewImageInner: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  previewActionCell: {
    textAlign: "right",
  },
  previewLinkCell: {
    textAlign: "right",
  },
  previewLinkInner: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  previewActionInner: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  previewWhiteButton: {
    whiteSpace: "nowrap",
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground1,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
    "&:active": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  previewThumb: {
    width: "56px",
    height: "56px",
    borderRadius: "8px",
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  previewPlaceholder: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
  previewChineseTitle: {
    lineHeight: tokens.lineHeightBase300,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    wordBreak: "break-word",
  },
  previewEnglishTitle: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    wordBreak: "break-word",
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
  summaryTable: {
    marginTop: "4px",
  },
  statusPill: {
    display: "inline-flex",
    paddingInline: "8px",
    paddingBlock: "2px",
    borderRadius: "999px",
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase100,
  },
  logCard: {
    padding: "16px",
    borderRadius: "16px",
  },
  logBox: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "12px",
    minHeight: "220px",
    maxHeight: "420px",
    overflow: "auto",
    fontSize: tokens.fontSizeBase100,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    whiteSpace: "pre-wrap",
  },
  tabList: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  summaryColFile: {
    width: "100%",
  },
  summaryColNumber: {
    width: "75px",
    textAlign: "right",
  },
  summaryColStatus: {
    width: "75px",
    textAlign: "right",
  },
  summaryCellNumber: {
    textAlign: "right",
  },
  downloadsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
  },
});

export default function BulkProcessingPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [job, setJob] = useState<BulkJob | null>(null);
  const [activeTab, setActiveTab] = useState<string>("parallel");
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [extractorFiles, setExtractorFiles] = useState<ExtractorFileSummary[]>(
    []
  );
  const [extractorLoading, setExtractorLoading] = useState(false);
  const [extractorError, setExtractorError] = useState<string | null>(null);
  const [extractorLoadingName, setExtractorLoadingName] = useState<string | null>(
    null
  );
  const [assigningName, setAssigningName] = useState<string | null>(null);
  const [assignedNames, setAssignedNames] = useState<string[]>([]);
  const [selectedExtractorFiles, setSelectedExtractorFiles] = useState<
    Set<string>
  >(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeName, setMergeName] = useState("");
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [preview, setPreview] = useState<ExtractorPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRemovedIndexes, setPreviewRemovedIndexes] = useState<Set<number>>(
    new Set()
  );
  const [previewSaving, setPreviewSaving] = useState(false);
  const [availableSpuCount, setAvailableSpuCount] = useState<number | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [queuePreviewByFile, setQueuePreviewByFile] = useState<
    Record<string, ExtractorPreviewItem[]>
  >({});
  const [queuePreviewLoadingByFile, setQueuePreviewLoadingByFile] = useState<
    Record<string, boolean>
  >({});
  const [queueKeywordsByFile, setQueueKeywordsByFile] = useState<
    Record<string, string>
  >({});
  const [queueKeywordsLoadingByFile, setQueueKeywordsLoadingByFile] = useState<
    Record<string, boolean>
  >({});
  const [deckHoverPreview, setDeckHoverPreview] = useState<DeckHoverPreview | null>(
    null
  );
  const [autoAssignFailedNames, setAutoAssignFailedNames] = useState<Set<string>>(
    new Set()
  );
  const autoAssignRunningRef = useRef(false);
  const queuePreviewRequestRef = useRef<Set<string>>(new Set());
  const queueKeywordRequestRef = useRef<Set<string>>(new Set());
  const logSourcesRef = useRef<EventSource[]>([]);

  const loadSpuSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/production/spu-pool/summary");
      if (!response.ok) return;
      const payload = await response.json();
      if (typeof payload?.freeCount === "number") {
        setAvailableSpuCount(payload.freeCount);
      }
    } catch {
      return;
    }
  }, []);

  const loadExtractorFiles = useCallback(async () => {
    setExtractorLoading(true);
    setExtractorError(null);
    try {
      const response = await fetch("/api/1688-extractor/files");
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to load files.");
      }
      const payload = await response.json();
      const nextItems = (payload?.items ?? []) as ExtractorFileSummary[];
      setExtractorFiles(nextItems);
      setSelectedExtractorFiles((prev) => {
        if (!prev.size) return prev;
        const allowed = new Set(nextItems.map((item) => item.name));
        const next = new Set([...prev].filter((name) => allowed.has(name)));
        return next;
      });
      await loadSpuSummary();
    } catch (err) {
      setExtractorError((err as Error).message);
    } finally {
      setExtractorLoading(false);
    }
  }, [loadSpuSummary]);

  useEffect(() => {
    loadExtractorFiles();
  }, [loadExtractorFiles]);

  useEffect(() => {
    if (job) return;
    let active = true;
    const loadLatest = async () => {
      try {
        const response = await fetch("/api/bulk-jobs");
        if (!response.ok) return;
        const payload = await response.json();
        const items = (payload?.items ?? []) as BulkJob[];
        if (!items.length) return;
        const running = items.find((entry) => entry.status === "running");
        const queued = items.find((entry) => entry.status === "queued");
        const selected = running ?? queued ?? items[0];
        if (active) setJob(selected);
      } catch {
        return;
      }
    };
    loadLatest();
    return () => {
      active = false;
    };
  }, [job]);

  const tabs = useMemo(() => {
    const workerCount = job?.workerCount ?? 1;
    return ["parallel", ...Array.from({ length: workerCount }, (_, i) => `w${i + 1}`)];
  }, [job?.workerCount]);

  const appendLog = useCallback((key: string, line: string) => {
    setLogs((prev) => {
      const next = { ...prev };
      const list = [...(next[key] ?? []), line];
      if (list.length > 500) {
        list.splice(0, list.length - 500);
      }
      next[key] = list;
      return next;
    });
  }, []);

  const selectedExtractorList = useMemo(
    () =>
      extractorFiles.filter((entry) => selectedExtractorFiles.has(entry.name)),
    [extractorFiles, selectedExtractorFiles]
  );

  const productionQueueFiles = useMemo(
    () =>
      extractorFiles.filter((entry) =>
        entry.name.toLowerCase().startsWith("production_queue_incoming_")
      ),
    [extractorFiles]
  );

  const chromeExtractorFiles = useMemo(
    () =>
      extractorFiles.filter(
        (entry) => !entry.name.toLowerCase().startsWith("production_queue_incoming_")
      ),
    [extractorFiles]
  );

  useEffect(() => {
    const allowed = new Set(productionQueueFiles.map((entry) => entry.name));
    const knownFileNames = new Set(extractorFiles.map((entry) => entry.name));
    setQueuePreviewByFile((prev) => {
      const next = Object.entries(prev).filter(([name]) => allowed.has(name));
      if (next.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(next);
    });
    setQueuePreviewLoadingByFile((prev) => {
      const next = Object.entries(prev).filter(([name]) => allowed.has(name));
      if (next.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(next);
    });
    setQueueKeywordsByFile((prev) => {
      const next = Object.entries(prev).filter(([name]) => allowed.has(name));
      if (next.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(next);
    });
    setQueueKeywordsLoadingByFile((prev) => {
      const next = Object.entries(prev).filter(([name]) => allowed.has(name));
      if (next.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(next);
    });
    setAutoAssignFailedNames((prev) => {
      const next = new Set([...prev].filter((name) => knownFileNames.has(name)));
      return next.size === prev.size ? prev : next;
    });
  }, [productionQueueFiles, extractorFiles]);

  useEffect(() => {
    let cancelled = false;
    const loadQueuePreviews = async () => {
      for (const entry of productionQueueFiles) {
        if (cancelled) return;
        if (queuePreviewByFile[entry.name]) continue;
        if (queuePreviewRequestRef.current.has(entry.name)) continue;
        queuePreviewRequestRef.current.add(entry.name);
        setQueuePreviewLoadingByFile((prev) => ({ ...prev, [entry.name]: true }));
        try {
          const response = await fetch(
            `/api/1688-extractor/files/${encodeURIComponent(entry.name)}`
          );
          if (!response.ok) continue;
          const payload = (await response.json()) as ExtractorPreview;
          const items =
            (payload.items ?? payload.previewItems ?? []).filter(
              (item) => Boolean(item?.imageUrl)
            ) as ExtractorPreviewItem[];
          if (cancelled) return;
          setQueuePreviewByFile((prev) => ({ ...prev, [entry.name]: items }));
        } catch {
          continue;
        } finally {
          queuePreviewRequestRef.current.delete(entry.name);
          if (!cancelled) {
            setQueuePreviewLoadingByFile((prev) => ({
              ...prev,
              [entry.name]: false,
            }));
          }
        }
      }
    };
    void loadQueuePreviews();
    return () => {
      cancelled = true;
    };
  }, [productionQueueFiles, queuePreviewByFile]);

  useEffect(() => {
    let cancelled = false;
    const loadQueueKeywords = async () => {
      for (const entry of productionQueueFiles) {
        if (cancelled) return;
        if (queueKeywordsByFile[entry.name]) continue;
        if (queueKeywordRequestRef.current.has(entry.name)) continue;
        queueKeywordRequestRef.current.add(entry.name);
        setQueueKeywordsLoadingByFile((prev) => ({ ...prev, [entry.name]: true }));
        try {
          const response = await fetch(
            `/api/1688-extractor/files/${encodeURIComponent(entry.name)}/keywords?v=${encodeURIComponent(entry.receivedAt || "")}`,
            { cache: "no-store" }
          );
          if (!response.ok) continue;
          const payload = (await response.json()) as QueueKeywordPayload;
          const label =
            typeof payload?.label === "string" ? payload.label.trim() : "";
          if (!label) continue;
          if (cancelled) return;
          setQueueKeywordsByFile((prev) => ({ ...prev, [entry.name]: label }));
        } catch {
          continue;
        } finally {
          queueKeywordRequestRef.current.delete(entry.name);
          if (!cancelled) {
            setQueueKeywordsLoadingByFile((prev) => ({
              ...prev,
              [entry.name]: false,
            }));
          }
        }
      }
    };
    void loadQueueKeywords();
    return () => {
      cancelled = true;
    };
  }, [productionQueueFiles, queueKeywordsByFile]);

  const selectedProductTotal = useMemo(
    () =>
      selectedExtractorList.reduce((sum, entry) => {
        const count =
          typeof entry.productCount === "number" && entry.productCount > 0
            ? entry.productCount
            : entry.urlCount ?? 0;
        return sum + count;
      }, 0),
    [selectedExtractorList]
  );

  const allExtractorSelected = useMemo(
    () =>
      chromeExtractorFiles.length > 0 &&
      chromeExtractorFiles.every((entry) => selectedExtractorFiles.has(entry.name)),
    [chromeExtractorFiles, selectedExtractorFiles]
  );

  const someExtractorSelected = useMemo(
    () => chromeExtractorFiles.some((entry) => selectedExtractorFiles.has(entry.name)),
    [chromeExtractorFiles, selectedExtractorFiles]
  );

  const toggleSelectAllExtractor = useCallback(() => {
    if (allExtractorSelected) {
      setSelectedExtractorFiles(new Set());
      return;
    }
    setSelectedExtractorFiles(new Set(chromeExtractorFiles.map((entry) => entry.name)));
  }, [allExtractorSelected, chromeExtractorFiles]);

  const toggleSelectExtractor = useCallback((name: string) => {
    setSelectedExtractorFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const handleOpenMergeDialog = () => {
    if (selectedExtractorFiles.size < 2) return;
    setMergeError(null);
    setMergeName("");
    setMergeDialogOpen(true);
  };

  const handleConfirmMerge = async () => {
    if (selectedExtractorFiles.size < 2) return;
    setIsMerging(true);
    setMergeError(null);
    try {
      const response = await fetch("/api/1688-extractor/files/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          names: selectedExtractorList.map((entry) => entry.name),
          baseName: mergeName.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to merge files.");
      }
      setMergeDialogOpen(false);
      setMergeName("");
      setSelectedExtractorFiles(new Set());
      await loadExtractorFiles();
    } catch (err) {
      setMergeError((err as Error).message);
    } finally {
      setIsMerging(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await fetch("/api/bulk-jobs/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Upload failed.");
      }
      const payload = await response.json();
      setJob(payload.job as BulkJob);
      setLogs({});
      setActiveTab("parallel");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleStart = async () => {
    if (!job) return;
    setIsStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/bulk-jobs/${job.jobId}/start`, {
        method: "POST",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to start job.");
      }
      const payload = await response.json();
      setJob(payload.job as BulkJob);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    if (!job) return;
    setIsStopping(true);
    setError(null);
    try {
      const response = await fetch(`/api/bulk-jobs/${job.jobId}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to stop job.");
      }
      const payload = await response.json();
      setJob(payload.job as BulkJob);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsStopping(false);
    }
  };

  const handlePreview = async (entry: ExtractorFileSummary) => {
    setPreview({
      name: entry.name,
      receivedAt: entry.receivedAt,
      urlCount: entry.urlCount,
      productCount: entry.productCount,
      missingSpuCount: entry.missingSpuCount,
      items: [],
    });
    setPreviewRemovedIndexes(new Set());
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const response = await fetch(
        `/api/1688-extractor/files/${encodeURIComponent(entry.name)}/preview-table`
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to load file.");
      }
      const payload = (await response.json()) as ExtractorPreview;
      const items = (
        Array.isArray(payload.items) ? payload.items : payload.previewItems ?? []
      ).map((item) => ({
        ...item,
        titleZh:
          typeof item?.titleZh === "string" && item.titleZh.trim()
            ? item.titleZh.trim()
            : "",
        titleEn:
          typeof item?.titleEn === "string" && item.titleEn.trim()
            ? item.titleEn.trim()
            : "",
        supplierUrl:
          typeof item?.supplierUrl === "string" && item.supplierUrl.trim()
            ? item.supplierUrl.trim()
            : "",
        platformLabel:
          typeof item?.platformLabel === "string" && item.platformLabel.trim()
            ? item.platformLabel.trim()
            : "",
      })) as ExtractorPreviewItem[];
      setPreview({ ...payload, items });
    } catch (err) {
      setPreviewError((err as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSavePreview = async () => {
    if (!preview) return;
    if (previewRemovedIndexes.size === 0) {
      setPreview(null);
      return;
    }
    setPreviewSaving(true);
    try {
      const response = await fetch(
        `/api/1688-extractor/files/${encodeURIComponent(preview.name)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            removeIndexes: Array.from(previewRemovedIndexes.values()),
          }),
        }
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to save changes.");
      }
      setPreview(null);
      setPreviewRemovedIndexes(new Set());
      await loadExtractorFiles();
    } catch (err) {
      setPreviewError((err as Error).message);
    } finally {
      setPreviewSaving(false);
    }
  };

  const handleDeleteExtractor = async (name: string) => {
    setExtractorLoadingName(name);
    setExtractorError(null);
    try {
      const response = await fetch(
        `/api/1688-extractor/files/${encodeURIComponent(name)}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to delete file.");
      }
      if (preview?.name === name) {
        setPreview(null);
      }
      await loadExtractorFiles();
    } catch (err) {
      setExtractorError((err as Error).message);
    } finally {
      setExtractorLoadingName(null);
    }
  };

  const handleLoadExtractor = async (name: string) => {
    setExtractorLoadingName(name);
    setError(null);
    try {
      const response = await fetch("/api/bulk-jobs/from-extractor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to load file.");
      }
      const payload = await response.json();
      setJob(payload.job as BulkJob);
      setLogs({});
      setActiveTab("parallel");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExtractorLoadingName(null);
    }
  };

  useEffect(() => {
    if (assigningName) return;
    if (autoAssignRunningRef.current) return;

    const nextEntry = extractorFiles.find(
      (entry) =>
        entry.missingSpuCount > 0 &&
        !autoAssignFailedNames.has(entry.name) &&
        !assignedNames.includes(entry.name)
    );
    if (!nextEntry) return;

    autoAssignRunningRef.current = true;
    setAssigningName(nextEntry.name);
    setExtractorError(null);

    const runAutoAssign = async () => {
      try {
        const response = await fetch(
          `/api/1688-extractor/files/${encodeURIComponent(nextEntry.name)}/assign-spus`,
          { method: "POST" }
        );
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Unable to assign SPUs.");
        }
        setAssignedNames((prev) =>
          prev.includes(nextEntry.name) ? prev : [...prev, nextEntry.name]
        );
        setAutoAssignFailedNames((prev) => {
          if (!prev.has(nextEntry.name)) return prev;
          const next = new Set(prev);
          next.delete(nextEntry.name);
          return next;
        });
        await loadExtractorFiles();
      } catch (err) {
        setAutoAssignFailedNames((prev) => {
          if (prev.has(nextEntry.name)) return prev;
          const next = new Set(prev);
          next.add(nextEntry.name);
          return next;
        });
        setExtractorError((err as Error).message);
      } finally {
        autoAssignRunningRef.current = false;
        setAssigningName(null);
      }
    };

    void runAutoAssign();
  }, [
    assigningName,
    autoAssignFailedNames,
    assignedNames,
    extractorFiles,
    loadExtractorFiles,
  ]);

  useEffect(() => {
    if (!job) return;
    if (job.status !== "running" && job.status !== "queued") return;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/bulk-jobs/${job.jobId}`);
        if (!response.ok) return;
        const payload = await response.json();
        setJob(payload.job as BulkJob);
      } catch {
        return;
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [job]);

  useEffect(() => {
    logSourcesRef.current.forEach((source) => source.close());
    logSourcesRef.current = [];
    if (!job) return;

    const attachSource = (key: string, url: string) => {
      const source = new EventSource(url);
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.line) {
            appendLog(key, payload.line);
          }
        } catch {
          return;
        }
      };
      logSourcesRef.current.push(source);
    };

    attachSource("parallel", `/api/bulk-jobs/${job.jobId}/logs/parallel`);
    const workerCount = job.workerCount ?? 1;
    for (let i = 1; i <= workerCount; i += 1) {
      attachSource(`w${i}`, `/api/bulk-jobs/${job.jobId}/logs/worker/${i}`);
    }

    return () => {
      logSourcesRef.current.forEach((source) => source.close());
      logSourcesRef.current = [];
    };
  }, [job?.jobId, job?.workerCount, appendLog]);

  const statusLabel = job ? job.status : "idle";

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text size={700} weight="semibold">
          {t("bulkProcessing.title")}
        </Text>
        <Text size={300} color="neutral">
          {t("bulkProcessing.subtitle")}
        </Text>
      </div>

      <Card className={styles.chromeCard}>
        <div className={styles.chromeHeaderRow}>
          <Text size={500} weight="semibold">
            {t("bulkProcessing.queueIncoming.title")}
          </Text>
        </div>
        {extractorLoading ? <Spinner size="tiny" /> : null}
        {!extractorLoading && productionQueueFiles.length === 0 ? (
          <Text size={200} className={styles.chromeEmpty}>
            {t("bulkProcessing.queueIncoming.empty")}
          </Text>
        ) : null}
        {productionQueueFiles.length ? (
          <Table size="small" className={styles.chromeTable}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.chromeColDeck}>
                  Image explorer
                </TableHeaderCell>
                <TableHeaderCell className={styles.chromeColKeywords}>
                  Batch Content
                </TableHeaderCell>
                <TableHeaderCell className={styles.chromeColJson}>
                  {t("bulkProcessing.chrome.file")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.chromeColProducts}>
                  {t("bulkProcessing.chrome.products")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.chromeColCreated}>
                  {t("bulkProcessing.chrome.received")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.chromeColActions}>
                  {t("bulkProcessing.chrome.actions")}
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productionQueueFiles.map((entry) => (
                <TableRow key={entry.name}>
                  <TableCell className={styles.chromeColDeck}>
                    {(() => {
                      const deckItems = (queuePreviewByFile[entry.name] ?? [])
                        .filter((item) => Boolean(item.imageUrl))
                        .slice(0, 5);
                      if (deckItems.length === 0) {
                        if (queuePreviewLoadingByFile[entry.name]) {
                          return <Spinner size="tiny" />;
                        }
                        return (
                          <div className={styles.queueDeckPlaceholder}>No image</div>
                        );
                      }
                      const deckCount = deckItems.length;
                      return (
                        <div className={styles.queueDeckWrap}>
                          {deckItems.map((item, index) => {
                            const imageUrl = toImageProxyUrl(item.imageUrl);
                            if (!imageUrl) return null;
                            const isHovered =
                              deckHoverPreview?.fileName === entry.name &&
                              deckHoverPreview?.index === index;
                            return (
                              <div
                                key={`${entry.name}-${item.index}-${index}`}
                                className={styles.queueDeckThumb}
                                style={{
                                  left: `${index * 20}px`,
                                  zIndex: isHovered ? 30 : index + 1,
                                }}
                                onMouseEnter={(ev) => {
                                  setDeckHoverPreview({
                                    fileName: entry.name,
                                    index,
                                    imageUrl,
                                    x: ev.clientX,
                                    y: ev.clientY,
                                  });
                                }}
                                onMouseMove={(ev) => {
                                  setDeckHoverPreview((prev) => {
                                    if (!prev) return prev;
                                    if (
                                      prev.fileName !== entry.name ||
                                      prev.index !== index
                                    ) {
                                      return prev;
                                    }
                                    return { ...prev, x: ev.clientX, y: ev.clientY };
                                  });
                                }}
                                onMouseLeave={() => {
                                  setDeckHoverPreview((prev) => {
                                    if (!prev) return prev;
                                    if (
                                      prev.fileName !== entry.name ||
                                      prev.index !== index
                                    ) {
                                      return prev;
                                    }
                                    return null;
                                  });
                                }}
                              >
                                <img
                                  src={imageUrl}
                                  alt=""
                                  className={styles.queueDeckImage}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className={styles.chromeColKeywords}>
                    {queueKeywordsByFile[entry.name] ? (
                      <Text size={200} className={styles.queueKeywords}>
                        {queueKeywordsByFile[entry.name]}
                      </Text>
                    ) : queueKeywordsLoadingByFile[entry.name] ? (
                      <Text size={200} className={styles.queueKeywordsLoading}>
                        Building batch content...
                      </Text>
                    ) : (
                      <Text size={200} color="neutral">
                        -
                      </Text>
                    )}
                  </TableCell>
                  <TableCell className={styles.chromeColJson}>
                    <Button appearance="primary" size="small" onClick={() => handlePreview(entry)}>
                      JSON file
                    </Button>
                  </TableCell>
                  <TableCell className={styles.chromeColProducts}>
                    {entry.productCount || entry.urlCount}
                  </TableCell>
                  <TableCell className={styles.chromeColCreated}>
                    {formatDateTime(entry.receivedAt)}
                  </TableCell>
                  <TableCell className={styles.chromeActionsCell}>
                    <div className={styles.chromeActions}>
                      <Button
                        appearance="primary"
                        onClick={() => handleLoadExtractor(entry.name)}
                        disabled={extractorLoadingName === entry.name}
                        size="small"
                      >
                        {extractorLoadingName === entry.name ? (
                          <Spinner size="tiny" />
                        ) : (
                          "Run this batch"
                        )}
                      </Button>
                      <Button
                        appearance="outline"
                        onClick={() => handleDeleteExtractor(entry.name)}
                        disabled={extractorLoadingName === entry.name}
                        size="small"
                      >
                        {t("bulkProcessing.chrome.delete")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Card>

      <Card className={styles.chromeCard}>
        <div className={styles.chromeHeaderRow}>
          <Text size={500} weight="semibold">
            {t("bulkProcessing.chrome.title")}
          </Text>
          <div className={styles.chromeHeaderActions}>
            <Button
              appearance="outline"
              size="small"
              className={styles.chromeBadge}
              disabled
            >
              {t("bulkProcessing.chrome.availableSpus", {
                count: availableSpuCount ?? "-",
              })}
            </Button>
            <Button
              appearance="outline"
              size="small"
              onClick={handleOpenMergeDialog}
              disabled={selectedExtractorFiles.size < 2 || isMerging}
            >
              {t("bulkProcessing.chrome.merge")}
            </Button>
          </div>
        </div>
        {extractorError ? (
          <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
            {extractorError}
          </Text>
        ) : null}
        {extractorLoading ? <Spinner size="tiny" /> : null}
        {!extractorLoading && chromeExtractorFiles.length === 0 ? (
          <Text size={200} className={styles.chromeEmpty}>
            {t("bulkProcessing.chrome.empty")}
          </Text>
        ) : null}
        {chromeExtractorFiles.length ? (
          <Table size="small" className={styles.chromeTable}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.chromeColSelect}>
                  <Checkbox
                    checked={
                      allExtractorSelected
                        ? true
                        : someExtractorSelected
                        ? "mixed"
                        : false
                    }
                    onChange={toggleSelectAllExtractor}
                    aria-label={t("common.selectAll")}
                  />
                </TableHeaderCell>
                <TableHeaderCell>{t("bulkProcessing.chrome.file")}</TableHeaderCell>
                <TableHeaderCell className={styles.chromeColProducts}>
                  {t("bulkProcessing.chrome.products")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.chromeColCreated}>
                  {t("bulkProcessing.chrome.received")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.chromeColActions}>
                  {t("bulkProcessing.chrome.actions")}
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chromeExtractorFiles.map((entry) => (
                <TableRow key={entry.name}>
                  <TableCell className={styles.chromeColSelect}>
                    <Checkbox
                      checked={selectedExtractorFiles.has(entry.name)}
                      onChange={() => toggleSelectExtractor(entry.name)}
                      aria-label={t("common.selectItem", { item: entry.name })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      appearance="transparent"
                      className={styles.chromeLink}
                      onClick={() => handlePreview(entry)}
                    >
                      {entry.name}
                    </Button>
                  </TableCell>
                  <TableCell className={styles.chromeColProducts}>
                    {entry.productCount || entry.urlCount}
                  </TableCell>
                  <TableCell className={styles.chromeColCreated}>
                    {formatDateTime(entry.receivedAt)}
                  </TableCell>
                  <TableCell className={styles.chromeActionsCell}>
                    <div className={styles.chromeActions}>
                      <Button
                        appearance="outline"
                        onClick={() => handleLoadExtractor(entry.name)}
                        disabled={extractorLoadingName === entry.name}
                        size="small"
                      >
                        {extractorLoadingName === entry.name ? (
                          <Spinner size="tiny" />
                        ) : (
                          t("bulkProcessing.chrome.load")
                        )}
                      </Button>
                      <Button
                        appearance="outline"
                        onClick={() => handleDeleteExtractor(entry.name)}
                        disabled={extractorLoadingName === entry.name}
                        size="small"
                      >
                        {t("bulkProcessing.chrome.delete")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Card>

      <Card className={styles.uploadCard}>
        <div className={styles.uploadRow}>
          <Field label={t("bulkProcessing.uploadLabel")}>
            <input
              type="file"
              accept="application/json"
              className={styles.fileInput}
              ref={fileInputRef}
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] ?? null)
              }
            />
          </Field>
          <Button
            appearance="outline"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
          >
            {isUploading ? <Spinner size="tiny" /> : t("bulkProcessing.upload")}
          </Button>
          <Button
            appearance="primary"
            onClick={handleStart}
            disabled={!job || job.status === "running" || isStarting}
          >
            {isStarting ? <Spinner size="tiny" /> : t("bulkProcessing.run")}
          </Button>
          <Button
            appearance="outline"
            onClick={handleStop}
            disabled={
              !job ||
              (job.status !== "running" && job.status !== "queued") ||
              isStopping
            }
          >
            {isStopping ? <Spinner size="tiny" /> : t("bulkProcessing.stop")}
          </Button>
        </div>

        {error ? (
          <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
            {error}
          </Text>
        ) : null}

        {job ? (
          <Table size="small" className={styles.summaryTable}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.summaryColFile}>
                  {t("bulkProcessing.summary.file")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.summaryColNumber}>
                  {t("bulkProcessing.summary.count")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.summaryColNumber}>
                  {t("bulkProcessing.summary.workers")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.summaryColStatus}>
                  {t("bulkProcessing.summary.status")}
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>{job.inputName}</TableCell>
                <TableCell className={styles.summaryCellNumber}>
                  {job.itemCount}
                </TableCell>
                <TableCell className={styles.summaryCellNumber}>
                  {job.workerCount}
                </TableCell>
                <TableCell className={styles.summaryCellNumber}>
                  <span className={styles.statusPill}>{statusLabel}</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : null}

        {job?.status === "completed" ? (
          <div className={styles.downloadsRow}>
            <Text size={200}>{t("bulkProcessing.completed")}</Text>
            {job.summary?.outputExcelPath ? (
              <Button
                appearance="outline"
                onClick={() =>
                  window.open(
                    `/api/bulk-jobs/${job.jobId}/download?type=excel`,
                    "_blank"
                  )
                }
              >
                {t("bulkProcessing.downloadExcel")}
              </Button>
            ) : null}
            {job.summary?.outputZipPath ? (
              <Button
                appearance="outline"
                onClick={() =>
                  window.open(
                    `/api/bulk-jobs/${job.jobId}/download?type=zip`,
                    "_blank"
                  )
                }
              >
                {t("bulkProcessing.downloadZip")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className={styles.logCard}>
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, data) => setActiveTab(String(data.value))}
          className={styles.tabList}
        >
          {tabs.map((tab) => (
            <Tab key={tab} value={tab}>
              {tab === "parallel"
                ? t("bulkProcessing.logs.parallel")
                : `${t("bulkProcessing.logs.worker")} ${tab.replace("w", "")}`}
            </Tab>
          ))}
        </TabList>

        {tabs.map((tab) =>
          activeTab === tab ? (
            <div key={tab} className={styles.logBox}>
              {(logs[tab]?.join("\n") ?? "") || t("bulkProcessing.logs.empty")}
            </div>
          ) : null
        )}
      </Card>

      {deckHoverPreview ? (
        <div
          className={styles.queueZoomPreview}
          style={{
            left: `${deckHoverPreview.x + 24}px`,
            top: `${Math.max(16, deckHoverPreview.y - 150)}px`,
          }}
        >
          <img
            src={deckHoverPreview.imageUrl}
            alt=""
            className={styles.queueZoomImage}
          />
        </div>
      ) : null}

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(_, data) => {
          if (!data.open) {
            setPreview(null);
            setPreviewRemovedIndexes(new Set());
          }
        }}
      >
        <DialogSurface className={styles.previewDialog}>
          <DialogBody className={styles.previewBody}>
            <DialogTitle>{t("bulkProcessing.chrome.previewTitle")}</DialogTitle>
            {previewLoading ? <Spinner size="tiny" /> : null}
            {previewError ? (
              <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
                {previewError}
              </Text>
            ) : null}
            {preview ? (
              <>
                <div className={styles.previewMeta}>
                  <Text size={200}>
                    {t("bulkProcessing.chrome.previewProducts", {
                      count: preview.productCount,
                    })}
                  </Text>
                  <Text size={200}>
                    {t("bulkProcessing.chrome.previewUrls", {
                      count: preview.urlCount,
                    })}
                  </Text>
                  <Text size={200}>{formatDateTime(preview.receivedAt)}</Text>
                </div>
                <div className={styles.previewTableWrap}>
                  <Table size="small" className={styles.previewTable}>
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell className={styles.previewColImage}>
                          Images
                        </TableHeaderCell>
                        <TableHeaderCell className={styles.previewColSpu}>
                          SPU
                        </TableHeaderCell>
                        <TableHeaderCell className={styles.previewColCn}>
                          Product Title (Chinese)
                        </TableHeaderCell>
                        <TableHeaderCell className={styles.previewColEn}>
                          Working / Translated English Title
                        </TableHeaderCell>
                        <TableHeaderCell className={styles.previewColPlatform}>
                          Platform
                        </TableHeaderCell>
                        <TableHeaderCell className={styles.previewColLink}>
                          Supplier Link
                        </TableHeaderCell>
                        <TableHeaderCell className={styles.previewColAction}>
                          Action
                        </TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(Array.isArray(preview.items) ? preview.items : []).map(
                        (item, index) => (
                          <TableRow
                            className={styles.previewRow}
                            key={
                              item.index ?? (item.url || `${item.title}-${index}`)
                            }
                          >
                            <TableCell
                              className={`${styles.previewCell} ${styles.previewImageCell}`}
                            >
                              <div className={styles.previewImageInner}>
                                <div className={styles.previewThumb}>
                                  {item.imageUrl ? (
                                    <img
                                      src={toImageProxyUrl(item.imageUrl)}
                                      alt=""
                                      className={styles.previewImage}
                                    />
                                  ) : (
                                    <span className={styles.previewPlaceholder}>
                                      N/A
                                    </span>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className={styles.previewCell}>
                              <Text size={200}>
                                {item.spu || t("bulkProcessing.chrome.spuEmpty")}
                              </Text>
                            </TableCell>
                            <TableCell className={styles.previewCell}>
                              <Text
                                size={200}
                                className={styles.previewChineseTitle}
                              >
                                {item.titleZh || "-"}
                              </Text>
                            </TableCell>
                            <TableCell className={styles.previewCell}>
                              <Text
                                size={200}
                                className={styles.previewEnglishTitle}
                              >
                                {item.titleEn || "-"}
                              </Text>
                            </TableCell>
                            <TableCell className={styles.previewCell}>
                              <Text size={200} color="neutral">
                                {item.platformLabel || "1688 only"}
                              </Text>
                            </TableCell>
                            <TableCell
                              className={`${styles.previewCell} ${styles.previewLinkCell}`}
                            >
                              <div className={styles.previewLinkInner}>
                                {item.supplierUrl || item.url ? (
                                  <Button
                                    appearance="outline"
                                    size="small"
                                    className={styles.previewWhiteButton}
                                    onClick={() =>
                                      window.open(
                                        item.supplierUrl || item.url,
                                        "_blank",
                                        "noopener,noreferrer"
                                      )
                                    }
                                  >
                                    Supplier Link
                                  </Button>
                                ) : (
                                  <Text size={100} color="neutral">
                                    -
                                  </Text>
                                )}
                              </div>
                            </TableCell>
                            <TableCell
                              className={`${styles.previewCell} ${styles.previewActionCell}`}
                            >
                              <div className={styles.previewActionInner}>
                                <Button
                                  appearance="outline"
                                  size="small"
                                  className={styles.previewWhiteButton}
                                  onClick={() =>
                                    setPreview((current) => {
                                      if (!current) return current;
                                      const nextItems = current.items.filter(
                                        (currentItem) =>
                                          currentItem.index !== item.index
                                      );
                                      setPreviewRemovedIndexes((prev) => {
                                        const next = new Set(prev);
                                        next.add(item.index);
                                        return next;
                                      });
                                      return { ...current, items: nextItems };
                                    })
                                  }
                                >
                                  {t("bulkProcessing.chrome.delete")}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : null}
            <DialogActions>
              <Button
                appearance="primary"
                onClick={handleSavePreview}
                disabled={previewSaving || previewRemovedIndexes.size === 0}
              >
                {previewSaving ? <Spinner size="tiny" /> : t("common.save")}
              </Button>
              <Button appearance="outline" onClick={() => setPreview(null)}>
                {t("common.close")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={mergeDialogOpen}
        onOpenChange={(_, data) => {
          setMergeDialogOpen(data.open);
          if (!data.open) setMergeError(null);
        }}
      >
        <DialogSurface className={styles.mergeDialog}>
          <DialogBody className={styles.mergeBody}>
            <DialogTitle>{t("bulkProcessing.chrome.mergeDialogTitle")}</DialogTitle>
            <Text size={200} className={styles.mergeMeta}>
              {t("bulkProcessing.chrome.mergeDialogSummary", {
                files: selectedExtractorFiles.size,
                products: selectedProductTotal,
              })}
            </Text>
            <Field label={t("bulkProcessing.chrome.mergeNameLabel")}>
              <Input
                value={mergeName}
                onChange={(_, data) => setMergeName(data.value)}
                placeholder={t("bulkProcessing.chrome.mergeNamePlaceholder")}
              />
            </Field>
            {mergeError ? (
              <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
                {mergeError}
              </Text>
            ) : null}
            <DialogActions>
              <Button
                appearance="primary"
                onClick={handleConfirmMerge}
                disabled={isMerging || selectedExtractorFiles.size < 2}
              >
                {isMerging ? <Spinner size="tiny" /> : t("bulkProcessing.chrome.mergeConfirm")}
              </Button>
              <Button appearance="outline" onClick={() => setMergeDialogOpen(false)}>
                {t("common.close")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
