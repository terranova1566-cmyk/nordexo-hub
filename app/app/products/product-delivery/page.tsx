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
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
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
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatCurrency, formatDateTime } from "@/lib/format";

type DeliveryList = {
  id: string;
  name: string;
  partner?: string | null;
  created_at: string | null;
  item_count: number;
  letsdeal_status?: {
    total: number;
    completed: number;
    queued: number;
    running: number;
    failed: number;
    pending: number;
    ready: boolean;
  } | null;
  preview_images?: string[];
  preview_items?: DeliveryListMediaItem[];
  batch_content?: DeliveryListMediaItem[];
};

type DeliveryListPreviewItem = {
  product_id: string;
  spu: string | null;
  title: string;
  image_url: string | null;
  price_min: number | null;
  price_max: number | null;
};

type DeliveryListMediaItem = {
  product_id: string;
  title: string | null;
  image_url: string | null;
  hover_image_url: string | null;
};

type DeckHoverPreview = {
  listId: string;
  index: number;
  src: string;
  x: number;
  y: number;
};

type QueueKeywordHoverPreview = {
  listId: string;
  index: number;
  src: string;
  x: number;
  y: number;
};

type ExportDataset = "partner" | "all" | "letsdeal";
type ImageExportMode = "all" | "original";
type DeliveryPartner = "digideal" | "letsdeal";

const DELIVERY_PARTNER_OPTIONS: Array<{ value: DeliveryPartner | "all"; label: string }> = [
  { value: "all", label: "All partners" },
  { value: "digideal", label: "DigiDeal.se" },
  { value: "letsdeal", label: "LetsDeal" },
];

const normalizeDeliveryPartner = (value: string | null | undefined): DeliveryPartner => {
  return String(value ?? "").trim().toLowerCase() === "letsdeal"
    ? "letsdeal"
    : "digideal";
};

const deliveryPartnerLabel = (value: string | null | undefined) =>
  normalizeDeliveryPartner(value) === "letsdeal" ? "LetsDeal" : "DigiDeal.se";

const useStyles = makeStyles({
  layout: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "12px",
    flexWrap: "wrap",
  },
  title: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightSemibold,
  },
  controlsBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    padding: "10px 12px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  controlsLeft: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  controlsRight: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    marginLeft: "auto",
  },
  controlsSearch: {
    width: "280px",
    minWidth: "220px",
  },
  controlsFilter: {
    width: "170px",
    minWidth: "150px",
  },
  tableCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
  },
  tableActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  },
  sellerCol: {
    width: "110px",
    minWidth: "110px",
  },
  imageExplorerCol: {
    width: "190px",
    minWidth: "190px",
  },
  batchContentCol: {
    minWidth: "240px",
    maxWidth: "320px",
  },
  titleCol: {
    maxWidth: "44ch",
  },
  dateCol: {
    width: "170px",
    minWidth: "170px",
  },
  itemsCol: {
    width: "76px",
    minWidth: "76px",
  },
  itemsBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "28px",
    height: "22px",
    paddingInline: "8px",
    borderRadius: "999px",
    backgroundColor: tokens.colorBrandBackgroundHover,
    color: tokens.colorNeutralForegroundOnBrand,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase200,
  },
  previewCol: {
    width: "92px",
    minWidth: "92px",
  },
  downloadsCol: {
    width: "228px",
    minWidth: "228px",
  },
  selectCol: {
    width: "56px",
    minWidth: "56px",
    maxWidth: "56px",
    textAlign: "right",
  },
  selectCheckboxWrap: {
    display: "flex",
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  selectCheckbox: {
    "& .fui-Checkbox__indicator": {
      backgroundColor: tokens.colorNeutralBackground1,
    },
    "& input:checked + .fui-Checkbox__indicator": {
      backgroundColor: tokens.colorBrandBackground,
      border: `1px solid ${tokens.colorBrandStroke1}`,
      color: tokens.colorNeutralForegroundOnBrand,
    },
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
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
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
  actionWhiteButton: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground1,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
    "&:active": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  downloadsActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  compactMenuPopover: {
    "& .fui-MenuList": {
      minWidth: "148px",
      paddingBlock: "2px",
    },
  },
  compactMenuItem: {
    minHeight: "28px",
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    paddingBlock: "4px",
    paddingInline: "10px",
  },
  menuButtonLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  },
  menuButtonChevron: {
    width: 0,
    height: 0,
    borderLeft: "4px solid transparent",
    borderRight: "4px solid transparent",
    borderTop: "5px solid currentColor",
    marginTop: "2px",
  },
  previewDialog: {
    maxWidth: "1080px",
    width: "min(1080px, 96vw)",
  },
  duplicateDialog: {
    maxWidth: "520px",
    width: "min(520px, 96vw)",
  },
  previewBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  duplicateForm: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  dialogActionsEnd: {
    justifyContent: "flex-end",
  },
  previewMeta: {
    display: "flex",
    justifyContent: "flex-start",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
  },
  previewSearch: {
    width: "320px",
    maxWidth: "100%",
  },
  previewTableWrap: {
    maxHeight: "520px",
    overflow: "auto",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  previewImageCell: {
    width: "90px",
    minWidth: "90px",
  },
  previewSpuCell: {
    width: "130px",
    minWidth: "130px",
  },
  previewThumb: {
    width: "64px",
    height: "64px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  previewThumbImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  previewPriceCell: {
    width: "180px",
    minWidth: "180px",
  },
  previewActionCell: {
    width: "120px",
    minWidth: "120px",
  },
  previewRowCell: {
    paddingBlock: "8px",
    verticalAlign: "middle",
  },
  previewDeleteButton: {
    color: tokens.colorPaletteRedForeground1,
  },
  previewSaveButton: {
    backgroundColor: "#0b63b2",
    border: "1px solid #0b63b2",
    color: "#ffffff",
    "&:hover": {
      backgroundColor: "#09579b",
      border: "1px solid #09579b",
      color: "#ffffff",
    },
    "&:active": {
      backgroundColor: "#084d89",
      border: "1px solid #084d89",
      color: "#ffffff",
    },
    "&:disabled": {
      backgroundColor: tokens.colorNeutralBackground3,
      border: `1px solid ${tokens.colorNeutralStroke2}`,
      color: tokens.colorNeutralForeground3,
    },
  },
});

const extractErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = await response.json();
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    // ignore parse failures
  }
  try {
    const text = await response.text();
    if (text.trim()) return text.trim();
  } catch {
    // ignore parse failures
  }
  return fallback;
};

const triggerFileDownload = async (response: Response, fallbackFileName: string) => {
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const fileName = match?.[1] ?? fallbackFileName;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const formatPriceRange = (
  min: number | null,
  max: number | null,
  notAvailableLabel: string
) => {
  if (min === null && max === null) return notAvailableLabel;
  const start = min ?? max;
  const end = max ?? min;
  if (start === null || end === null) return notAvailableLabel;
  const startText = formatCurrency(start, "SEK") || notAvailableLabel;
  const endText = formatCurrency(end, "SEK") || notAvailableLabel;
  if (start === end) return startText;
  return `${startText} - ${endText}`;
};

export default function ProductDeliveryPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [lists, setLists] = useState<DeliveryList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listSearchInput, setListSearchInput] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [partnerFilter, setPartnerFilter] = useState<"all" | DeliveryPartner>("all");
  const [busyDownloads, setBusyDownloads] = useState<Set<string>>(new Set());
  const [deckHoverPreview, setDeckHoverPreview] = useState<DeckHoverPreview | null>(null);
  const [queueKeywordHoverPreview, setQueueKeywordHoverPreview] =
    useState<QueueKeywordHoverPreview | null>(null);
  const [previewList, setPreviewList] = useState<DeliveryList | null>(null);
  const [previewItems, setPreviewItems] = useState<DeliveryListPreviewItem[]>([]);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewDeletedProductIds, setPreviewDeletedProductIds] = useState<Set<string>>(new Set());
  const [isSavingPreview, setIsSavingPreview] = useState(false);
  const [duplicateSourceList, setDuplicateSourceList] = useState<DeliveryList | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState("");
  const [duplicatePartner, setDuplicatePartner] = useState("digideal");
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [isDuplicatingList, setIsDuplicatingList] = useState(false);
  const [selectedListIds, setSelectedListIds] = useState<Set<string>>(new Set());
  const [isApplyingAction, setIsApplyingAction] = useState(false);

  const loadLists = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (partnerFilter !== "all") {
        params.set("partner", partnerFilter);
      }
      if (listSearch) {
        params.set("q", listSearch);
      }
      const response = await fetch(
        `/api/product-delivery/digideal/lists${
          params.toString() ? `?${params.toString()}` : ""
        }`
      );
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, t("products.lists.error")));
      }
      const payload = await response.json();
      setLists(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [listSearch, partnerFilter, t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setListSearch(listSearchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [listSearchInput]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      try {
        const response = await fetch("/api/settings/profile", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (!isMounted) return;
        setIsAdminUser(Boolean(payload?.is_admin));
      } catch {
        // keep default partner visibility if profile lookup fails
      }
    };
    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setSelectedListIds((prev) => {
      if (prev.size === 0) return prev;
      const available = new Set(lists.map((list) => list.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (available.has(id)) {
          next.add(id);
        }
      });
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [lists]);

  const buildDownloadKey = (
    listId: string,
    mode: "excel" | "images",
    option: ExportDataset | ImageExportMode
  ) => `${listId}:${mode}:${option}`;

  const handleDownload = async (
    list: DeliveryList,
    options:
      | { mode: "excel"; dataset: ExportDataset }
      | { mode: "images"; imageMode: ImageExportMode }
  ) => {
    const option = options.mode === "excel" ? options.dataset : options.imageMode;
    const key = buildDownloadKey(list.id, options.mode, option);
    setBusyDownloads((prev) => new Set(prev).add(key));
    setError(null);
    try {
      const endpoint =
        options.mode === "excel" ? "/api/exports/digideal" : "/api/exports/digideal/images";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          options.mode === "excel"
            ? {
                listId: list.id,
                name: list.name,
                market: "SE",
                dataset: options.dataset,
              }
            : {
                listId: list.id,
                name: list.name,
                imageMode: options.imageMode,
              }
        ),
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, t("products.lists.exportError")));
      }
      const fallbackFileName =
        options.mode === "excel"
          ? options.dataset === "all"
            ? "digideal_delivery_complete_data.xlsx"
            : options.dataset === "letsdeal"
              ? "letsdeal_delivery_data.xlsx"
            : "digideal_delivery_partner_data.xlsx"
          : options.imageMode === "all"
            ? "digideal_delivery_images_full.zip"
            : "digideal_delivery_images_standard.zip";
      await triggerFileDownload(
        response,
        fallbackFileName
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyDownloads((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const loadPreviewItems = useCallback(
    async (listId: string) => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const params = new URLSearchParams({ listId });
        const response = await fetch(
          `/api/product-delivery/digideal/lists/items?${params.toString()}`
        );
        if (!response.ok) {
          throw new Error(await extractErrorMessage(response, t("products.error.load")));
        }
        const payload = await response.json();
        setPreviewItems(Array.isArray(payload?.items) ? payload.items : []);
      } catch (err) {
        setPreviewError((err as Error).message);
      } finally {
        setPreviewLoading(false);
      }
    },
    [t]
  );

  const openPreview = async (list: DeliveryList) => {
    setPreviewList(list);
    setPreviewItems([]);
    setPreviewSearch("");
    setPreviewDeletedProductIds(new Set());
    setPreviewError(null);
    await loadPreviewItems(list.id);
  };

  const closePreviewDialog = useCallback(() => {
    setPreviewList(null);
    setPreviewItems([]);
    setPreviewSearch("");
    setPreviewError(null);
    setPreviewLoading(false);
    setPreviewDeletedProductIds(new Set());
    setIsSavingPreview(false);
  }, []);

  const handleRemoveFromPreview = (productId: string) => {
    if (!productId || isSavingPreview) return;
    setPreviewItems((prev) => prev.filter((item) => item.product_id !== productId));
    setPreviewDeletedProductIds((prev) => {
      const next = new Set(prev);
      next.add(productId);
      return next;
    });
  };

  const handleSaveAndClosePreview = useCallback(async () => {
    if (!previewList || isSavingPreview) return;
    const deletedIds = Array.from(previewDeletedProductIds);
    if (deletedIds.length === 0) {
      closePreviewDialog();
      return;
    }

    setIsSavingPreview(true);
    setPreviewError(null);
    try {
      for (const productId of deletedIds) {
        const response = await fetch("/api/product-delivery/digideal/lists/items", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listId: previewList.id,
            productId,
          }),
        });
        if (!response.ok) {
          throw new Error(await extractErrorMessage(response, t("products.lists.deleteError")));
        }
      }
      await loadLists();
      closePreviewDialog();
    } catch (err) {
      setPreviewError((err as Error).message);
      setIsSavingPreview(false);
    }
  }, [closePreviewDialog, isSavingPreview, loadLists, previewDeletedProductIds, previewList, t]);

  const filteredPreviewItems = useMemo(() => {
    const query = previewSearch.trim().toLowerCase();
    if (!query) return previewItems;
    return previewItems.filter((item) =>
      String(item.title ?? "")
        .toLowerCase()
        .includes(query)
    );
  }, [previewItems, previewSearch]);

  const hasPreviewChanges = previewDeletedProductIds.size > 0;

  const previewSummary = useMemo(() => {
    if (!previewList) return "";
    const count = previewItems.length;
    const dateLabel = formatDateTime(previewList.created_at) || t("common.notAvailable");
    return `${count} / / ${dateLabel}`;
  }, [previewItems.length, previewList, t]);

  const previewTitle = useMemo(() => {
    if (!previewList) return t("digidealDelivery.preview.button");
    return `${t("digidealDelivery.preview.title")} - ${previewList.name}`;
  }, [previewList, t]);

  const previewPartnerLabel = previewList ? deliveryPartnerLabel(previewList.partner) : "";

  const previewSaveDisabled = isSavingPreview || !hasPreviewChanges;

  const previewSearchResultEmpty =
    !previewLoading && previewItems.length > 0 && filteredPreviewItems.length === 0;

  const previewDeleteDisabled = isSavingPreview;

  const previewDialogTitle = previewList
    ? `${previewTitle} (${previewPartnerLabel})`
    : previewTitle;

  const handleDeleteSelectedLists = useCallback(async () => {
    const listIds = Array.from(selectedListIds);
    if (listIds.length === 0 || isApplyingAction) return;
    setIsApplyingAction(true);
    setError(null);
    try {
      const response = await fetch("/api/product-delivery/digideal/lists", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listIds }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { deletedIds?: string[]; failedIds?: string[]; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string" && payload.error.trim()
            ? payload.error
            : t("products.lists.deleteError")
        );
      }

      const deletedIds = Array.isArray(payload?.deletedIds)
        ? payload.deletedIds
            .map((value) => String(value ?? "").trim())
            .filter(Boolean)
        : listIds;
      const deletedIdSet = new Set(deletedIds);

      setLists((prev) => prev.filter((list) => !deletedIdSet.has(list.id)));
      setSelectedListIds(new Set());

      if (previewList && deletedIdSet.has(previewList.id)) {
        closePreviewDialog();
      }

      const failedIds = Array.isArray(payload?.failedIds)
        ? payload.failedIds
            .map((value) => String(value ?? "").trim())
            .filter(Boolean)
        : [];
      if (failedIds.length > 0) {
        setError(t("products.lists.deleteError"));
        await loadLists();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsApplyingAction(false);
    }
  }, [selectedListIds, isApplyingAction, previewList, closePreviewDialog, loadLists, t]);

  const allSelected = lists.length > 0 && lists.every((list) => selectedListIds.has(list.id));
  const someSelected = lists.some((list) => selectedListIds.has(list.id));
  const selectAllState = allSelected ? true : someSelected ? "mixed" : false;
  const hasSelection = selectedListIds.size > 0;
  const selectedListForDuplicate = useMemo(() => {
    if (selectedListIds.size !== 1) return null;
    const [selectedId] = Array.from(selectedListIds);
    if (!selectedId) return null;
    return lists.find((list) => list.id === selectedId) ?? null;
  }, [lists, selectedListIds]);
  const titleColumnWidth = useMemo(() => {
    const widestTitleLength = lists.reduce((maxWidth, list) => {
      const currentLength = (list.name ?? "").trim().length;
      return Math.max(maxWidth, currentLength);
    }, 0);
    const widthCh = Math.max(22, Math.min(44, widestTitleLength + 2));
    return `${widthCh}ch`;
  }, [lists]);
  const duplicatePartnerLabel = deliveryPartnerLabel(duplicatePartner);

  const openDuplicateDialog = useCallback(() => {
    if (!selectedListForDuplicate) return;
    setDuplicateSourceList(selectedListForDuplicate);
    setDuplicateTitle(selectedListForDuplicate.name ?? "");
    setDuplicatePartner(normalizeDeliveryPartner(selectedListForDuplicate.partner));
    setDuplicateError(null);
  }, [selectedListForDuplicate]);

  const handleDuplicateList = useCallback(async () => {
    if (!duplicateSourceList || isDuplicatingList) return;
    const normalizedTitle = duplicateTitle.trim();
    if (!normalizedTitle) {
      setDuplicateError("Title is required.");
      return;
    }
    setDuplicateError(null);
    setError(null);
    setIsDuplicatingList(true);
    try {
      const response = await fetch("/api/product-delivery/digideal/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedTitle,
          sourceListId: duplicateSourceList.id,
          partner: duplicatePartner,
        }),
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, t("products.lists.error")));
      }
      await loadLists();
      setDuplicateSourceList(null);
      setDuplicateError(null);
      setDuplicateTitle("");
    } catch (err) {
      setDuplicateError((err as Error).message);
    } finally {
      setIsDuplicatingList(false);
    }
  }, [
    duplicatePartner,
    duplicateSourceList,
    duplicateTitle,
    isDuplicatingList,
    loadLists,
    t,
  ]);

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <Text className={styles.title}>{t("digidealDelivery.title")}</Text>
      </div>

      <div className={styles.controlsBar}>
        <div className={styles.controlsLeft}>
          <Input
            className={styles.controlsSearch}
            value={listSearchInput}
            onChange={(_, data) => setListSearchInput(data.value)}
            placeholder="Search SPU, SKU or product title"
          />
          <Dropdown
            className={styles.controlsFilter}
            value={
              DELIVERY_PARTNER_OPTIONS.find((option) => option.value === partnerFilter)?.label ??
              DELIVERY_PARTNER_OPTIONS[0].label
            }
            selectedOptions={[partnerFilter]}
            onOptionSelect={(_, data) => {
              const next =
                String(data.optionValue ?? "all").trim().toLowerCase() === "letsdeal"
                  ? "letsdeal"
                  : String(data.optionValue ?? "all").trim().toLowerCase() === "digideal"
                    ? "digideal"
                    : "all";
              setPartnerFilter(next);
            }}
          >
            {DELIVERY_PARTNER_OPTIONS.map((option) => (
              <Option key={option.value} value={option.value} text={option.label}>
                {option.label}
              </Option>
            ))}
          </Dropdown>
        </div>
        <div className={styles.controlsRight}>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button
                appearance={hasSelection ? "primary" : "outline"}
                disabled={!hasSelection || isApplyingAction}
              >
                {t("products.actions.label")}
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem
                  disabled={!selectedListForDuplicate || isApplyingAction || isDuplicatingList}
                  onClick={openDuplicateDialog}
                >
                  Duplicate
                </MenuItem>
                <MenuItem
                  disabled={!hasSelection || isApplyingAction}
                  onClick={() => {
                    void handleDeleteSelectedLists();
                  }}
                >
                  {t("common.delete")}
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
      </div>

      <Card className={styles.tableCard}>
        {error ? <MessageBar intent="error">{error}</MessageBar> : null}
        {isLoading ? (
          <Spinner label={t("products.loading")} />
        ) : lists.length === 0 ? (
          <Text>{t("digidealDelivery.table.empty")}</Text>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.imageExplorerCol}>
                  {t("digidealDelivery.table.imageExplorer")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.sellerCol}>Partner</TableHeaderCell>
                <TableHeaderCell
                  className={styles.titleCol}
                  style={{ width: titleColumnWidth, minWidth: titleColumnWidth }}
                >
                  {t("digidealDelivery.table.title")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.batchContentCol}>
                  {t("digidealDelivery.table.batchContent")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.dateCol}>
                  {t("digidealDelivery.table.createdAt")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.itemsCol}>
                  {t("digidealDelivery.table.itemCount")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.previewCol}>
                  {t("digidealDelivery.table.preview")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.downloadsCol}>
                  {t("digidealDelivery.table.downloads")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.selectCol}>
                  <div className={styles.selectCheckboxWrap}>
                    <Checkbox
                      aria-label={t("common.selectAll")}
                      checked={selectAllState}
                      disabled={isLoading || lists.length === 0}
                      className={styles.selectCheckbox}
                      onChange={(_, data) => {
                        if (data.checked === true) {
                          setSelectedListIds(new Set(lists.map((list) => list.id)));
                          return;
                        }
                        setSelectedListIds(new Set());
                      }}
                    />
                  </div>
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((list) => {
                const legacyDeckItems = (list.preview_images ?? []).map((imageUrl, index) => ({
                  product_id: `legacy-${list.id}-${index}`,
                  title: null,
                  image_url: imageUrl,
                  hover_image_url: imageUrl,
                }));
                const deckItems = (
                  list.preview_items && list.preview_items.length > 0
                    ? list.preview_items
                    : legacyDeckItems
                )
                  .filter((item) => Boolean(item.image_url))
                  .slice(0, 5);
                const batchContentItems = (list.batch_content ?? []).slice(0, 8);
                const excelAllKey = buildDownloadKey(list.id, "excel", "all");
                const excelPartnerKey = buildDownloadKey(list.id, "excel", "partner");
                const excelLetsdealKey = buildDownloadKey(list.id, "excel", "letsdeal");
                const imageAllKey = buildDownloadKey(list.id, "images", "all");
                const imageStandardKey = buildDownloadKey(list.id, "images", "original");
                const isLetsdealList = normalizeDeliveryPartner(list.partner) === "letsdeal";
                const letsdealReady = Boolean(list.letsdeal_status?.ready);
                const excelBusy =
                  busyDownloads.has(excelAllKey) ||
                  busyDownloads.has(excelPartnerKey) ||
                  busyDownloads.has(excelLetsdealKey);
                const imagesBusy =
                  busyDownloads.has(imageAllKey) || busyDownloads.has(imageStandardKey);
                return (
                  <TableRow key={list.id}>
                    <TableCell className={styles.imageExplorerCol}>
                      {deckItems.length === 0 ? (
                        <div className={styles.queueDeckPlaceholder}>
                          {t("common.notAvailable")}
                        </div>
                      ) : (
                        <div className={styles.queueDeckWrap}>
                          {deckItems.map((item, index) => {
                            const imageUrl = item.image_url;
                            if (!imageUrl) return null;
                            const hoverImageUrl = item.hover_image_url || imageUrl;
                            const isHovered =
                              deckHoverPreview?.listId === list.id &&
                              deckHoverPreview?.index === index;
                            return (
                              <div
                                key={`${list.id}-img-${index}`}
                                className={styles.queueDeckThumb}
                                style={{
                                  left: `${index * 20}px`,
                                  zIndex: isHovered ? 30 : index + 1,
                                }}
                                onMouseEnter={(ev) => {
                                  setDeckHoverPreview({
                                    listId: list.id,
                                    index,
                                    src: hoverImageUrl,
                                    x: ev.clientX,
                                    y: ev.clientY,
                                  });
                                }}
                                onMouseMove={(ev) => {
                                  setDeckHoverPreview((prev) => {
                                    if (!prev) return prev;
                                    if (prev.listId !== list.id || prev.index !== index) {
                                      return prev;
                                    }
                                    return { ...prev, x: ev.clientX, y: ev.clientY };
                                  });
                                }}
                                onMouseLeave={() => {
                                  setDeckHoverPreview((prev) => {
                                    if (!prev) return prev;
                                    if (prev.listId !== list.id || prev.index !== index) {
                                      return prev;
                                    }
                                    return null;
                                  });
                                }}
                              >
                                <img src={imageUrl} alt="" className={styles.queueDeckImage} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={styles.sellerCol}>
                      {deliveryPartnerLabel(list.partner)}
                    </TableCell>
                    <TableCell
                      className={styles.titleCol}
                      style={{ width: titleColumnWidth, minWidth: titleColumnWidth }}
                    >
                      {list.name || t("common.notAvailable")}
                    </TableCell>
                    <TableCell className={styles.batchContentCol}>
                      <div className={styles.queueKeywordsWrap}>
                        {batchContentItems.length > 0 ? (
                          <div
                            className={styles.queueKeywordBadgeList}
                            title={batchContentItems
                              .map((item) => item.title || t("common.notAvailable"))
                              .join(", ")}
                          >
                            {batchContentItems.map((item, index) => {
                              const hoverSrc = item.hover_image_url || item.image_url;
                              return (
                                <span
                                  key={`${list.id}-batch-content-${item.product_id}-${index}`}
                                  className={styles.queueKeywordBadge}
                                  onMouseEnter={(ev) => {
                                    if (!hoverSrc) return;
                                    setQueueKeywordHoverPreview({
                                      listId: list.id,
                                      index,
                                      src: hoverSrc,
                                      x: ev.clientX,
                                      y: ev.clientY,
                                    });
                                  }}
                                  onMouseMove={(ev) => {
                                    setQueueKeywordHoverPreview((prev) => {
                                      if (!prev) return prev;
                                      if (prev.listId !== list.id || prev.index !== index) {
                                        return prev;
                                      }
                                      return { ...prev, x: ev.clientX, y: ev.clientY };
                                    });
                                  }}
                                  onMouseLeave={() => {
                                    setQueueKeywordHoverPreview((prev) => {
                                      if (!prev) return prev;
                                      if (prev.listId !== list.id || prev.index !== index) {
                                        return prev;
                                      }
                                      return null;
                                    });
                                  }}
                                >
                                  {item.title || t("common.notAvailable")}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <Text size={200} className={styles.queueKeywordsMain}>
                            -
                          </Text>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={styles.dateCol}>
                      {formatDateTime(list.created_at) || t("common.notAvailable")}
                    </TableCell>
                    <TableCell className={styles.itemsCol}>
                      <span className={styles.itemsBadge}>{list.item_count ?? 0}</span>
                    </TableCell>
                    <TableCell className={styles.previewCol}>
                      <Button
                        appearance="outline"
                        size="small"
                        className={styles.actionWhiteButton}
                        onClick={() => {
                          void openPreview(list);
                        }}
                      >
                        {t("digidealDelivery.preview.button")}
                      </Button>
                    </TableCell>
                    <TableCell className={styles.downloadsCol}>
                      <div className={styles.downloadsActions}>
                        {isAdminUser ? (
                          <Menu>
                            <MenuTrigger disableButtonEnhancement>
                              <Button
                                appearance="outline"
                                size="small"
                                className={styles.actionWhiteButton}
                                disabled={excelBusy}
                              >
                                <span className={styles.menuButtonLabel}>
                                  {t("digidealDelivery.download.excelFile")}
                                  <span className={styles.menuButtonChevron} aria-hidden />
                                </span>
                              </Button>
                            </MenuTrigger>
                            <MenuPopover className={styles.compactMenuPopover}>
                              <MenuList>
                                <MenuItem
                                  className={styles.compactMenuItem}
                                  disabled={busyDownloads.has(excelPartnerKey)}
                                  onClick={() => {
                                    void handleDownload(list, {
                                      mode: "excel",
                                      dataset: "partner",
                                    });
                                  }}
                                >
                                  {t("digidealDelivery.download.partnerData")}
                                </MenuItem>
                                <MenuItem
                                  className={styles.compactMenuItem}
                                  disabled={busyDownloads.has(excelAllKey)}
                                  onClick={() => {
                                    void handleDownload(list, {
                                      mode: "excel",
                                      dataset: "all",
                                    });
                                  }}
                                >
                                  {t("digidealDelivery.download.completeData")}
                                </MenuItem>
                                {isLetsdealList ? (
                                  <MenuItem
                                    className={styles.compactMenuItem}
                                    disabled={
                                      busyDownloads.has(excelLetsdealKey) || !letsdealReady
                                    }
                                    onClick={() => {
                                      void handleDownload(list, {
                                        mode: "excel",
                                        dataset: "letsdeal",
                                      });
                                    }}
                                  >
                                    {t("digidealDelivery.download.letsdealData")}
                                  </MenuItem>
                                ) : null}
                              </MenuList>
                            </MenuPopover>
                          </Menu>
                        ) : (
                          <Button
                            appearance="outline"
                            size="small"
                            className={styles.actionWhiteButton}
                            disabled={excelBusy || (isLetsdealList && !letsdealReady)}
                            onClick={() => {
                              void handleDownload(list, {
                                mode: "excel",
                                dataset: isLetsdealList ? "letsdeal" : "partner",
                              });
                            }}
                          >
                            {t("digidealDelivery.download.excelFile")}
                          </Button>
                        )}

                        {isAdminUser ? (
                          <Menu>
                            <MenuTrigger disableButtonEnhancement>
                              <Button
                                appearance="outline"
                                size="small"
                                className={styles.actionWhiteButton}
                                disabled={imagesBusy}
                              >
                                <span className={styles.menuButtonLabel}>
                                  {t("digidealDelivery.download.images")}
                                  <span className={styles.menuButtonChevron} aria-hidden />
                                </span>
                              </Button>
                            </MenuTrigger>
                            <MenuPopover className={styles.compactMenuPopover}>
                              <MenuList>
                                <MenuItem
                                  className={styles.compactMenuItem}
                                  disabled={busyDownloads.has(imageStandardKey)}
                                  onClick={() => {
                                    void handleDownload(list, {
                                      mode: "images",
                                      imageMode: "original",
                                    });
                                  }}
                                >
                                  {t("digidealDelivery.download.standardImages")}
                                </MenuItem>
                                <MenuItem
                                  className={styles.compactMenuItem}
                                  disabled={busyDownloads.has(imageAllKey)}
                                  onClick={() => {
                                    void handleDownload(list, {
                                      mode: "images",
                                      imageMode: "all",
                                    });
                                  }}
                                >
                                  {t("digidealDelivery.download.fullImageSet")}
                                </MenuItem>
                              </MenuList>
                            </MenuPopover>
                          </Menu>
                        ) : (
                          <Button
                            appearance="outline"
                            size="small"
                            className={styles.actionWhiteButton}
                            disabled={imagesBusy}
                            onClick={() => {
                              void handleDownload(list, {
                                mode: "images",
                                imageMode: "original",
                              });
                            }}
                          >
                            {t("digidealDelivery.download.images")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={styles.selectCol}>
                      <div className={styles.selectCheckboxWrap}>
                        <Checkbox
                          checked={selectedListIds.has(list.id)}
                          aria-label={t("common.selectItem", {
                            item: list.name || t("common.notAvailable"),
                          })}
                          className={styles.selectCheckbox}
                          onChange={(_, data) => {
                            setSelectedListIds((prev) => {
                              const next = new Set(prev);
                              if (data.checked === true) {
                                next.add(list.id);
                              } else {
                                next.delete(list.id);
                              }
                              return next;
                            });
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
          <img src={deckHoverPreview.src} alt="" className={styles.queueZoomImage} />
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
            src={queueKeywordHoverPreview.src}
            alt=""
            className={styles.queueKeywordHoverImage}
          />
        </div>
      ) : null}

      <Dialog
        open={Boolean(previewList)}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closePreviewDialog();
          }
        }}
      >
        <DialogSurface className={styles.previewDialog}>
          <DialogBody className={styles.previewBody}>
            <DialogTitle>{previewDialogTitle}</DialogTitle>
            {previewList ? (
              <div className={styles.previewMeta}>
                <Text size={200}>{previewSummary}</Text>
                <Input
                  className={styles.previewSearch}
                  value={previewSearch}
                  onChange={(_, data) => setPreviewSearch(data.value)}
                  placeholder="Search product title"
                />
              </div>
            ) : null}
            {previewError ? <MessageBar intent="error">{previewError}</MessageBar> : null}
            {previewLoading ? (
              <Spinner label={t("digidealDelivery.preview.loading")} />
            ) : previewItems.length === 0 ? (
              <Text>{t("digidealDelivery.preview.empty")}</Text>
            ) : previewSearchResultEmpty ? (
              <Text>No products match the search.</Text>
            ) : (
              <div className={styles.previewTableWrap}>
                <Table size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell className={styles.previewImageCell}>
                        {t("products.table.image")}
                      </TableHeaderCell>
                      <TableHeaderCell className={styles.previewSpuCell}>SPU</TableHeaderCell>
                      <TableHeaderCell>{t("digidealDelivery.preview.table.title")}</TableHeaderCell>
                      <TableHeaderCell className={styles.previewPriceCell}>
                        {t("digidealDelivery.preview.table.b2bPriceRange")}
                      </TableHeaderCell>
                      <TableHeaderCell className={styles.previewActionCell}>
                        {t("digidealDelivery.preview.table.actions")}
                      </TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPreviewItems.map((item) => (
                      <TableRow key={item.product_id}>
                        <TableCell
                          className={mergeClasses(styles.previewImageCell, styles.previewRowCell)}
                        >
                          <div className={styles.previewThumb}>
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt=""
                                className={styles.previewThumbImage}
                              />
                            ) : (
                              t("common.notAvailable")
                            )}
                          </div>
                        </TableCell>
                        <TableCell
                          className={mergeClasses(styles.previewSpuCell, styles.previewRowCell)}
                        >
                          {item.spu || t("common.notAvailable")}
                        </TableCell>
                        <TableCell className={styles.previewRowCell}>
                          {item.title || t("common.notAvailable")}
                        </TableCell>
                        <TableCell
                          className={mergeClasses(styles.previewPriceCell, styles.previewRowCell)}
                        >
                          {formatPriceRange(
                            item.price_min,
                            item.price_max,
                            t("common.notAvailable")
                          )}
                        </TableCell>
                        <TableCell
                          className={mergeClasses(styles.previewActionCell, styles.previewRowCell)}
                        >
                          <Button
                            appearance="outline"
                            size="small"
                            disabled={previewDeleteDisabled}
                            className={mergeClasses(
                              styles.actionWhiteButton,
                              styles.previewDeleteButton
                            )}
                            onClick={() => {
                              handleRemoveFromPreview(item.product_id);
                            }}
                          >
                            {t("common.delete")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <DialogActions className={styles.dialogActionsEnd}>
              <Button
                appearance="outline"
                className={styles.actionWhiteButton}
                disabled={isSavingPreview}
                onClick={closePreviewDialog}
              >
                {t("common.close")}
              </Button>
              <Button
                appearance="primary"
                disabled={previewSaveDisabled}
                className={styles.previewSaveButton}
                onClick={() => {
                  void handleSaveAndClosePreview();
                }}
              >
                {isSavingPreview ? t("common.loading") : "Save and Close"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={Boolean(duplicateSourceList)}
        onOpenChange={(_, data) => {
          if (!data.open) {
            setDuplicateSourceList(null);
            setDuplicateError(null);
            setDuplicateTitle("");
            setDuplicatePartner("digideal");
            setIsDuplicatingList(false);
          }
        }}
      >
        <DialogSurface className={styles.duplicateDialog}>
          <DialogBody className={styles.previewBody}>
            <DialogTitle>Duplicate Delivery List</DialogTitle>
            {duplicateError ? <MessageBar intent="error">{duplicateError}</MessageBar> : null}
            <div className={styles.duplicateForm}>
              <Field label="Partner">
                <Dropdown
                  value={duplicatePartnerLabel}
                  selectedOptions={[duplicatePartner]}
                  onOptionSelect={(_, data) => {
                    setDuplicatePartner(String(data.optionValue ?? "digideal"));
                  }}
                >
                  <Option value="digideal" text="DigiDeal.se">
                    DigiDeal.se
                  </Option>
                  <Option value="letsdeal" text="LetsDeal">
                    LetsDeal
                  </Option>
                </Dropdown>
              </Field>
              <Field label="Title">
                <Input
                  value={duplicateTitle}
                  onChange={(_, data) => setDuplicateTitle(data.value)}
                />
              </Field>
            </div>
            <DialogActions className={styles.dialogActionsEnd}>
              <Button
                appearance="outline"
                className={styles.actionWhiteButton}
                disabled={isDuplicatingList}
                onClick={() => {
                  setDuplicateSourceList(null);
                  setDuplicateError(null);
                  setDuplicateTitle("");
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                disabled={isDuplicatingList}
                onClick={() => {
                  void handleDuplicateList();
                }}
              >
                {isDuplicatingList ? t("common.loading") : "Duplicate"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
