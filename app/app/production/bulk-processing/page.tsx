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
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  deckItems?: ExtractorPreviewItem[];
  keywordLabel?: string;
  keywordItems?: string[];
  keywordCached?: boolean;
  keywordUpdatedAt?: string | null;
};

type ExtractorPreviewItem = {
  index: number;
  url: string;
  title: string;
  imageUrl: string | null;
  spu: string;
  variantCount: number;
  variants?: ExtractorPreviewVariant[];
  titleZh?: string;
  titleEn?: string;
  supplierUrl?: string;
  platformLabel?: string;
};

type ExtractorPreviewVariant = {
  comboIndex: number;
  labelZh: string;
  labelEn: string;
  labelRaw: string;
  imageUrl: string | null;
  priceText: string;
  weightText: string;
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
  proxyUrl: string;
  x: number;
  y: number;
};

type QueueKeywordHoverPreview = {
  fileName: string;
  index: number;
  proxyUrl: string;
  x: number;
  y: number;
};

const toImageProxyUrl = (
  rawUrl: string | null | undefined,
  options?: { width?: number; height?: number }
) => {
  const value = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!value) return "";
  const params = new URLSearchParams({ url: value });
  if (typeof options?.width === "number" && options.width > 0) {
    params.set("w", String(Math.round(options.width)));
  }
  if (typeof options?.height === "number" && options.height > 0) {
    params.set("h", String(Math.round(options.height)));
  }
  return `/api/1688-extractor/image-proxy?${params.toString()}`;
};

const getIncomingSourceLabel = (fileName: string) =>
  fileName.toLowerCase().startsWith("production_queue_incoming_")
    ? "Production queue"
    : "Chrome extension";

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 15000
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const normalizeVariantComboIndexes = (input: number[]) =>
  Array.from(
    new Set(
      input.filter((value) => Number.isInteger(value) && Number(value) >= 0)
    )
  ).sort((a, b) => a - b);

const hasSameIndexes = (left: number[], right: number[]) => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
};

const normalizeQueueKeywordItems = (
  keywords: unknown,
  fallbackLabel?: string
) => {
  const fallback =
    typeof fallbackLabel === "string"
      ? fallbackLabel
          .split(/[,，、]+/)
          .map((part) => part.trim())
          .filter(Boolean)
      : [];
  const rawList = Array.isArray(keywords) ? keywords : fallback;
  const seen = new Set<string>();
  const out: string[] = [];
  rawList.forEach((entry) => {
    const value = typeof entry === "string" ? entry.trim() : "";
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out;
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
    width: "168px",
  },
  chromeColDeck: {
    width: "190px",
  },
  chromeColKeywords: {
    minWidth: "260px",
    maxWidth: "360px",
  },
  chromeColSource: {
    width: "140px",
  },
  chromeColJson: {
    width: "108px",
  },
  chromeColActions: {
    width: "280px",
  },
  chromeColRowSelect: {
    width: "44px",
    textAlign: "center",
  },
  chromeActionsCell: {
    width: "280px",
  },
  chromeButton: {
    minWidth: "120px",
  },
  chromeViewProductsButton: {
    whiteSpace: "nowrap",
    minWidth: "148px",
    backgroundColor: `${tokens.colorNeutralBackground1} !important`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground1,
    "&:hover": {
      backgroundColor: `${tokens.colorNeutralBackground2} !important`,
    },
    "&:active": {
      backgroundColor: `${tokens.colorNeutralBackground2} !important`,
    },
  },
  chromeBadge: {
    minWidth: "140px",
  },
  assignedButton: {
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground2,
  },
  completedBatchButton: {
    backgroundColor: "#107c10",
    border: "1px solid #0b6a0b",
    color: "#ffffff",
    "&:hover": {
      backgroundColor: "#0b6a0b",
      color: "#ffffff",
    },
    "&:active": {
      backgroundColor: "#095a09",
      color: "#ffffff",
    },
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
  queueKeywordsWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  queueKeywordBadgeList: {
    display: "flex",
    flexWrap: "wrap",
    alignContent: "flex-start",
    gap: "6px",
    maxHeight: "50px",
    overflow: "hidden",
  },
  queueKeywordBadge: {
    display: "inline-flex",
    alignItems: "center",
    maxWidth: "100%",
    minHeight: "22px",
    paddingInline: "10px",
    borderRadius: "999px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#fff6cc",
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  queueKeywordsMain: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
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
  queueKeywordHoverPreview: {
    position: "fixed",
    width: "75px",
    height: "75px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow8,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: 2000,
  },
  queueKeywordHoverImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  previewDialog: {
    maxWidth: "1180px",
    width: "min(1180px, 94vw)",
  },
  jsonDialog: {
    maxWidth: "1080px",
    width: "min(1080px, 96vw)",
  },
  jsonDialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  jsonEditorWrap: {
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    minHeight: "420px",
    overflow: "hidden",
  },
  jsonEditorTextarea: {
    width: "100%",
    minHeight: "420px",
    border: "none",
    outline: "none",
    resize: "vertical",
    padding: "12px",
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
  },
  jsonMeta: {
    color: tokens.colorNeutralForeground2,
  },
  variantsDialog: {
    maxWidth: "980px",
    width: "min(980px, 94vw)",
  },
  variantsDialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  variantsMeta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },
  variantsMetaActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  variantsCount: {
    color: tokens.colorNeutralForeground2,
  },
  variantsTableWrap: {
    maxHeight: "520px",
    overflow: "auto",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  variantsTable: {
    width: "100%",
  },
  variantsColPick: {
    width: "68px",
  },
  variantsColImage: {
    width: "76px",
  },
  variantsColLabel: {
    minWidth: "240px",
  },
  variantsColPrice: {
    width: "120px",
  },
  variantsColWeight: {
    width: "120px",
  },
  variantsThumb: {
    width: "52px",
    height: "52px",
    borderRadius: "8px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    objectFit: "cover",
    display: "block",
  },
  variantsThumbPlaceholder: {
    width: "52px",
    height: "52px",
    borderRadius: "8px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: tokens.fontSizeBase100,
  },
  variantsLabelWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  variantsLabelZh: {
    lineHeight: tokens.lineHeightBase300,
    fontSize: tokens.fontSizeBase200,
    wordBreak: "break-word",
  },
  variantsLabelEn: {
    color: tokens.colorNeutralForeground2,
    lineHeight: tokens.lineHeightBase200,
    fontSize: tokens.fontSizeBase100,
    wordBreak: "break-word",
  },
  variantsLabelRaw: {
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase200,
    fontSize: tokens.fontSizeBase100,
    wordBreak: "break-word",
  },
  variantsValue: {
    whiteSpace: "nowrap",
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
  previewColVariants: {
    width: "126px",
    textAlign: "left",
  },
  previewColLink: {
    width: "118px",
    textAlign: "left",
  },
  previewColAction: {
    width: "92px",
    textAlign: "left",
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
    textAlign: "left",
  },
  previewLinkCell: {
    textAlign: "left",
  },
  previewLinkInner: {
    display: "flex",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  previewActionInner: {
    display: "flex",
    justifyContent: "flex-start",
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
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [job, setJob] = useState<BulkJob | null>(null);
  const [bulkJobs, setBulkJobs] = useState<BulkJob[]>([]);
  const [activeTab, setActiveTab] = useState<string>("parallel");
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [isImportingJson, setIsImportingJson] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
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
  const [previewVariantUpdates, setPreviewVariantUpdates] = useState<
    Record<number, number[]>
  >({});
  const [previewSaving, setPreviewSaving] = useState(false);
  const [previewVariantTarget, setPreviewVariantTarget] = useState<{
    itemIndex: number;
    title: string;
    variants: ExtractorPreviewVariant[];
    baseSelectedIndexes: number[];
  } | null>(null);
  const [previewVariantSelection, setPreviewVariantSelection] = useState<Set<number>>(
    new Set()
  );
  const [jsonEditorTarget, setJsonEditorTarget] = useState<ExtractorFileSummary | null>(
    null
  );
  const [jsonEditorText, setJsonEditorText] = useState("");
  const [jsonEditorLoading, setJsonEditorLoading] = useState(false);
  const [jsonEditorSaving, setJsonEditorSaving] = useState(false);
  const [jsonEditorError, setJsonEditorError] = useState<string | null>(null);
  const [availableSpuCount, setAvailableSpuCount] = useState<number | null>(
    null
  );
  const [queuePreviewByFile, setQueuePreviewByFile] = useState<
    Record<string, ExtractorPreviewItem[]>
  >({});
  const [queuePreviewLoadingByFile, setQueuePreviewLoadingByFile] = useState<
    Record<string, boolean>
  >({});
  const [queueKeywordsByFile, setQueueKeywordsByFile] = useState<
    Record<string, string>
  >({});
  const [queueKeywordItemsByFile, setQueueKeywordItemsByFile] = useState<
    Record<string, string[]>
  >({});
  const [queueKeywordsLoadingByFile, setQueueKeywordsLoadingByFile] = useState<
    Record<string, boolean>
  >({});
  const [deckHoverPreview, setDeckHoverPreview] = useState<DeckHoverPreview | null>(
    null
  );
  const [queueKeywordHoverPreview, setQueueKeywordHoverPreview] =
    useState<QueueKeywordHoverPreview | null>(null);
  const [autoAssignFailedNames, setAutoAssignFailedNames] = useState<Set<string>>(
    new Set()
  );
  const autoAssignRunningRef = useRef(false);
  const queuePreviewRequestRef = useRef<Set<string>>(new Set());
  const queueKeywordRequestRef = useRef<Set<string>>(new Set());
  const preloadedImageUrlsRef = useRef<Set<string>>(new Set());
  const preloadedImageElementsRef = useRef<Map<string, HTMLImageElement>>(
    new Map()
  );
  const preloadedZoomBlobUrlByProxyRef = useRef<Map<string, string>>(new Map());
  const preloadingZoomProxyUrlsRef = useRef<Set<string>>(new Set());
  const [, forceZoomPreviewRefresh] = useState(0);
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

  const loadBulkJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/bulk-jobs", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      const items = (payload?.items ?? []) as BulkJob[];
      setBulkJobs(items);
      const running = items.find((entry) => entry.status === "running");
      const queued = items.find((entry) => entry.status === "queued");
      setJob(running ?? queued ?? null);
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
      setQueuePreviewByFile(() => {
        const next: Record<string, ExtractorPreviewItem[]> = {};
        nextItems.forEach((item) => {
          const deck = Array.isArray(item.deckItems)
            ? item.deckItems.filter((entry) => Boolean(entry?.imageUrl)).slice(0, 5)
            : [];
          next[item.name] = deck as ExtractorPreviewItem[];
        });
        return next;
      });
      setQueuePreviewLoadingByFile(() => {
        const next: Record<string, boolean> = {};
        nextItems.forEach((item) => {
          next[item.name] = false;
        });
        return next;
      });
      setQueueKeywordsByFile(() => {
        const next: Record<string, string> = {};
        nextItems.forEach((item) => {
          const cached = typeof item.keywordLabel === "string" ? item.keywordLabel.trim() : "";
          next[item.name] = cached;
        });
        return next;
      });
      setQueueKeywordItemsByFile(() => {
        const next: Record<string, string[]> = {};
        nextItems.forEach((item) => {
          next[item.name] = normalizeQueueKeywordItems(
            item.keywordItems,
            item.keywordLabel
          );
        });
        return next;
      });
      setQueueKeywordsLoadingByFile((prev) => {
        const next: Record<string, boolean> = {};
        nextItems.forEach((item) => {
          const cached = Boolean(
            item.keywordCached &&
              typeof item.keywordLabel === "string" &&
              item.keywordLabel.trim()
          );
          next[item.name] = cached ? false : Boolean(prev[item.name]);
        });
        return next;
      });
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
    loadBulkJobs();
  }, [loadBulkJobs]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadBulkJobs();
    }, 3000);
    return () => {
      clearInterval(interval);
    };
  }, [loadBulkJobs]);

  const tabs = useMemo(() => {
    const workerCount = job?.workerCount ?? 1;
    return ["parallel", ...Array.from({ length: workerCount }, (_, i) => `w${i + 1}`)];
  }, [job?.workerCount]);

  useEffect(() => {
    if (job) return;
    setLogs({});
    setActiveTab("parallel");
  }, [job]);

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

  const productionQueueFiles = useMemo(() => extractorFiles, [extractorFiles]);

  const latestJobByInputName = useMemo(() => {
    const map = new Map<string, BulkJob>();
    for (const entry of bulkJobs) {
      if (!entry?.inputName) continue;
      if (!map.has(entry.inputName)) {
        map.set(entry.inputName, entry);
      }
    }
    return map;
  }, [bulkJobs]);

  const chromeExtractorFiles = useMemo(
    () => [] as ExtractorFileSummary[],
    []
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
    const pending = productionQueueFiles.filter(
      (entry) =>
        entry.deckItems === undefined &&
        !queuePreviewByFile[entry.name] &&
        !queuePreviewRequestRef.current.has(entry.name)
    );
    if (!pending.length) return () => void 0;

    pending.forEach((entry) => {
      queuePreviewRequestRef.current.add(entry.name);
      setQueuePreviewLoadingByFile((prev) => ({ ...prev, [entry.name]: true }));
    });

    const loadQueuePreviews = async () => {
      await Promise.allSettled(
        pending.map(async (entry) => {
          try {
            const response = await fetchWithTimeout(
              `/api/1688-extractor/files/${encodeURIComponent(entry.name)}`,
              { cache: "no-store" },
              15000
            );
            if (!response.ok) {
              throw new Error(`Preview request failed for ${entry.name}`);
            }
            const payload = (await response.json()) as ExtractorPreview;
            const items =
              (payload.items ?? payload.previewItems ?? []).filter((item) =>
                Boolean(item?.imageUrl)
              ) as ExtractorPreviewItem[];
            if (cancelled) return;
            setQueuePreviewByFile((prev) => ({ ...prev, [entry.name]: items }));
          } catch {
            if (cancelled) return;
            setQueuePreviewByFile((prev) => ({ ...prev, [entry.name]: [] }));
          } finally {
            queuePreviewRequestRef.current.delete(entry.name);
            if (!cancelled) {
              setQueuePreviewLoadingByFile((prev) => ({
                ...prev,
                [entry.name]: false,
              }));
            }
          }
        })
      );
    };

    void loadQueuePreviews();
    return () => {
      cancelled = true;
    };
  }, [productionQueueFiles, queuePreviewByFile]);

  useEffect(() => {
    let cancelled = false;
    const pending = productionQueueFiles.filter((entry) => {
      if (entry.keywordCached) return false;
      const existing = queueKeywordsByFile[entry.name];
      const hasLabel = typeof existing === "string" && existing.trim().length > 0;
      return !hasLabel && !queueKeywordRequestRef.current.has(entry.name);
    });
    if (!pending.length) return () => void 0;

    pending.forEach((entry) => {
      queueKeywordRequestRef.current.add(entry.name);
      setQueueKeywordsLoadingByFile((prev) => ({ ...prev, [entry.name]: true }));
    });

    const loadQueueKeywords = async () => {
      await Promise.allSettled(
        pending.map(async (entry) => {
          try {
            const response = await fetchWithTimeout(
              `/api/1688-extractor/files/${encodeURIComponent(entry.name)}/keywords`,
              { cache: "no-store" },
              25000
            );
            if (!response.ok) {
              throw new Error(`Keyword request failed for ${entry.name}`);
            }
            const payload = (await response.json()) as QueueKeywordPayload;
            const label =
              typeof payload?.label === "string" ? payload.label.trim() : "";
            const keywordItems = normalizeQueueKeywordItems(payload?.keywords, label);
            if (cancelled) return;
            setQueueKeywordsByFile((prev) => ({ ...prev, [entry.name]: label }));
            setQueueKeywordItemsByFile((prev) => ({
              ...prev,
              [entry.name]: keywordItems,
            }));
          } catch {
            if (cancelled) return;
            setQueueKeywordsByFile((prev) => ({ ...prev, [entry.name]: "" }));
            setQueueKeywordItemsByFile((prev) => ({ ...prev, [entry.name]: [] }));
          } finally {
            queueKeywordRequestRef.current.delete(entry.name);
            if (!cancelled) {
              setQueueKeywordsLoadingByFile((prev) => ({
                ...prev,
                [entry.name]: false,
              }));
            }
          }
        })
      );
    };

    void loadQueueKeywords();
    return () => {
      cancelled = true;
    };
  }, [productionQueueFiles, queueKeywordsByFile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const thumbUrls: string[] = [];
    const zoomUrls: string[] = [];
    productionQueueFiles.forEach((entry) => {
      const deckItems = (queuePreviewByFile[entry.name] ?? []).slice(0, 5);
      deckItems.forEach((item) => {
        const thumbUrl = toImageProxyUrl(item.imageUrl, { width: 75, height: 75 });
        const zoomUrl = toImageProxyUrl(item.imageUrl, { width: 300, height: 300 });
        if (thumbUrl) thumbUrls.push(thumbUrl);
        if (zoomUrl) zoomUrls.push(zoomUrl);
      });
    });

    thumbUrls.forEach((url) => {
      if (preloadedImageUrlsRef.current.has(url)) return;
      preloadedImageUrlsRef.current.add(url);
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      preloadedImageElementsRef.current.set(url, img);
    });

    const missingZoom = zoomUrls.filter(
      (url) =>
        !preloadedZoomBlobUrlByProxyRef.current.has(url) &&
        !preloadingZoomProxyUrlsRef.current.has(url)
    );
    if (!missingZoom.length) return;

    let cancelled = false;
    missingZoom.forEach((url) => preloadingZoomProxyUrlsRef.current.add(url));

    const run = async () => {
      let changed = false;
      await Promise.allSettled(
        missingZoom.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "force-cache" });
            if (!response.ok) return;
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            preloadedZoomBlobUrlByProxyRef.current.set(url, objectUrl);
            const img = new Image();
            img.decoding = "async";
            img.src = objectUrl;
            preloadedImageElementsRef.current.set(objectUrl, img);
            changed = true;
          } catch {
            // best-effort preloading
          } finally {
            preloadingZoomProxyUrlsRef.current.delete(url);
          }
        })
      );
      if (!cancelled && changed) {
        forceZoomPreviewRefresh((prev) => prev + 1);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [productionQueueFiles, queuePreviewByFile, forceZoomPreviewRefresh]);

  useEffect(() => {
    return () => {
      preloadedZoomBlobUrlByProxyRef.current.forEach((objectUrl) => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore cleanup errors
        }
      });
      preloadedZoomBlobUrlByProxyRef.current.clear();
      preloadedImageElementsRef.current.clear();
    };
  }, []);

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

  const selectedProductionNames = useMemo(
    () =>
      productionQueueFiles
        .filter((entry) => selectedExtractorFiles.has(entry.name))
        .map((entry) => entry.name),
    [productionQueueFiles, selectedExtractorFiles]
  );

  const allProductionSelected = useMemo(
    () =>
      productionQueueFiles.length > 0 &&
      productionQueueFiles.every((entry) => selectedExtractorFiles.has(entry.name)),
    [productionQueueFiles, selectedExtractorFiles]
  );

  const someProductionSelected = useMemo(
    () =>
      productionQueueFiles.some((entry) => selectedExtractorFiles.has(entry.name)),
    [productionQueueFiles, selectedExtractorFiles]
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

  const toggleSelectAllProduction = useCallback(() => {
    setSelectedExtractorFiles((prev) => {
      const next = new Set(prev);
      if (allProductionSelected) {
        productionQueueFiles.forEach((entry) => next.delete(entry.name));
      } else {
        productionQueueFiles.forEach((entry) => next.add(entry.name));
      }
      return next;
    });
  }, [allProductionSelected, productionQueueFiles]);

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

  const handleClickImportJson = () => {
    importFileInputRef.current?.click();
  };

  const handleImportJsonFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImportingJson(true);
    setExtractorError(null);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as unknown;
      const fallbackName = file.name.replace(/\.json$/i, "").trim();
      let payload: Record<string, unknown>;
      if (Array.isArray(parsed)) {
        payload = { items: parsed, filenameBase: fallbackName };
      } else if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const items =
          Array.isArray(record.items)
            ? record.items
            : Array.isArray(record.urls)
            ? record.urls
            : Array.isArray(record.data)
            ? record.data
            : Array.isArray(record.products)
            ? record.products
            : Array.isArray(record.results)
            ? record.results
            : null;
        if (!items) {
          throw new Error("JSON must contain an items array.");
        }
        payload = { ...record, items };
        const hasName = Boolean(
          String(record.filenameBase ?? record.filename ?? record.name ?? "").trim()
        );
        if (!hasName) {
          payload.filenameBase = fallbackName;
        }
      } else {
        throw new Error("Invalid JSON structure.");
      }

      const response = await fetch("/api/1688-extractor/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to import JSON file.");
      }
      await Promise.all([loadExtractorFiles(), loadBulkJobs()]);
    } catch (err) {
      const message = (err as Error).message || "Unable to import JSON file.";
      setExtractorError(message);
    } finally {
      setIsImportingJson(false);
      event.target.value = "";
    }
  };

  const closeJsonEditor = () => {
    setJsonEditorTarget(null);
    setJsonEditorText("");
    setJsonEditorError(null);
    setJsonEditorLoading(false);
    setJsonEditorSaving(false);
  };

  const handleOpenJsonEditor = async (entry: ExtractorFileSummary) => {
    setJsonEditorTarget(entry);
    setJsonEditorText("");
    setJsonEditorError(null);
    setJsonEditorLoading(true);
    setJsonEditorSaving(false);
    try {
      const response = await fetch(
        `/api/1688-extractor/files/${encodeURIComponent(entry.name)}?mode=raw`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          String((payload as Record<string, unknown>)?.error || "Unable to load JSON file.")
        );
      }
      setJsonEditorText(
        typeof (payload as Record<string, unknown>)?.text === "string"
          ? String((payload as Record<string, unknown>).text)
          : ""
      );
    } catch (err) {
      setJsonEditorError((err as Error).message || "Unable to load JSON file.");
    } finally {
      setJsonEditorLoading(false);
    }
  };

  const handleSaveJsonEditor = async () => {
    if (!jsonEditorTarget) return;
    const text = jsonEditorText.trim();
    if (!text) {
      setJsonEditorError("JSON content is empty.");
      return;
    }
    try {
      JSON.parse(text);
    } catch {
      setJsonEditorError("Invalid JSON content.");
      return;
    }
    setJsonEditorSaving(true);
    setJsonEditorError(null);
    try {
      const response = await fetch(
        `/api/1688-extractor/files/${encodeURIComponent(jsonEditorTarget.name)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          String((payload as Record<string, unknown>)?.error || "Unable to save JSON file.")
        );
      }
      closeJsonEditor();
      if (preview?.name === jsonEditorTarget.name) {
        setPreview(null);
        setPreviewRemovedIndexes(new Set());
        setPreviewVariantUpdates({});
        setPreviewVariantTarget(null);
        setPreviewVariantSelection(new Set());
      }
      await loadExtractorFiles();
    } catch (err) {
      setJsonEditorError((err as Error).message || "Unable to save JSON file.");
    } finally {
      setJsonEditorSaving(false);
    }
  };

  const closePreviewVariantDialog = () => {
    setPreviewVariantTarget(null);
    setPreviewVariantSelection(new Set());
  };

  const handleOpenPreviewVariantDialog = (item: ExtractorPreviewItem) => {
    const variants = Array.isArray(item.variants) ? item.variants : [];
    const baseSelectedIndexes = normalizeVariantComboIndexes(
      variants.map((variant) => Number(variant.comboIndex))
    );
    setPreviewVariantTarget({
      itemIndex: item.index,
      title: item.titleEn || item.titleZh || item.title || `Product #${item.index + 1}`,
      variants,
      baseSelectedIndexes,
    });
    setPreviewVariantSelection(new Set(baseSelectedIndexes));
  };

  const handleApplyPreviewVariantDialog = () => {
    if (!previewVariantTarget) return;
    const selectedIndexes = normalizeVariantComboIndexes(
      Array.from(previewVariantSelection.values())
    );
    const selectedSet = new Set(selectedIndexes);
    const nextVariants = previewVariantTarget.variants.filter((variant) =>
      selectedSet.has(variant.comboIndex)
    );

    setPreview((current) => {
      if (!current) return current;
      const nextItems = current.items.map((item) => {
        if (item.index !== previewVariantTarget.itemIndex) return item;
        return {
          ...item,
          variants: nextVariants,
          variantCount: nextVariants.length,
        };
      });
      return { ...current, items: nextItems };
    });

    setPreviewVariantUpdates((prev) => {
      const next = { ...prev };
      if (hasSameIndexes(selectedIndexes, previewVariantTarget.baseSelectedIndexes)) {
        delete next[previewVariantTarget.itemIndex];
      } else {
        next[previewVariantTarget.itemIndex] = selectedIndexes;
      }
      return next;
    });

    closePreviewVariantDialog();
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
    setPreviewVariantUpdates({});
    closePreviewVariantDialog();
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
      ).map((item, rowIndex) => {
        const rawVariants = Array.isArray((item as Record<string, unknown>)?.variants)
          ? ((item as Record<string, unknown>).variants as unknown[])
          : [];
        const variants = rawVariants
          .map((rawVariant, variantIndex) => {
            const variant =
              rawVariant && typeof rawVariant === "object"
                ? (rawVariant as Record<string, unknown>)
                : {};
            const comboIndex = Number(variant.comboIndex);
            const resolvedComboIndex =
              Number.isInteger(comboIndex) && comboIndex >= 0
                ? comboIndex
                : variantIndex;
            return {
              comboIndex: resolvedComboIndex,
              labelZh:
                typeof variant.labelZh === "string" ? variant.labelZh.trim() : "",
              labelEn:
                typeof variant.labelEn === "string" ? variant.labelEn.trim() : "",
              labelRaw:
                typeof variant.labelRaw === "string" ? variant.labelRaw.trim() : "",
              imageUrl:
                typeof variant.imageUrl === "string" && variant.imageUrl.trim()
                  ? variant.imageUrl.trim()
                  : null,
              priceText:
                typeof variant.priceText === "string" ? variant.priceText.trim() : "",
              weightText:
                typeof variant.weightText === "string"
                  ? variant.weightText.trim()
                  : "",
            } as ExtractorPreviewVariant;
          })
          .filter(
            (variant) =>
              variant.labelZh ||
              variant.labelEn ||
              variant.labelRaw ||
              variant.imageUrl ||
              variant.priceText ||
              variant.weightText
          );
        const fallbackVariantCount = Number(
          (item as Record<string, unknown>)?.variantCount
        );
        return {
          ...item,
          index:
            Number.isInteger(Number(item?.index)) && Number(item.index) >= 0
              ? Number(item.index)
              : rowIndex,
          variantCount:
            variants.length > 0
              ? variants.length
              : Number.isFinite(fallbackVariantCount) && fallbackVariantCount > 0
              ? Math.round(fallbackVariantCount)
              : 0,
          variants,
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
        };
      }) as ExtractorPreviewItem[];
      setPreview({ ...payload, items });
    } catch (err) {
      setPreviewError((err as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSavePreview = async () => {
    if (!preview) return;
    const variantUpdates = Object.entries(previewVariantUpdates)
      .map(([indexRaw, selectedComboIndexes]) => ({
        index: Number(indexRaw),
        selectedComboIndexes: normalizeVariantComboIndexes(
          Array.isArray(selectedComboIndexes) ? selectedComboIndexes : []
        ),
      }))
      .filter(
        (row) =>
          Number.isInteger(row.index) &&
          row.index >= 0 &&
          Array.isArray(row.selectedComboIndexes)
      );
    if (previewRemovedIndexes.size === 0 && variantUpdates.length === 0) {
      setPreview(null);
      setPreviewRemovedIndexes(new Set());
      setPreviewVariantUpdates({});
      closePreviewVariantDialog();
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
            variantUpdates,
          }),
        }
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to save changes.");
      }
      setPreview(null);
      setPreviewRemovedIndexes(new Set());
      setPreviewVariantUpdates({});
      closePreviewVariantDialog();
      await loadExtractorFiles();
    } catch (err) {
      setPreviewError((err as Error).message);
    } finally {
      setPreviewSaving(false);
    }
  };

  const handleDeleteSelectedExtractors = async () => {
    if (!selectedProductionNames.length) return;
    setIsDeletingSelected(true);
    setExtractorError(null);
    try {
      const settled = await Promise.allSettled(
        selectedProductionNames.map(async (name) => {
          const response = await fetch(
            `/api/1688-extractor/files/${encodeURIComponent(name)}`,
            { method: "DELETE" }
          );
          if (!response.ok) {
            const message = await response.text();
            throw new Error(`${name}: ${message || "Unable to delete file."}`);
          }
          return name;
        })
      );

      const deletedNames = settled
        .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
        .map((result) => result.value);
      const failedMessages = settled
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => (result.reason as Error)?.message || String(result.reason));

      if (deletedNames.length) {
        setSelectedExtractorFiles((prev) => {
          const next = new Set(prev);
          deletedNames.forEach((name) => next.delete(name));
          return next;
        });
        if (preview && deletedNames.includes(preview.name)) {
          setPreview(null);
          setPreviewRemovedIndexes(new Set());
          setPreviewVariantUpdates({});
          closePreviewVariantDialog();
        }
        if (jsonEditorTarget && deletedNames.includes(jsonEditorTarget.name)) {
          closeJsonEditor();
        }
        await loadExtractorFiles();
      }

      if (failedMessages.length) {
        setExtractorError(failedMessages.join(" | "));
      }
    } catch (err) {
      setExtractorError((err as Error).message || "Unable to delete selected files.");
    } finally {
      setIsDeletingSelected(false);
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
        setPreviewRemovedIndexes(new Set());
        setPreviewVariantUpdates({});
        closePreviewVariantDialog();
      }
      if (jsonEditorTarget?.name === name) {
        closeJsonEditor();
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
    setExtractorError(null);
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
      await loadBulkJobs();
    } catch (err) {
      setExtractorError((err as Error).message);
    } finally {
      setExtractorLoadingName(null);
    }
  };

  const handleStopBatch = async (name: string, jobId: string) => {
    setExtractorLoadingName(name);
    setExtractorError(null);
    try {
      const response = await fetch(`/api/bulk-jobs/${encodeURIComponent(jobId)}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to stop batch.");
      }
      const payload = await response.json();
      if (payload?.job) {
        setJob(payload.job as BulkJob);
      }
      await loadBulkJobs();
    } catch (err) {
      const message = (err as Error).message || "Unable to stop batch.";
      setExtractorError(message);
    } finally {
      setExtractorLoadingName(null);
    }
  };

  const handleRemoveBatchData = async (name: string, jobId: string) => {
    setExtractorLoadingName(name);
    setExtractorError(null);
    try {
      const response = await fetch(`/api/bulk-jobs/${encodeURIComponent(jobId)}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to remove batch data.");
      }
      const payload = await response.json();
      if (payload?.job) {
        setJob(payload.job as BulkJob);
      }
      await loadBulkJobs();
    } catch (err) {
      const message = (err as Error).message || "Unable to remove batch data.";
      setExtractorError(message);
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

  return (
    <div className={styles.page}>
      <Card className={styles.chromeCard}>
        <div className={styles.chromeHeaderRow}>
          <Text size={500} weight="semibold">
            {t("bulkProcessing.queueIncoming.title")}
          </Text>
          <div className={styles.chromeHeaderActions}>
            <Button
              appearance="primary"
              size="small"
              onClick={handleClickImportJson}
              disabled={isImportingJson || isDeletingSelected}
            >
              {isImportingJson ? <Spinner size="tiny" /> : "Import JSON File"}
            </Button>
            <Button
              appearance="outline"
              size="small"
              onClick={() => void handleDeleteSelectedExtractors()}
              disabled={isDeletingSelected || selectedProductionNames.length === 0}
            >
              {isDeletingSelected ? <Spinner size="tiny" /> : "Delete"}
            </Button>
            <Button
              appearance="outline"
              size="small"
              onClick={handleOpenMergeDialog}
              disabled={
                isMerging || isDeletingSelected || selectedProductionNames.length < 2
              }
            >
              Merge
            </Button>
          </div>
        </div>
        <input
          ref={importFileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={handleImportJsonFile}
        />
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
                <TableHeaderCell className={styles.chromeColSource}>
                  Source
                </TableHeaderCell>
                <TableHeaderCell className={styles.chromeColProducts}>
                  {t("bulkProcessing.chrome.products")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.chromeColCreated}>
                  {t("bulkProcessing.chrome.received")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.chromeColJson}>
                  {t("bulkProcessing.chrome.file")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.chromeColActions}>
                  {t("bulkProcessing.chrome.actions")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.chromeColRowSelect}>
                  <Checkbox
                    checked={
                      allProductionSelected
                        ? true
                        : someProductionSelected
                        ? "mixed"
                        : false
                    }
                    onChange={toggleSelectAllProduction}
                    aria-label={t("common.selectAll")}
                  />
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productionQueueFiles.map((entry) => {
                const rowJob = latestJobByInputName.get(entry.name) ?? null;
                const isRunningBatch =
                  rowJob?.status === "running" || rowJob?.status === "queued";
                const isBatchComplete = rowJob?.status === "completed";
                const isRowBusy = extractorLoadingName === entry.name;
                return (
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
                      return (
                        <div className={styles.queueDeckWrap}>
                          {deckItems.map((item, index) => {
                            const thumbUrl = toImageProxyUrl(item.imageUrl, {
                              width: 75,
                              height: 75,
                            });
                            const hoverUrl = toImageProxyUrl(item.imageUrl, {
                              width: 300,
                              height: 300,
                            });
                            if (!thumbUrl || !hoverUrl) return null;
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
                                    proxyUrl: hoverUrl,
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
                                  src={thumbUrl}
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
                    {(() => {
                      const label = queueKeywordsByFile[entry.name] ?? "";
                      const keywordItems =
                        queueKeywordItemsByFile[entry.name] ??
                        normalizeQueueKeywordItems(undefined, label);

                      return (
                        <div className={styles.queueKeywordsWrap}>
                          {queueKeywordsLoadingByFile[entry.name] ? (
                            <Text size={200} className={styles.queueKeywordsLoading}>
                              Building batch content...
                            </Text>
                          ) : keywordItems.length > 0 ? (
                            <div
                              className={styles.queueKeywordBadgeList}
                              title={keywordItems.join(", ")}
                            >
                              {keywordItems.map((item, index) => {
                                const previewItem =
                                  (queuePreviewByFile[entry.name] ?? []).find(
                                    (candidate) => candidate.index === index
                                  ) ?? (queuePreviewByFile[entry.name] ?? [])[index];
                                const badgeHoverUrl = toImageProxyUrl(
                                  previewItem?.imageUrl,
                                  {
                                    width: 75,
                                    height: 75,
                                  }
                                );
                                return (
                                  <span
                                    key={`${entry.name}-keyword-${index}`}
                                    className={styles.queueKeywordBadge}
                                    onMouseEnter={(ev) => {
                                      if (!badgeHoverUrl) return;
                                      setQueueKeywordHoverPreview({
                                        fileName: entry.name,
                                        index,
                                        proxyUrl: badgeHoverUrl,
                                        x: ev.clientX,
                                        y: ev.clientY,
                                      });
                                    }}
                                    onMouseMove={(ev) => {
                                      setQueueKeywordHoverPreview((prev) => {
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
                                      setQueueKeywordHoverPreview((prev) => {
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
                                    {item}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <Text size={300} className={styles.queueKeywordsMain}>
                              -
                            </Text>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className={styles.chromeColSource}>
                    <Text size={200} color="neutral">
                      {getIncomingSourceLabel(entry.name)}
                    </Text>
                  </TableCell>
                  <TableCell className={styles.chromeColProducts}>
                    <Button
                      appearance="outline"
                      size="small"
                      className={styles.chromeViewProductsButton}
                      onClick={() => void handlePreview(entry)}
                    >
                      View Products ({entry.productCount || entry.urlCount || 0})
                    </Button>
                  </TableCell>
                  <TableCell className={styles.chromeColCreated}>
                    {formatDateTime(entry.receivedAt)}
                  </TableCell>
                  <TableCell className={styles.chromeColJson}>
                    <Button
                      appearance="primary"
                      size="small"
                      onClick={() => void handleOpenJsonEditor(entry)}
                    >
                      JSON file
                    </Button>
                  </TableCell>
                  <TableCell className={styles.chromeActionsCell}>
                    <div className={styles.chromeActions}>
                      <Button
                        appearance={
                          isBatchComplete || isRunningBatch ? "outline" : "primary"
                        }
                        className={
                          isBatchComplete
                            ? styles.completedBatchButton
                            : isRunningBatch
                            ? styles.assignedButton
                            : undefined
                        }
                        onClick={() => handleLoadExtractor(entry.name)}
                        disabled={isRowBusy || isBatchComplete || isRunningBatch}
                        size="small"
                      >
                        {isRowBusy && !isBatchComplete && !isRunningBatch ? (
                          <Spinner size="tiny" />
                        ) : isBatchComplete ? (
                          "Batch Complete"
                        ) : isRunningBatch ? (
                          <>
                            <Spinner size="tiny" />
                            {" "}
                            Processing Batch
                          </>
                        ) : (
                          "Run this batch"
                        )}
                      </Button>
                      <Button
                        appearance="outline"
                        onClick={() => {
                          if (isRunningBatch && rowJob) {
                            void handleStopBatch(entry.name, rowJob.jobId);
                            return;
                          }
                          if (isBatchComplete && rowJob) {
                            void handleRemoveBatchData(entry.name, rowJob.jobId);
                            return;
                          }
                          void handleDeleteExtractor(entry.name);
                        }}
                        disabled={isRowBusy}
                        size="small"
                      >
                        {isRowBusy ? (
                          <Spinner size="tiny" />
                        ) : isRunningBatch ? (
                          "Stop Process"
                        ) : isBatchComplete ? (
                          "Remove Batch"
                        ) : (
                          t("bulkProcessing.chrome.delete")
                        )}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className={styles.chromeColRowSelect}>
                    <Checkbox
                      checked={selectedExtractorFiles.has(entry.name)}
                      onChange={() => toggleSelectExtractor(entry.name)}
                      aria-label={t("common.selectItem", { item: entry.name })}
                      disabled={isDeletingSelected}
                    />
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </Card>

      {chromeExtractorFiles.length ? (
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
      ) : null}

      {job ? (
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
      ) : null}

      {deckHoverPreview ? (
        <div
          className={styles.queueZoomPreview}
          style={{
            left: `${deckHoverPreview.x + 24}px`,
            top: `${Math.max(16, deckHoverPreview.y - 150)}px`,
          }}
        >
          <img
            src={
              preloadedZoomBlobUrlByProxyRef.current.get(
                deckHoverPreview.proxyUrl
              ) ?? deckHoverPreview.proxyUrl
            }
            alt=""
            className={styles.queueZoomImage}
          />
        </div>
      ) : null}

      {queueKeywordHoverPreview ? (
        <div
          className={styles.queueKeywordHoverPreview}
          style={{
            left: `${queueKeywordHoverPreview.x + 16}px`,
            top: `${Math.max(16, queueKeywordHoverPreview.y - 38)}px`,
          }}
        >
          <img
            src={queueKeywordHoverPreview.proxyUrl}
            alt=""
            className={styles.queueKeywordHoverImage}
          />
        </div>
      ) : null}

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(_, data) => {
          if (!data.open) {
            setPreview(null);
            setPreviewRemovedIndexes(new Set());
            setPreviewVariantUpdates({});
            closePreviewVariantDialog();
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
                        <TableHeaderCell className={styles.previewColVariants}>
                          Variants
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
                                      src={toImageProxyUrl(item.imageUrl, {
                                        width: 75,
                                        height: 75,
                                      })}
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
                            <TableCell className={styles.previewCell}>
                              <Button
                                appearance="outline"
                                size="small"
                                className={styles.previewWhiteButton}
                                onClick={() => handleOpenPreviewVariantDialog(item)}
                              >
                                Variants ({item.variantCount || 0})
                              </Button>
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
                                      setPreviewVariantUpdates((prev) => {
                                        if (!Object.prototype.hasOwnProperty.call(prev, item.index)) {
                                          return prev;
                                        }
                                        const next = { ...prev };
                                        delete next[item.index];
                                        return next;
                                      });
                                      if (previewVariantTarget?.itemIndex === item.index) {
                                        closePreviewVariantDialog();
                                      }
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
                disabled={
                  previewSaving ||
                  (previewRemovedIndexes.size === 0 &&
                    Object.keys(previewVariantUpdates).length === 0)
                }
              >
                {previewSaving ? <Spinner size="tiny" /> : t("common.save")}
              </Button>
              <Button
                appearance="outline"
                onClick={() => {
                  setPreview(null);
                  setPreviewRemovedIndexes(new Set());
                  setPreviewVariantUpdates({});
                  closePreviewVariantDialog();
                }}
              >
                {t("common.close")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={Boolean(previewVariantTarget)}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closePreviewVariantDialog();
          }
        }}
      >
        <DialogSurface className={styles.variantsDialog}>
          <DialogBody className={styles.variantsDialogBody}>
            <DialogTitle>Variants</DialogTitle>
            {previewVariantTarget ? (
              <>
                <div className={styles.variantsMeta}>
                  <Text size={200} className={styles.variantsCount}>
                    {previewVariantTarget.title || `Product #${previewVariantTarget.itemIndex + 1}`}
                  </Text>
                  <div className={styles.variantsMetaActions}>
                    <Button
                      appearance="outline"
                      size="small"
                      onClick={() =>
                        setPreviewVariantSelection(
                          new Set(
                            previewVariantTarget.variants.map((variant) => variant.comboIndex)
                          )
                        )
                      }
                      disabled={previewVariantTarget.variants.length === 0}
                    >
                      Select all
                    </Button>
                    <Button
                      appearance="outline"
                      size="small"
                      onClick={() => setPreviewVariantSelection(new Set())}
                      disabled={previewVariantTarget.variants.length === 0}
                    >
                      Clear
                    </Button>
                    <Text size={200} className={styles.variantsCount}>
                      Keep {previewVariantSelection.size}
                    </Text>
                  </div>
                </div>
                <div className={styles.variantsTableWrap}>
                  <Table size="small" className={styles.variantsTable}>
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell className={styles.variantsColPick}>
                          Keep
                        </TableHeaderCell>
                        <TableHeaderCell className={styles.variantsColImage}>
                          Image
                        </TableHeaderCell>
                        <TableHeaderCell className={styles.variantsColLabel}>
                          Variant
                        </TableHeaderCell>
                        <TableHeaderCell className={styles.variantsColPrice}>
                          Price
                        </TableHeaderCell>
                        <TableHeaderCell className={styles.variantsColWeight}>
                          Weight
                        </TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewVariantTarget.variants.map((variant, index) => {
                        const checked = previewVariantSelection.has(variant.comboIndex);
                        const variantLabel =
                          variant.labelZh || variant.labelEn || variant.labelRaw || "-";
                        return (
                          <TableRow key={`${variant.comboIndex}-${index}`}>
                            <TableCell>
                              <Checkbox
                                checked={checked}
                                onChange={(_, data) => {
                                  setPreviewVariantSelection((prev) => {
                                    const next = new Set(prev);
                                    if (data.checked) {
                                      next.add(variant.comboIndex);
                                    } else {
                                      next.delete(variant.comboIndex);
                                    }
                                    return next;
                                  });
                                }}
                                aria-label={`Keep variant ${variantLabel}`}
                              />
                            </TableCell>
                            <TableCell>
                              {variant.imageUrl ? (
                                <img
                                  src={toImageProxyUrl(variant.imageUrl, {
                                    width: 56,
                                    height: 56,
                                  })}
                                  alt=""
                                  className={styles.variantsThumb}
                                />
                              ) : (
                                <div className={styles.variantsThumbPlaceholder}>-</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className={styles.variantsLabelWrap}>
                                <Text className={styles.variantsLabelZh}>
                                  {variant.labelZh || variantLabel}
                                </Text>
                                {variant.labelEn &&
                                variant.labelEn !== variant.labelZh ? (
                                  <Text className={styles.variantsLabelEn}>
                                    {variant.labelEn}
                                  </Text>
                                ) : null}
                                {variant.labelRaw &&
                                variant.labelRaw !== variant.labelZh &&
                                variant.labelRaw !== variant.labelEn ? (
                                  <Text className={styles.variantsLabelRaw}>
                                    {variant.labelRaw}
                                  </Text>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Text className={styles.variantsValue}>
                                {variant.priceText || "-"}
                              </Text>
                            </TableCell>
                            <TableCell>
                              <Text className={styles.variantsValue}>
                                {variant.weightText || "-"}
                              </Text>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : null}
            <DialogActions>
              <Button appearance="primary" onClick={handleApplyPreviewVariantDialog}>
                Apply
              </Button>
              <Button appearance="outline" onClick={closePreviewVariantDialog}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={Boolean(jsonEditorTarget)}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closeJsonEditor();
          }
        }}
      >
        <DialogSurface className={styles.jsonDialog}>
          <DialogBody className={styles.jsonDialogBody}>
            <DialogTitle>
              {jsonEditorTarget ? `JSON file: ${jsonEditorTarget.name}` : "JSON file"}
            </DialogTitle>
            <Text size={200} className={styles.jsonMeta}>
              Edit and save raw JSON for this incoming batch.
            </Text>
            {jsonEditorError ? (
              <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
                {jsonEditorError}
              </Text>
            ) : null}
            {jsonEditorLoading ? (
              <Spinner />
            ) : (
              <div className={styles.jsonEditorWrap}>
                <textarea
                  value={jsonEditorText}
                  onChange={(event) => setJsonEditorText(event.target.value)}
                  className={styles.jsonEditorTextarea}
                />
              </div>
            )}
            <DialogActions>
              <Button
                appearance="primary"
                onClick={handleSaveJsonEditor}
                disabled={jsonEditorLoading || jsonEditorSaving}
              >
                {jsonEditorSaving ? <Spinner size="tiny" /> : t("common.save")}
              </Button>
              <Button appearance="outline" onClick={closeJsonEditor}>
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
