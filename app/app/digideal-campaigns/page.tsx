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
  Dropdown,
  Field,
  Image,
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
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/components/i18n-provider";

type DigidealItem = {
  product_id: string;
  listing_title: string | null;
  title_h1: string | null;
  product_url: string | null;
  product_slug: string | null;
  prodno: string | null;
  seller_name: string | null;
  seller_orgnr: string | null;
  status: string | null;
  last_price: number | null;
  last_original_price: number | null;
  last_discount_percent: number | null;
  last_you_save_kr: number | null;
  last_purchased_count: number | null;
  last_instock_qty: number | null;
  last_available_qty: number | null;
  last_reserved_qty: number | null;
  primary_image_url: string | null;
  image_urls: string[] | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  sold_today: number;
  sold_7d: number;
  sold_all_time: number;
  digideal_add_rerun: boolean | null;
  digideal_add_rerun_at: string | null;
  digideal_add_rerun_comment: string | null;
  digideal_rerun_status: string | null;
  purchase_price: number | null;
  weight_kg: number | null;
  weight_grams: number | null;
  supplier_url: string | null;
  shipping_cost: number | null;
  estimated_rerun_price: number | null;
  report_exists: boolean;
};

type DigidealResponse = {
  items: DigidealItem[];
  page: number;
  pageSize: number;
  total: number;
  error?: string;
};

type SellerOption = {
  seller_name: string;
  product_count: number;
};

type AnalysisImage = {
  id?: string;
  role?: string;
  url?: string;
  local_url?: string | null;
  local_path?: string | null;
  metrics?: {
    width?: number;
    height?: number;
    blur_score?: number;
  };
};

type DigidealAnalysisPayload = {
  product: {
    product_id: string;
    listing_title: string | null;
    title_h1: string | null;
    product_slug: string | null;
    prodno: string | null;
    seller_name: string | null;
    status: string | null;
    primary_image_url: string | null;
    image_urls: string[] | null;
    description_html: string | null;
  } | null;
  analysis: {
    product_id: string;
    status: string | null;
    text_analysis: Record<string, unknown> | null;
    main_image_analysis: Record<string, unknown> | null;
    contact_sheet_analysis: Record<string, unknown> | null;
    images: AnalysisImage[] | null;
    main_image_local_url: string | null;
    main_image_url: string | null;
    contact_sheet_local_url: string | null;
    last_run_at: string | null;
    attempts: number | null;
    last_error: string | null;
  } | null;
};

const useStyles = makeStyles({
  layout: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  controlsCard: {
    padding: "6px 16px 16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    "& label": {
      marginBottom: "0px",
    },
    "& .fui-Field": {
      rowGap: "0px",
    },
    "& .fui-Label": {
      marginBottom: "0px",
    },
  },
  topRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: "12px",
  },
  bottomRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: "12px",
  },
  searchInput: {
    width: "520px",
    maxWidth: "100%",
    fontSize: tokens.fontSizeBase300,
    "& input": {
      fontSize: tokens.fontSizeBase300,
    },
  },
  filterLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground4,
    fontWeight: tokens.fontWeightRegular,
    lineHeight: tokens.lineHeightBase100,
  },
  filterField: {
    minWidth: "180px",
  },
  dropdownCompact: {
    minWidth: "unset",
    width: "auto",
    maxWidth: "100%",
  },
  tableCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
  },
  table: {
    width: "100%",
    "& .fui-TableCell": {
      paddingTop: "8px",
      paddingBottom: "8px",
    },
    "& .fui-TableRow:active": {
      backgroundColor: "transparent",
    },
    "& .fui-TableRow:active .fui-TableCell": {
      backgroundColor: "transparent",
    },
  },
  productionRow: {
    backgroundColor: "#ecffef",
    "& .fui-TableCell": {
      backgroundColor: "#ecffef",
    },
    "&:hover": {
      backgroundColor: "#d8f5dd",
    },
    "&:hover .fui-TableCell": {
      backgroundColor: "#d8f5dd",
    },
  },
  imageCol: {
    width: "158px",
    paddingLeft: "8px",
    paddingRight: 0,
    boxSizing: "border-box",
  },
  productCol: {
    minWidth: "360px",
    width: "360px",
    paddingLeft: "15px",
    paddingRight: "16px",
  },
  salesCol: {
    minWidth: "240px",
  },
  sellerCol: {
    minWidth: "200px",
  },
  priceCol: {
    minWidth: "160px",
  },
  statusCol: {
    minWidth: "110px",
  },
  linkCol: {
    minWidth: "120px",
  },
  estimatedPriceCol: {
    minWidth: "160px",
  },
  linkButton: {
    backgroundColor: tokens.colorNeutralBackground1,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  linkButtonContent: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  },
  linkIcon: {
    width: "16px",
    height: "16px",
  },
  rerunCol: {
    minWidth: "220px",
  },
  estimatedPriceText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    display: "inline-block",
    flexShrink: 0,
    textAlign: "right",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  },
  estimatedPriceRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    flexWrap: "nowrap",
  },
  supplierDialog: {
    minWidth: "420px",
    maxWidth: "520px",
  },
  supplierDialogContent: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  supplierDialogMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  cellStack: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  metaStack: {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
  },
  metaLine: {
    lineHeight: tokens.lineHeightBase100,
  },
  metaLineTight: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
  },
  metaText: {
    color: tokens.colorNeutralForeground3,
  },
  productTitle: {
    fontWeight: tokens.fontWeightSemibold,
  },
  productIdInline: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
    display: "inline-block",
    marginLeft: "4px",
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
  thumbnailFrame: {
    width: "150px",
    height: "75px",
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
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
    height: "250px",
    maxWidth: "70vw",
    maxHeight: "50vh",
    objectFit: "contain",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: "10px",
  },
  salesWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  },
  salesSellerStack: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    alignItems: "flex-start",
  },
  sellerLink: {
    padding: 0,
    minWidth: "unset",
    height: "auto",
    alignSelf: "flex-start",
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    "&:hover": {
      backgroundColor: "transparent",
      textDecorationLine: "underline",
    },
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
  salesGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
  },
  salesGroupTight: {
    display: "inline-flex",
    alignItems: "center",
    gap: "1px",
  },
  statusBadge: {
    textTransform: "capitalize",
  },
  statusBadgeOnline: {
    color: "#298131",
    border: "1px solid #298131",
  },
  statusBadgeOffline: {
    color: "#d36a7c",
    border: "1px solid #d36a7c",
  },
  priceRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
    flexWrap: "wrap",
  },
  priceCurrent: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  pricePrevious: {
    color: tokens.colorNeutralForeground3,
    textDecorationLine: "line-through",
  },
  priceShipping: {
    color: tokens.colorNeutralForeground3,
  },
  discountText: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  rerunActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  rerunActionRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  rerunMetaColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  rerunAddedText: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  rerunAddedButton: {
    backgroundColor: "#1f7a3f",
    color: "#ffffff",
    border: "1px solid #1f7a3f",
    "&:hover": {
      backgroundColor: "#1a6a36",
      border: "1px solid #1a6a36",
      color: "#ffffff",
    },
    "&:active": {
      backgroundColor: "#165a2e",
      border: "1px solid #165a2e",
      color: "#ffffff",
    },
    "&:disabled": {
      backgroundColor: "#1f7a3f",
      border: "1px solid #1f7a3f",
      color: "#ffffff",
      opacity: 0.8,
    },
  },
  rerunRemoveButton: {
    backgroundColor: "#d9d9d9",
    color: tokens.colorNeutralForeground1,
    border: "1px solid #c6c6c6",
    "&:hover": {
      backgroundColor: "#cfcfcf",
      border: "1px solid #bdbdbd",
      color: tokens.colorNeutralForeground1,
    },
    "&:active": {
      backgroundColor: "#c6c6c6",
      border: "1px solid #b3b3b3",
      color: tokens.colorNeutralForeground1,
    },
    "&:disabled": {
      backgroundColor: "#d9d9d9",
      border: "1px solid #c6c6c6",
      color: tokens.colorNeutralForeground1,
      opacity: 0.85,
    },
  },
  rerunIconRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
  rerunIconButton: {
    border: "none",
    background: "transparent",
    padding: "2px",
    borderRadius: "6px",
    color: tokens.colorNeutralForeground4,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    "&:hover": {
      color: tokens.colorBrandForeground1,
    },
  },
  rerunIcon: {
    width: "18px",
    height: "18px",
  },
  rerunMenuButton: {
    gap: "6px",
  },
  optimizeButtonContent: {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
  },
  optimizeButton: {
    backgroundColor: tokens.colorNeutralBackground1,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
    "&:hover .optimizeIcon": {
      color: "#6732d3",
    },
    "&:disabled": {
      backgroundColor: tokens.colorNeutralBackground2,
      border: `1px solid ${tokens.colorNeutralStroke2}`,
      color: tokens.colorNeutralForegroundDisabled,
      cursor: "not-allowed",
    },
    "&:disabled .optimizeIcon": {
      color: tokens.colorNeutralForegroundDisabled,
    },
  },
  optimizeIcon: {
    width: "20px",
    height: "20px",
    color: "#555555",
  },
  pagination: {
    marginTop: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
  },
  dialogSurface: {
    minWidth: "360px",
    maxWidth: "560px",
  },
  optimizeDialogSurface: {
    minWidth: "520px",
    maxWidth: "900px",
    maxHeight: "calc(100vh - 120px)",
    marginBlock: "60px",
    overflowY: "auto",
  },
  dialogContent: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  dialogField: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  dialogPlaceholder: {
    minHeight: "220px",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  optimizeHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  optimizeTitle: {
    fontWeight: tokens.fontWeightSemibold,
  },
  optimizeBadges: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  optimizeImages: {
    display: "grid",
    gridTemplateColumns: "minmax(240px, 1fr) minmax(220px, 1fr)",
    gap: "12px",
  },
  heroBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  heroFrame: {
    width: "100%",
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  heroImage: {
    width: "100%",
    height: "100%",
    maxHeight: "260px",
    objectFit: "contain",
  },
  heroNote: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase200,
  },
  thumbGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "6px",
  },
  thumbItem: {
    position: "relative",
    borderRadius: "8px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
    aspectRatio: "1 / 1",
    objectFit: "cover",
  },
  thumbIcon: {
    position: "absolute",
    top: "4px",
    right: "4px",
    width: "16px",
    height: "16px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: "999px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorNeutralForeground3,
  },
  thumbTooltip: {
    maxWidth: "260px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  optimizeSections: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  },
  optimizeOverlayWrap: {
    position: "relative",
  },
  optimizeBlurLayer: {
    filter: "blur(6px)",
    pointerEvents: "none",
    userSelect: "none",
  },
  optimizeOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.45)",
  },
  optimizeOverlayBadge: {
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    padding: "8px 14px",
    borderRadius: "999px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    boxShadow: tokens.shadow8,
  },
  sectionCard: {
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sectionTitle: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  sectionText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    lineHeight: tokens.lineHeightBase200,
  },
  sectionList: {
    margin: 0,
    paddingLeft: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
  },
  descriptionBlock: {
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "12px",
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  descriptionContent: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    lineHeight: tokens.lineHeightBase200,
  },
});

const normalizeImageUrls = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (entry): entry is string => typeof entry === "string"
        );
      }
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeAnalysisImages = (value: unknown): AnalysisImage[] => {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is AnalysisImage => typeof entry === "object" && entry !== null
    );
  }
  return [];
};

const getImageUrl = (image?: AnalysisImage | null) =>
  image?.local_url || image?.url || null;

const toStringValue = (value: unknown) =>
  typeof value === "string" ? value : "";

const toArray = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

export default function DigidealCampaignsPage() {
  const styles = useStyles();
  const { t } = useI18n();

  const [items, setItems] = useState<DigidealItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState("online");
  const [sort, setSort] = useState("last_seen_desc");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [sellerOptions, setSellerOptions] = useState<SellerOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRerunDialogOpen, setIsRerunDialogOpen] = useState(false);
  const [rerunComment, setRerunComment] = useState("");
  const [rerunTargetTitle, setRerunTargetTitle] = useState<string | null>(null);
  const [rerunTargetId, setRerunTargetId] = useState<string | null>(null);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [hoveredRemoveId, setHoveredRemoveId] = useState<string | null>(null);
  const [isRerunSaving, setIsRerunSaving] = useState(false);
  const [isOptimizeDialogOpen, setIsOptimizeDialogOpen] = useState(false);
  const [optimizeTargetTitle, setOptimizeTargetTitle] = useState<string | null>(
    null
  );
  const [optimizeTargetId, setOptimizeTargetId] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<DigidealAnalysisPayload | null>(
    null
  );
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierTarget, setSupplierTarget] = useState<DigidealItem | null>(null);
  const [supplierUrlDraft, setSupplierUrlDraft] = useState("");
  const [supplierWeightDraft, setSupplierWeightDraft] = useState("");
  const [supplierPriceDraft, setSupplierPriceDraft] = useState("");
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const openRerunDialog = (title: string, productId: string) => {
    setRerunTargetTitle(title);
    setRerunTargetId(productId);
    setRerunComment("");
    setIsRerunDialogOpen(true);
  };

  const closeRerunDialog = () => {
    setIsRerunDialogOpen(false);
    setRerunTargetId(null);
  };

  const openSupplierDialog = (item: DigidealItem) => {
    const weightGrams =
      item.weight_grams ??
      (item.weight_kg !== null && item.weight_kg !== undefined
        ? Math.round(item.weight_kg * 1000)
        : null);
    setSupplierTarget(item);
    setSupplierUrlDraft(item.supplier_url ?? "");
    setSupplierWeightDraft(weightGrams !== null ? String(weightGrams) : "");
    setSupplierPriceDraft(
      item.purchase_price !== null && item.purchase_price !== undefined
        ? String(item.purchase_price)
        : ""
    );
    setSupplierError(null);
    setSupplierDialogOpen(true);
  };

  const closeSupplierDialog = () => {
    setSupplierDialogOpen(false);
    setSupplierTarget(null);
  };
  const openOptimizeDialog = (title: string, productId: string) => {
    setOptimizeTargetTitle(title);
    setOptimizeTargetId(productId);
    setIsOptimizeDialogOpen(true);
  };

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
      }
    };

    loadAdmin();

    return () => {
      isActive = false;
    };
  }, []);

  const setAddingState = (productId: string, isAdding: boolean) => {
    setAddingIds((prev) => {
      const next = new Set(prev);
      if (isAdding) {
        next.add(productId);
      } else {
        next.delete(productId);
      }
      return next;
    });
  };

  const setRemovingState = (productId: string, isRemoving: boolean) => {
    setRemovingIds((prev) => {
      const next = new Set(prev);
      if (isRemoving) {
        next.add(productId);
      } else {
        next.delete(productId);
      }
      return next;
    });
  };

  const applyAddState = (
    productId: string,
    addedAt: string,
    comment?: string | null,
    status?: string | null
  ) => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.product_id === productId
          ? {
              ...entry,
              digideal_add_rerun: true,
              digideal_add_rerun_at: addedAt,
              digideal_add_rerun_comment:
                typeof comment === "string"
                  ? comment
                  : entry.digideal_add_rerun_comment ?? null,
              digideal_rerun_status:
                typeof status === "string" && status.trim()
                  ? status
                  : entry.digideal_rerun_status ?? "Queued",
            }
          : entry
      )
    );
  };

  const applyRemoveState = (productId: string) => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.product_id === productId
          ? {
              ...entry,
              digideal_add_rerun: false,
              digideal_add_rerun_at: null,
              digideal_add_rerun_comment: null,
              digideal_rerun_status: null,
            }
          : entry
      )
    );
  };

  const addToProduction = async (
    item: DigidealItem,
    options: {
      comment?: string | null;
      addToPipeline?: boolean;
      addDirectly?: boolean;
    } = {}
  ) => {
    const productId = item.product_id;
    if (!productId) return false;
    setError(null);
    setAddingState(productId, true);
    try {
      const response = await fetch("/api/digideal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          comment: options.comment ?? null,
          add_to_pipeline: options.addToPipeline,
          add_directly: options.addDirectly,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("digideal.rerun.error"));
      }
      const addedAt =
        typeof payload?.added_at === "string"
          ? payload.added_at
          : new Date().toISOString();
      const nextComment =
        typeof payload?.comment === "string"
          ? payload.comment
          : typeof options.comment === "string"
            ? options.comment
            : null;
      const nextStatus =
        typeof payload?.status === "string" && payload.status.trim()
          ? payload.status
          : "Queued";
      applyAddState(productId, addedAt, nextComment, nextStatus);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("digideal.rerun.error"));
      return false;
    } finally {
      setAddingState(productId, false);
    }
  };

  const removeFromProduction = async (item: DigidealItem) => {
    const productId = item.product_id;
    if (!productId) return false;
    setError(null);
    setRemovingState(productId, true);
    try {
      const response = await fetch("/api/discovery/production", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "digideal",
          product_id: productId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("digideal.rerun.removeError"));
      }
      applyRemoveState(productId);
      setHoveredRemoveId((prev) => (prev === productId ? null : prev));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("digideal.rerun.removeError"));
      return false;
    } finally {
      setRemovingState(productId, false);
    }
  };

  const handleRerunSave = async () => {
    if (!rerunTargetId) {
      closeRerunDialog();
      return;
    }
    const target = items.find((entry) => entry.product_id === rerunTargetId);
    if (!target) {
      closeRerunDialog();
      return;
    }
    setIsRerunSaving(true);
    const ok = await addToProduction(target, {
      comment: rerunComment,
      addToPipeline: true,
      addDirectly: true,
    });
    setIsRerunSaving(false);
    if (ok) {
      closeRerunDialog();
    }
  };

  const handleSupplierSave = async () => {
    if (!supplierTarget) {
      closeSupplierDialog();
      return;
    }
    const supplierUrl = supplierUrlDraft.trim();
    const weightValue = Number(supplierWeightDraft);
    const priceValue = Number(supplierPriceDraft);
    if (
      !supplierUrl ||
      !Number.isFinite(weightValue) ||
      weightValue <= 0 ||
      !Number.isFinite(priceValue) ||
      priceValue <= 0
    ) {
      setSupplierError(t("digideal.supplier.errorInvalid"));
      return;
    }

    setSupplierSaving(true);
    setSupplierError(null);
    try {
      const response = await fetch("/api/digideal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: supplierTarget.product_id,
          supplier_url: supplierUrl,
          weight_grams: weightValue,
          purchase_price: priceValue,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("digideal.supplier.errorSave"));
      }
      setSupplierDialogOpen(false);
      setSupplierTarget(null);
      setRefreshToken((prev) => prev + 1);
    } catch (err) {
      setSupplierError(
        err instanceof Error ? err.message : t("digideal.supplier.errorSave")
      );
    } finally {
      setSupplierSaving(false);
    }
  };

  const debouncedSearch = useDebouncedValue(search, 300);
  const debouncedCategory = useDebouncedValue(category, 300);
  const debouncedTag = useDebouncedValue(tag, 300);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    debouncedCategory,
    debouncedTag,
    status,
    sort,
    pageSize,
    sellerFilter,
  ]);

  useEffect(() => {
    const controller = new AbortController();

    const loadSellers = async () => {
      try {
        const response = await fetch("/api/digideal/sellers", {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { sellers?: SellerOption[] };
        setSellerOptions(payload.sellers ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    };

    loadSellers();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isOptimizeDialogOpen || !optimizeTargetId) {
      setAnalysisData(null);
      setAnalysisError(null);
      return;
    }

    const controller = new AbortController();
    const loadAnalysis = async () => {
      setAnalysisLoading(true);
      setAnalysisError(null);
      try {
        const response = await fetch(
          `/api/digideal/analysis?productId=${encodeURIComponent(
            optimizeTargetId
          )}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || t("digideal.optimize.error"));
        }
        const payload = (await response.json()) as DigidealAnalysisPayload;
        setAnalysisData(payload);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAnalysisError(
          err instanceof Error ? err.message : t("digideal.optimize.error")
        );
      } finally {
        setAnalysisLoading(false);
      }
    };

    loadAnalysis();

    return () => controller.abort();
  }, [isOptimizeDialogOpen, optimizeTargetId, t]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        const debugEnabled =
          typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).get("debug") === "1";
        if (debugEnabled) params.set("debug", "1");
        if (debouncedSearch) params.set("q", debouncedSearch);
        if (debouncedCategory) params.set("category", debouncedCategory);
        if (debouncedTag) params.set("tag", debouncedTag);
        if (sellerFilter && sellerFilter !== "all") {
          params.set("seller", sellerFilter);
        }
        if (status) params.set("status", status);
        if (sort) params.set("sort", sort);
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));

        const response = await fetch(`/api/digideal?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          let message = t("digideal.error");
          try {
            const errorPayload = (await response.json()) as {
              error?: string;
              debug?: { details?: string; hint?: string; code?: string };
            };
            if (errorPayload?.error) {
              const parts = [errorPayload.error];
              if (errorPayload.debug?.code) {
                parts.push(`[${errorPayload.debug.code}]`);
              }
              if (errorPayload.debug?.details) {
                parts.push(errorPayload.debug.details);
              }
              if (errorPayload.debug?.hint) {
                parts.push(errorPayload.debug.hint);
              }
              message = parts.join(" ");
            }
          } catch {
            // ignore parse errors
          }
          throw new Error(message);
        }
        const payload = (await response.json()) as DigidealResponse;
        setItems(payload.items ?? []);
        setPage(payload.page ?? page);
        setPageSize(payload.pageSize ?? pageSize);
        setTotal(payload.total ?? 0);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : t("digideal.error"));
      } finally {
        setIsLoading(false);
      }
    };

    load();

    return () => controller.abort();
  }, [
    debouncedSearch,
    debouncedCategory,
    debouncedTag,
    status,
    sort,
    sellerFilter,
    page,
    pageSize,
    refreshToken,
    t,
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const analysisView = useMemo(() => {
    if (!analysisData) return null;

    const product = analysisData.product;
    const analysis = analysisData.analysis;

    const productTitle =
      product?.listing_title ||
      product?.title_h1 ||
      product?.product_slug ||
      product?.prodno ||
      product?.product_id ||
      optimizeTargetTitle ||
      "";

    const textAnalysis = analysis?.text_analysis ?? null;
    const mainImageAnalysis = analysis?.main_image_analysis ?? null;
    const contactSheetAnalysis = analysis?.contact_sheet_analysis ?? null;

    const textSummary = toStringValue(
      (textAnalysis as Record<string, unknown>)?.summary
    );
    const textIssues = toArray<{
      type?: string;
      detail?: string;
      severity?: string;
    }>((textAnalysis as Record<string, unknown>)?.issues);
    const textImprovements = toArray<{
      title?: string;
      reason?: string;
    }>((textAnalysis as Record<string, unknown>)?.improvements);
    const conversionBlockers = toArray<{
      issue?: string;
      impact?: string;
      fix?: string;
    }>((textAnalysis as Record<string, unknown>)?.conversion_blockers);

    const mainHeroNote =
      toStringValue(
        (mainImageAnalysis as Record<string, unknown>)?.hero_suitability &&
          (mainImageAnalysis as Record<string, any>)?.hero_suitability?.notes
      ) ||
      toStringValue(
        (mainImageAnalysis as Record<string, any>)?.notes
      ) ||
      toStringValue(
        toArray<{ detail?: string }>(
          (mainImageAnalysis as Record<string, any>)?.issues
        )[0]?.detail
      );

    const mainImageIssues = toArray<{
      type?: string;
      detail?: string;
    }>((mainImageAnalysis as Record<string, unknown>)?.issues);
    const mainImageImprovements = toArray<{
      title?: string;
      reason?: string;
    }>((mainImageAnalysis as Record<string, unknown>)?.improvements);

    const contactImages = toArray<{
      index?: number;
      image_id?: string;
      notes?: string;
      issues?: { type?: string; detail?: string; severity?: string }[];
      improvements?: { title?: string; reason?: string }[];
    }>((contactSheetAnalysis as Record<string, unknown>)?.images);

    const descriptionMismatches = toArray<{
      issue?: string;
      detail?: string;
      severity?: string;
    }>((contactSheetAnalysis as Record<string, unknown>)?.description_mismatches);

    const allImages = normalizeAnalysisImages(analysis?.images);
    const fallbackImages = normalizeImageUrls(product?.image_urls);
    const imageSources: AnalysisImage[] =
      allImages.length > 0
        ? allImages
        : fallbackImages.map((url) => ({ url }));

    const heroSource =
      analysis?.main_image_local_url ||
      analysis?.main_image_url ||
      product?.primary_image_url ||
      getImageUrl(imageSources[0]) ||
      null;

    const thumbnails = imageSources
      .filter((image) => image.role !== "main" && image.id !== "main")
      .slice(0, 9);

    const getContactNote = (image: AnalysisImage, index: number) => {
      if (image.id) {
        const match = contactImages.find((item) => item.image_id === image.id);
        if (match) return match;
      }
      return contactImages.find((item) => item.index === index + 1);
    };

    const scoreBadge = (label: string, value?: string | number | null) => (
      <Badge appearance="outline">
        {label}
        {value !== null && value !== undefined && value !== ""
          ? `: ${value}`
          : ""}
      </Badge>
    );

    return (
      <>
        <div className={styles.optimizeHeader}>
          <div>
            <Text size={300} className={styles.optimizeTitle}>
              {productTitle}
            </Text>
            {product?.seller_name ? (
              <Text size={200} className={styles.sectionText}>
                {product.seller_name}
              </Text>
            ) : null}
          </div>
          <div className={styles.optimizeBadges}>
            {analysis?.status ? (
              <Badge appearance="outline">{analysis.status}</Badge>
            ) : null}
            {scoreBadge(
              t("digideal.optimize.score.text"),
              toStringValue(
                (textAnalysis as Record<string, unknown>)?.overall_score
              )
            )}
            {scoreBadge(
              t("digideal.optimize.score.image"),
              toStringValue(
                (mainImageAnalysis as Record<string, unknown>)?.overall_score
              )
            )}
          </div>
        </div>

        <div className={styles.optimizeImages}>
          <div className={styles.heroBlock}>
            <div className={styles.heroFrame}>
              {heroSource ? (
                <Image src={heroSource} alt={productTitle} className={styles.heroImage} />
              ) : (
                <Text size={200}>{t("common.notAvailable")}</Text>
              )}
            </div>
            <Text size={200} className={styles.heroNote}>
              {mainHeroNote || t("digideal.optimize.heroNoteFallback")}
            </Text>
          </div>
          <div className={styles.thumbGrid}>
            {thumbnails.length > 0 ? (
              thumbnails.map((image, index) => {
                const thumbAnalysis = getContactNote(image, index);
                const tooltipContent = (
                  <div className={styles.thumbTooltip}>
                    {thumbAnalysis?.notes ? (
                      <Text size={200}>{thumbAnalysis.notes}</Text>
                    ) : null}
                    {thumbAnalysis?.issues?.length ? (
                      <ul className={styles.sectionList}>
                        {thumbAnalysis.issues.slice(0, 2).map((issue, i) => (
                          <li key={`issue-${i}`}>{issue.detail || issue.type}</li>
                        ))}
                      </ul>
                    ) : null}
                    {thumbAnalysis?.improvements?.length ? (
                      <ul className={styles.sectionList}>
                        {thumbAnalysis.improvements
                          .slice(0, 2)
                          .map((improvement, i) => (
                            <li key={`improve-${i}`}>
                              {improvement.title || improvement.reason}
                            </li>
                          ))}
                      </ul>
                    ) : null}
                    {!thumbAnalysis ? (
                      <Text size={200}>{t("digideal.optimize.thumbFallback")}</Text>
                    ) : null}
                  </div>
                );
                const url = getImageUrl(image);
                return (
                  <Tooltip key={url ?? index} content={tooltipContent} relationship="label">
                    <div className={styles.thumbItem}>
                      {url ? (
                        <Image src={url} alt={productTitle} className={styles.thumbImage} />
                      ) : null}
                      <span className={styles.thumbIcon} aria-hidden="true">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          width="12"
                          height="12"
                        >
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 8h.01" />
                          <path d="M11 12h1v4h1" />
                        </svg>
                      </span>
                    </div>
                  </Tooltip>
                );
              })
            ) : (
              <Text size={200}>{t("digideal.optimize.thumbsEmpty")}</Text>
            )}
          </div>
        </div>

        <div className={styles.optimizeSections}>
          <div className={styles.sectionCard}>
            <Text className={styles.sectionTitle}>{t("digideal.optimize.summary")}</Text>
            <Text className={styles.sectionText}>
              {textSummary || t("common.notAvailable")}
            </Text>
          </div>
          <div className={styles.sectionCard}>
            <Text className={styles.sectionTitle}>{t("digideal.optimize.issues")}</Text>
            {textIssues.length ? (
              <ul className={styles.sectionList}>
                {textIssues.map((issue, index) => (
                  <li key={`issue-${index}`}>{issue.detail || issue.type}</li>
                ))}
              </ul>
            ) : (
              <Text className={styles.sectionText}>{t("common.notAvailable")}</Text>
            )}
          </div>
          <div className={styles.sectionCard}>
            <Text className={styles.sectionTitle}>{t("digideal.optimize.blockers")}</Text>
            {conversionBlockers.length ? (
              <ul className={styles.sectionList}>
                {conversionBlockers.map((blocker, index) => (
                  <li key={`blocker-${index}`}>{blocker.fix || blocker.issue}</li>
                ))}
              </ul>
            ) : (
              <Text className={styles.sectionText}>{t("common.notAvailable")}</Text>
            )}
          </div>
          <div className={styles.sectionCard}>
            <Text className={styles.sectionTitle}>{t("digideal.optimize.improvements")}</Text>
            {textImprovements.length ? (
              <ul className={styles.sectionList}>
                {textImprovements.map((improvement, index) => (
                  <li key={`improve-${index}`}>
                    {improvement.title || improvement.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <Text className={styles.sectionText}>{t("common.notAvailable")}</Text>
            )}
          </div>
          <div className={styles.sectionCard}>
            <Text className={styles.sectionTitle}>{t("digideal.optimize.imageIssues")}</Text>
            {mainImageIssues.length ? (
              <ul className={styles.sectionList}>
                {mainImageIssues.map((issue, index) => (
                  <li key={`img-issue-${index}`}>{issue.detail || issue.type}</li>
                ))}
              </ul>
            ) : (
              <Text className={styles.sectionText}>{t("common.notAvailable")}</Text>
            )}
          </div>
          <div className={styles.sectionCard}>
            <Text className={styles.sectionTitle}>{t("digideal.optimize.imageImprovements")}</Text>
            {mainImageImprovements.length ? (
              <ul className={styles.sectionList}>
                {mainImageImprovements.map((improvement, index) => (
                  <li key={`img-improve-${index}`}>
                    {improvement.title || improvement.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <Text className={styles.sectionText}>{t("common.notAvailable")}</Text>
            )}
          </div>
        </div>

        {descriptionMismatches.length ? (
          <div className={styles.descriptionBlock}>
            <Text className={styles.sectionTitle}>
              {t("digideal.optimize.descriptionMismatches")}
            </Text>
            <ul className={styles.sectionList}>
              {descriptionMismatches.map((mismatch, index) => (
                <li key={`mismatch-${index}`}>
                  {mismatch.detail || mismatch.issue}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={styles.descriptionBlock}>
          <Text className={styles.sectionTitle}>
            {t("digideal.optimize.originalDescription")}
          </Text>
          {product?.description_html ? (
            <div
              className={styles.descriptionContent}
              dangerouslySetInnerHTML={{ __html: product.description_html }}
            />
          ) : (
            <Text className={styles.sectionText}>{t("common.notAvailable")}</Text>
          )}
        </div>

        <div className={styles.sectionCard}>
          <Text className={styles.sectionTitle}>{t("digideal.optimize.operational")}</Text>
          <Text className={styles.sectionText}>
            {t("digideal.optimize.lastRun")}:{" "}
            {analysis?.last_run_at ? formatDate(analysis.last_run_at) : "-"}
          </Text>
          <Text className={styles.sectionText}>
            {t("digideal.optimize.attempts")}: {analysis?.attempts ?? "-"}
          </Text>
          {analysis?.last_error ? (
            <Text className={styles.sectionText}>
              {t("digideal.optimize.lastError")}: {analysis.last_error}
            </Text>
          ) : null}
        </div>
      </>
    );
  }, [analysisData, optimizeTargetTitle, styles, t]);

  const rows = useMemo(
    () =>
      items.map((item) => {
        const title =
          item.listing_title ||
          item.title_h1 ||
          item.product_slug ||
          item.product_id;
        const imageUrls = normalizeImageUrls(item.image_urls);
        const imageSrc = item.primary_image_url || imageUrls[0] || null;
        const productId = item.prodno || item.product_id;
        const priceValue = item.last_price ?? null;
        const prevPrice = item.last_original_price ?? null;
        const shippingCost =
          typeof item.shipping_cost === "number" ? item.shipping_cost : null;
        const shippingCostLabel =
          shippingCost !== null ? formatCurrency(shippingCost, "SEK") : "";
        const discount = item.last_discount_percent;
        const saveKr = item.last_you_save_kr;
        const statusLabel = item.status ?? "-";
        const seller = item.seller_name ?? "-";
        const sellerId = item.seller_orgnr;
        const isNordexo = seller.toLowerCase().includes("nordexo");
        const soldTodayRaw = Math.max(0, item.sold_today ?? 0);
        const sold7dRaw = Math.max(0, item.sold_7d ?? 0);
        const soldAllRaw = Math.max(0, item.sold_all_time ?? 0);
        const firstSeenTime = item.first_seen_at
          ? Date.parse(item.first_seen_at)
          : Number.NaN;
        const activeDays = Number.isFinite(firstSeenTime)
          ? (Date.now() - firstSeenTime) / (1000 * 60 * 60 * 24)
          : null;
        const soldToday = soldTodayRaw;
        let sold7d = sold7dRaw;
        if (activeDays !== null && activeDays <= 1) {
          sold7d = Math.max(sold7d, soldToday);
        } else if (sold7d < soldToday) {
          sold7d = soldToday;
        }
        const soldAllTime = Math.max(soldAllRaw, sold7d);
        const showShortSales = statusLabel !== "offline";
        const hasReport = item.report_exists === true;
        const rawProductionStatus =
          typeof item.digideal_rerun_status === "string"
            ? item.digideal_rerun_status.trim()
            : "";
        const productionStatus =
          rawProductionStatus || (item.digideal_add_rerun ? "Queued" : "");
        const normalizedProductionStatus = productionStatus.toLowerCase();
        const isProductionActive = ["queued", "being produced", "done"].includes(
          normalizedProductionStatus
        );
        const addedAtLabel = item.digideal_add_rerun_at
          ? formatDate(item.digideal_add_rerun_at)
          : null;
        const productionStatusLabel = productionStatus
          ? {
              queued: t("digideal.rerun.status.queued"),
              "being produced": t("digideal.rerun.status.beingProduced"),
              done: t("digideal.rerun.status.done"),
            }[normalizedProductionStatus] ?? productionStatus
          : null;
        const showAddedMeta =
          isProductionActive && Boolean(addedAtLabel || productionStatusLabel);
        const isAdding = addingIds.has(item.product_id);
        const isRemoving = removingIds.has(item.product_id);
        const isHoveringRemove =
          hoveredRemoveId === item.product_id || isRemoving;
        const estimatedPriceValue =
          typeof item.estimated_rerun_price === "number"
            ? item.estimated_rerun_price
            : null;
        const hasEstimatedPrice = estimatedPriceValue !== null;
        const estimatedPriceLabel =
          estimatedPriceValue !== null
            ? formatCurrency(estimatedPriceValue, "SEK") || "-"
            : "-";
        const showSupplierAdd = isAdmin && !hasEstimatedPrice && !isNordexo;
        const showSupplierEdit = isAdmin && hasEstimatedPrice;
        const rerunIcons = [
          {
            key: "full",
            label: t("digideal.rerun.fullImageSet"),
            icon: (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className={styles.rerunIcon}
                aria-hidden="true"
              >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M18 4h-6a3 3 0 0 0 -3 3v10a3 3 0 0 0 3 3h6a3 3 0 0 0 3 -3v-10a3 3 0 0 0 -3 -3z" />
                <path d="M7 6a1 1 0 0 1 .993 .883l.007 .117v10a1 1 0 0 1 -1.993 .117l-.007 -.117v-10a1 1 0 0 1 1 -1z" />
                <path d="M4 7a1 1 0 0 1 .993 .883l.007 .117v8a1 1 0 0 1 -1.993 .117l-.007 -.117v-8a1 1 0 0 1 1 -1z" />
              </svg>
            ),
          },
          {
            key: "localized",
            label: t("digideal.rerun.localizedImages"),
            icon: (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.rerunIcon}
                aria-hidden="true"
              >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M15 8h.01" />
                <path d="M10 21h-4a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v5" />
                <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l1 1" />
                <path d="M14 21v-4a2 2 0 1 1 4 0v4" />
                <path d="M14 19h4" />
                <path d="M21 15v6" />
              </svg>
            ),
          },
          {
            key: "text",
            label: t("digideal.rerun.aiText"),
            icon: (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.rerunIcon}
                aria-hidden="true"
              >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                <path d="M10 21h-3a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v3.5" />
                <path d="M9 9h1" />
                <path d="M9 13h2.5" />
                <path d="M9 17h1" />
                <path d="M14 21v-4a2 2 0 1 1 4 0v4" />
                <path d="M14 19h4" />
                <path d="M21 15v6" />
              </svg>
            ),
          },
          {
            key: "video",
            label: t("digideal.rerun.aiVideo"),
            icon: (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.rerunIcon}
                aria-hidden="true"
              >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M10 20h-5a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v2" />
                <path d="M14.362 11.15a3 3 0 1 0 -4.144 4.263" />
                <path d="M14 21v-4a2 2 0 1 1 4 0v4" />
                <path d="M14 19h4" />
                <path d="M21 15v6" />
              </svg>
            ),
          },
          {
            key: "ready",
            label: t("digideal.rerun.ready24h"),
            icon: (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.rerunIcon}
                aria-hidden="true"
              >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M3 12a9 9 0 0 0 5.998 8.485m12.002 -8.485a9 9 0 1 0 -18 0" />
                <path d="M12 7v5" />
                <path d="M12 15h2a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-1a1 1 0 0 0 -1 1v1a1 1 0 0 0 1 1h2" />
                <path d="M18 15v2a1 1 0 0 0 1 1h1" />
                <path d="M21 15v6" />
              </svg>
            ),
          },
        ];

        return (
          <TableRow
            key={item.product_id}
            className={isProductionActive ? styles.productionRow : undefined}
          >
            <TableCell className={styles.imageCol}>
              <div className={styles.thumbnailWrap}>
                <div className={styles.thumbnailFrame}>
                  {imageSrc ? (
                    <Image src={imageSrc} alt={title} className={styles.thumbnail} />
                  ) : null}
                </div>
                {imageSrc ? (
                  <div className={mergeClasses(styles.previewLayer, "previewLayer")}>
                    <div className={styles.previewBox}>
                      <Image
                        src={imageSrc}
                        alt={title}
                        className={styles.previewImage}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </TableCell>
            <TableCell className={styles.productCol}>
              <div className={styles.cellStack}>
                <Text className={styles.productTitle}>
                  {title}
                  <span className={styles.productIdInline}>
                    {`\u00A0(ID: ${productId})`}
                  </span>
                </Text>
                <div className={styles.metaStack}>
                  <Text
                    size={100}
                    className={mergeClasses(
                      styles.metaText,
                      styles.metaLine,
                      styles.metaLineTight
                    )}
                  >
                    {t("digideal.meta.firstSeen", {
                      date: item.first_seen_at ? formatDate(item.first_seen_at) : "-",
                    })}
                  </Text>
                  <Text
                    size={100}
                    className={mergeClasses(
                      styles.metaText,
                      styles.metaLine,
                      styles.metaLineTight
                    )}
                  >
                    {t("digideal.meta.updated", {
                      date: item.last_seen_at ? formatDate(item.last_seen_at) : "-",
                    })}
                  </Text>
                </div>
              </div>
            </TableCell>
            <TableCell className={styles.salesCol}>
              <div className={styles.salesSellerStack}>
                <Button
                  appearance="transparent"
                  size="small"
                  className={styles.sellerLink}
                  onClick={() => {
                    setSellerFilter(seller);
                    setPage(1);
                  }}
                >
                  {seller}
                </Button>
                <div className={styles.salesWrap}>
                  {showShortSales ? (
                    <>
                      <span className={styles.salesGroup}>
                        <Text size={200} className={styles.metaText}>
                          1d
                        </Text>
                        <span className={styles.salesButton}>{soldToday}</span>
                      </span>
                      <span className={styles.salesGroupTight}>
                        <Text size={200} className={styles.metaText}>
                          7d
                        </Text>
                        <span className={styles.salesButton}>{sold7d}</span>
                      </span>
                    </>
                  ) : null}
                  <span className={styles.salesGroup}>
                    <Text size={200} className={styles.metaText}>
                      {t("digideal.sales.all")}
                    </Text>
                    <span className={styles.salesButton}>{soldAllTime}</span>
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell className={styles.priceCol}>
              <div className={styles.cellStack}>
                <div className={styles.priceRow}>
                  <Text className={styles.priceCurrent}>
                    {priceValue !== null
                      ? formatCurrency(priceValue, "SEK")
                      : "-"}
                  </Text>
                  {shippingCostLabel ? (
                    <Text className={styles.priceShipping}>
                      ({shippingCostLabel})
                    </Text>
                  ) : null}
                  {prevPrice !== null && prevPrice > (priceValue ?? 0) ? (
                    <Text className={styles.pricePrevious}>
                      {formatCurrency(prevPrice, "SEK")}
                    </Text>
                  ) : null}
                </div>
                {discount !== null || saveKr !== null ? (
                  <Text size={200} className={styles.discountText}>
                    {discount !== null
                      ? t("digideal.discount", { value: discount })
                      : null}
                    {discount !== null && saveKr !== null ? " · " : null}
                    {saveKr !== null
                      ? t("digideal.save", { value: saveKr })
                      : null}
                  </Text>
                ) : null}
              </div>
            </TableCell>
            <TableCell className={styles.statusCol}>
              <Badge
                appearance="outline"
                className={mergeClasses(
                  styles.statusBadge,
                  statusLabel === "online"
                    ? styles.statusBadgeOnline
                    : statusLabel === "offline"
                      ? styles.statusBadgeOffline
                      : undefined
                )}
              >
                {statusLabel}
              </Badge>
            </TableCell>
            <TableCell className={styles.linkCol}>
              {item.product_url ? (
                <Button
                  appearance="outline"
                  size="small"
                  as="a"
                  href={item.product_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.linkButton}
                >
                  <span className={styles.linkButtonContent}>
                    {t("digideal.link.view")}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={styles.linkIcon}
                      aria-hidden="true"
                    >
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
                      <path d="M11 13l9 -9" />
                      <path d="M15 4h5v5" />
                    </svg>
                  </span>
                </Button>
              ) : (
                "-"
              )}
            </TableCell>
            <TableCell>
              {isNordexo ? (
                "-"
              ) : (
                <Button
                  appearance="outline"
                  size="small"
                  className={styles.optimizeButton}
                  onClick={() => {
                    if (!hasReport) return;
                    openOptimizeDialog(title, item.product_id);
                  }}
                  disabled={!hasReport}
                >
                  <span className={styles.optimizeButtonContent}>
                    {t("digideal.optimize.analyze")}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={styles.optimizeIcon}
                      aria-hidden="true"
                    >
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065" />
                      <path d="M9 14v-2.5a1.5 1.5 0 0 1 3 0v2.5" />
                      <path d="M9 13h3" />
                      <path d="M15 10v4" />
                    </svg>
                  </span>
                </Button>
              )}
            </TableCell>
            <TableCell className={styles.estimatedPriceCol}>
              {hasEstimatedPrice ? (
                <div className={styles.estimatedPriceRow}>
                  <Text className={styles.estimatedPriceText}>
                    {estimatedPriceLabel}
                  </Text>
                  {showSupplierEdit ? (
                    <Button
                      appearance="outline"
                      size="small"
                      className={styles.linkButton}
                      onClick={() => openSupplierDialog(item)}
                    >
                      {t("digideal.supplier.edit")}
                    </Button>
                  ) : null}
                </div>
              ) : showSupplierAdd ? (
                <Button
                  appearance="outline"
                  size="small"
                  className={styles.linkButton}
                  onClick={() => openSupplierDialog(item)}
                >
                  {t("digideal.supplier.add")}
                </Button>
              ) : (
                <Text className={styles.estimatedPriceText}>-</Text>
              )}
            </TableCell>
            <TableCell className={styles.rerunCol}>
              {isNordexo ? (
                "-"
              ) : (
                <div className={styles.rerunActions}>
                  <div className={styles.rerunActionRow}>
                    {isProductionActive ? (
                      <Button
                        appearance="primary"
                        size="small"
                        className={mergeClasses(
                          styles.rerunAddedButton,
                          isHoveringRemove ? styles.rerunRemoveButton : undefined
                        )}
                        onMouseEnter={() => setHoveredRemoveId(item.product_id)}
                        onMouseLeave={() => setHoveredRemoveId(null)}
                        onPointerEnter={() => setHoveredRemoveId(item.product_id)}
                        onPointerLeave={() => setHoveredRemoveId(null)}
                        onFocus={() => setHoveredRemoveId(item.product_id)}
                        onBlur={() => setHoveredRemoveId(null)}
                        onClick={() => removeFromProduction(item)}
                        disabled={isRemoving}
                      >
                        {isHoveringRemove
                          ? t("digideal.rerun.remove")
                          : t("digideal.rerun.added")}
                      </Button>
                    ) : (
                      <Menu>
                        <MenuTrigger disableButtonEnhancement>
                          <Button
                            appearance="primary"
                            size="small"
                            className={styles.rerunMenuButton}
                            disabled={isAdding}
                          >
                            {t("digideal.rerun.add")}
                          </Button>
                        </MenuTrigger>
                        <MenuPopover>
                          <MenuList>
                            <MenuItem
                              onClick={() =>
                                addToProduction(item, {
                                  addToPipeline: true,
                                  addDirectly: true,
                                })
                              }
                              disabled={isAdding}
                            >
                              {t("digideal.rerun.add")}
                            </MenuItem>
                            <MenuItem
                              onClick={() => openRerunDialog(title, item.product_id)}
                              disabled={isAdding}
                            >
                              {t("digideal.rerun.addWithComment")}
                            </MenuItem>
                          </MenuList>
                        </MenuPopover>
                      </Menu>
                    )}
                    {showAddedMeta ? (
                      <div className={styles.rerunMetaColumn}>
                        {addedAtLabel ? (
                          <Text size={100} className={styles.rerunAddedText}>
                            {t("digideal.rerun.addedOn", { date: addedAtLabel })}
                          </Text>
                        ) : null}
                        {productionStatusLabel ? (
                          <Text size={100} className={styles.rerunAddedText}>
                            {productionStatusLabel}
                          </Text>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className={styles.rerunIconRow}>
                    {rerunIcons.map((icon) => (
                      <Tooltip
                        key={icon.key}
                        content={icon.label}
                        relationship="label"
                        positioning="below"
                      >
                        <button
                          type="button"
                          className={styles.rerunIconButton}
                          aria-label={icon.label}
                        >
                          {icon.icon}
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              )}
            </TableCell>
          </TableRow>
        );
      }),
    [
      items,
      styles,
      t,
      addingIds,
      removingIds,
      hoveredRemoveId,
      addToProduction,
      removeFromProduction,
      openRerunDialog,
      openSupplierDialog,
      isAdmin,
    ]
  );

  return (
    <div className={styles.layout}>
      <Card className={styles.controlsCard}>
        <div className={styles.topRow}>
          <Field label={<span className={styles.filterLabel}>{t("digideal.filters.search")}</span>}>
            <Input
              value={search}
              onChange={(_, data) => setSearch(data.value)}
              placeholder={t("digideal.filters.searchPlaceholder")}
              className={styles.searchInput}
            />
          </Field>
          <Field label={<span className={styles.filterLabel}>{t("digideal.filters.category")}</span>}>
            <Input
              value={category}
              onChange={(_, data) => setCategory(data.value)}
              placeholder={t("digideal.filters.categoryPlaceholder")}
              className={styles.filterField}
            />
          </Field>
          <Field label={<span className={styles.filterLabel}>{t("digideal.filters.tags")}</span>}>
            <Input
              value={tag}
              onChange={(_, data) => setTag(data.value)}
              placeholder={t("digideal.filters.tagsPlaceholder")}
              className={styles.filterField}
            />
          </Field>
        </div>
        <div className={styles.bottomRow}>
          <Field label={<span className={styles.filterLabel}>{t("digideal.filters.status")}</span>}>
            <Dropdown
              value={
                status === "all"
                  ? t("digideal.status.all")
                  : status === "offline"
                    ? t("digideal.status.offline")
                    : t("digideal.status.online")
              }
              selectedOptions={[status]}
              onOptionSelect={(_, data) =>
                setStatus(String(data.optionValue) || "online")
              }
              className={mergeClasses(styles.dropdownCompact, styles.filterField)}
            >
              <Option value="online">{t("digideal.status.online")}</Option>
              <Option value="offline">{t("digideal.status.offline")}</Option>
              <Option value="all">{t("digideal.status.all")}</Option>
            </Dropdown>
          </Field>
          <Field label={<span className={styles.filterLabel}>{t("digideal.filters.seller")}</span>}>
            <Dropdown
              value={
                sellerFilter === "all" ? t("digideal.seller.all") : sellerFilter
              }
              selectedOptions={[sellerFilter]}
              onOptionSelect={(_, data) =>
                setSellerFilter(String(data.optionValue) || "all")
              }
              className={mergeClasses(styles.dropdownCompact, styles.filterField)}
            >
              <Option value="all">{t("digideal.seller.all")}</Option>
              {sellerOptions.map((seller) => (
                <Option key={seller.seller_name} value={seller.seller_name}>
                  {seller.seller_name}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field label={<span className={styles.filterLabel}>{t("digideal.filters.sort")}</span>}>
            <Dropdown
              value={
                sort === "sold_today"
                  ? t("digideal.sort.soldToday")
                  : sort === "sold_7d"
                    ? t("digideal.sort.sold7d")
                    : sort === "sold_all_time"
                      ? t("digideal.sort.soldAll")
                      : sort === "first_seen_desc"
                        ? t("digideal.sort.firstSeen")
                        : t("digideal.sort.lastSeen")
              }
              selectedOptions={[sort]}
              onOptionSelect={(_, data) =>
                setSort(String(data.optionValue) || "last_seen_desc")
              }
              className={mergeClasses(styles.dropdownCompact, styles.filterField)}
            >
              <Option value="last_seen_desc">{t("digideal.sort.lastSeen")}</Option>
              <Option value="first_seen_desc">{t("digideal.sort.firstSeen")}</Option>
              <Option value="sold_today">{t("digideal.sort.soldToday")}</Option>
              <Option value="sold_7d">{t("digideal.sort.sold7d")}</Option>
              <Option value="sold_all_time">{t("digideal.sort.soldAll")}</Option>
            </Dropdown>
          </Field>
          <Field label={<span className={styles.filterLabel}>{t("digideal.filters.pages")}</span>}>
            <Dropdown
              value={String(pageSize)}
              selectedOptions={[String(pageSize)]}
              onOptionSelect={(_, data) =>
                setPageSize(Number(data.optionValue) || 25)
              }
              className={mergeClasses(styles.dropdownCompact, styles.filterField)}
            >
              <Option value="25">25</Option>
              <Option value="50">50</Option>
              <Option value="100">100</Option>
              <Option value="200">200</Option>
            </Dropdown>
          </Field>
        </div>
      </Card>

      <Card className={styles.tableCard}>
        {error ? <MessageBar intent="error">{error}</MessageBar> : null}
        {isLoading ? (
          <Spinner label={t("digideal.loading")} />
        ) : items.length === 0 ? (
          <Text>{t("digideal.empty")}</Text>
        ) : (
          <Table className={styles.table} size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.imageCol} aria-label={t("digideal.table.image")} />
                <TableHeaderCell className={styles.productCol}>
                  {t("digideal.table.product")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.salesCol}>
                  {t("digideal.table.salesSeller")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.priceCol}>
                  {t("digideal.table.price")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.statusCol}>
                  {t("digideal.table.status")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.linkCol}>
                  {t("digideal.table.link")}
                </TableHeaderCell>
                <TableHeaderCell>
                  {t("digideal.table.optimize")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.estimatedPriceCol}>
                  {t("digideal.table.estimatedRerunPrice")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.rerunCol}>
                  {t("digideal.table.rerun")}
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>{rows}</TableBody>
          </Table>
        )}
        <div className={styles.pagination}>
          <Text size={200} className={styles.metaText}>
            {t("digideal.pagination.pageOf", { page, pageCount })}
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

      <Dialog open={isRerunDialogOpen} onOpenChange={(_, data) => setIsRerunDialogOpen(data.open)}>
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody>
            <DialogTitle>{t("digideal.rerun.dialog.title")}</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              {rerunTargetTitle ? (
                <Text size={200}>{rerunTargetTitle}</Text>
              ) : null}
              <div className={styles.dialogField}>
                <Text weight="semibold">
                  {t("digideal.rerun.dialog.commentLabel")}
                </Text>
                <Input
                  value={rerunComment}
                  onChange={(_, data) => setRerunComment(data.value)}
                  placeholder={t("digideal.rerun.dialog.commentPlaceholder")}
                />
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeRerunDialog}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleRerunSave}
                disabled={isRerunSaving}
              >
                {t("digideal.rerun.dialog.save")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog
        open={supplierDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closeSupplierDialog();
          }
        }}
      >
        <DialogSurface className={styles.supplierDialog}>
          <DialogBody>
            <DialogTitle>{t("digideal.supplier.dialog.title")}</DialogTitle>
            <DialogContent className={styles.supplierDialogContent}>
              {supplierTarget ? (
                <Text size={200} className={styles.supplierDialogMeta}>
                  {supplierTarget.listing_title ||
                    supplierTarget.title_h1 ||
                    supplierTarget.product_slug ||
                    supplierTarget.product_id}
                </Text>
              ) : null}
              {supplierError ? (
                <MessageBar intent="error">{supplierError}</MessageBar>
              ) : null}
              <Field
                label={
                  <span className={styles.filterLabel}>
                    {t("digideal.supplier.dialog.urlLabel")}
                  </span>
                }
              >
                <Input
                  value={supplierUrlDraft}
                  onChange={(_, data) => setSupplierUrlDraft(data.value)}
                  placeholder={t("digideal.supplier.dialog.urlPlaceholder")}
                />
              </Field>
              <Field
                label={
                  <span className={styles.filterLabel}>
                    {t("digideal.supplier.dialog.weightLabel")}
                  </span>
                }
              >
                <Input
                  type="number"
                  value={supplierWeightDraft}
                  onChange={(_, data) => setSupplierWeightDraft(data.value)}
                  placeholder={t("digideal.supplier.dialog.weightPlaceholder")}
                  min={0}
                />
              </Field>
              <Field
                label={
                  <span className={styles.filterLabel}>
                    {t("digideal.supplier.dialog.priceLabel")}
                  </span>
                }
              >
                <Input
                  type="number"
                  value={supplierPriceDraft}
                  onChange={(_, data) => setSupplierPriceDraft(data.value)}
                  placeholder={t("digideal.supplier.dialog.pricePlaceholder")}
                  min={0}
                  step="0.01"
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeSupplierDialog}>
                {t("digideal.supplier.dialog.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleSupplierSave}
                disabled={supplierSaving}
              >
                {t("digideal.supplier.dialog.save")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog
        open={isOptimizeDialogOpen}
        onOpenChange={(_, data) => setIsOptimizeDialogOpen(data.open)}
      >
        <DialogSurface className={styles.optimizeDialogSurface}>
          <DialogBody>
            <DialogTitle>{t("digideal.optimize.title")}</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              {analysisLoading ? (
                <Spinner label={t("digideal.optimize.loading")} />
              ) : analysisError ? (
                <MessageBar intent="error">{analysisError}</MessageBar>
              ) : analysisView ? (
                <div className={styles.optimizeOverlayWrap}>
                  <div className={styles.optimizeBlurLayer}>{analysisView}</div>
                  <div className={styles.optimizeOverlay}>
                    <span className={styles.optimizeOverlayBadge}>
                      {t("digideal.optimize.comingSoon")}
                    </span>
                  </div>
                </div>
              ) : (
                <Text>{t("digideal.optimize.empty")}</Text>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                onClick={() => setIsOptimizeDialogOpen(false)}
              >
                {t("common.close")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
