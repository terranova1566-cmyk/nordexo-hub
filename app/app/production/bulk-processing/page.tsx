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
  chromeColActions: {
    width: "450px",
  },
  chromeActionsCell: {
    width: "450px",
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
  previewDialog: {
    maxWidth: "720px",
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
  previewList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxHeight: "420px",
    overflow: "auto",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "10px",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  previewRow: {
    display: "grid",
    gridTemplateColumns: "80px 48px 1fr",
    gap: "10px",
    alignItems: "center",
  },
  previewDelete: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  previewThumb: {
    width: "48px",
    height: "48px",
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
      extractorFiles.length > 0 &&
      extractorFiles.every((entry) => selectedExtractorFiles.has(entry.name)),
    [extractorFiles, selectedExtractorFiles]
  );

  const someExtractorSelected = useMemo(
    () => extractorFiles.some((entry) => selectedExtractorFiles.has(entry.name)),
    [extractorFiles, selectedExtractorFiles]
  );

  const toggleSelectAllExtractor = useCallback(() => {
    if (allExtractorSelected) {
      setSelectedExtractorFiles(new Set());
      return;
    }
    setSelectedExtractorFiles(new Set(extractorFiles.map((entry) => entry.name)));
  }, [allExtractorSelected, extractorFiles]);

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
        `/api/1688-extractor/files/${encodeURIComponent(entry.name)}`
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to load file.");
      }
      const payload = (await response.json()) as ExtractorPreview;
      const items =
        (payload.items ?? payload.previewItems ?? []) as ExtractorPreviewItem[];
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

  const handleAssignSpus = async (entry: ExtractorFileSummary) => {
    setAssigningName(entry.name);
    setExtractorError(null);
    try {
      const response = await fetch(
        `/api/1688-extractor/files/${encodeURIComponent(entry.name)}/assign-spus`,
        { method: "POST" }
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to assign SPUs.");
      }
      setAssignedNames((prev) =>
        prev.includes(entry.name) ? prev : [...prev, entry.name]
      );
      await loadExtractorFiles();
      if (preview?.name === entry.name) {
        await handlePreview(entry);
      }
    } catch (err) {
      setExtractorError((err as Error).message);
    } finally {
      setAssigningName(null);
    }
  };

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
        {!extractorLoading && extractorFiles.length === 0 ? (
          <Text size={200} className={styles.chromeEmpty}>
            {t("bulkProcessing.chrome.empty")}
          </Text>
        ) : null}
        {extractorFiles.length ? (
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
              {extractorFiles.map((entry) => (
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
                      {(() => {
                        const spusAdded =
                          assignedNames.includes(entry.name) ||
                          entry.missingSpuCount === 0;
                        return (
                      <Button
                        appearance={spusAdded ? "outline" : "primary"}
                        className={
                          spusAdded
                            ? `${styles.assignedButton} ${styles.chromeButton}`
                            : styles.chromeButton
                        }
                        onClick={() => handleAssignSpus(entry)}
                        disabled={
                          spusAdded ||
                          assigningName === entry.name
                        }
                        size="small"
                      >
                        {assigningName === entry.name
                          ? t("bulkProcessing.chrome.assigning")
                          : spusAdded
                          ? t("bulkProcessing.chrome.assignDone")
                          : t("bulkProcessing.chrome.assign")}
                      </Button>
                        );
                      })()}
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
                <div className={styles.previewList}>
                  {(Array.isArray(preview.items) ? preview.items : []).map(
                    (item, index) => (
                      <div
                        key={
                          item.index ?? (item.url || `${item.title}-${index}`)
                        }
                        className={styles.previewRow}
                      >
                        <div className={styles.previewDelete}>
                          <Button
                            appearance="outline"
                            size="small"
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
                        <div className={styles.previewThumb}>
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt=""
                              className={styles.previewImage}
                            />
                          ) : (
                            <span className={styles.previewPlaceholder}>N/A</span>
                          )}
                        </div>
                        <div>
                          <Text size={200}>{item.title}</Text>
                          {item.url ? (
                            <a href={item.url} target="_blank" rel="noreferrer">
                              {item.url}
                            </a>
                          ) : null}
                          <Text size={100} color="neutral">
                            {item.spu
                              ? `SPU ${item.spu}`
                              : t("bulkProcessing.chrome.spuEmpty")}
                          </Text>
                          <Text size={100} color="neutral">
                            {t("bulkProcessing.chrome.previewVariants", {
                              count: item.variantCount ?? 0,
                            })}
                          </Text>
                        </div>
                      </div>
                    )
                  )}
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
