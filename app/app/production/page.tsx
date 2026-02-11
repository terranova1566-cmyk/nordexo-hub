"use client";

 import {
  Badge,
  Button,
  Card,
  Checkbox,
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
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatCurrency, formatDateTime } from "@/lib/format";

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
  taxonomy_path?: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  sold_today: number | null;
  sold_7d: number | null;
  sold_all_time: number | null;
  // Discovery pricing fields
  price?: number | null;
  previous_price?: number | null;
  last_price?: number | null;
  last_previous_price?: number | null;
  // DigiDeal pricing fields
  last_original_price?: number | null;
  last_discount_percent?: number | null;
  last_you_save_kr?: number | null;
  shipping_cost_kr?: number | null;
  status?: string | null;
  seller_name?: string | null;
  // Linked product
  identical_spu?: string | null;
  // Manual supplier precedence for DigiDeal
  supplier_1688_url?: string | null;
  supplier_locked?: boolean | null;
  created_at: string | null;
  comment_count?: number | null;
  supplier_count?: number | null;
  supplier_selected?: boolean | null;
  supplier_selected_offer_image_url?: string | null;
  supplier_selected_offer_title?: string | null;
  supplier_selected_offer_detail_url?: string | null;
};

type ProductionComment = {
  id: string;
  user_label: string;
  comment: string;
  created_at: string;
};

type SupplierOffer = {
  rank?: number;
  offerId?: string | number | null;
  detailUrl?: string | null;
  imageUrl?: string | null;
  subject?: string | null;
  subject_en?: string | null;
  sellerName?: string | null;
  saleAmount?: string | number | null;
  [key: string]: unknown;
};

type SupplierSelection = {
  provider: string;
  product_id: string;
  selected_offer_id: string | null;
  selected_detail_url: string | null;
  selected_offer: SupplierOffer | null;
  locked?: boolean;
};

type CropRectNorm = { x: number; y: number; w: number; h: number };

type CatalogProduct = {
  id: string;
  spu: string | null;
  title: string | null;
  brand: string | null;
  vendor: string | null;
  thumbnail_url: string | null;
  small_image_url: string | null;
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
      verticalAlign: "middle",
    },
  },
  imageCol: {
    width: "83px",
    paddingLeft: "8px",
    paddingRight: 0,
    boxSizing: "border-box",
  },
  productCol: {
    width: "420px",
    maxWidth: "420px",
    minWidth: "420px",
    paddingLeft: "15px",
    paddingRight: "20px",
  },
  providerCol: {
    width: "150px",
  },
  salesCol: {
    width: "150px",
  },
  priceCol: {
    width: "190px",
  },
  linkCol: {
    width: "100px",
  },
  linkedCol: {
    width: "180px",
  },
  commentsCol: {
    width: "160px",
  },
  suppliersCol: {
    width: "170px",
  },
  selectCol: {
    width: "56px",
    paddingRight: "10px",
    paddingLeft: "10px",
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
  productCellStack: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: 0,
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
    color: tokens.colorBrandForeground1,
    cursor: "pointer",
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    "&:hover": {
      textDecorationLine: "underline",
      color: tokens.colorBrandForeground2,
    },
  },
  breadcrumbDivider: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
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
  cellStack: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
  },
  priceRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "6px",
    flexWrap: "wrap",
  },
  priceCurrent: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  priceShipping: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
  },
  pricePrevious: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    textDecorationLine: "line-through",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  discountText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
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
  linkedProductStack: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "6px",
    minWidth: 0,
  },
  linkedSpuRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    minWidth: 0,
  },
  linkedRelinkButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    width: "22px",
    height: "22px",
    borderRadius: "999px",
    color: tokens.colorNeutralForeground3,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background-color 0.12s ease, color 0.12s ease",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground3,
      color: tokens.colorBrandForeground1,
    },
  },
  linkedRelinkIcon: {
    width: "16px",
    height: "16px",
  },
  linkedSpuLink: {
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: "nowrap",
    textDecorationLine: "none",
    "&:hover": {
      textDecorationLine: "underline",
      color: tokens.colorBrandForeground2,
    },
  },
  linkedDialogSurface: {
    width: "min(2200px, 70vw)",
    maxWidth: "min(2200px, 70vw)",
    "@media (max-width: 1100px)": {
      width: "96vw",
      maxWidth: "96vw",
    },
  },
  linkedDialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    maxHeight: "min(78vh, 720px)",
    minHeight: 0,
  },
  linkedDialogGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1fr)",
    gap: "16px",
    minHeight: 0,
    "@media (max-width: 1100px)": {
      gridTemplateColumns: "1fr",
    },
  },
  linkedResultsWrap: {
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  linkedResultRow: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "10px 12px",
    backgroundColor: tokens.colorNeutralBackground1,
    display: "grid",
    gridTemplateColumns: "64px 1fr",
    gap: "12px",
    alignItems: "center",
    cursor: "pointer",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  linkedResultRowSelected: {
    border: "1px solid #0f6cbd",
    backgroundColor: "#e6f2fb",
  },
  linkedResultImage: {
    width: "64px",
    height: "64px",
    borderRadius: "12px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  linkedResultPrimary: {
    fontWeight: tokens.fontWeightSemibold,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    lineHeight: "1.2",
  },
  linkedResultSecondary: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
  supplierDialog: {
    minWidth: "680px",
    maxWidth: "980px",
    maxHeight: "min(84vh, 820px)",
  },
  supplierHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  supplierHeaderTitle: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  supplierHeaderActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  supplierSortButtonContent: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap",
  },
  supplierSortIcon: {
    width: "14px",
    height: "14px",
    display: "block",
  },
  supplierDialogContentWrap: {
    position: "relative",
    minHeight: "220px",
  },
  supplierBusyLayer: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.55)",
    backdropFilter: "blur(2px)",
    zIndex: 5,
  },
  supplierBusyInner: {
    borderRadius: "12px",
    padding: "10px 12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  supplierList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxHeight: "624px",
    overflowY: "auto",
    padding: "2px",
  },
  supplierSectionTitle: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: "0.01em",
    textTransform: "uppercase",
    marginTop: "6px",
  },
  supplierRow: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "8px 10px",
    backgroundColor: tokens.colorNeutralBackground1,
    display: "grid",
    gridTemplateColumns: "110px 1fr",
    gap: "10px",
    alignItems: "center",
  },
  supplierRowClickable: {
    cursor: "pointer",
    transition: "background-color 0.12s ease, border-color 0.12s ease",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  supplierRowSelected: {
    border: "1px solid #0f6cbd",
    backgroundColor: "#e6f2fb",
  },
  supplierThumb: {
    width: "110px",
    height: "110px",
    borderRadius: "12px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
    display: "block",
  },
  supplierTitle: {
    fontWeight: 600,
    lineHeight: "1.35",
    display: "-webkit-box",
    WebkitLineClamp: 1,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  supplierTitleEn: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    lineHeight: "1.25",
    display: "-webkit-box",
    WebkitLineClamp: 1,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  supplierMeta: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  supplierMetaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
    lineHeight: "1.15",
  },
  supplierTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
  },
  supplierMetaItem: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
  },
  supplierPriceText: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightBold,
    fontSize: tokens.fontSizeBase300,
  },
  supplierMetaLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap",
  },
  supplierLinkRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: "2px",
  },
  externalIcon: {
    width: "14px",
    height: "14px",
  },
  supplierLink: {
    color: tokens.colorBrandForeground1,
    textDecorationLine: "none",
    "&:hover": {
      textDecorationLine: "underline",
    },
  },
  supplierSelectedButton: {
    backgroundColor: "#d6f5da",
    color: "#165a23",
    selectors: {
      "&:hover": {
        backgroundColor: "#c3eccc",
      },
    },
  },
  cropOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.55)",
    backdropFilter: "blur(2px)",
    zIndex: 9,
    padding: "16px",
  },
  cropModal: {
    width: "min(520px, 92vw)",
    aspectRatio: "1 / 1",
    borderRadius: "14px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
    position: "relative",
    overflow: "hidden",
  },
  cropModalHeader: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 2,
    padding: "10px 12px",
    backgroundColor: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(6px)",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  cropModalActions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    padding: "10px 12px",
    backgroundColor: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(6px)",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "8px",
  },
  cropModalTitle: {
    fontWeight: tokens.fontWeightSemibold,
  },
  cropStage: {
    position: "absolute",
    inset: 0,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  cropStageViewport: {
    position: "absolute",
    left: "12px",
    right: "12px",
    top: "52px",
    bottom: "58px",
    borderRadius: "12px",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  cropStagePadding: {
    position: "absolute",
    inset: "16px",
    borderRadius: "10px",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  cropImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    userSelect: "none",
    WebkitUserSelect: "none",
    pointerEvents: "none",
  },
  cropMissing: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
    textAlign: "center",
  },
  cropRect: {
    position: "absolute",
    border: "2px solid #0f6cbd",
    borderRadius: "8px",
    backgroundColor: "rgba(15,108,189,0.08)",
    boxSizing: "border-box",
    touchAction: "none",
  },
  cropHandle: {
    position: "absolute",
    width: "14px",
    height: "14px",
    borderRadius: "4px",
    backgroundColor: "#ffffff",
    border: "2px solid #0f6cbd",
    boxSizing: "border-box",
    touchAction: "none",
  },
  cropHandleNW: { left: "-7px", top: "-7px", cursor: "nwse-resize" },
  cropHandleNE: { right: "-7px", top: "-7px", cursor: "nesw-resize" },
  cropHandleSW: { left: "-7px", bottom: "-7px", cursor: "nesw-resize" },
  cropHandleSE: { right: "-7px", bottom: "-7px", cursor: "nwse-resize" },
  supplierSelectedThumbTooltip: {
    width: "200px",
    height: "200px",
    padding: 0,
    borderRadius: 0,
    overflow: "hidden",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  supplierSelectedThumb: {
    width: "200px",
    height: "200px",
    borderRadius: 0,
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
    display: "block",
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

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierTarget, setSupplierTarget] = useState<ProductionItem | null>(null);
  const [supplierOffers, setSupplierOffers] = useState<SupplierOffer[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [supplierSelectedOfferId, setSupplierSelectedOfferId] = useState<string>("");
  const [supplierSelected, setSupplierSelected] = useState<SupplierSelection | null>(null);
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierLockedUrl, setSupplierLockedUrl] = useState<string | null>(null);
  const [supplierTranslating, setSupplierTranslating] = useState(false);
  const [supplierBgStatus, setSupplierBgStatus] = useState<Record<string, "searching" | "done" | "error">>({});
  const [supplierBusy, setSupplierBusy] = useState(false);
  const [supplierSearchImageUrl, setSupplierSearchImageUrl] = useState<string | null>(null);
  const [supplierPriceSortDir, setSupplierPriceSortDir] = useState<
    "asc" | "desc" | null
  >(null);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());

  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [cropNaturalSize, setCropNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const [cropRect, setCropRect] = useState<CropRectNorm>({ x: 0.12, y: 0.12, w: 0.76, h: 0.76 });
  const dragRef = useRef<{
    handle: "nw" | "ne" | "sw" | "se" | "move";
    startX: number;
    startY: number;
    startRect: CropRectNorm;
    imgBox: { left: number; top: number; width: number; height: number };
  } | null>(null);
  const [recropSearching, setRecropSearching] = useState(false);

  const [linkedDialogOpen, setLinkedDialogOpen] = useState(false);
  const [linkedTarget, setLinkedTarget] = useState<ProductionItem | null>(null);
  const [linkedResults, setLinkedResults] = useState<CatalogProduct[]>([]);
  const [linkedSelectedId, setLinkedSelectedId] = useState<string | null>(null);
  const [linkedManualSpu, setLinkedManualSpu] = useState("");
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [linkedSaving, setLinkedSaving] = useState(false);
  const [linkedError, setLinkedError] = useState<string | null>(null);

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

  const closeSupplierDialog = useCallback(() => {
    setSupplierDialogOpen(false);
    setSupplierTarget(null);
    setSupplierOffers([]);
    setSupplierError(null);
    setSupplierSelectedOfferId("");
    setSupplierSelected(null);
    setSupplierLoading(false);
    setSupplierSaving(false);
    setSupplierLockedUrl(null);
    setSupplierTranslating(false);
    setSupplierBusy(false);
    setSupplierSearchImageUrl(null);
    setSupplierPriceSortDir(null);
  }, []);

  const closeCropDialog = useCallback(() => {
    setCropDialogOpen(false);
    setCropImageUrl(null);
    setCropNaturalSize(null);
    setCropRect({ x: 0.12, y: 0.12, w: 0.76, h: 0.76 });
    dragRef.current = null;
    setRecropSearching(false);
  }, []);

  const getSupplierKey = useCallback((item: { provider: string; product_id: string }) => {
    return `${item.provider}:${item.product_id}`;
  }, []);

  const normalizeSupplierImageUrl = useCallback((value: string | null) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (raw.startsWith("//")) return `https:${raw}`;
    if (raw.startsWith("http://")) return `https://${raw.slice("http://".length)}`;
    return raw;
  }, []);

  const formatRmb = useCallback((value: number) => {
    // Keep it simple and consistent across environments.
    const fixed = Number.isFinite(value) ? value.toFixed(2) : String(value);
    return `¥${fixed}`;
  }, []);

  const pickOfferPriceRmb = useCallback(
    (offer: SupplierOffer): string | null => {
      const candidates = [
        (offer as any)?.price,
        (offer as any)?.priceValue,
        (offer as any)?.priceRmb,
        (offer as any)?.oldPrice,
      ];
      for (const candidate of candidates) {
        const raw =
          typeof candidate === "string" ? Number(candidate) : (candidate as number);
        if (!Number.isFinite(raw)) continue;
        // Heuristic: many 1688 prices come back as "fen" integers.
        const normalized = raw >= 1000 ? raw / 100 : raw;
        return formatRmb(normalized);
      }
      return null;
    },
    [formatRmb]
  );

  const pickOfferPriceRmbNumber = useCallback((offer: SupplierOffer): number | null => {
    const candidates = [
      (offer as any)?.price,
      (offer as any)?.priceValue,
      (offer as any)?.priceRmb,
      (offer as any)?.oldPrice,
    ];
    for (const candidate of candidates) {
      const raw = typeof candidate === "string" ? Number(candidate) : (candidate as number);
      if (!Number.isFinite(raw)) continue;
      if (Number.isInteger(raw) && raw >= 1000 && raw <= 100000) return raw / 100;
      return raw;
    }
    return null;
  }, []);

  const buildOfferMeta = useCallback(
    (offer: SupplierOffer) => {
      const pickSold = () => {
        const candidates = [
          offer?.saleAmount,
          (offer as any)?.saleAmount30d,
          (offer as any)?.saleAmount30Days,
          (offer as any)?.sold30d,
          (offer as any)?.sold,
          (offer as any)?.saleCount,
          (offer as any)?.saleQuantity,
          (offer as any)?.monthSoldNum,
        ];
        for (const candidate of candidates) {
          if (candidate === null || candidate === undefined) continue;
          const text = String(candidate).trim();
          if (text) return text;
        }
        return null;
      };
      const sold = pickSold();
      const qtyBegin = (offer as any)?.quantityBegin;
      const unit = typeof (offer as any)?.unit === "string" ? String((offer as any).unit).trim() : "";
      const moq =
        Number.isFinite(Number(qtyBegin)) && Number(qtyBegin) > 0
          ? `${Number(qtyBegin)}${unit || ""}`
          : null;
      const province = typeof (offer as any)?.province === "string" ? String((offer as any).province).trim() : "";
      const city = typeof (offer as any)?.city === "string" ? String((offer as any).city).trim() : "";
      const location = province || city ? [province, city].filter(Boolean).join(" / ") : null;
      const supplyAmountRaw = (offer as any)?.supplyAmount;
      const supplyAmount =
        Number.isFinite(Number(supplyAmountRaw)) && Number(supplyAmountRaw) > 0
          ? String(Number(supplyAmountRaw))
          : null;
      const price = pickOfferPriceRmb(offer);
      return {
        price,
        sold,
        moq,
        location,
        supplyAmount,
        seller: typeof offer?.sellerName === "string" ? offer.sellerName.trim() : "",
      };
    },
    [pickOfferPriceRmb]
  );

  const openLinkedDialog = useCallback((item: ProductionItem) => {
    setLinkedTarget(item);
    setLinkedDialogOpen(true);
    setLinkedResults([]);
    setLinkedSelectedId(null);
    setLinkedManualSpu("");
    setLinkedError(null);
    setLinkedLoading(false);
    setLinkedSaving(false);
  }, []);

  const closeLinkedDialog = useCallback(() => {
    setLinkedDialogOpen(false);
    setLinkedTarget(null);
    setLinkedResults([]);
    setLinkedSelectedId(null);
    setLinkedManualSpu("");
    setLinkedError(null);
    setLinkedLoading(false);
    setLinkedSaving(false);
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

  const openSupplierDialog = useCallback(
    async (item: ProductionItem) => {
      setSupplierTarget(item);
      setSupplierDialogOpen(true);
      setSupplierError(null);
      setSupplierOffers([]);
      setSupplierSelectedOfferId("");
      setSupplierSelected(null);
      setSupplierLoading(true);
      setSupplierLockedUrl(null);
      setSupplierTranslating(false);
      setSupplierBusy(false);
      setSupplierSearchImageUrl(null);
      setSupplierPriceSortDir(null);
      try {
        const params = new URLSearchParams({
          provider: item.provider,
          product_id: item.product_id,
        });
        // Prefer the original remote image for search retries; local paths can disappear.
        const localImageUrl =
          item.image_local_url ||
          (item.image_local_path
            ? `/api/discovery/local-image?path=${encodeURIComponent(
                item.image_local_path
              )}`
            : null);
        const imageUrl = item.image_url || localImageUrl;
        if (imageUrl) params.set("image_url", imageUrl);

        const response = await fetch(`/api/production/suppliers?${params.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || t("production.suppliers.errorLoad"));
        }
        const offers = Array.isArray(payload?.offers) ? payload.offers : [];
        setSupplierOffers(offers);
        const input = payload?.input ?? null;
        const usedPicUrl =
          typeof input?.usedPicUrl === "string"
            ? input.usedPicUrl
            : typeof input?.picUrl === "string"
              ? input.picUrl
              : imageUrl || null;
        setSupplierSearchImageUrl(usedPicUrl);
        const lockedUrl =
          typeof payload?.locked_supplier_url === "string" && payload.locked_supplier_url.trim()
            ? payload.locked_supplier_url.trim()
            : null;
        setSupplierLockedUrl(lockedUrl);
        const selectedPayload = payload?.selected ?? null;
        const selectedOfferId =
          typeof selectedPayload?.selected_offer_id === "string"
            ? String(selectedPayload.selected_offer_id)
            : "";
        setSupplierSelectedOfferId(selectedOfferId);
        setSupplierSelected(
          selectedPayload && typeof selectedPayload === "object"
            ? {
                provider: String(selectedPayload.provider ?? item.provider),
                product_id: String(selectedPayload.product_id ?? item.product_id),
                selected_offer_id:
                  typeof selectedPayload.selected_offer_id === "string"
                    ? selectedPayload.selected_offer_id
                    : null,
                selected_detail_url:
                  typeof selectedPayload.selected_detail_url === "string"
                    ? selectedPayload.selected_detail_url
                    : null,
                selected_offer:
                  selectedPayload.selected_offer && typeof selectedPayload.selected_offer === "object"
                    ? (selectedPayload.selected_offer as SupplierOffer)
                    : null,
                locked: Boolean(selectedPayload.locked),
              }
            : null
        );

        // Background-translate titles once offers are cached (best-effort).
        const needsTranslation = offers.some((offer: SupplierOffer) => {
          const subject = typeof offer?.subject === "string" ? offer.subject.trim() : "";
          const en = typeof offer?.subject_en === "string" ? offer.subject_en.trim() : "";
          return Boolean(subject) && !en;
        });
        if (needsTranslation) {
          setSupplierTranslating(true);
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 15000);
          fetch("/api/production/suppliers/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: item.provider,
              product_id: item.product_id,
            }),
            signal: controller.signal,
          })
            .then(async (res) => {
              const translatedPayload = await res.json().catch(() => null);
              if (!translatedPayload || typeof translatedPayload !== "object") return;
              const updatedOffers = Array.isArray((translatedPayload as any).offers)
                ? (translatedPayload as any).offers
                : null;
              if (updatedOffers) setSupplierOffers(updatedOffers);
            })
            .catch(() => null)
            .finally(() => {
              window.clearTimeout(timeout);
              setSupplierTranslating(false);
            });
        }
      } catch (err) {
        setSupplierError(
          err instanceof Error ? err.message : t("production.suppliers.errorLoad")
        );
      } finally {
        setSupplierLoading(false);
      }
    },
    [t]
  );

  const openCropDialog = useCallback(() => {
    if (!supplierTarget) return;
    const localImageUrl =
      supplierTarget.image_local_url ||
      (supplierTarget.image_local_path
        ? `/api/discovery/local-image?path=${encodeURIComponent(
            supplierTarget.image_local_path
          )}`
        : null);
    const cachedUrl =
      supplierSearchImageUrl && !supplierSearchImageUrl.includes("/api/discovery/local-image")
        ? supplierSearchImageUrl
        : null;
    const fallback =
      cachedUrl ||
      supplierTarget.image_url ||
      supplierSearchImageUrl ||
      localImageUrl ||
      null;
    setCropImageUrl(fallback);
    setCropDialogOpen(true);
    setCropNaturalSize(null);
    setCropRect({ x: 0.12, y: 0.12, w: 0.76, h: 0.76 });
    dragRef.current = null;
  }, [supplierSearchImageUrl, supplierTarget]);

  const getCropImageBox = useCallback(() => {
    const stage = cropStageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    const n = cropNaturalSize;
    if (!n || !n.w || !n.h) {
      return {
        stage: rect,
        img: { left: 0, top: 0, width: rect.width, height: rect.height },
      };
    }

    const scale = Math.min(rect.width / n.w, rect.height / n.h);
    const renderedW = n.w * scale;
    const renderedH = n.h * scale;
    const left = (rect.width - renderedW) / 2;
    const top = (rect.height - renderedH) / 2;
    return {
      stage: rect,
      img: { left, top, width: renderedW, height: renderedH },
    };
  }, [cropNaturalSize]);

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  const clampRect = useCallback((r: CropRectNorm) => {
    const minSize = 0.06;
    const w = Math.max(minSize, Math.min(1, r.w));
    const h = Math.max(minSize, Math.min(1, r.h));
    const x = clamp01(r.x);
    const y = clamp01(r.y);
    const x2 = Math.min(1, x + w);
    const y2 = Math.min(1, y + h);
    return { x: Math.max(0, x2 - w), y: Math.max(0, y2 - h), w, h };
  }, []);

  const beginDrag = useCallback(
    (ev: React.PointerEvent, handle: "nw" | "ne" | "sw" | "se" | "move") => {
      if (!cropDialogOpen) return;
      const box = getCropImageBox();
      if (!box) return;
      ev.preventDefault();
      ev.stopPropagation();
      (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
      dragRef.current = {
        handle,
        startX: ev.clientX,
        startY: ev.clientY,
        startRect: cropRect,
        imgBox: box.img,
      };
    },
    [cropDialogOpen, cropRect, getCropImageBox]
  );

  const onDragMove = useCallback(
    (ev: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const stage = cropStageRef.current;
      if (!stage) return;
      ev.preventDefault();
      const dxPx = ev.clientX - drag.startX;
      const dyPx = ev.clientY - drag.startY;
      const dx = drag.imgBox.width > 0 ? dxPx / drag.imgBox.width : 0;
      const dy = drag.imgBox.height > 0 ? dyPx / drag.imgBox.height : 0;

      const s = drag.startRect;
      let next: CropRectNorm = { ...s };
      if (drag.handle === "move") {
        next = { ...s, x: s.x + dx, y: s.y + dy };
      } else if (drag.handle === "nw") {
        next = { x: s.x + dx, y: s.y + dy, w: s.w - dx, h: s.h - dy };
      } else if (drag.handle === "ne") {
        next = { x: s.x, y: s.y + dy, w: s.w + dx, h: s.h - dy };
      } else if (drag.handle === "sw") {
        next = { x: s.x + dx, y: s.y, w: s.w - dx, h: s.h + dy };
      } else if (drag.handle === "se") {
        next = { x: s.x, y: s.y, w: s.w + dx, h: s.h + dy };
      }
      setCropRect(clampRect(next));
    },
    [clampRect]
  );

  const endDrag = useCallback((ev: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    ev.preventDefault();
    dragRef.current = null;
  }, []);

  const handleRecropSearch = useCallback(async () => {
    if (!supplierTarget) return;
    if (!cropImageUrl) return;
    if (!cropNaturalSize || !cropNaturalSize.w || !cropNaturalSize.h) return;

    setRecropSearching(true);
    setSupplierBusy(true);
    closeCropDialog();

    try {
      // Convert the normalized crop rect to source pixels.
      const x = Math.round(cropRect.x * cropNaturalSize.w);
      const y = Math.round(cropRect.y * cropNaturalSize.h);
      const width = Math.round(cropRect.w * cropNaturalSize.w);
      const height = Math.round(cropRect.h * cropNaturalSize.h);

      const response = await fetch("/api/production/suppliers/recrop-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: supplierTarget.provider,
          product_id: supplierTarget.product_id,
          image_url: cropImageUrl,
          crop: { x, y, width, height },
          limit: 10,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("production.suppliers.errorLoad"));
      }
      const offers = Array.isArray(payload?.offers) ? payload.offers : [];
      setSupplierOffers(offers);
      const count =
        typeof payload?.offer_count === "number" ? payload.offer_count : offers.length;
      setItems((prev) =>
        prev.map((entry) =>
          entry.provider === supplierTarget.provider &&
          entry.product_id === supplierTarget.product_id
            ? { ...entry, supplier_count: count }
            : entry
        )
      );
      const input = payload?.input ?? null;
      const usedPicUrl =
        typeof input?.usedPicUrl === "string"
          ? input.usedPicUrl
          : typeof input?.picUrl === "string"
            ? input.picUrl
            : cropImageUrl;
      setSupplierSearchImageUrl(usedPicUrl);

      // Best-effort: translate the refreshed offer titles as well.
      const needsTranslation = offers.some((offer: SupplierOffer) => {
        const subject = typeof offer?.subject === "string" ? offer.subject.trim() : "";
        const en = typeof offer?.subject_en === "string" ? offer.subject_en.trim() : "";
        return Boolean(subject) && !en;
      });
      if (needsTranslation) {
        setSupplierTranslating(true);
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        fetch("/api/production/suppliers/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: supplierTarget.provider,
            product_id: supplierTarget.product_id,
          }),
          signal: controller.signal,
        })
          .then(async (res) => {
            const translatedPayload = await res.json().catch(() => null);
            if (!translatedPayload || typeof translatedPayload !== "object") return;
            const updatedOffers = Array.isArray((translatedPayload as any).offers)
              ? (translatedPayload as any).offers
              : null;
            if (updatedOffers) setSupplierOffers(updatedOffers);
          })
          .catch(() => null)
          .finally(() => {
            window.clearTimeout(timeout);
            setSupplierTranslating(false);
          });
      }
    } catch (err) {
      setSupplierError(
        err instanceof Error ? err.message : t("production.suppliers.errorLoad")
      );
    } finally {
      setRecropSearching(false);
      setSupplierBusy(false);
    }
  }, [closeCropDialog, cropImageUrl, cropNaturalSize, cropRect, supplierTarget, t]);

  const handleSaveSupplier = useCallback(async () => {
    if (!supplierTarget) return;
    if (supplierLockedUrl) return;
    const offerId = supplierSelectedOfferId.trim();
    if (!offerId) return;
    setSupplierSaving(true);
    setSupplierError(null);
    try {
      const response = await fetch("/api/production/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: supplierTarget.provider,
          product_id: supplierTarget.product_id,
          offer_id: offerId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("production.suppliers.errorSave"));
      }
      if (payload?.selected) {
        const selectedOffer =
          payload.selected?.selected_offer && typeof payload.selected.selected_offer === "object"
            ? (payload.selected.selected_offer as SupplierOffer)
            : null;
        setSupplierSelected({
          provider: supplierTarget.provider,
          product_id: supplierTarget.product_id,
          selected_offer_id:
            typeof payload.selected?.selected_offer_id === "string"
              ? payload.selected.selected_offer_id
              : offerId,
          selected_detail_url:
            typeof payload.selected?.selected_detail_url === "string"
              ? payload.selected.selected_detail_url
              : null,
          selected_offer: selectedOffer,
          locked: false,
        });

        const selectedImageUrl =
          selectedOffer && typeof (selectedOffer as any)?.imageUrl === "string"
            ? normalizeSupplierImageUrl(String((selectedOffer as any).imageUrl))
            : null;
        const selectedTitle =
          selectedOffer && typeof (selectedOffer as any)?.subject === "string"
            ? String((selectedOffer as any).subject)
            : null;
        const selectedDetailUrl =
          selectedOffer && typeof (selectedOffer as any)?.detailUrl === "string"
            ? String((selectedOffer as any).detailUrl)
            : null;

        setItems((prev) =>
          prev.map((entry) =>
            entry.provider === supplierTarget.provider &&
            entry.product_id === supplierTarget.product_id
              ? {
                  ...entry,
                  supplier_selected: true,
                  supplier_selected_offer_image_url: selectedImageUrl,
                  supplier_selected_offer_title: selectedTitle,
                  supplier_selected_offer_detail_url: selectedDetailUrl,
                }
              : entry
          )
        );
      } else {
        setItems((prev) =>
          prev.map((entry) =>
            entry.provider === supplierTarget.provider &&
            entry.product_id === supplierTarget.product_id
              ? { ...entry, supplier_selected: true }
              : entry
          )
        );
      }
      closeSupplierDialog();
    } catch (err) {
      setSupplierError(
        err instanceof Error ? err.message : t("production.suppliers.errorSave")
      );
    } finally {
      setSupplierSaving(false);
    }
  }, [
    closeSupplierDialog,
    normalizeSupplierImageUrl,
    supplierLockedUrl,
    supplierSelectedOfferId,
    supplierTarget,
    t,
  ]);

  useEffect(() => {
    const allowed = new Set(items.map((it) => `${it.provider}:${it.product_id}`));
    setSelectedKeys((prev) => {
      const next = new Set<string>();
      for (const key of prev) {
        if (allowed.has(key)) next.add(key);
      }
      return next;
    });
  }, [items]);

  // Background supplier searching: silently hydrate supplier counts so the user can open production
  // and see cached suppliers without waiting for a click.
  useEffect(() => {
    if (!adminLoaded || !isAdmin) return;
    if (items.length === 0) return;
    const started = new Set(Object.entries(supplierBgStatus).filter(([, v]) => v === "searching").map(([k]) => k));
    const searchingCount = started.size;
    const maxConcurrent = 2;
    const capacity = Math.max(0, maxConcurrent - searchingCount);
    if (capacity <= 0) return;

    const targets = items
      .filter((item) => item.supplier_count === null)
      .slice(0, capacity);
    if (targets.length === 0) return;

    targets.forEach((item) => {
      const key = getSupplierKey(item);
      if (supplierBgStatus[key] === "searching" || supplierBgStatus[key] === "done") return;
      setSupplierBgStatus((prev) => ({ ...prev, [key]: "searching" }));

      const params = new URLSearchParams({
        provider: item.provider,
        product_id: item.product_id,
      });
      const localImageUrl =
        item.image_local_url ||
        (item.image_local_path
          ? `/api/discovery/local-image?path=${encodeURIComponent(item.image_local_path)}`
          : null);
      const imageUrl = localImageUrl || item.image_url;
      if (imageUrl) params.set("image_url", imageUrl);

      fetch(`/api/production/suppliers?${params.toString()}`)
        .then(async (res) => {
          const payload = await res.json().catch(() => null);
          if (!payload || typeof payload !== "object") throw new Error("invalid payload");
          const count = Number((payload as any)?.offer_count);
          const safeCount = Number.isFinite(count) ? count : null;
          setItems((prev) =>
            prev.map((entry) =>
              entry.provider === item.provider && entry.product_id === item.product_id
                ? { ...entry, supplier_count: safeCount }
                : entry
            )
          );
          setSupplierBgStatus((prev) => ({ ...prev, [key]: "done" }));

          // Best-effort background translation so English titles are ready when opening the dialog.
          if (safeCount !== null && safeCount > 0) {
            fetch("/api/production/suppliers/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider: item.provider,
                product_id: item.product_id,
              }),
            }).catch(() => null);
          }
        })
        .catch(() => {
          setSupplierBgStatus((prev) => ({ ...prev, [key]: "error" }));
        });
    });
  }, [adminLoaded, getSupplierKey, isAdmin, items, supplierBgStatus]);

  useEffect(() => {
    if (!linkedDialogOpen || !linkedTarget) {
      setLinkedResults([]);
      setLinkedSelectedId(null);
      setLinkedError(null);
      setLinkedLoading(false);
      return;
    }

    const controller = new AbortController();
    let isActive = true;

    const loadMatches = async () => {
      setLinkedLoading(true);
      setLinkedError(null);
      setLinkedResults([]);
      setLinkedSelectedId(null);

      const inputText = String(linkedTarget.title || linkedTarget.product_id || "")
        .trim()
        .slice(0, 600);

      if (!inputText) {
        setLinkedLoading(false);
        return;
      }

      try {
        const advancedResponse = await fetch("/api/products/advanced-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: inputText }),
          signal: controller.signal,
        });

        if (!advancedResponse.ok) {
          const text = await advancedResponse.text();
          throw new Error(text || t("production.linked.errorSearch"));
        }

        const advancedPayload = await advancedResponse.json();
        const expandedQuery =
          String(advancedPayload?.expanded_query ?? inputText).trim() || inputText;
        const coreTerms = Array.isArray(advancedPayload?.core_terms)
          ? advancedPayload.core_terms
              .map((term: unknown) => String(term ?? "").trim())
              .filter(Boolean)
          : [];

        const params = new URLSearchParams();
        params.set("q", expandedQuery);
        params.set("sort", "relevance");
        params.set("pageSize", "50");
        if (coreTerms.length > 0) {
          params.set("coreTerms", coreTerms.join("|"));
        }

        const productsResponse = await fetch(`/api/products?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!productsResponse.ok) {
          const text = await productsResponse.text();
          throw new Error(text || t("production.linked.errorSearch"));
        }

        const productsPayload = await productsResponse.json();
        const mapped: CatalogProduct[] = Array.isArray(productsPayload?.items)
          ? productsPayload.items
              .map((row: any) => {
                const id = String(row?.id ?? "").trim();
                if (!id) return null;
                return {
                  id,
                  spu: row?.spu ?? null,
                  title: row?.title ?? null,
                  brand: row?.brand ?? null,
                  vendor: row?.vendor ?? null,
                  thumbnail_url: row?.thumbnail_url ?? null,
                  small_image_url: row?.small_image_url ?? null,
                } satisfies CatalogProduct;
              })
              .filter((row: CatalogProduct | null): row is CatalogProduct => Boolean(row))
          : [];

        if (isActive) {
          setLinkedResults(mapped);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (isActive) {
          setLinkedError(err instanceof Error ? err.message : t("production.linked.errorSearch"));
        }
      } finally {
        if (isActive) setLinkedLoading(false);
      }
    };

    void loadMatches();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [linkedDialogOpen, linkedTarget?.product_id, linkedTarget?.title, t]);

  const handleLinkedSave = useCallback(async () => {
    if (!linkedTarget) {
      closeLinkedDialog();
      return;
    }
    if (!isAdmin) return;

    const manualSpu = linkedManualSpu.trim();
    let spu = manualSpu;
    if (!spu) {
      const selected = linkedResults.find((row) => row.id === linkedSelectedId);
      spu = String(selected?.spu ?? "").trim();
    }
    if (!spu) {
      setLinkedError(t("production.linked.errorSelect"));
      return;
    }

    setLinkedSaving(true);
    setLinkedError(null);
    try {
      const endpoint =
        linkedTarget.provider === "digideal" ? "/api/digideal/identical" : "/api/discovery/identical";
      const body =
        linkedTarget.provider === "digideal"
          ? { product_id: linkedTarget.product_id, identical_spu: spu }
          : { provider: linkedTarget.provider, product_id: linkedTarget.product_id, identical_spu: spu };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("production.linked.errorSave"));
      }

      const savedSpu = String(payload?.item?.identical_spu ?? spu).trim() || spu;
      setItems((prev) =>
        prev.map((entry) =>
          entry.provider === linkedTarget.provider && entry.product_id === linkedTarget.product_id
            ? { ...entry, identical_spu: savedSpu }
            : entry
        )
      );
      closeLinkedDialog();
    } catch (err) {
      setLinkedError(err instanceof Error ? err.message : t("production.linked.errorSave"));
    } finally {
      setLinkedSaving(false);
    }
  }, [closeLinkedDialog, isAdmin, linkedManualSpu, linkedResults, linkedSelectedId, linkedTarget, t]);

  const handleLinkedUnlink = useCallback(async () => {
    if (!linkedTarget) {
      closeLinkedDialog();
      return;
    }
    if (!isAdmin) return;
    if (!linkedTarget.identical_spu) return;

    setLinkedSaving(true);
    setLinkedError(null);
    try {
      const endpoint =
        linkedTarget.provider === "digideal" ? "/api/digideal/identical" : "/api/discovery/identical";
      const body =
        linkedTarget.provider === "digideal"
          ? { product_id: linkedTarget.product_id, identical_spu: null }
          : { provider: linkedTarget.provider, product_id: linkedTarget.product_id, identical_spu: null };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("production.linked.errorSave"));
      }

      setItems((prev) =>
        prev.map((entry) =>
          entry.provider === linkedTarget.provider && entry.product_id === linkedTarget.product_id
            ? { ...entry, identical_spu: null }
            : entry
        )
      );
      setLinkedTarget((prev) => (prev ? { ...prev, identical_spu: null } : prev));
      setLinkedSelectedId(null);
      setLinkedManualSpu("");
    } catch (err) {
      setLinkedError(err instanceof Error ? err.message : t("production.linked.errorSave"));
    } finally {
      setLinkedSaving(false);
    }
  }, [closeLinkedDialog, isAdmin, linkedTarget, t]);

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
	    const allRowKeys = items.map((it) => `${it.provider}:${it.product_id}`);
	    const selectedCount = allRowKeys.filter((k) => selectedKeys.has(k)).length;
	    const allSelected = allRowKeys.length > 0 && selectedCount === allRowKeys.length;
	    const someSelected = selectedCount > 0 && !allSelected;
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
            <TableHeaderCell className={styles.priceCol}>
              {t("production.table.price")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.linkCol}>
              {t("production.table.link")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.suppliersCol}>
              {t("production.table.suppliers")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.linkedCol}>
              {t("production.table.linkedProduct")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.commentsCol}>
              {t("production.table.comments")}
            </TableHeaderCell>
	            <TableHeaderCell className={styles.actionCell}>
	              {t("production.table.actions")}
	            </TableHeaderCell>
	            <TableHeaderCell className={styles.selectCol}>
	              <Checkbox
	                checked={allSelected ? true : someSelected ? "mixed" : false}
	                onChange={(_, data) => {
	                  const checked = data.checked === true;
	                  setSelectedKeys(() => {
	                    if (!checked) return new Set();
	                    return new Set(allRowKeys);
	                  });
	                }}
	                aria-label={t("production.table.selectAll")}
	              />
	            </TableHeaderCell>
	          </TableRow>
	        </TableHeader>
        <TableBody>
	          {items.map((item) => {
	            const rowKey = `${item.provider}:${item.product_id}`;
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
            const supplierCount =
              typeof item.supplier_count === "number" ? item.supplier_count : null;
            const supplierLabel =
              supplierCount === null
                ? supplierBgStatus[`${item.provider}:${item.product_id}`] === "searching"
                  ? t("production.suppliers.searching")
                  : t("production.suppliers.search")
                : t("production.suppliers.count", { count: supplierCount });
            const supplierSelected = Boolean(item.supplier_selected);
            const supplierButtonLabel = supplierSelected
              ? t("production.suppliers.selected")
              : supplierLabel;
            const selectedSupplierThumbRaw =
              typeof item.supplier_selected_offer_image_url === "string"
                ? item.supplier_selected_offer_image_url.trim()
                : "";
            const selectedSupplierThumbUrl = selectedSupplierThumbRaw
              ? normalizeSupplierImageUrl(selectedSupplierThumbRaw)
              : "";
            const selectedSupplierThumbTitle =
              typeof item.supplier_selected_offer_title === "string" &&
              item.supplier_selected_offer_title.trim()
                ? item.supplier_selected_offer_title.trim()
                : t("production.suppliers.selected");
            const supplierTooltipContent =
              supplierSelected && selectedSupplierThumbUrl ? (
                <div className={styles.supplierSelectedThumbTooltip}>
                  <img
                    src={selectedSupplierThumbUrl}
                    alt={selectedSupplierThumbTitle}
                    className={styles.supplierSelectedThumb}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : (
                supplierLabel
              );
            const hasLinkedProduct = Boolean(String(item.identical_spu ?? "").trim());
            const linkedSpu = String(item.identical_spu ?? "").trim();

            const isDigideal = item.provider === "digideal";
            const priceValue = isDigideal
              ? (typeof item.last_price === "number" ? item.last_price : null)
              : (typeof item.price === "number"
                  ? item.price
                  : typeof item.last_price === "number"
                    ? item.last_price
                    : null);
            const prevPriceValue = isDigideal
              ? (typeof item.last_original_price === "number" ? item.last_original_price : null)
              : (typeof item.previous_price === "number"
                  ? item.previous_price
                  : typeof item.last_previous_price === "number"
                    ? item.last_previous_price
                    : null);
            const shippingCost =
              typeof item.shipping_cost_kr === "number" ? item.shipping_cost_kr : null;
            const shippingCostLabel =
              shippingCost !== null
                ? shippingCost === 0
                  ? "0 kr"
                  : formatCurrency(shippingCost, "SEK")
                : "—";
            const discount = typeof item.last_discount_percent === "number" ? item.last_discount_percent : null;
            const saveKr = typeof item.last_you_save_kr === "number" ? item.last_you_save_kr : null;
	            return (
	              <TableRow key={rowKey}>
                <TableCell className={styles.imageCol}>
                  {imageSrc ? (
                    <Image src={imageSrc} alt={title} className={styles.thumb} />
                  ) : null}
                </TableCell>
                <TableCell className={mergeClasses(styles.productCol)}>
                  <div className={styles.productCellStack}>
                    <Text className={styles.productTitle}>{title}</Text>
                    {category ? (
                      <div className={styles.breadcrumbRow}>
                        <button
                          type="button"
                          className={styles.breadcrumbLink}
                          onClick={() => {
                            window.location.href = `/app/discovery?categories=${categoryParam}`;
                          }}
                        >
                          {category}
                        </button>
                      </div>
                    ) : (
                      <Text size={100} className={styles.cardMeta}>
                        -
                      </Text>
                    )}
                  </div>
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
                <TableCell className={styles.priceCol}>
                  <div className={styles.cellStack}>
                    <div className={styles.priceRow}>
                      <Text className={styles.priceCurrent}>
                        {priceValue !== null ? formatCurrency(priceValue, "SEK") : "-"}
                      </Text>
                      {isDigideal ? (
                        <Text className={styles.priceShipping}>
                          ({shippingCostLabel})
                        </Text>
                      ) : null}
                      {prevPriceValue !== null && prevPriceValue > (priceValue ?? 0) ? (
                        <Text className={styles.pricePrevious}>
                          {formatCurrency(prevPriceValue, "SEK")}
                        </Text>
                      ) : null}
                    </div>
                    {isDigideal && (discount !== null || saveKr !== null) ? (
                      <Text size={200} className={styles.discountText}>
                        {discount !== null
                          ? t("digideal.discount", { value: discount })
                          : null}
                        {discount !== null && saveKr !== null ? " · " : null}
                        {saveKr !== null ? t("digideal.save", { value: saveKr }) : null}
                      </Text>
                    ) : null}
                    {!isDigideal && prevPriceValue !== null && prevPriceValue > (priceValue ?? 0) ? (
                      <Text size={200} className={styles.discountText}>
                        {t("discovery.price.prev", { value: formatCurrency(prevPriceValue, "SEK") })}
                      </Text>
                    ) : null}
                  </div>
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
                      className={styles.linkButton}
                    >
                      <span className={styles.linkButtonContent}>
                        {t("production.link.view")}
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
                          <path d="M10 14l11 -11" />
                          <path d="M21 3v8" />
                          <path d="M21 3h-8" />
                          <path d="M14 10v8a2 2 0 0 1 -2 2h-7a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2h8" />
                        </svg>
                      </span>
                    </Button>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className={styles.suppliersCol}>
                  <Tooltip
                    content={supplierTooltipContent}
                    relationship="label"
                    positioning={
                      supplierSelected && selectedSupplierThumbUrl
                        ? { position: "above", align: "center", offset: 10 }
                        : undefined
                    }
                  >
                    <Button
                      appearance={supplierSelected ? "primary" : "outline"}
                      size="small"
                      className={mergeClasses(
                        supplierSelected ? styles.supplierSelectedButton : styles.linkButton
                      )}
                      onClick={() => openSupplierDialog(item)}
                    >
                      {supplierButtonLabel}
                    </Button>
                  </Tooltip>
                </TableCell>
                <TableCell className={styles.linkedCol}>
                  <div className={styles.linkedProductStack}>
                    {hasLinkedProduct ? (
                      <div className={styles.linkedSpuRow}>
                        <a
                          href={`/app/products/spu/${encodeURIComponent(linkedSpu)}`}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.linkedSpuLink}
                        >
                          {linkedSpu}
                        </a>
                        <button
                          type="button"
                          className={styles.linkedRelinkButton}
                          onClick={() => openLinkedDialog(item)}
                          aria-label={t("production.linked.relink")}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={styles.linkedRelinkIcon}
                            aria-hidden="true"
                          >
                            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                            <path d="M9 15l3 -3m2 -2l1 -1" />
                            <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" />
                            <path d="M3 3l18 18" />
                            <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" />
                          </svg>
                        </button>
                      </div>
	                    ) : (
	                      <Button
	                        appearance="outline"
	                        size="small"
	                        className={styles.linkButton}
	                        onClick={() => openLinkedDialog(item)}
	                      >
	                        {t("production.linked.link")}
	                      </Button>
	                    )}
	                  </div>
	                </TableCell>
	                <TableCell className={styles.commentsCol}>
	                  <Button
	                    appearance="outline"
	                    size="small"
	                    className={styles.linkButton}
	                    onClick={() => openCommentDialog(item)}
	                  >
	                    {commentLabel}
	                  </Button>
	                </TableCell>
	                <TableCell className={styles.actionCell}>
	                  <div className={styles.actionRow}>
	                    <Button
	                      appearance="outline"
	                      size="small"
	                      className={styles.linkButton}
	                      onClick={() => handleRemove(item)}
	                      disabled={removingKey === rowKey}
	                    >
	                      {t("production.action.remove")}
	                    </Button>
	                    <Button
	                      appearance="outline"
	                      size="small"
	                      className={styles.linkButton}
	                      disabled
	                    >
	                      {t("production.action.produce")}
	                    </Button>
	                  </div>
	                </TableCell>
	                <TableCell className={styles.selectCol}>
	                  <Checkbox
	                    checked={selectedKeys.has(rowKey)}
	                    onChange={(_, data) => {
	                      const checked = data.checked === true;
	                      setSelectedKeys((prev) => {
	                        const next = new Set(prev);
	                        if (checked) next.add(rowKey);
	                        else next.delete(rowKey);
	                        return next;
	                      });
	                    }}
	                    aria-label={t("production.table.selectRow")}
	                  />
	                </TableCell>
	              </TableRow>
	            );
	          })}
        </TableBody>
      </Table>
    );
  }, [
    handleRemove,
    items,
    loading,
    normalizeSupplierImageUrl,
    openCommentDialog,
    openLinkedDialog,
    openSupplierDialog,
    removingKey,
    selectedKeys,
    supplierBgStatus,
    styles,
    t,
  ]);

  return (
    <>
      <Card className={styles.card}>
        <Text size={600} weight="semibold">
          {t("production.title")}
        </Text>
        <Text size={200} className={styles.cardMeta}>
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
            <DialogTitle>{t("production.suppliers.title")}</DialogTitle>
            <DialogContent className={mergeClasses(styles.commentSection, styles.supplierDialogContentWrap)}>
              {supplierBusy ? (
                <div className={styles.supplierBusyLayer}>
                  <div className={styles.supplierBusyInner}>
                    <Spinner label={t("production.suppliers.loading")} />
                  </div>
                </div>
              ) : null}
              {supplierTarget ? (
                <div className={styles.supplierHeaderRow}>
                  <Text size={200} className={styles.supplierHeaderTitle}>
                    {supplierTarget.title ?? supplierTarget.product_id}
                  </Text>
                  <div className={styles.supplierHeaderActions}>
                    <Button
                      appearance="primary"
                      size="small"
                      onClick={() => {
                        const next =
                          supplierPriceSortDir === null
                            ? "asc"
                            : supplierPriceSortDir === "asc"
                              ? "desc"
                              : "asc";
                        setSupplierPriceSortDir(next);
                      }}
                      disabled={supplierLoading || supplierOffers.length === 0}
                    >
                      <span className={styles.supplierSortButtonContent}>
                        {t("production.suppliers.filterByPrice")}
                        {supplierPriceSortDir === "asc" ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={styles.supplierSortIcon}
                            aria-hidden="true"
                          >
                            <path d="M12 5v14" />
                            <path d="M19 12l-7 7l-7-7" />
                          </svg>
                        ) : supplierPriceSortDir === "desc" ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={styles.supplierSortIcon}
                            aria-hidden="true"
                          >
                            <path d="M12 19V5" />
                            <path d="M5 12l7-7l7 7" />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={styles.supplierSortIcon}
                            aria-hidden="true"
                          >
                            <path d="M12 5v14" />
                            <path d="M5 9l7-7l7 7" />
                            <path d="M19 15l-7 7l-7-7" />
                          </svg>
                        )}
                      </span>
                    </Button>
                  </div>
                </div>
              ) : null}
              {supplierError ? (
                <MessageBar intent="error">{supplierError}</MessageBar>
              ) : null}
              {supplierLockedUrl ? (
                <MessageBar>
                  {t("production.suppliers.locked")}{" "}
                  <a
                    href={supplierLockedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.supplierLink}
                  >
                    {t("production.suppliers.openLocked")}
                  </a>
                </MessageBar>
              ) : null}
              {supplierLoading ? (
                <Spinner label={t("production.suppliers.loading")} />
              ) : supplierOffers.length === 0 ? (
                <Text>{t("production.suppliers.empty")}</Text>
              ) : (
                <div className={styles.supplierList}>
                  {supplierLockedUrl ? (
                    <>
                      <Text className={styles.supplierSectionTitle}>
                        {t("production.suppliers.selectedHeader")}
                      </Text>
                      <div
                        className={mergeClasses(
                          styles.supplierRow,
                          styles.supplierRowSelected
                        )}
                      >
                        <div />
                        <div className={styles.supplierMeta}>
                          <Text className={styles.supplierTitle}>
                            {t("production.suppliers.lockedSelectedTitle")}
                          </Text>
                          <div className={styles.supplierMetaRow}>
                            <a
                              href={supplierLockedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={mergeClasses(styles.supplierLink, styles.supplierMetaLink)}
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              {t("production.suppliers.openLocked")}
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={styles.externalIcon}
                                aria-hidden="true"
                              >
                                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                                <path d="M10 14l11 -11" />
                                <path d="M21 3v8" />
                                <path d="M21 3h-8" />
                                <path d="M14 10v8a2 2 0 0 1 -2 2h-7a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2h8" />
                              </svg>
                            </a>
                          </div>
                        </div>
                      </div>
                      <Text className={styles.supplierSectionTitle}>
                        {t("production.suppliers.otherHeader")}
                      </Text>
                    </>
                  ) : supplierSelected?.selected_offer ? (
                    <>
                      <Text className={styles.supplierSectionTitle}>
                        {t("production.suppliers.selectedHeader")}
                      </Text>
                      {(() => {
                        const offer = supplierSelected.selected_offer as SupplierOffer;
                        const offerId =
                          offer?.offerId === null || offer?.offerId === undefined
                            ? ""
                            : String(offer.offerId);
                        const url =
                          typeof offer?.detailUrl === "string" ? offer.detailUrl : "";
                        const title =
                          typeof offer?.subject === "string" && offer.subject.trim()
                            ? offer.subject
                            : offerId || "#";
                        const titleEn =
                          typeof offer?.subject_en === "string" ? offer.subject_en.trim() : "";
                        const imageUrl = normalizeSupplierImageUrl(
                          typeof offer?.imageUrl === "string" ? offer.imageUrl : ""
                        );
                        const meta = buildOfferMeta(offer);
                        return (
                          <div
                            className={mergeClasses(
                              styles.supplierRow,
                              styles.supplierRowSelected
                            )}
                          >
                            <div>
                              {imageUrl ? (
                                <img
                                  src={imageUrl}
                                  alt={title}
                                  className={styles.supplierThumb}
                                  referrerPolicy="no-referrer"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : null}
                            </div>
                            <div className={styles.supplierMeta}>
                              <div className={styles.supplierTitleRow}>
                                <Text className={styles.supplierTitle}>{title}</Text>
                                <Badge appearance="filled" color="brand">
                                  {t("production.suppliers.pinned")}
                                </Badge>
                              </div>
                              {titleEn ? (
                                <Text className={styles.supplierTitleEn}>{titleEn}</Text>
                              ) : null}
	                              <div className={styles.supplierMetaRow}>
	                                {meta.price ? (
	                                  <Text className={mergeClasses(styles.supplierMetaItem, styles.supplierPriceText)}>
	                                    {t("production.suppliers.price")}: {meta.price}
	                                  </Text>
	                                ) : null}
                                {meta.sold ? (
                                  <Text className={styles.supplierMetaItem}>
                                    {t("production.suppliers.sales")}: {meta.sold}
                                  </Text>
                                ) : null}
                                {meta.moq ? (
                                  <Text className={styles.supplierMetaItem}>
                                    {t("production.suppliers.moq")}: {meta.moq}
                                  </Text>
                                ) : null}
                                {meta.location ? (
                                  <Text className={styles.supplierMetaItem}>
                                    {t("production.suppliers.location")}: {meta.location}
                                  </Text>
                                ) : null}
                                {meta.supplyAmount ? (
                                  <Text className={styles.supplierMetaItem}>
                                    {t("production.suppliers.supply")}: {meta.supplyAmount}
                                  </Text>
                                ) : null}
                              </div>
                              {url ? (
                                <div className={styles.supplierLinkRow}>
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={mergeClasses(styles.supplierLink, styles.supplierMetaLink)}
                                  >
                                    {t("production.suppliers.open1688")}
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className={styles.externalIcon}
                                      aria-hidden="true"
                                    >
                                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                                      <path d="M10 14l11 -11" />
                                      <path d="M21 3v8" />
                                      <path d="M21 3h-8" />
                                      <path d="M14 10v8a2 2 0 0 1 -2 2h-7a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2h8" />
                                    </svg>
                                  </a>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  ) : null}

                  {supplierSelected?.selected_offer ? (
                    <Text className={styles.supplierSectionTitle}>
                      {t("production.suppliers.otherHeader")}
                    </Text>
                  ) : null}

                  {(() => {
                    const pinnedId = supplierSelected?.selected_offer_id
                      ? String(supplierSelected.selected_offer_id)
                      : "";
                    const decorated = supplierOffers
                      .filter((offer) => {
                        if (!pinnedId) return true;
                        const offerId =
                          offer?.offerId === null || offer?.offerId === undefined
                            ? ""
                            : String(offer.offerId);
                        return offerId !== pinnedId;
                      })
                      .map((offer, idx) => ({
                        offer,
                        idx,
                        price: pickOfferPriceRmbNumber(offer),
                      }));

                    if (supplierPriceSortDir) {
                      decorated.sort((a, b) => {
                        const ap = a.price;
                        const bp = b.price;
                        if (ap === null && bp === null) return a.idx - b.idx;
                        if (ap === null) return 1;
                        if (bp === null) return -1;
                        const diff = ap - bp;
                        if (diff === 0) return a.idx - b.idx;
                        return supplierPriceSortDir === "asc" ? diff : -diff;
                      });
                    }

                    return decorated.map(({ offer, idx }) => {
                    const offerId =
                      offer?.offerId === null || offer?.offerId === undefined
                        ? ""
                        : String(offer.offerId);
                    const url =
                      typeof offer?.detailUrl === "string" ? offer.detailUrl : "";
                    const title =
                      typeof offer?.subject === "string" && offer.subject.trim()
                        ? offer.subject
                        : offerId || `#${idx + 1}`;
                    const titleEn =
                      typeof offer?.subject_en === "string" ? offer.subject_en.trim() : "";
                    const imageUrl = normalizeSupplierImageUrl(
                      typeof offer?.imageUrl === "string" ? offer.imageUrl : ""
                    );
                    const isSelected = offerId && supplierSelectedOfferId === offerId;
                    const meta = buildOfferMeta(offer);
                    const rowKey = `${offerId || idx}`;
                    return (
                      <div
                        key={rowKey}
                        className={mergeClasses(
                          styles.supplierRow,
                          styles.supplierRowClickable,
                          isSelected ? styles.supplierRowSelected : undefined
                        )}
                        onClick={() => {
                          if (!offerId) return;
                          if (supplierLockedUrl) return;
                          setSupplierSelectedOfferId(offerId);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(ev) => {
                          if (ev.key !== "Enter" && ev.key !== " ") return;
                          ev.preventDefault();
                          if (!offerId) return;
                          if (supplierLockedUrl) return;
                          setSupplierSelectedOfferId(offerId);
                        }}
                      >
                        <div>
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={title}
                              className={styles.supplierThumb}
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : null}
                        </div>
                        <div className={styles.supplierMeta}>
                          <Text className={styles.supplierTitle}>{title}</Text>
                          {titleEn ? (
                            <Text className={styles.supplierTitleEn}>{titleEn}</Text>
                          ) : supplierTranslating ? (
                            <Text className={styles.supplierTitleEn}>
                              {t("production.suppliers.translating")}
                            </Text>
                          ) : null}
                          <div className={styles.supplierMetaRow}>
                            {meta.price ? (
                              <Text className={mergeClasses(styles.supplierMetaItem, styles.supplierPriceText)}>
                                {t("production.suppliers.price")}: {meta.price}
                              </Text>
                            ) : null}
                            {meta.sold ? (
                              <Text className={styles.supplierMetaItem}>
                                {t("production.suppliers.sales")}: {meta.sold}
                              </Text>
                            ) : null}
                            {meta.moq ? (
                              <Text className={styles.supplierMetaItem}>
                                {t("production.suppliers.moq")}: {meta.moq}
                              </Text>
                            ) : null}
                            {meta.location ? (
                              <Text className={styles.supplierMetaItem}>
                                {t("production.suppliers.location")}: {meta.location}
                              </Text>
                            ) : null}
                            {meta.supplyAmount ? (
                              <Text className={styles.supplierMetaItem}>
                                {t("production.suppliers.supply")}: {meta.supplyAmount}
                              </Text>
                            ) : null}
                          </div>
                          {url ? (
                            <div className={styles.supplierLinkRow}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className={mergeClasses(styles.supplierLink, styles.supplierMetaLink)}
                                onClick={(ev) => ev.stopPropagation()}
                              >
                                {t("production.suppliers.open1688")}
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className={styles.externalIcon}
                                  aria-hidden="true"
                                >
                                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                                  <path d="M10 14l11 -11" />
                                  <path d="M21 3v8" />
                                  <path d="M21 3h-8" />
                                  <path d="M14 10v8a2 2 0 0 1 -2 2h-7a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2h8" />
                                </svg>
                              </a>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  });
                  })()}
                </div>
              )}
              {supplierTarget ? (
                (() => {
                  const key = getSupplierKey(supplierTarget);
                  const state = supplierBgStatus[key];
                  if (state !== "searching") return null;
                  return (
                    <Text size={200} className={styles.cardMeta}>
                      {t("production.suppliers.searchingFooter")}
                    </Text>
                  );
                })()
              ) : null}

              {cropDialogOpen ? (
                <div
                  className={styles.cropOverlay}
                  role="dialog"
                  aria-modal="true"
                  onClick={(ev) => {
                    // Keep clicks inside the recrop overlay from interacting with supplier rows.
                    ev.stopPropagation();
                  }}
                >
                  <div
                    className={styles.cropModal}
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <div className={styles.cropModalHeader}>
                      <Text className={styles.cropModalTitle}>
                        {t("production.suppliers.recropTitle")}
                      </Text>
                    </div>

                    {cropImageUrl ? (
                      <div className={styles.cropStage}>
                        <div className={styles.cropStageViewport}>
                          <div
                            className={styles.cropStagePadding}
                            ref={(el) => {
                              cropStageRef.current = el;
                            }}
                            onPointerMove={onDragMove}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            onPointerLeave={endDrag}
                          >
                            <img
                              src={cropImageUrl}
                              alt={t("production.suppliers.recropTitle")}
                              className={styles.cropImage}
                              referrerPolicy="no-referrer"
                              onLoad={(ev) => {
                                const img = ev.currentTarget;
                                if (img?.naturalWidth && img?.naturalHeight) {
                                  setCropNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                                }
                              }}
                            />
                            {(() => {
                              const box = getCropImageBox();
                              if (!box) return null;
                              const left = box.img.left + cropRect.x * box.img.width;
                              const top = box.img.top + cropRect.y * box.img.height;
                              const width = cropRect.w * box.img.width;
                              const height = cropRect.h * box.img.height;
                              return (
                                <div
                                  className={styles.cropRect}
                                  style={{ left, top, width, height }}
                                  onPointerDown={(ev) => beginDrag(ev, "move")}
                                >
                                  <div
                                    className={mergeClasses(styles.cropHandle, styles.cropHandleNW)}
                                    onPointerDown={(ev) => beginDrag(ev, "nw")}
                                  />
                                  <div
                                    className={mergeClasses(styles.cropHandle, styles.cropHandleNE)}
                                    onPointerDown={(ev) => beginDrag(ev, "ne")}
                                  />
                                  <div
                                    className={mergeClasses(styles.cropHandle, styles.cropHandleSW)}
                                    onPointerDown={(ev) => beginDrag(ev, "sw")}
                                  />
                                  <div
                                    className={mergeClasses(styles.cropHandle, styles.cropHandleSE)}
                                    onPointerDown={(ev) => beginDrag(ev, "se")}
                                  />
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.cropMissing}>
                        <Text>{t("production.suppliers.recropMissingImage")}</Text>
                      </div>
                    )}

                    <div className={styles.cropModalActions}>
                      <Button
                        appearance="secondary"
                        onClick={closeCropDialog}
                        disabled={recropSearching}
                      >
                        {t("production.suppliers.close")}
                      </Button>
                      <Button
                        appearance="primary"
                        onClick={handleRecropSearch}
                        disabled={recropSearching || !cropImageUrl || !cropNaturalSize}
                      >
                        {t("production.suppliers.recropSearch")}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="outline"
                onClick={openCropDialog}
                disabled={supplierLoading || supplierBusy || !supplierTarget}
              >
                {t("production.suppliers.recrop")}
              </Button>
              <Button appearance="secondary" onClick={closeSupplierDialog}>
                {t("production.suppliers.close")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleSaveSupplier}
                disabled={
                  supplierSaving ||
                  supplierSelectedOfferId.trim().length === 0 ||
                  Boolean(supplierLockedUrl)
                }
              >
                {t("production.suppliers.save")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog
        open={linkedDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) closeLinkedDialog();
        }}
      >
        <DialogSurface className={styles.linkedDialogSurface}>
          <DialogBody className={styles.linkedDialogBody}>
            <DialogTitle>{t("production.linked.title")}</DialogTitle>
            {linkedTarget ? (
              <div className={styles.linkedDialogGrid}>
                <div className={styles.commentSection}>
                  <Text size={200}>
                    {linkedTarget.title ?? linkedTarget.product_id}
                  </Text>
                  {linkedTarget.identical_spu ? (
                    <Text size={200}>
                      {t("production.linked.current")}{" "}
                      <a
                        href={`/app/products/spu/${encodeURIComponent(
                          String(linkedTarget.identical_spu)
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {String(linkedTarget.identical_spu)}
                      </a>
                    </Text>
                  ) : null}
                  {linkedError ? <MessageBar intent="error">{linkedError}</MessageBar> : null}
                  <Field label={t("production.linked.manualLabel")}>
                    <Textarea
                      value={linkedManualSpu}
                      onChange={(_, data) => setLinkedManualSpu(data.value)}
                      placeholder={t("production.linked.manualPlaceholder")}
                      resize="vertical"
                    />
                  </Field>
                </div>
                <div className={styles.linkedResultsWrap}>
                  {linkedLoading ? (
                    <Spinner label={t("production.linked.loading")} />
                  ) : linkedResults.length === 0 ? (
                    <Text>{t("production.linked.empty")}</Text>
                  ) : (
                    linkedResults.map((row) => {
                      const imageSrc = row.thumbnail_url || row.small_image_url || null;
                      const selected = linkedSelectedId === row.id;
                      return (
                        <div
                          key={row.id}
                          className={mergeClasses(
                            styles.linkedResultRow,
                            selected ? styles.linkedResultRowSelected : undefined
                          )}
                          onClick={() => setLinkedSelectedId(row.id)}
                        >
                          {imageSrc ? (
                            <Image
                              src={imageSrc}
                              alt={row.title ?? row.spu ?? row.id}
                              className={styles.linkedResultImage}
                            />
                          ) : (
                            <div className={styles.linkedResultImage} />
                          )}
                          <div>
                            <Text className={styles.linkedResultPrimary}>
                              {row.title ?? row.spu ?? row.id}
                            </Text>
                            <Text className={styles.linkedResultSecondary}>
                              {row.spu ?? "-"} {row.vendor ? `· ${row.vendor}` : ""}{" "}
                              {row.brand ? `· ${row.brand}` : ""}
                            </Text>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
            <DialogActions>
              <Button appearance="secondary" onClick={closeLinkedDialog}>
                {t("production.linked.close")}
              </Button>
              {linkedTarget?.identical_spu ? (
                <Button appearance="secondary" onClick={handleLinkedUnlink} disabled={linkedSaving}>
                  {t("production.linked.unlink")}
                </Button>
              ) : null}
              <Button appearance="primary" onClick={handleLinkedSave} disabled={linkedSaving || !isAdmin}>
                {t("production.linked.save")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
