"use client";

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Textarea,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PROVIDER = "partner_suggestions";
const MIN_SUPPLIER_GALLERY_BYTES = 20 * 1024;
const MIN_SUPPLIER_GALLERY_DIMENSION = 600;

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

type VariantCombo = {
  index: number;
  t1: string;
  t2: string;
  t3: string;
  t1_zh?: string;
  t1_en?: string;
  t2_zh?: string;
  t2_en?: string;
  t3_zh?: string;
  t3_en?: string;
  image_url?: string;
  image_thumb_url?: string;
  image_zoom_url?: string;
  image_full_url?: string;
  price_raw: string;
  price: number | null;
  weight_raw?: string;
  weight_grams?: number | null;
};

type ExternalDataStatus = {
  title?: { ok?: boolean; value?: string | null } | null;
  description?: { ok?: boolean; value?: string | null } | null;
  images?: { ok?: boolean; count?: number; mainImageUrl?: string | null } | null;
};

type ExternalData = {
  inputUrl?: string | null;
  finalUrl?: string | null;
  title?: string | null;
  description?: string | null;
  rawTitle?: string | null;
  rawDescription?: string | null;
  mainImageUrl?: string | null;
  rawMainImageUrl?: string | null;
  galleryImageUrls?: string[];
  rawGalleryImageUrls?: string[];
  errors?: string[];
  aiReview?: {
    model?: string | null;
    verified?: boolean;
    confidence?: number | null;
  } | null;
  status?: ExternalDataStatus | null;
};

type SourceJobState = {
  status?: "idle" | "queued" | "running" | "done" | "error" | string;
  stage?: "queued" | "crawl" | "ai_cleanup" | "done" | string;
  queuedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  updatedAt?: string | null;
  error?: string | null;
};

type ProductionStatusState = {
  status?: string | null;
  updated_at?: string | null;
  spu_assigned_at?: string | null;
  production_started_at?: string | null;
  production_done_at?: string | null;
  last_file_name?: string | null;
  last_job_id?: string | null;
};

type SuggestionItem = {
  id: string;
  createdAt: string;
  sourceType: "image" | "url";
  sourceLabel: string | null;
  sourceUrl: string | null;
  crawlFinalUrl: string | null;
  title: string | null;
  description: string | null;
  mainImageUrl: string | null;
  galleryImageUrls: string[];
  externalData?: ExternalData | null;
  errors: string[];
  searchJob?: {
    status: "idle" | "queued" | "running" | "done" | "error" | string;
    queuedAt?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    lastRunAt?: string | null;
    error?: string | null;
  } | null;
  sourceJob?: SourceJobState | null;
  googleTaxonomy?: {
    status?: "idle" | "queued" | "running" | "done" | "error" | string;
    id?: number | null;
    path?: string | null;
    l1?: string | null;
    l2?: string | null;
    l3?: string | null;
    confidence?: number | null;
    sourceTitle?: string | null;
    queuedAt?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    updatedAt?: string | null;
    error?: string | null;
  } | null;
  search: {
    fetchedAt: string | null;
    offerCount: number;
    offers: SupplierOffer[];
  };
  selection: {
    selected_offer_id: string | null;
    selected_detail_url: string | null;
    selected_offer?: Record<string, unknown> | null;
    payload_status: string | null;
    payload_error: string | null;
    payload_file_name: string | null;
  } | null;
  variantMetrics: {
    purchasePriceCny: number;
    weightGrams: number;
    priceMinCny: number;
    priceMaxCny: number;
    weightMinGrams: number;
    weightMaxGrams: number;
    shippingClass: string;
    selectedCount: number;
    availableCount: number;
    packsText: string | null;
  } | null;
  pricing: Array<{
    market: string;
    currency: string;
    b2bPrice: number;
    b2bPriceMin?: number | null;
    b2bPriceMax?: number | null;
  }>;
  productionStatus?: ProductionStatusState | null;
};

type VariantsPayload = {
  available_count: number;
  combos: VariantCombo[];
  selected_combo_indexes: number[];
  packs_text: string;
  gallery_images?: Array<{
    thumb_url?: string;
    full_url?: string;
    url?: string;
    url_full?: string;
  }>;
  type1_label?: string;
  type2_label?: string;
  type3_label?: string;
  sek_pricing_context?: {
    market: string;
    currency: "SEK";
    shipping_class: string;
    fx_rate_cny: number;
    weight_threshold_g: number;
    packing_fee: number;
    markup_percent: number;
    markup_fixed: number;
    rate_low: number;
    rate_high: number;
    base_low: number;
    base_high: number;
    mult_low: number;
    mult_high: number;
  } | null;
};

type SourceFilter = "all" | "image" | "url";
type SupplierFilter = "all" | "not_started" | "searching" | "selected";
type VariantFilter = "all" | "picked" | "not_picked";
type ViewerPriceRole = "admin" | "partner" | "non_admin";
type CategorySelection = { level: "l1" | "l2" | "l3"; value: string };
type CategoryNode = { name: string; children?: CategoryNode[] };
type PricingEntry = {
  market: string;
  currency: string;
  b2bPrice: number;
  b2bPriceMin?: number | null;
  b2bPriceMax?: number | null;
};

type SupplierGalleryImageEntry = {
  key: string;
  thumb: string;
  full: string;
  identity: string;
  source: "offer" | "gallery" | "variant";
};

type SupplierGalleryProbeResult = {
  width: number;
  height: number;
  byteSize: number | null;
  signature: string | null;
};

type VariantDraftOverride = {
  price: string;
  weightGrams: string;
};

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  title: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightSemibold,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  flashStack: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    overflow: "hidden",
  },
  flashItem: {
    maxHeight: "120px",
    opacity: 1,
    transform: "translateY(0)",
    transitionProperty: "max-height, opacity, transform, margin",
    transitionDuration: "260ms",
    transitionTimingFunction: "ease",
    margin: 0,
    overflow: "hidden",
  },
  flashItemClosing: {
    maxHeight: 0,
    opacity: 0,
    transform: "translateY(-10px)",
    marginTop: "-4px",
    marginBottom: "-4px",
  },
  toolbarCard: {
    padding: "10px 16px 14px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    width: "100%",
    boxSizing: "border-box",
  },
  toolbarTop: {
    display: "flex",
    alignItems: "flex-end",
    gap: "10px",
    flexWrap: "wrap",
  },
  toolbarSearchWrap: {
    minWidth: "220px",
    maxWidth: "420px",
    flex: "0 1 20%",
  },
  toolbarActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    marginLeft: "auto",
  },
  toolbarFilters: {
    display: "flex",
    alignItems: "flex-end",
    gap: "8px",
    flexWrap: "wrap",
    flex: "1 1 auto",
  },
  filterField: {
    minWidth: "unset",
    width: "fit-content",
    maxWidth: "100%",
  },
  dropdownCompact: {
    minWidth: "unset",
    width: "auto",
    maxWidth: "100%",
  },
  compactFieldLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground4,
    lineHeight: "1.15",
  },
  categoryTrigger: {
    justifyContent: "space-between",
    width: "auto",
    minWidth: "200px",
    maxWidth: "260px",
    textAlign: "left",
    fontWeight: tokens.fontWeightRegular,
  },
  categoryPopover: {
    padding: "12px",
    minWidth: "660px",
    maxWidth: "860px",
  },
  categorySearch: {
    marginBottom: "10px",
  },
  categoryColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(200px, 1fr))",
    gap: "12px",
    alignItems: "start",
  },
  categoryColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    maxHeight: "450px",
    overflowY: "auto",
    paddingRight: "12px",
  },
  categoryColumnTitle: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
  categoryItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 6px",
    borderRadius: "6px",
    width: "100%",
    boxSizing: "border-box",
    backgroundColor: "transparent",
    transition: "background-color 0.12s ease",
  },
  categoryItemInteractive: {
    cursor: "pointer",
    "&:hover": {
      backgroundColor: "#f1f1f1",
    },
    "&:focus-visible": {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "1px",
    },
  },
  categoryNavButton: {
    border: "none",
    backgroundColor: "transparent",
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  categoryNavActive: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  categoryCheckbox: {
    fontSize: tokens.fontSizeBase200,
    display: "flex",
    alignItems: "center",
  },
  categoryActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "12px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    "@media (max-width: 1080px)": {
      gridTemplateColumns: "1fr",
    },
  },
  paneCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  dropZone: {
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: "12px",
    padding: "20px",
    minHeight: "170px",
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "10px",
    textAlign: "center",
  },
  dropZoneLoading: {
    pointerEvents: "none",
    opacity: 0.72,
  },
  dropZoneActive: {
    border: "1px dashed #2b88d8",
    backgroundColor: "#edf6ff",
  },
  fileInputHidden: {
    display: "none",
  },
  helperText: {
    color: tokens.colorNeutralForeground3,
  },
  selectedMeta: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  saveRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  saveActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  actionOutlineButton: {
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  packsButtonAdded: {
    border: "1px solid #0f6cbd",
    color: "#0f6cbd",
    backgroundColor: "#e8f3ff",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
      border: "1px solid #0f6cbd",
      color: "#0f6cbd",
    },
    "&:active": {
      backgroundColor: "#dcedff",
      border: "1px solid #0f6cbd",
      color: "#0f6cbd",
    },
  },
  deleteButtonActive: {
    border: "1px solid #0f6cbd",
    color: "#0f6cbd",
    backgroundColor: "#e8f3ff",
    "&:hover": {
      border: "1px solid #0f6cbd",
      color: "#0f6cbd",
      backgroundColor: "#dcedff",
    },
    "&:active": {
      border: "1px solid #0f6cbd",
      color: "#0f6cbd",
      backgroundColor: "#d4e8ff",
    },
  },
  sendButtonActive: {
    border: "1px solid #0f6cbd",
    color: "#0f6cbd",
    backgroundColor: "#e8f3ff",
    "&:hover": {
      border: "1px solid #0f6cbd",
      color: "#0f6cbd",
      backgroundColor: "#dcedff",
    },
    "&:active": {
      border: "1px solid #0f6cbd",
      color: "#0f6cbd",
      backgroundColor: "#d4e8ff",
    },
  },
  tableCard: {
    padding: "10px 16px 16px",
    borderRadius: "var(--app-radius)",
    overflowX: "auto",
  },
  table: {
    minWidth: "1400px",
    tableLayout: "auto",
    "& .fui-TableCell": {
      paddingTop: "4px",
      paddingBottom: "4px",
      paddingLeft: "8px",
      paddingRight: "8px",
      verticalAlign: "middle",
    },
    "& .fui-TableHeaderCell": {
      paddingLeft: "8px",
      paddingRight: "8px",
      whiteSpace: "nowrap",
    },
  },
  selectCol: {
    width: "52px",
    minWidth: "52px",
    maxWidth: "52px",
    textAlign: "center",
  },
  imageCol: {
    width: "1%",
    minWidth: "86px",
    maxWidth: "86px",
    paddingRight: "6px",
    boxSizing: "border-box",
  },
  productCol: {
    minWidth: "320px",
    width: "22%",
  },
  sourceDataCol: {
    minWidth: "130px",
    width: "9%",
  },
  priceCol: {
    minWidth: "92px",
    width: "7%",
  },
  thumbShell: {
    width: "72px",
    height: "72px",
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: "hidden",
    boxSizing: "border-box",
  },
  thumb: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center center",
    display: "block",
  },
  thumbZoomImageMain: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center",
    display: "block",
  },
  thumbZoomImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center",
    display: "block",
  },
  thumbZoomTooltipContent: {
    maxWidth: "none",
    padding: "0",
    width: "340px",
    height: "340px",
    overflow: "hidden",
  },
  thumbZoomTooltipMainContent: {
    borderRadius: "0",
    overflow: "hidden",
  },
  thumbZoomFrame: {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    padding: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderRadius: "0",
    border: "0",
    overflow: "hidden",
  },
  titleCell: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
  },
  titleText: {
    fontWeight: tokens.fontWeightSemibold,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  sourceText: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "320px",
  },
  productMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    lineHeight: "1.2",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    flexWrap: "wrap",
  },
  productMetaSeparator: {
    color: tokens.colorNeutralForeground4,
  },
  sourceInlineLink: {
    color: tokens.colorNeutralForeground3,
    textDecorationLine: "none",
    textUnderlineOffset: "2px",
    "&:hover": {
      color: tokens.colorPaletteBlueForeground2,
      textDecorationLine: "underline",
    },
  },
  sourceInlineAction: {
    border: "none",
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground3,
    padding: 0,
    margin: 0,
    cursor: "pointer",
    fontSize: tokens.fontSizeBase100,
    lineHeight: "1.2",
    "&:hover": {
      color: tokens.colorPaletteBlueForeground2,
      textDecorationLine: "underline",
    },
  },
  taxonomyStatusRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    minHeight: "14px",
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    lineHeight: "1.15",
  },
  taxonomyStatusOk: {
    color: "#107c10",
  },
  taxonomyBreadcrumbRow: {
    display: "block",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: "1.05",
  },
  taxonomyBreadcrumbLink: {
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
    },
  },
  taxonomyBreadcrumbDivider: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    margin: "0 4px",
  },
  urlCell: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    minWidth: "145px",
    maxWidth: "150px",
  },
  urlStatusList: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    lineHeight: "1.15",
  },
  statusItem: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: "1.15",
    margin: 0,
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: "3px",
    minHeight: "0",
    lineHeight: "1.15",
  },
  statusIcon: {
    display: "inline-flex",
    width: "10px",
    minWidth: "10px",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "10px",
    lineHeight: "1",
  },
  statusLoadingText: {
    color: tokens.colorNeutralForeground3,
  },
  sourceInlineLoaderIcon: {
    width: "10px",
    height: "10px",
    display: "inline-block",
    animationName: {
      from: { transform: "rotate(0deg)" },
      to: { transform: "rotate(360deg)" },
    },
    animationDuration: "900ms",
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
  },
  statusOk: {
    color: "#107c10",
  },
  statusBad: {
    color: tokens.colorPaletteDarkOrangeForeground2,
  },
  statusHint: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    lineHeight: "1.15",
  },
  variantCellStack: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  variantMetaTight: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    lineHeight: "1.2",
    marginTop: "1px",
  },
  variantMetaMultiline: {
    whiteSpace: "pre-line",
  },
  variantDataList: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  variantDataLine: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: "1.15",
    color: tokens.colorNeutralForeground2,
    display: "flex",
    alignItems: "baseline",
    gap: "4px",
  },
  variantDataLabel: {
    color: tokens.colorNeutralForeground2,
    fontWeight: tokens.fontWeightRegular,
  },
  variantDataValue: {
    color: tokens.colorPaletteBlueForeground2,
    fontWeight: tokens.fontWeightSemibold,
  },
  variantDataValueMuted: {
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightRegular,
  },
  linkButton: {
    backgroundColor: tokens.colorNeutralBackground1,
    width: "fit-content",
    minWidth: "unset",
    paddingLeft: "10px",
    paddingRight: "10px",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  supplierSelectedButton: {
    backgroundColor: "#d6f5da",
    color: "#165a23",
    border: "1px solid #165a23",
    width: "fit-content",
    minWidth: "unset",
    paddingLeft: "10px",
    paddingRight: "10px",
    "&:hover": {
      backgroundColor: "#c3eccc",
    },
  },
  actionNeededBlueButton: {
    backgroundColor: "#ebf7ff",
    color: tokens.colorPaletteBlueForeground2,
    border: `1px solid ${tokens.colorPaletteBlueForeground2}`,
    width: "fit-content",
    minWidth: "unset",
    paddingLeft: "10px",
    paddingRight: "10px",
    "&:hover": {
      backgroundColor: "#dcedff",
    },
  },
  supplierInlineLoaderIcon: {
    width: "12px",
    height: "12px",
    display: "inline-block",
    animationName: {
      from: { transform: "rotate(0deg)" },
      to: { transform: "rotate(360deg)" },
    },
    animationDuration: "900ms",
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
  },
  badgeStack: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    alignItems: "center",
  },
  priceStack: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "6px",
  },
  productionStatusText: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: "1.2",
    color: tokens.colorNeutralForeground3,
  },
  productionStatusInProgress: {
    color: tokens.colorPaletteBlueForeground2,
    fontWeight: tokens.fontWeightSemibold,
  },
  productionStatusDone: {
    color: "#107c10",
    fontWeight: tokens.fontWeightSemibold,
  },
  badgeWhite: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground2,
  },
  warningText: {
    color: tokens.colorPaletteDarkOrangeForeground2,
  },
  dialogSurface: {
    width: "min(1340px, 96vw)",
    maxWidth: "min(1340px, 96vw)",
    maxHeight: "92vh",
    overflow: "hidden",
  },
  dialogContent: {
    minHeight: 0,
    overflow: "hidden",
  },
  dialogBody: {
    display: "grid",
    gridTemplateColumns: "520px minmax(0, 1fr)",
    gap: "16px",
    height: "76vh",
    maxHeight: "76vh",
    overflow: "hidden",
    alignItems: "stretch",
    "@media (max-width: 1080px)": {
      gridTemplateColumns: "1fr",
      height: "auto",
      maxHeight: "none",
    },
  },
  panel: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "12px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
    boxSizing: "border-box",
  },
  panelRight: {
    justifySelf: "stretch",
  },
  panelRightLayout: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    height: "100%",
    minHeight: 0,
  },
  supplierMediaTop: {
    flex: "0 0 25%",
    height: "clamp(172px, 22vh, 220px)",
    minHeight: "clamp(172px, 22vh, 220px)",
    maxHeight: "clamp(172px, 22vh, 220px)",
    display: "grid",
    gridTemplateColumns: "clamp(172px, 22vh, 220px) minmax(0, 1fr)",
    gap: "10px",
    alignItems: "stretch",
    overflow: "hidden",
    "@media (max-width: 1080px)": {
      gridTemplateColumns: "1fr",
      maxHeight: "none",
      height: "auto",
      minHeight: "172px",
    },
  },
  supplierMediaPane: {
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  supplierMediaTitle: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: "1.1",
    color: tokens.colorNeutralForeground2,
    paddingLeft: "2px",
  },
  supplierSourceCard: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
    position: "relative",
    alignSelf: "stretch",
    justifySelf: "stretch",
    width: "100%",
    height: "100%",
    minHeight: "0",
  },
  supplierSourceImage: {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "contain",
    objectPosition: "center",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  supplierSourcePlaceholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  supplierGalleryCard: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: "100%",
    minHeight: 0,
    position: "relative",
  },
  supplierGalleryScroller: {
    flex: 1,
    minHeight: 0,
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "8px",
    overflowX: "auto",
    overflowY: "hidden",
    padding: "10px",
    scrollbarWidth: "auto",
    "&::-webkit-scrollbar": {
      height: "13px",
    },
    "&::-webkit-scrollbar-track": {
      backgroundColor: tokens.colorNeutralBackground3,
      borderRadius: "999px",
    },
    "&::-webkit-scrollbar-thumb": {
      backgroundColor: tokens.colorNeutralStroke1,
      borderRadius: "999px",
      border: `2px solid ${tokens.colorNeutralBackground3}`,
    },
  },
  supplierGalleryScrollerSingle: {
    justifyContent: "center",
  },
  supplierGalleryScrollerLoading: {
    filter: "blur(1.5px)",
    opacity: 0.58,
    pointerEvents: "none",
    userSelect: "none",
  },
  supplierGalleryLoadingOverlay: {
    position: "absolute",
    inset: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: 2,
  },
  supplierGalleryLoadingInner: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 10px",
    borderRadius: "999px",
    backgroundColor: "rgba(255,255,255,0.85)",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  supplierGalleryLoadingText: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
  },
  supplierGalleryEmpty: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    lineHeight: "1.15",
  },
  supplierGalleryThumbButton: {
    appearance: "none",
    WebkitAppearance: "none",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "8px",
    padding: "0",
    backgroundColor: tokens.colorNeutralBackground1,
    width: "clamp(132px, 16vh, 192px)",
    height: "clamp(132px, 16vh, 192px)",
    overflow: "hidden",
    flex: "0 0 auto",
    boxSizing: "border-box",
    cursor: "zoom-in",
    transition: "border-color 140ms ease, box-shadow 140ms ease",
    "&:hover": {
      boxShadow: `inset 0 0 0 1px ${tokens.colorBrandStroke1}`,
    },
    "&:focus-visible": {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "1px",
    },
  },
  supplierGalleryThumbButtonSingle: {
    height: "calc(100% - 4px)",
    width: "auto",
    aspectRatio: "1 / 1",
    maxWidth: "100%",
    margin: "0 auto",
  },
  supplierGalleryThumbImage: {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "contain",
    objectPosition: "center",
    backgroundColor: tokens.colorNeutralBackground1,
    pointerEvents: "none",
  },
  supplierImagePreviewBackdrop: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
    zIndex: 2147483000,
  },
  supplierImagePreviewDialog: {
    width: "min(536px, calc(100vw - 32px))",
    maxWidth: "536px",
    position: "relative",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow16,
  },
  supplierImagePreviewBody: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "14px",
  },
  supplierImagePreviewTitle: {
    paddingRight: "34px",
  },
  supplierImagePreviewContent: {
    paddingTop: "2px",
    paddingBottom: "2px",
  },
  supplierImagePreviewFrame: {
    width: "484px",
    height: "484px",
    maxWidth: "100%",
    maxHeight: "calc(100vh - 220px)",
    margin: "0 auto",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  supplierImagePreviewImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  supplierImagePreviewCloseButton: {
    position: "absolute",
    top: "10px",
    right: "10px",
    width: "30px",
    height: "30px",
    borderRadius: "999px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground3,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    zIndex: 3,
    transition: "color 120ms ease, border-color 120ms ease, background-color 120ms ease",
    "&:hover": {
      color: "#0f6cbd",
      border: "1px solid #0f6cbd",
      backgroundColor: "#eef6ff",
    },
    "&:focus-visible": {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "1px",
    },
  },
  supplierImagePreviewCloseButtonActive: {
    color: "#0f6cbd",
    border: "1px solid #0f6cbd",
    backgroundColor: "#eef6ff",
  },
  supplierImagePreviewCloseIcon: {
    width: "16px",
    height: "16px",
  },
  variantsSectionWrap: {
    position: "relative",
    flex: "1 1 75%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  variantsSectionContent: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    height: "100%",
    minHeight: 0,
  },
  variantsSectionLoading: {
    filter: "blur(1.8px)",
    opacity: 0.62,
    pointerEvents: "none",
    userSelect: "none",
  },
  variantsSectionLoadingOverlay: {
    position: "absolute",
    inset: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    pointerEvents: "none",
  },
  scroll: {
    flex: 1,
    overflowY: "auto",
    minHeight: 0,
    maxHeight: "none",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  offerCard: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    padding: "9px 10px 9px 8px",
    display: "grid",
    gridTemplateColumns: "74px 1fr",
    gap: "12px",
    alignItems: "stretch",
    minHeight: "92px",
  },
  offerCardInteractive: {
    cursor: "pointer",
    "&:hover": {
      border: `1px solid ${tokens.colorBrandStroke1}`,
      backgroundColor: tokens.colorBrandBackground2,
    },
    "&:focus-visible": {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "1px",
    },
  },
  offerCardDisabled: {
    opacity: 0.7,
  },
  offerCardSelected: {
    border: "1px solid #0f6cbd",
    backgroundColor: "#eef6fd",
  },
  offerImage: {
    width: "74px",
    height: "100%",
    minHeight: "72px",
    borderRadius: "10px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
    alignSelf: "stretch",
  },
  offerMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    minWidth: 0,
  },
  offerOpenLink: {
    width: "fit-content",
    fontSize: tokens.fontSizeBase100,
    color: "#0f6cbd",
    textDecoration: "none",
    lineHeight: "1.15",
    cursor: "pointer",
    "&:hover": {
      color: "#0f6cbd",
      textDecoration: "underline",
    },
    "&:focus-visible": {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "1px",
      borderRadius: "3px",
    },
  },
  offerTitleEn: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    lineHeight: "1.1",
    display: "block",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    overflow: "hidden",
  },
  offerTitleZh: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    lineHeight: "1.1",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  offerSelectedBadge: {
    borderRadius: "999px",
    border: "1px solid #67af7b",
    color: "#2e7d32",
    backgroundColor: "#dfffd4",
    opacity: 1,
    fontWeight: tokens.fontWeightSemibold,
    width: "fit-content",
    "&.fui-Badge": {
      backgroundColor: "#dfffd4",
      opacity: 1,
    },
    "&.fui-Badge--outline": {
      backgroundColor: "#dfffd4",
      opacity: 1,
    },
  },
  offerFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    flexWrap: "wrap",
  },
  variantsTable: {
    minWidth: "100%",
    direction: "ltr",
    tableLayout: "fixed",
  },
  variantsTableWrap: {
    overflow: "auto",
    maxHeight: "48vh",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
  },
  variantsTableWrapLeftScroll: {
    direction: "ltr",
  },
  variantsTableWrapFlex: {
    flex: 1,
    maxHeight: "none",
    minHeight: 0,
  },
  variantLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  variantNameEn: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    lineHeight: "1.2",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  variantNameZh: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    lineHeight: "1.15",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  variantImageCol: {
    width: "70px",
    verticalAlign: "middle",
  },
  variantNameCol: {
    width: "auto",
    minWidth: 0,
  },
  variantHeaderText: {
    fontSize: "11px",
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: "1.1",
  },
  variantHeaderTextRight: {
    display: "block",
    textAlign: "right",
    width: "100%",
  },
  variantPickHeaderCell: {
    textAlign: "right",
    paddingLeft: "0",
    paddingRight: "8px",
  },
  variantPickCell: {
    textAlign: "right",
    paddingRight: "8px",
  },
  variantPickCheckWrap: {
    width: "100%",
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  variantValueWrap: {
    width: "100%",
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  variantImageCellCenter: {
    width: "100%",
    minHeight: "50px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  variantPriceCol: {
    width: "94px",
    textAlign: "right",
  },
  variantWeightCol: {
    width: "94px",
    textAlign: "right",
  },
  variantPickCol: {
    width: "54px",
  },
  variantImageThumb: {
    width: "44px",
    height: "44px",
    borderRadius: "8px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  variantImageMissingIconWrap: {
    width: "44px",
    height: "44px",
    borderRadius: "8px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground4,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  variantImageMissingIcon: {
    width: "20px",
    height: "20px",
  },
  variantEditInput: {
    width: "76px",
    minWidth: "76px",
    maxWidth: "76px",
    marginLeft: "auto",
    "& input": {
      textAlign: "right",
    },
  },
  packsPopoverSurface: {
    minWidth: "260px",
    maxWidth: "320px",
    padding: "10px",
  },
  packsPopoverBody: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  packsFieldLabel: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: "1.1",
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightRegular,
  },
  packsInputCompact: {
    "& input": {
      fontSize: tokens.fontSizeBase200,
      lineHeight: "1.15",
      paddingTop: "2px",
      paddingBottom: "2px",
    },
  },
  packsBadgeWrap: {
    display: "flex",
    alignItems: "flex-start",
    gap: "6px",
    flexWrap: "wrap",
    width: "100%",
    minHeight: "24px",
  },
  packsBadgeButton: {
    appearance: "none",
    WebkitAppearance: "none",
    border: "0",
    background: "transparent",
    padding: "0",
    margin: "0",
    cursor: "pointer",
    borderRadius: "999px",
  },
  packsBadge: {
    border: "1px solid #0f6cbd",
    color: "#0f6cbd",
    backgroundColor: "#e8f3ff",
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
  },
  packsBadgeEmpty: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    lineHeight: "1.1",
  },
  packsPopoverActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "6px",
  },
  priceBadge: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground2,
  },
  priceBadgeGreen: {
    borderRadius: "999px",
    border: "1px solid #2e7d32",
    color: "#2e7d32",
    backgroundColor: "#dfffd4",
    opacity: 1,
    fontWeight: tokens.fontWeightSemibold,
    "&.fui-Badge": {
      backgroundColor: "#dfffd4",
      opacity: 1,
    },
    "&.fui-Badge--outline": {
      backgroundColor: "#dfffd4",
      opacity: 1,
    },
  },
  jsonDialog: {
    minWidth: "min(92vw, 980px)",
    maxWidth: "min(95vw, 1280px)",
  },
  jsonDialogBody: {
    display: "flex",
    flexDirection: "column",
    height: "min(92vh, 980px)",
    minHeight: "min(92vh, 980px)",
  },
  jsonDialogActions: {
    justifyContent: "flex-end",
    display: "flex",
    width: "100%",
  },
  jsonDialogContent: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  jsonEditorWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  jsonRawWrap: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  jsonNativeTextarea: {
    width: "100%",
    height: "100%",
    minHeight: 0,
    flex: 1,
    boxSizing: "border-box",
    resize: "none",
    overflow: "auto",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: "12px",
    lineHeight: "1.45",
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: "10px 12px",
  },
  addDialogSurface: {
    width: "min(760px, 96vw)",
    maxWidth: "min(760px, 96vw)",
  },
  addDialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  addDialogFooterMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  addDialogActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    gap: "10px",
  },
  sourceDialogSurface: {
    width: "min(760px, 96vw)",
    maxWidth: "min(760px, 96vw)",
  },
  sourceDialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  sourceDialogPreview: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "8px",
    padding: "10px 0 2px",
  },
  sourceDialogPreviewFrame: {
    position: "relative",
    width: "min(500px, 84vw)",
    height: "min(500px, 66vh)",
    maxWidth: "500px",
    maxHeight: "500px",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  sourceDialogPreviewImg: {
    width: "100%",
    height: "100%",
    borderRadius: "12px",
    objectFit: "contain",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  sourceDialogPreviewOverlay: {
    position: "absolute",
    top: "10px",
    right: "10px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    zIndex: 2,
  },
  sourceDialogPreviewMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    lineHeight: "1.2",
  },
  sourceDialogSearchButton: {
    width: "fit-content",
    minWidth: "unset",
    paddingLeft: "10px",
    paddingRight: "10px",
  },
  sourceDialogActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    width: "100%",
  },
});

const formatDateTime = (value: string | null) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  const pad2 = (num: number) => String(num).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const formatCompactNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(2).replace(/\.?0+$/, "");
};

const normalizeCurrencyCode = (value: unknown) => {
  const text = toText(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/[A-Z]{3}/);
  return match ? match[0] : text;
};

const formatCurrencyValue = (value: number | null | undefined, currency: unknown) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const code = normalizeCurrencyCode(currency) || "SEK";
  return `${formatCompactNumber(value)} ${code}`;
};

const toPositiveDecimal = (value: unknown) => {
  const raw = toText(value).replace(",", ".");
  if (!raw) return null;
  const direct = Number(raw);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = raw.match(/\d+(?:\.\d+)?/);
  if (!match?.[0]) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toWeightGramsValue = (value: unknown) => {
  const raw = toText(value).replace(",", ".");
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match?.[0]) return null;
  const num = Number(match[0]);
  if (!Number.isFinite(num) || num <= 0) return null;
  const lowered = raw.toLowerCase();
  if (lowered.includes("kg")) return Math.round(num * 1000);
  return Math.round(num);
};

const computeSekPriceFromPricingContext = (
  purchasePriceCny: number | null,
  weightGrams: number | null,
  pricingContext: VariantsPayload["sek_pricing_context"]
) => {
  if (!pricingContext) return null;
  if (!Number.isFinite(Number(purchasePriceCny)) || Number(purchasePriceCny) <= 0) return null;
  if (!Number.isFinite(Number(weightGrams)) || Number(weightGrams) <= 0) return null;

  const purchase = Number(purchasePriceCny);
  const weight = Math.round(Number(weightGrams));
  const threshold = Number(pricingContext.weight_threshold_g);
  const useLow = Number.isFinite(threshold) ? weight <= threshold : true;
  const rate = Number(useLow ? pricingContext.rate_low : pricingContext.rate_high);
  const base = Number(useLow ? pricingContext.base_low : pricingContext.base_high);
  const mult = Number(useLow ? pricingContext.mult_low : pricingContext.mult_high);
  const fx = Number(pricingContext.fx_rate_cny);
  const packingFee = Number(pricingContext.packing_fee);
  const markupPercent = Number(pricingContext.markup_percent);
  const markupFixed = Number(pricingContext.markup_fixed);

  if (![rate, base, mult, fx, packingFee, markupPercent, markupFixed].every(Number.isFinite)) {
    return null;
  }

  const shippingCny = weight * mult * rate + base;
  const shippingSek = shippingCny * fx + packingFee;
  const stockSek = purchase * fx;
  const totalSek = stockSek + shippingSek;
  const rawSek = totalSek * (1 + markupPercent) + markupFixed;
  if (!Number.isFinite(rawSek)) return null;
  return Math.round(rawSek);
};

const toText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const normalizeSuggestionErrorText = (value: unknown) => {
  const text = toText(value);
  if (!text) return "";
  if (/missing normalized image for supplier search/i.test(text)) {
    return "Missing image for search.";
  }
  return text;
};

const normalizePayloadErrorText = (value: unknown) => {
  const text = toText(value);
  if (!text) return "";
  if (/^1688 payload was empty \(no variants\/images\)\.\s*please retry this supplier\.?$/i.test(text)) {
    return "1688 payload was empty (no variants/images).\nPlease retry this supplier.";
  }
  return text;
};

const hasCjk = (value: unknown) => /[\u3400-\u9fff]/.test(toText(value));

const truncateTitleText = (value: unknown, maxChars = 40) => {
  const normalized = toText(value).replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  const head = normalized.slice(0, maxChars).replace(/\s+$/g, "");
  return `${head}...`;
};

const normalizeImageUrl = (value: unknown) => {
  const text = toText(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("//")) return `https:${text}`;
  return text;
};

const isHttpAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

const buildImageProxyUrl = (rawUrl: unknown, width?: number, height?: number) => {
  const source = normalizeImageUrl(rawUrl);
  if (!source) return "";
  if (source.startsWith("/api/")) return source;
  if (!isHttpAbsoluteUrl(source)) return source.startsWith("/") ? source : "";
  const params = new URLSearchParams({ url: source });
  if (Number.isFinite(width) && Number(width) > 0) {
    params.set("w", String(Math.trunc(Number(width))));
  }
  if (Number.isFinite(height) && Number(height) > 0) {
    params.set("h", String(Math.trunc(Number(height))));
  }
  return `/api/1688-extractor/image-proxy?${params.toString()}`;
};

const unwrapProxyImageUrl = (rawUrl: unknown) => {
  const source = normalizeImageUrl(rawUrl);
  if (!source) return "";
  if (source.startsWith("/api/1688-extractor/image-proxy?")) {
    try {
      const parsed = new URL(source, "https://preview.local");
      const inner = normalizeImageUrl(parsed.searchParams.get("url"));
      if (inner) return inner;
    } catch {
      return source;
    }
  }
  return source;
};

const stripImageSizeTokens = (value: string) =>
  value
    .replace(/_sum(?=\.(?:jpg|jpeg|png|webp|gif|bmp|avif)$)/gi, "")
    .replace(/\.(\d{2,4}x\d{2,4})(?=\.(?:jpg|jpeg|png|webp|gif|bmp|avif)$)/gi, "")
    .replace(/_(\d{2,4}x\d{2,4})(?=\.(?:jpg|jpeg|png|webp|gif|bmp|avif)$)/gi, "")
    .replace(/@\d+w_\d+h(?:_[a-z0-9]+)*(?=\.(?:jpg|jpeg|png|webp|gif|bmp|avif)$)/gi, "")
    .replace(/\.(jpg|jpeg|png|webp|gif|bmp|avif)\.\1$/i, ".$1");

const buildImageSourceCandidates = (rawUrl: unknown) => {
  const unwrapped = unwrapProxyImageUrl(rawUrl);
  if (!unwrapped) return [] as string[];
  const candidates: string[] = [];
  const add = (next: unknown) => {
    const text = normalizeImageUrl(next);
    if (!text) return;
    if (!candidates.includes(text)) candidates.push(text);
  };
  add(unwrapped);
  add(stripImageSizeTokens(unwrapped));
  try {
    const parsed = new URL(
      unwrapped.startsWith("//") ? `https:${unwrapped}` : unwrapped,
      "https://preview.local"
    );
    const cleaned = new URL(parsed.toString());
    cleaned.searchParams.delete("x-oss-process");
    cleaned.searchParams.delete("imageMogr2");
    cleaned.searchParams.delete("w");
    cleaned.searchParams.delete("h");
    cleaned.searchParams.delete("width");
    cleaned.searchParams.delete("height");
    cleaned.searchParams.delete("resize");
    cleaned.searchParams.delete("quality");
    cleaned.searchParams.delete("crop");
    cleaned.pathname = stripImageSizeTokens(cleaned.pathname);
    add(
      parsed.origin === "https://preview.local"
        ? `${cleaned.pathname}${cleaned.search}`
        : cleaned.toString()
    );
  } catch {
    // Ignore parse failures and keep string-based candidates.
  }
  return candidates;
};

const buildLargePreviewImageUrl = (rawUrl: unknown, size = 520) => {
  const candidates = buildImageSourceCandidates(rawUrl);
  for (const candidate of candidates) {
    const proxied = buildImageProxyUrl(candidate, size, size);
    if (proxied) return proxied;
  }
  return normalizeImageUrl(rawUrl);
};

const extractOfferImageUrl = (offer: unknown) => {
  const offerRecord =
    offer && typeof offer === "object" ? (offer as Record<string, unknown>) : {};
  return normalizeImageUrl(
    offerRecord.image_thumb_url ||
      offerRecord.imageUrl ||
      offerRecord.image_url ||
      offerRecord.imgUrl ||
      offerRecord.img_url ||
      offerRecord.image
  );
};

const parsePackValues = (value: unknown) => {
  const tokens = toText(value).match(/\d+/g) ?? [];
  const packs = tokens
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0 && entry <= 999);
  return Array.from(new Set(packs)).sort((a, b) => a - b);
};

const normalizePacksText = (value: unknown) => {
  const packs = parsePackValues(value);
  if (packs.length === 0) return "";
  return packs.join(", ");
};

const normalizePayloadStatus = (value: unknown) => {
  const status = toText(value).toLowerCase();
  if (status === "fetching" || status === "queued" || status === "ready" || status === "failed") {
    return status;
  }
  return "";
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

const toAbsoluteBrowserUrl = (rawUrl: unknown) => {
  const source = normalizeImageUrl(rawUrl);
  if (!source) return "";
  if (isHttpAbsoluteUrl(source)) return source;
  if (source.startsWith("//")) return `https:${source}`;
  if (typeof window === "undefined") return source;
  try {
    return new URL(source, window.location.origin).toString();
  } catch {
    return source;
  }
};

const buildGoogleImageSearchUrl = (rawImageUrl: unknown) => {
  const absoluteImageUrl = toAbsoluteBrowserUrl(rawImageUrl);
  if (!isHttpAbsoluteUrl(absoluteImageUrl)) return "";
  const params = new URLSearchParams({
    image_url: absoluteImageUrl,
    hl: "sv",
  });
  return `https://www.google.com/searchbyimage?${params.toString()}`;
};

const imageIdentity = (value: unknown): string => {
  const raw = unwrapProxyImageUrl(value);
  if (!raw) return "";
  try {
    const absolute = raw.startsWith("//") ? `https:${raw}` : raw;
    const parsed = new URL(absolute, "https://identity.local");
    let host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = stripImageSizeTokens(parsed.pathname).toLowerCase();
    if (!host && parsed.origin === "https://identity.local") host = "local";
    return `${host}${pathname}`;
  } catch {
    const cleaned = stripImageSizeTokens(raw)
      .replace(/^https?:\/\//i, "")
      .replace(/^\/\//, "")
      .replace(/[?#].*$/, "")
      .toLowerCase();
    return cleaned;
  }
};

const computeImageSignature = (image: HTMLImageElement) => {
  const sampleSize = 12;
  const canvas = document.createElement("canvas");
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, sampleSize, sampleSize);
  const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
  const luminance: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    luminance.push(r * 0.299 + g * 0.587 + b * 0.114);
  }
  if (luminance.length === 0) return null;
  const average =
    luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
  const bits = luminance.map((value) => (value >= average ? "1" : "0")).join("");
  let hash = "";
  for (let index = 0; index < bits.length; index += 4) {
    const chunk = bits.slice(index, index + 4).padEnd(4, "0");
    hash += Number.parseInt(chunk, 2).toString(16);
  }
  return `${sampleSize}:${hash}`;
};

const probeSupplierImage = async (
  url: string,
  timeoutMs = 10_000
): Promise<SupplierGalleryProbeResult | null> => {
  if (!url) return null;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "force-cache",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    const byteSize =
      Number.isFinite(blob.size) && blob.size > 0 ? Math.trunc(blob.size) : null;
    if (!blob.size) {
      return {
        width: 0,
        height: 0,
        byteSize,
        signature: null,
      };
    }

    const objectUrl = URL.createObjectURL(blob);
    try {
      const metadata = await new Promise<{
        width: number;
        height: number;
        signature: string | null;
      } | null>((resolve) => {
        const image = new Image();
        let finished = false;
        const decodeTimeout = window.setTimeout(() => {
          if (finished) return;
          finished = true;
          resolve(null);
        }, timeoutMs);
        image.onload = () => {
          if (finished) return;
          finished = true;
          window.clearTimeout(decodeTimeout);
          resolve({
            width: image.naturalWidth || 0,
            height: image.naturalHeight || 0,
            signature: computeImageSignature(image),
          });
        };
        image.onerror = () => {
          if (finished) return;
          finished = true;
          window.clearTimeout(decodeTimeout);
          resolve(null);
        };
        image.decoding = "async";
        image.referrerPolicy = "no-referrer";
        image.src = objectUrl;
      });
      if (!metadata) {
        return {
          width: 0,
          height: 0,
          byteSize,
          signature: null,
        };
      }
      return {
        ...metadata,
        byteSize,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const resolveProbeImageUrl = (value: unknown) => {
  const normalized = normalizeImageUrl(value);
  if (!normalized) return "";
  if (normalized.startsWith("/api/1688-extractor/image-proxy?")) {
    try {
      const parsed = new URL(normalized, "https://probe.local");
      const inner = normalizeImageUrl(parsed.searchParams.get("url"));
      if (inner) return inner.startsWith("//") ? `https:${inner}` : inner;
    } catch {
      // fall through
    }
  }
  return normalized.startsWith("//") ? `https:${normalized}` : normalized;
};

const firstValidUrl = (...values: unknown[]) => {
  for (const value of values) {
    const text = toText(value);
    if (/^https?:\/\//i.test(text)) return text;
  }
  return "";
};

const INTERNAL_SOURCE_HOSTS = new Set([
  "hub.nordexo.se",
  "localhost",
  "127.0.0.1",
  "::1",
]);
const INTERNAL_SOURCE_SUFFIXES = [".nordexo.se", ".nordexo.com"];
const INTERNAL_EMAIL_DOMAINS = new Set(["nordexo.se", "nordexo.com"]);
const CURRENCY_PRIORITY = ["SEK", "NOK", "DKK", "EUR"];

const getHostname = (value: string) => {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const normalizeDomainLabel = (hostname: string) =>
  toText(hostname).toLowerCase().replace(/^www\./, "");

const rootDomainFromHostname = (hostname: string) => {
  const host = normalizeDomainLabel(hostname);
  if (!host) return "";
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;

  const secondLevel = parts[parts.length - 2];
  const topLevel = parts[parts.length - 1];
  const useThreeParts =
    topLevel.length === 2 &&
    ["co", "com", "net", "org", "gov", "edu"].includes(secondLevel) &&
    parts.length >= 3;

  return useThreeParts ? parts.slice(-3).join(".") : parts.slice(-2).join(".");
};

const formatSourceDomainLabel = (hostname: string) => {
  const root = rootDomainFromHostname(hostname);
  if (!root) return "";
  return `${root.charAt(0).toUpperCase()}${root.slice(1)}`;
};

const isInternalSourceHost = (hostname: string) => {
  const host = normalizeDomainLabel(hostname);
  if (!host) return true;
  if (INTERNAL_SOURCE_HOSTS.has(host)) return true;
  return INTERNAL_SOURCE_SUFFIXES.some((suffix) => host.endsWith(suffix));
};

const getSourceLinkMeta = (value: unknown): { url: string; domain: string } | null => {
  const url = toText(value);
  if (!/^https?:\/\//i.test(url)) return null;
  const hostname = normalizeDomainLabel(getHostname(url));
  if (!hostname || isInternalSourceHost(hostname)) return null;
  const domain = formatSourceDomainLabel(hostname);
  if (!domain) return null;
  return { url, domain };
};

const deriveViewerPriceRole = (payload: unknown): ViewerPriceRole => {
  const record =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  if (Boolean(record?.is_admin)) return "admin";

  const email = toText(record?.email).toLowerCase();
  const companyName = toText(record?.company_name).toLowerCase();
  const emailDomain = email.includes("@") ? email.split("@").pop() || "" : "";
  const isInternal =
    INTERNAL_EMAIL_DOMAINS.has(emailDomain) || companyName.includes("nordexo");
  return isInternal ? "non_admin" : "partner";
};

const getAllowedCurrencies = (role: ViewerPriceRole): Set<string> | null => {
  if (role === "admin") return null;
  if (role === "non_admin") return new Set(["SEK", "NOK"]);
  return new Set(["SEK"]);
};

const filterPricingByViewerRole = (
  entries: PricingEntry[],
  role: ViewerPriceRole
): PricingEntry[] => {
  const allowed = getAllowedCurrencies(role);
  const uniqueByCurrency = new Map<string, PricingEntry>();

  for (const entry of entries) {
    const amount = Number(entry?.b2bPrice);
    if (!Number.isFinite(amount)) continue;
    const currency = normalizeCurrencyCode(entry?.currency || entry?.market);
    if (!currency) continue;
    if (allowed && !allowed.has(currency)) continue;
    if (!uniqueByCurrency.has(currency)) {
      uniqueByCurrency.set(currency, {
        ...entry,
        currency,
      });
    }
  }

  return Array.from(uniqueByCurrency.values()).sort((a, b) => {
    const aCode = normalizeCurrencyCode(a.currency);
    const bCode = normalizeCurrencyCode(b.currency);
    const aIndex = CURRENCY_PRIORITY.indexOf(aCode);
    const bIndex = CURRENCY_PRIORITY.indexOf(bCode);
    const aRank = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const bRank = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    if (aRank !== bRank) return aRank - bRank;
    return aCode.localeCompare(bCode);
  });
};

const getSuggestionProductionStatusKey = (
  status: ProductionStatusState | null | undefined
) => {
  const queueStatus = toText(status?.status).toLowerCase();
  const done = Boolean(toText(status?.production_done_at)) || queueStatus === "production_done";
  if (done) return "production_done" as const;
  const started =
    Boolean(toText(status?.production_started_at)) || queueStatus === "production_started";
  if (started) return "production_started" as const;
  const assigned = Boolean(toText(status?.spu_assigned_at)) || queueStatus === "spu_assigned";
  if (assigned) return "spu_assigned" as const;
  if (queueStatus === "queued_for_production" || queueStatus === "queued") {
    return "queued_for_production" as const;
  }
  return "none" as const;
};

const hasSuggestionPriceData = (item: SuggestionItem) =>
  Array.isArray(item.pricing) &&
  item.pricing.some((entry) => {
    const amount = Number(entry?.b2bPrice);
    return Number.isFinite(amount) && amount > 0;
  });

const isSuggestionReadyForProduction = (item: SuggestionItem) => {
  const supplierSelected = Boolean(
    toText(item.selection?.selected_offer_id) || toText(item.selection?.selected_detail_url)
  );
  const variantsPicked = Boolean(item.variantMetrics && item.variantMetrics.selectedCount > 0);
  const payloadReady = Boolean(toText(item.selection?.payload_file_name));
  return supplierSelected && variantsPicked && payloadReady && hasSuggestionPriceData(item);
};

const sourceFilterLabel: Record<SourceFilter, string> = {
  all: "All Sources",
  image: "Images",
  url: "URLs",
};

const supplierFilterLabel: Record<SupplierFilter, string> = {
  all: "All Supplier States",
  not_started: "Supplier Not Started",
  searching: "Supplier Searching",
  selected: "Supplier Selected",
};

const variantFilterLabel: Record<VariantFilter, string> = {
  all: "All Variant States",
  not_picked: "Variants Not Picked",
  picked: "Variants Picked",
};

export default function DigiDealProductSuggestionsPage() {
  const styles = useStyles();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const supplierOfferImageWarmRef = useRef<Set<string>>(new Set());
  const supplierOfferTranslateInFlightRef = useRef<Set<string>>(new Set());
  const supplierTranslateBusyRef = useRef(false);
  const supplierTranslateAttemptsRef = useRef<Map<string, number>>(new Map());
  const variantsCacheRef = useRef<Record<string, VariantsPayload>>({});
  const variantFetchInFlightRef = useRef<
    Map<string, Promise<VariantsPayload | null>>
  >(new Map());
  const variantWarmAttemptsRef = useRef<Map<string, number>>(new Map());
  const supplierGalleryStripRef = useRef<HTMLDivElement | null>(null);
  const supplierGalleryProbeCacheRef = useRef<
    Map<string, SupplierGalleryProbeResult | null>
  >(new Map());
  const offerDialogOpenRef = useRef(false);
  const offerDialogItemIdRef = useRef("");
  const itemsRef = useRef<SuggestionItem[]>([]);
  const loadItemsInFlightRef = useRef(false);

  const [isAddDialogDragOver, setIsAddDialogDragOver] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [urlsText, setUrlsText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSendingToProduction, setIsSendingToProduction] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [supplierFilter, setSupplierFilter] = useState<SupplierFilter>("all");
  const [variantFilter, setVariantFilter] = useState<VariantFilter>("all");
  const [categorySelections, setCategorySelections] = useState<CategorySelection[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<CategorySelection[]>([]);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [activeL1, setActiveL1] = useState<string | null>(null);
  const [activeL2, setActiveL2] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [viewerPriceRole, setViewerPriceRole] = useState<ViewerPriceRole>("partner");
  const isAdminViewer = viewerPriceRole === "admin";
  const hideSupplier1688Details = !isAdminViewer;
  const allowCnyPriceEditing = isAdminViewer;

  const [items, setItems] = useState<SuggestionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageClosing, setMessageClosing] = useState(false);
  const [errorClosing, setErrorClosing] = useState(false);
  const [activeSearchIds, setActiveSearchIds] = useState<Record<string, boolean>>({});

  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [offerDialogItem, setOfferDialogItem] = useState<SuggestionItem | null>(null);
  const [offerDialogOffers, setOfferDialogOffers] = useState<SupplierOffer[]>([]);
  const [offerDialogBusy, setOfferDialogBusy] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string>("");
  const [selectingOfferId, setSelectingOfferId] = useState<string>("");

  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsSaving, setVariantsSaving] = useState(false);
  const [variants, setVariants] = useState<VariantsPayload | null>(null);
  const [selectedVariantIndexes, setSelectedVariantIndexes] = useState<number[]>([]);
  const [variantDraftOverrides, setVariantDraftOverrides] = useState<
    Record<number, VariantDraftOverride>
  >({});
  const [packsText, setPacksText] = useState("");
  const [packsPopoverOpen, setPacksPopoverOpen] = useState(false);
  const [packsDraft, setPacksDraft] = useState("");
  const [supplierGalleryVisibleImages, setSupplierGalleryVisibleImages] = useState<
    SupplierGalleryImageEntry[]
  >([]);
  const [supplierGalleryFiltering, setSupplierGalleryFiltering] = useState(false);
  const [supplierImagePreviewEntry, setSupplierImagePreviewEntry] =
    useState<SupplierGalleryImageEntry | null>(null);
  const [supplierImagePreviewDialogHover, setSupplierImagePreviewDialogHover] =
    useState(false);

  const [jsonDialogOpen, setJsonDialogOpen] = useState(false);
  const [jsonDialogText, setJsonDialogText] = useState("");
  const [jsonDialogTitle, setJsonDialogTitle] = useState("Production JSON");

  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [sourceDialogItem, setSourceDialogItem] = useState<SuggestionItem | null>(null);
  const [sourceUrlDraft, setSourceUrlDraft] = useState("");
  const [sourceDialogSaving, setSourceDialogSaving] = useState(false);
  const [sourceImageCopying, setSourceImageCopying] = useState(false);
  const [sourcePreviewHover, setSourcePreviewHover] = useState(false);

  const parsedUrls = useMemo(
    () =>
      urlsText
        .split(/[\n,]+/g)
        .map((entry) => entry.trim())
        .filter((entry) => /^https?:\/\//i.test(entry)),
    [urlsText]
  );

  const selectedIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);

  const fileStats = useMemo(() => {
    let imageCount = 0;
    let zipCount = 0;
    files.forEach((file) => {
      const name = toText(file.name).toLowerCase();
      const type = toText(file.type).toLowerCase();
      if (name.endsWith(".zip") || type.includes("zip")) {
        zipCount += 1;
      } else {
        imageCount += 1;
      }
    });
    return {
      total: files.length,
      imageCount,
      zipCount,
      hasZip: zipCount > 0,
    };
  }, [files]);

  const sourceDialogImageUrl = useMemo(
    () =>
      normalizeImageUrl(
        sourceDialogItem?.mainImageUrl ||
          sourceDialogItem?.externalData?.mainImageUrl ||
          sourceDialogItem?.externalData?.rawMainImageUrl ||
          ""
      ),
    [sourceDialogItem]
  );

  const sourceDialogImageAbsoluteUrl = useMemo(
    () => toAbsoluteBrowserUrl(sourceDialogImageUrl),
    [sourceDialogImageUrl]
  );

  const sourceDialogGoogleSearchUrl = useMemo(
    () => buildGoogleImageSearchUrl(sourceDialogImageAbsoluteUrl),
    [sourceDialogImageAbsoluteUrl]
  );

  const copySourceDialogImageToClipboard = useCallback(async () => {
    const imageUrl = sourceDialogImageAbsoluteUrl;
    if (!isHttpAbsoluteUrl(imageUrl)) {
      setError("No source image is available to copy.");
      return;
    }
    if (!navigator?.clipboard) {
      setError("Clipboard is not supported in this browser.");
      return;
    }

    setSourceImageCopying(true);
    setError(null);
    try {
      if (typeof ClipboardItem !== "undefined") {
        const response = await fetch(imageUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to download image for clipboard copy.");
        }
        const blob = await response.blob();
        let pngBlob: Blob = blob;
        if (blob.type !== "image/png") {
          const objectUrl = URL.createObjectURL(blob);
          try {
            const image = new Image();
            image.decoding = "async";
            image.src = objectUrl;
            await new Promise<void>((resolve, reject) => {
              image.onload = () => resolve();
              image.onerror = () =>
                reject(new Error("Unable to prepare image for clipboard copy."));
            });
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth || image.width || 1;
            canvas.height = image.naturalHeight || image.height || 1;
            const context = canvas.getContext("2d");
            if (!context) {
              throw new Error("Unable to prepare image for clipboard copy.");
            }
            context.drawImage(image, 0, 0);
            const converted = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/png")
            );
            if (!converted) {
              throw new Error("Unable to prepare image for clipboard copy.");
            }
            pngBlob = converted;
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
        }
        const clipboardItem = new ClipboardItem({ "image/png": pngBlob });
        await navigator.clipboard.write([clipboardItem]);
        setMessage("Image copied to clipboard.");
        return;
      }
      await navigator.clipboard.writeText(imageUrl);
      setMessage("Image URL copied to clipboard.");
    } catch (err) {
      try {
        await navigator.clipboard.writeText(imageUrl);
        setMessage("Image URL copied to clipboard.");
      } catch {
        setError((err as Error).message || "Unable to copy source image.");
      }
    } finally {
      setSourceImageCopying(false);
    }
  }, [sourceDialogImageAbsoluteUrl]);

  const openSourceDialogGoogleImageSearch = useCallback(() => {
    if (!sourceDialogGoogleSearchUrl) {
      setError("No source image is available for Google image search.");
      return;
    }
    window.open(sourceDialogGoogleSearchUrl, "_blank", "noopener,noreferrer");
  }, [sourceDialogGoogleSearchUrl]);

  const openSourceDialog = useCallback((item: SuggestionItem) => {
    const candidate = firstValidUrl(
      item.externalData?.inputUrl,
      item.externalData?.finalUrl,
      item.crawlFinalUrl,
      item.sourceUrl
    );
    setSourcePreviewHover(false);
    setSourceImageCopying(false);
    setSourceDialogItem(item);
    setSourceUrlDraft(getSourceLinkMeta(candidate)?.url || "");
    setSourceDialogOpen(true);
  }, []);

  const loadItems = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);
      if (loadItemsInFlightRef.current) return;
      loadItemsInFlightRef.current = true;

      if (!silent) {
        setIsLoading(true);
        setError(null);
      }
    try {
      const response = await fetch("/api/digideal/product-suggestions", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toText(payload?.error) || "Failed to load suggestions.");
      }
      const nextItems = Array.isArray(payload?.items)
        ? (payload.items as SuggestionItem[])
        : [];
      itemsRef.current = nextItems;
      setItems(nextItems);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to load suggestions.");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
      loadItemsInFlightRef.current = false;
    }
    },
    []
  );

  const saveSourceLink = useCallback(async () => {
    if (!sourceDialogItem) return;
    const sourceUrl = sourceUrlDraft.trim();
    if (!/^https?:\/\//i.test(sourceUrl)) {
      setError("Source URL must start with http:// or https://.");
      return;
    }

    setSourceDialogSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/digideal/product-suggestions/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: sourceDialogItem.id,
          source_url: sourceUrl,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toText(payload?.error) || "Unable to add source.");
      }
      setMessage("Source URL saved. External source crawl started.");
      setSourceDialogOpen(false);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add source.");
    } finally {
      setSourceDialogSaving(false);
    }
  }, [loadItems, sourceDialogItem, sourceUrlDraft]);

  const translateSupplierOffers = useCallback(
    async (productId: string, offers: SupplierOffer[]) => {
      if (!Array.isArray(offers) || offers.length === 0) return offers;

      const needsTranslation = offers.some((offer) => {
        const subject = toText(offer.subject);
        const subjectEn = toText(offer.subject_en);
        return Boolean(subject) && (!subjectEn || hasCjk(subjectEn));
      });
      if (!needsTranslation) return offers;
      if (supplierOfferTranslateInFlightRef.current.has(productId)) return offers;

      supplierOfferTranslateInFlightRef.current.add(productId);
      let timeoutId = 0;
      const controller = new AbortController();
      timeoutId = window.setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch("/api/production/suppliers/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: PROVIDER,
            product_id: productId,
          }),
          signal: controller.signal,
        });
        if (!response.ok) return offers;
        const payload = await response.json().catch(() => null);
        const translated = Array.isArray(payload?.offers)
          ? (payload.offers as SupplierOffer[])
          : [];
        if (translated.length === 0) return offers;

        setItems((prev) =>
          prev.map((entry) =>
            entry.id === productId
              ? {
                  ...entry,
                  search: {
                    ...entry.search,
                    offerCount: translated.length,
                    offers: translated,
                  },
                }
              : entry
          )
        );
        setOfferDialogOffers((prev) =>
          offerDialogOpen && offerDialogItem?.id === productId ? translated : prev
        );
        return translated;
      } catch {
        return offers;
      } finally {
        window.clearTimeout(timeoutId);
        supplierOfferTranslateInFlightRef.current.delete(productId);
      }
    },
    [offerDialogItem?.id, offerDialogOpen]
  );

  const runSupplierSearch = useCallback(
    async (item: SuggestionItem, refresh = false) => {
      if (!item.mainImageUrl) {
        setError(`Suggestion ${item.id} has no normalized main image.`);
        return null;
      }
      setActiveSearchIds((prev) => ({ ...prev, [item.id]: true }));
      try {
        const params = new URLSearchParams({
          provider: PROVIDER,
          product_id: item.id,
          image_url: item.mainImageUrl,
          limit: "10",
        });
        if (refresh) params.set("refresh", "1");

        const response = await fetch(`/api/production/suppliers?${params.toString()}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(toText(payload?.error) || "Supplier search failed.");
        }

        const offers = Array.isArray(payload?.offers)
          ? (payload.offers as SupplierOffer[])
          : [];

        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  search: {
                    fetchedAt: toText(payload?.fetched_at) || new Date().toISOString(),
                    offerCount: offers.length,
                    offers,
                  },
                }
              : entry
          )
        );
        if (offerDialogOpen && offerDialogItem?.id === item.id) {
          setOfferDialogOffers(offers);
        }
        void translateSupplierOffers(item.id, offers);

        return offers;
      } finally {
        setActiveSearchIds((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }
    },
    [offerDialogItem?.id, offerDialogOpen, translateSupplierOffers]
  );

  const applyVariantsPayload = useCallback((payload: VariantsPayload) => {
    setVariants(payload);
    setVariantDraftOverrides({});
    setSelectedVariantIndexes(
      Array.isArray(payload.selected_combo_indexes) ? payload.selected_combo_indexes : []
    );
    setPacksText(normalizePacksText(payload.packs_text));
  }, []);

  const fetchVariants = useCallback(
    async (
      item: SuggestionItem,
      options?: {
        force?: boolean;
        waitForPayload?: boolean;
        background?: boolean;
      }
    ) => {
      const force = Boolean(options?.force);
      const waitForPayload = Boolean(options?.waitForPayload);
      const background = Boolean(options?.background);

      const cached = variantsCacheRef.current[item.id];
      if (!force && cached) {
        if (!background) applyVariantsPayload(cached);
        return cached;
      }

      const inFlight = variantFetchInFlightRef.current.get(item.id);
      if (inFlight) {
        if (background) return null;
        setVariantsLoading(true);
        try {
          const awaited = await inFlight;
          if (
            awaited &&
            offerDialogOpenRef.current &&
            offerDialogItemIdRef.current === item.id
          ) {
            applyVariantsPayload(awaited);
          }
          return awaited;
        } finally {
          setVariantsLoading(false);
        }
      }

      const runFetch = async () => {
        const startedAt = Date.now();
        let attempt = 0;

        while (true) {
          attempt += 1;
          const params = new URLSearchParams({
            provider: PROVIDER,
            product_id: item.id,
          });
          const response = await fetch(`/api/production/suppliers/variants?${params.toString()}`);
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(toText(payload?.error) || "Unable to load variants.");
          }
          const nextVariants = payload as VariantsPayload;
          const comboCount = Array.isArray(nextVariants?.combos) ? nextVariants.combos.length : 0;
          const galleryCount = Array.isArray(nextVariants?.gallery_images)
            ? nextVariants.gallery_images.length
            : 0;
          const latestItem = itemsRef.current.find((entry) => entry.id === item.id) || item;
          const payloadStatus = normalizePayloadStatus(latestItem.selection?.payload_status);
          const supplierSelectedNow = Boolean(
            toText(latestItem.selection?.selected_offer_id) ||
              toText(latestItem.selection?.selected_detail_url)
          );
          const hasPayloadFile = Boolean(toText(latestItem.selection?.payload_file_name));
          const elapsedMs = Date.now() - startedAt;
          const activePayloadLoad =
            payloadStatus === "queued" || payloadStatus === "fetching";
          const shouldRetryWhileLoading = activePayloadLoad && elapsedMs < 95_000;
          const shouldRetryAfterReadyish =
            !activePayloadLoad &&
            (payloadStatus === "ready" || hasPayloadFile || !payloadStatus) &&
            elapsedMs < 22_000;
          const shouldRetry =
            waitForPayload &&
            comboCount === 0 &&
            galleryCount === 0 &&
            supplierSelectedNow &&
            (shouldRetryWhileLoading || shouldRetryAfterReadyish);

          if (shouldRetry) {
            await loadItems();
            await sleep(Math.min(1200 + attempt * 350, 2600));
            continue;
          }

          variantsCacheRef.current[item.id] = nextVariants;
          if (
            !background &&
            offerDialogOpenRef.current &&
            offerDialogItemIdRef.current === item.id
          ) {
            applyVariantsPayload(nextVariants);
          }
          return nextVariants;
        }
      };

      const fetchPromise = runFetch();
      variantFetchInFlightRef.current.set(item.id, fetchPromise);
      if (!background) setVariantsLoading(true);
      try {
        return await fetchPromise;
      } catch (err) {
        if (!background) {
          setError(err instanceof Error ? err.message : "Unable to load variants.");
          setVariants(null);
          setVariantDraftOverrides({});
          setSelectedVariantIndexes([]);
          setPacksText("");
        }
        return null;
      } finally {
        variantFetchInFlightRef.current.delete(item.id);
        if (!background) setVariantsLoading(false);
      }
    },
    [applyVariantsPayload, loadItems]
  );

  const openSupplierDialog = useCallback(
    async (item: SuggestionItem) => {
      setOfferDialogItem(item);
      setOfferDialogOffers(item.search?.offers || []);
      setSupplierImagePreviewEntry(null);
      if (Array.isArray(item.search?.offers) && item.search.offers.length > 0) {
        void translateSupplierOffers(item.id, item.search.offers);
      }
      setSelectedOfferId(toText(item.selection?.selected_offer_id));
      const cachedVariants = variantsCacheRef.current[item.id];
      const cachedComboCount = Array.isArray(cachedVariants?.combos)
        ? cachedVariants.combos.length
        : 0;
      const cachedGalleryCount = Array.isArray(cachedVariants?.gallery_images)
        ? cachedVariants.gallery_images.length
        : 0;
      const cachedHasVariantData = cachedComboCount > 0 || cachedGalleryCount > 0;
      if (cachedVariants) {
        applyVariantsPayload(cachedVariants);
      } else {
        setVariants(null);
        setVariantDraftOverrides({});
        setSelectedVariantIndexes([]);
        setPacksText("");
      }
      setOfferDialogOpen(true);

      const supplierSelected = Boolean(
        toText(item.selection?.selected_offer_id) ||
          toText(item.selection?.selected_detail_url)
      );
      if (supplierSelected && (!cachedVariants || !cachedHasVariantData)) {
        void fetchVariants(item, {
          force: Boolean(cachedVariants) && !cachedHasVariantData,
          waitForPayload: true,
        });
      }

      const hasOffers =
        (Array.isArray(item.search?.offers) && item.search.offers.length > 0) ||
        Number(item.search?.offerCount || 0) > 0;
      const searchJobStatus = toText(item.searchJob?.status).toLowerCase();
      const searchAlreadyRunning =
        searchJobStatus === "queued" || searchJobStatus === "running";

      if (!hasOffers && item.mainImageUrl && !searchAlreadyRunning) {
        setOfferDialogBusy(true);
        try {
          const offers = await runSupplierSearch(item, false);
          if (offers) {
            setOfferDialogOffers(offers);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Supplier search failed.");
        } finally {
          setOfferDialogBusy(false);
        }
      }

    },
    [applyVariantsPayload, fetchVariants, runSupplierSearch, translateSupplierOffers]
  );

  const selectSupplierOfferById = useCallback(
    async (picked: SupplierOffer) => {
      if (!offerDialogItem) return;

      const offerId = toText(picked.offerId);
      if (!offerId) {
        setError("Selected offer is missing an offer ID.");
        return;
      }

      // If this supplier is already selected and variants are cached, render instantly.
      if (selectedOfferId === offerId) {
        const cached = variantsCacheRef.current[offerDialogItem.id];
        if (cached) {
          applyVariantsPayload(cached);
          return;
        }
        await fetchVariants(offerDialogItem, { waitForPayload: true });
        return;
      }

      setSelectingOfferId(offerId);
      setError(null);
      setSelectedOfferId(offerId);
      setVariants(null);
      setVariantDraftOverrides({});
      setSelectedVariantIndexes([]);
      setPacksText("");

      try {
        const response = await fetch("/api/production/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: PROVIDER,
            product_id: offerDialogItem.id,
            offer_id: offerId,
            detail_url: toText(picked.detailUrl) || null,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(toText(payload?.error) || "Unable to select supplier.");
        }

        const suggestionTitle = toText(payload?.suggestion_title);
        if (suggestionTitle) {
          setItems((prev) =>
            prev.map((entry) =>
              entry.id === offerDialogItem.id
                ? {
                    ...entry,
                    title: suggestionTitle,
                  }
                : entry
            )
          );
          setOfferDialogItem((prev) =>
            prev && prev.id === offerDialogItem.id
              ? {
                  ...prev,
                  title: suggestionTitle,
                }
              : prev
          );
        }

        setMessage("Supplier selected. Loading variants...");
        await loadItems();
        delete variantsCacheRef.current[offerDialogItem.id];
        await fetchVariants(offerDialogItem, { force: true, waitForPayload: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to select supplier.");
      } finally {
        setSelectingOfferId("");
      }
    },
    [applyVariantsPayload, fetchVariants, loadItems, offerDialogItem, selectedOfferId]
  );

  const saveVariantSelection = useCallback(async () => {
    if (!offerDialogItem || !variants) return;
    setVariantsSaving(true);
    setError(null);

    try {
      const comboOverrides = Object.entries(variantDraftOverrides)
        .map(([rawIndex, draft]) => {
          const index = Number(rawIndex);
          if (!Number.isInteger(index) || index < 0) return null;
          const priceRaw = allowCnyPriceEditing
            ? toText(draft.price).replace(",", ".")
            : "";
          const weightRaw = toText(draft.weightGrams).replace(",", ".");
          const priceNum = Number(priceRaw);
          const weightNum = Number(weightRaw);
          const price =
            allowCnyPriceEditing && Number.isFinite(priceNum) && priceNum > 0
              ? Number(priceNum.toFixed(4))
              : null;
          const weightGrams =
            Number.isFinite(weightNum) && weightNum > 0
              ? Math.round(weightNum)
              : null;
          if (price === null && weightGrams === null) return null;
          return {
            index,
            price,
            weight_grams: weightGrams,
          };
        })
        .filter(
          (
            row
          ): row is { index: number; price: number | null; weight_grams: number | null } =>
            Boolean(row)
        );

      const response = await fetch("/api/production/suppliers/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: PROVIDER,
          product_id: offerDialogItem.id,
          selected_combo_indexes: selectedVariantIndexes,
          packs_text: normalizePacksText(packsText),
          combo_overrides: comboOverrides,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toText(payload?.error) || "Unable to save variants.");
      }

      setMessage("Variant selection saved.");
      const overrideMap = new Map(
        comboOverrides.map((row) => [row.index, row] as const)
      );
      const combosWithOverrides = variants.combos.map((combo) => {
        const override = overrideMap.get(combo.index);
        if (!override) return combo;
        return {
          ...combo,
          price:
            override.price !== null && override.price !== undefined
              ? override.price
              : combo.price,
          price_raw:
            override.price !== null && override.price !== undefined
              ? formatCompactNumber(override.price)
              : combo.price_raw,
          weight_grams:
            override.weight_grams !== null && override.weight_grams !== undefined
              ? override.weight_grams
              : combo.weight_grams,
          weight_raw:
            override.weight_grams !== null && override.weight_grams !== undefined
              ? `${override.weight_grams}g`
              : combo.weight_raw,
        };
      });
      variantsCacheRef.current[offerDialogItem.id] = {
        ...variants,
        combos: combosWithOverrides,
        selected_combo_indexes: selectedVariantIndexes,
        packs_text: normalizePacksText(packsText),
      };
      await loadItems();
      setOfferDialogOpen(false);
      setOfferDialogItem(null);
      setVariantDraftOverrides({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save variants.");
    } finally {
      setVariantsSaving(false);
    }
  }, [
    allowCnyPriceEditing,
    offerDialogItem,
    packsText,
    selectedVariantIndexes,
    variants,
    loadItems,
    variantDraftOverrides,
  ]);

  const openPayloadJson = useCallback(async (item: SuggestionItem) => {
    setError(null);
    try {
      const params = new URLSearchParams({
        provider: PROVIDER,
        product_id: item.id,
      });
      const response = await fetch(
        `/api/production/suppliers/payload/file?${params.toString()}`
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toText(payload?.error) || "Unable to load payload JSON.");
      }

      setJsonDialogTitle(`Production JSON - ${item.id}`);
      setJsonDialogText(toText(payload?.text));
      setJsonDialogOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load payload JSON.");
    }
  }, []);

  const handleFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const next = Array.from(incoming);
    if (next.length === 0) return;
    setFiles((prev) => [...prev, ...next]);
  }, []);

  const openAddDialog = useCallback(() => {
    setAddDialogOpen(true);
    setIsAddDialogDragOver(false);
    setMessage(null);
    setError(null);
  }, []);

  const submitBatch = useCallback(async () => {
    setError(null);
    setMessage(null);

    if (files.length === 0 && parsedUrls.length === 0) {
      setError("Add at least one product URL and/or one image/zip file.");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      if (urlsText.trim()) formData.append("urls", urlsText);
      // Always queued automatically in background.
      formData.append("queue_search", "1");

      const response = await fetch("/api/digideal/product-suggestions", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toText(payload?.error) || "Failed to create suggestions.");
      }

      const createdItems = Array.isArray(payload?.items)
        ? (payload.items as SuggestionItem[])
        : [];
      const queueWorkerStarted = Boolean(payload?.queueWorkerStarted);
      setMessage(
        queueWorkerStarted
          ? `Created ${createdItems.length} suggestion(s). Background supplier queue started.`
          : `Created ${createdItems.length} suggestion(s). Supplier queue will continue in background.`
      );
      setFiles([]);
      setUrlsText("");
      setAddDialogOpen(false);
      await loadItems();

      if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
        setError((payload.errors as string[]).slice(0, 5).join(" | "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create suggestions.");
    } finally {
      setIsSubmitting(false);
    }
  }, [files, loadItems, parsedUrls.length, urlsText]);

  const toggleVariantIndex = useCallback((index: number, checked: boolean) => {
    setSelectedVariantIndexes((prev) => {
      const nextSet = new Set(prev);
      if (checked) nextSet.add(index);
      else nextSet.delete(index);
      return Array.from(nextSet).sort((a, b) => a - b);
    });
  }, []);

  const defaultVariantDraftFromCombo = useCallback(
    (combo: VariantCombo): VariantDraftOverride => ({
      price:
        combo.price !== null && combo.price !== undefined
          ? formatCompactNumber(combo.price)
          : toText(combo.price_raw),
      weightGrams:
        combo.weight_grams !== null && combo.weight_grams !== undefined
          ? String(combo.weight_grams)
          : toText(combo.weight_raw),
    }),
    []
  );

  const resolveVariantDraft = useCallback(
    (combo: VariantCombo): VariantDraftOverride =>
      variantDraftOverrides[combo.index] || defaultVariantDraftFromCombo(combo),
    [defaultVariantDraftFromCombo, variantDraftOverrides]
  );

  const updateVariantDraftField = useCallback(
    (combo: VariantCombo, field: "price" | "weightGrams", nextValue: string) => {
      setVariantDraftOverrides((prev) => {
        const current = prev[combo.index] || defaultVariantDraftFromCombo(combo);
        return {
          ...prev,
          [combo.index]: {
            ...current,
            [field]: nextValue,
          },
        };
      });
    },
    [defaultVariantDraftFromCombo]
  );

  const selectedDialogOffer = useMemo(() => {
    const fromOfferList =
      selectedOfferId
        ? offerDialogOffers.find((offer) => toText(offer.offerId) === selectedOfferId) || null
        : null;
    const fromSelection =
      offerDialogItem?.selection?.selected_offer &&
      typeof offerDialogItem.selection.selected_offer === "object"
        ? (offerDialogItem.selection.selected_offer as Record<string, unknown>)
        : null;
    if (!fromOfferList && !fromSelection) return null;

    if (fromOfferList && fromSelection) {
      const listOfferId = toText(
        (fromOfferList as Record<string, unknown>)?.offerId ||
          (fromOfferList as Record<string, unknown>)?.offer_id
      );
      const listDetailUrl = toText(
        (fromOfferList as Record<string, unknown>)?.detailUrl ||
          (fromOfferList as Record<string, unknown>)?.detail_url
      );
      const selectedOfferIdFromSelection = toText(
        fromSelection?.offerId ||
          fromSelection?.offer_id ||
          offerDialogItem?.selection?.selected_offer_id
      );
      const selectedDetailUrlFromSelection = toText(
        fromSelection?.detailUrl ||
          fromSelection?.detail_url ||
          offerDialogItem?.selection?.selected_detail_url
      );
      const sameOffer =
        Boolean(listOfferId && selectedOfferIdFromSelection && listOfferId === selectedOfferIdFromSelection) ||
        Boolean(listDetailUrl && selectedDetailUrlFromSelection && listDetailUrl === selectedDetailUrlFromSelection);
      if (sameOffer) {
        return {
          ...(fromOfferList as Record<string, unknown>),
          ...fromSelection,
        } as SupplierOffer;
      }
      return {
        ...(fromOfferList as Record<string, unknown>),
        ...fromSelection,
      } as SupplierOffer;
    }

    if (fromSelection) return fromSelection as unknown as SupplierOffer;
    return fromOfferList as SupplierOffer;
  }, [
    offerDialogItem?.selection?.selected_detail_url,
    offerDialogItem?.selection?.selected_offer,
    offerDialogItem?.selection?.selected_offer_id,
    offerDialogOffers,
    selectedOfferId,
  ]);

  const dialogSourceMainImageUrl = useMemo(
    () =>
      normalizeImageUrl(
        offerDialogItem?.mainImageUrl ||
          offerDialogItem?.externalData?.mainImageUrl ||
          offerDialogItem?.externalData?.rawMainImageUrl ||
          ""
      ),
    [offerDialogItem]
  );

  const supplierGalleryCandidates = useMemo(() => {
    const entries: SupplierGalleryImageEntry[] = [];
    const seen = new Set<string>();
    const push = (
      fullValue: unknown,
      thumbHint: unknown,
      source: SupplierGalleryImageEntry["source"]
    ) => {
      const fullRaw = normalizeImageUrl(fullValue) || normalizeImageUrl(thumbHint);
      if (!fullRaw) return;
      const identity = imageIdentity(fullRaw);
      if (!identity || seen.has(identity)) return;
      seen.add(identity);
      const thumbRaw = normalizeImageUrl(thumbHint) || fullRaw;
      const previewUrl =
        buildLargePreviewImageUrl(fullRaw, 520) ||
        buildLargePreviewImageUrl(thumbRaw, 520) ||
        fullRaw;
      entries.push({
        key: identity,
        identity,
        full: fullRaw,
        thumb: previewUrl,
        source,
      });
    };

    const selectedOfferRecord =
      selectedDialogOffer && typeof selectedDialogOffer === "object"
        ? (selectedDialogOffer as Record<string, unknown>)
        : null;

    if (selectedOfferRecord) {
      push(selectedOfferRecord.imageUrl, selectedOfferRecord.image_thumb_url, "offer");
      push(selectedOfferRecord.image_url, selectedOfferRecord.image_thumb_url, "offer");
      push(selectedOfferRecord.imgUrl, selectedOfferRecord.image_thumb_url, "offer");
      push(selectedOfferRecord.img_url, selectedOfferRecord.image_thumb_url, "offer");
      push(selectedOfferRecord.image, selectedOfferRecord.image_thumb_url, "offer");

      const selectedVariantCache =
        selectedOfferRecord._production_variant_cache &&
        typeof selectedOfferRecord._production_variant_cache === "object"
          ? (selectedOfferRecord._production_variant_cache as Record<string, unknown>)
          : null;

      if (selectedVariantCache && Array.isArray(selectedVariantCache.gallery_images)) {
        selectedVariantCache.gallery_images.forEach((imageRow) => {
          if (!imageRow || typeof imageRow !== "object") return;
          const imageRecord = imageRow as Record<string, unknown>;
          push(
            imageRecord.full_url ||
              imageRecord.url_full ||
              imageRecord.url ||
              imageRecord.thumb_url,
            imageRecord.thumb_url || imageRecord.url,
            "gallery"
          );
        });
      }
    }
    if (Array.isArray(variants?.gallery_images)) {
      variants.gallery_images.forEach((imageRow) => {
        if (!imageRow || typeof imageRow !== "object") return;
        const imageRecord = imageRow as Record<string, unknown>;
        push(
          imageRecord.full_url || imageRecord.url_full || imageRecord.url || imageRecord.thumb_url,
          imageRecord.thumb_url || imageRecord.url,
          "gallery"
        );
      });
    }
    return entries.slice(0, 120);
  }, [selectedDialogOffer, variants]);

  const supplierVariantImageIdentitySet = useMemo(() => {
    const identities = new Set<string>();
    const pushComboImages = (comboRow: unknown) => {
      if (!comboRow || typeof comboRow !== "object") return;
      const comboRecord = comboRow as Record<string, unknown>;
      [
        comboRecord.image_full_url,
        comboRecord.image_zoom_url,
        comboRecord.image_url,
        comboRecord.image_thumb_url,
      ].forEach((value) => {
        const id = imageIdentity(value);
        if (id) identities.add(id);
      });
    };

    if (Array.isArray(variants?.combos)) {
      variants.combos.forEach((combo) => pushComboImages(combo));
    }

    const selectedOfferRecord =
      selectedDialogOffer && typeof selectedDialogOffer === "object"
        ? (selectedDialogOffer as Record<string, unknown>)
        : null;
    const selectedVariantCache =
      selectedOfferRecord &&
      selectedOfferRecord._production_variant_cache &&
      typeof selectedOfferRecord._production_variant_cache === "object"
        ? (selectedOfferRecord._production_variant_cache as Record<string, unknown>)
        : null;

    if (selectedVariantCache && Array.isArray(selectedVariantCache.combos)) {
      selectedVariantCache.combos.forEach((comboRow) => pushComboImages(comboRow));
    }
    return identities;
  }, [selectedDialogOffer, variants]);

  const variantSelectionIsLoading = Boolean(
    (variantsLoading || selectingOfferId) && selectedOfferId
  );
  const isSingleSupplierGalleryImage = supplierGalleryVisibleImages.length === 1;

  const applyPacksDraft = useCallback(() => {
    const normalized = normalizePacksText(packsDraft);
    setPacksText(normalized);
    setPacksDraft(normalized);
    setPacksPopoverOpen(false);
  }, [packsDraft]);

  const appliedPackValues = useMemo(() => parsePackValues(packsText), [packsText]);
  const draftPackValues = useMemo(() => parsePackValues(packsDraft), [packsDraft]);
  const hasAppliedPacks = appliedPackValues.length > 0;
  const variantIndexes = useMemo(
    () => (Array.isArray(variants?.combos) ? variants.combos.map((combo) => combo.index) : []),
    [variants]
  );
  const selectedVariantIndexSet = useMemo(
    () => new Set(selectedVariantIndexes),
    [selectedVariantIndexes]
  );
  const allVariantsSelected =
    variantIndexes.length > 0 &&
    variantIndexes.every((index) => selectedVariantIndexSet.has(index));
  const someVariantsSelected =
    variantIndexes.length > 0 &&
    variantIndexes.some((index) => selectedVariantIndexSet.has(index));

  const toggleAllVariants = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedVariantIndexes([]);
        return;
      }
      setSelectedVariantIndexes([...variantIndexes].sort((a, b) => a - b));
    },
    [variantIndexes]
  );

  const removeDraftPack = useCallback((packToRemove: number) => {
    setPacksDraft((prev) =>
      parsePackValues(prev)
        .filter((pack) => pack !== packToRemove)
        .join(", ")
    );
  }, []);

  const supplierDialogTitleText = toText(offerDialogItem?.title) || toText(offerDialogItem?.id);

  const categorySummary =
    categorySelections.length === 0
      ? "All Categories"
      : categorySelections.length <= 2
        ? categorySelections
            .map((item) => {
              const parts = String(item.value || "")
                .split(">")
                .map((entry) => entry.trim())
                .filter(Boolean);
              return parts[parts.length - 1] || item.value;
            })
            .join(", ")
        : `${categorySelections.length} selected`;

  const draftKeys = new Set(
    categoryDraft.map((item) => `${item.level}:${item.value}`)
  );

  const toggleDraftCategory = useCallback(
    (level: "l1" | "l2" | "l3", value: string) => {
      setCategoryDraft((prev) => {
        const exists = prev.some(
          (entry) => entry.level === level && entry.value === value
        );
        if (exists) {
          return prev.filter(
            (entry) => !(entry.level === level && entry.value === value)
          );
        }
        return [...prev, { level, value }];
      });
    },
    []
  );

  const categorySearchNormalized = categorySearch.trim().toLowerCase();
  const categoryTokens = useMemo(
    () => categorySearchNormalized.split(/\s+/).filter(Boolean),
    [categorySearchNormalized]
  );

  const matchCategoryTokens = useCallback(
    (value: string) => {
      if (categoryTokens.length === 0) return true;
      const normalized = value.toLowerCase();
      return categoryTokens.some((token) => normalized.includes(token));
    },
    [categoryTokens]
  );

  const filteredCategories = useMemo(() => {
    if (categoryTokens.length === 0) return categories;
    return categories.filter((l1) => {
      if (matchCategoryTokens(l1.name)) return true;
      return (l1.children ?? []).some((l2) => {
        if (matchCategoryTokens(l2.name)) return true;
        return (l2.children ?? []).some((l3) => matchCategoryTokens(l3.name));
      });
    });
  }, [categories, categoryTokens.length, matchCategoryTokens]);

  const filteredL2Nodes = useMemo(() => {
    const l1Node = filteredCategories.find((node) => node.name === activeL1);
    const nodes = l1Node?.children ?? [];
    if (categoryTokens.length === 0) return nodes;
    return nodes.filter(
      (l2) =>
        matchCategoryTokens(l2.name) ||
        (l2.children ?? []).some((l3) => matchCategoryTokens(l3.name))
    );
  }, [filteredCategories, activeL1, categoryTokens.length, matchCategoryTokens]);

  const filteredL3Nodes = useMemo(() => {
    const l1Node = filteredCategories.find((node) => node.name === activeL1);
    const l2Node = (l1Node?.children ?? []).find((child) => child.name === activeL2);
    const nodes = l2Node?.children ?? [];
    if (categoryTokens.length === 0) return nodes;
    return nodes.filter((l3) => matchCategoryTokens(l3.name));
  }, [filteredCategories, activeL1, activeL2, categoryTokens.length, matchCategoryTokens]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (sourceFilter !== "all" && item.sourceType !== sourceFilter) return false;

      const searchJobStatus = toText(item.searchJob?.status).toLowerCase();
      const payloadStatus = normalizePayloadStatus(item.selection?.payload_status);
      const supplierSelected = Boolean(
        toText(item.selection?.selected_offer_id) ||
          toText(item.selection?.selected_detail_url)
      );
      const supplierSearching =
        searchJobStatus === "queued" ||
        searchJobStatus === "running" ||
        payloadStatus === "queued" ||
        payloadStatus === "fetching";
      const supplierStarted =
        supplierSelected ||
        supplierSearching ||
        (Array.isArray(item.search?.offers) && item.search.offers.length > 0) ||
        Boolean(item.search?.fetchedAt) ||
        searchJobStatus === "done";

      if (supplierFilter === "selected" && !supplierSelected) return false;
      if (supplierFilter === "searching" && !supplierSearching) return false;
      if (supplierFilter === "not_started" && supplierStarted) return false;

      const hasPickedVariants = Boolean(
        item.variantMetrics && item.variantMetrics.selectedCount > 0
      );
      if (variantFilter === "picked" && !hasPickedVariants) return false;
      if (variantFilter === "not_picked" && hasPickedVariants) return false;

      if (categorySelections.length > 0) {
        const taxonomyPath = toText(
          item.googleTaxonomy?.path ||
            [item.googleTaxonomy?.l1, item.googleTaxonomy?.l2, item.googleTaxonomy?.l3]
              .map((entry) => toText(entry))
              .filter(Boolean)
              .join(" > ")
        );
        const taxonomyPathLower = taxonomyPath.toLowerCase();
        if (!taxonomyPathLower) return false;

        const matchedCategory = categorySelections.some((selection) => {
          const value = toText(selection.value).toLowerCase();
          if (!value) return false;
          return (
            taxonomyPathLower === value ||
            taxonomyPathLower.startsWith(`${value} >`)
          );
        });
        if (!matchedCategory) return false;
      }

      if (!query) return true;

      const selectedOffer =
        item.selection?.selected_offer &&
        typeof item.selection.selected_offer === "object"
          ? (item.selection.selected_offer as Record<string, unknown>)
          : null;

      const haystack = [
        item.id,
        item.title,
        item.sourceLabel,
        item.sourceUrl,
        item.crawlFinalUrl,
        item.externalData?.title,
        item.externalData?.description,
        item.externalData?.inputUrl,
        item.externalData?.finalUrl,
        item.googleTaxonomy?.path,
        item.googleTaxonomy?.l1,
        item.googleTaxonomy?.l2,
        item.googleTaxonomy?.l3,
        toText(selectedOffer?.subject),
        toText(selectedOffer?.subject_en),
      ]
        .map((value) => toText(value).toLowerCase())
        .filter(Boolean)
        .join(" ");

      return haystack.includes(query);
    });
  }, [
    items,
    searchQuery,
    sourceFilter,
    supplierFilter,
    variantFilter,
    categorySelections,
  ]);

  const visibleItemIds = useMemo(() => filteredItems.map((item) => item.id), [filteredItems]);
  const eligibleItemIdSet = useMemo(
    () =>
      new Set(
        items.filter((item) => isSuggestionReadyForProduction(item)).map((item) => item.id)
      ),
    [items]
  );
  const selectedEligibleItemIds = useMemo(
    () => selectedItemIds.filter((id) => eligibleItemIdSet.has(id)),
    [eligibleItemIdSet, selectedItemIds]
  );
  const selectedEligibleCount = selectedEligibleItemIds.length;
  const selectedIneligibleCount = Math.max(0, selectedItemIds.length - selectedEligibleCount);
  const canSendSelectedToProduction =
    selectedItemIds.length > 0 &&
    selectedEligibleCount === selectedItemIds.length &&
    selectedIneligibleCount === 0;
  const selectedVisibleCount = useMemo(
    () => visibleItemIds.filter((id) => selectedIdSet.has(id)).length,
    [selectedIdSet, visibleItemIds]
  );
  const allVisibleSelected =
    visibleItemIds.length > 0 && selectedVisibleCount === visibleItemIds.length;
  const selectAllState: boolean | "mixed" =
    allVisibleSelected
      ? true
      : selectedVisibleCount > 0
        ? "mixed"
        : false;

  const toggleRowSelected = useCallback((id: string, checked: boolean) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return Array.from(next);
    });
  }, []);

  const toggleSelectAllVisible = useCallback((checked: boolean) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        visibleItemIds.forEach((id) => next.add(id));
      } else {
        visibleItemIds.forEach((id) => next.delete(id));
      }
      return Array.from(next);
    });
  }, [visibleItemIds]);

  const deleteSelectedSuggestions = useCallback(async () => {
    if (selectedItemIds.length === 0) return;
    setIsDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/digideal/product-suggestions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedItemIds }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toText(payload?.error) || "Failed to delete products.");
      }
      const deletedCount = Number(payload?.deletedCount) || selectedItemIds.length;
      setSelectedItemIds([]);
      setMessage(`Deleted ${deletedCount} product(s).`);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete products.");
    } finally {
      setIsDeleting(false);
    }
  }, [loadItems, selectedItemIds]);

  const sendSelectedToProduction = useCallback(async () => {
    if (selectedItemIds.length === 0) {
      setError("Select at least one ready product to send.");
      return;
    }
    if (selectedIneligibleCount > 0) {
      setError(
        "Only ready products can be sent to production. Remove non-ready rows from selection."
      );
      return;
    }
    setIsSendingToProduction(true);
    setError(null);
    setMessage(null);
    try {
      const targetIds = selectedItemIds;
      const response = await fetch("/api/production/queue/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: targetIds.map((productId) => ({
            provider: PROVIDER,
            product_id: productId,
          })),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toText(payload?.error) || "Failed to send selected products.");
      }

      const nowIso = new Date().toISOString();
      const fileName = toText(payload?.file_name) || null;
      const jobId = toText(payload?.job?.jobId) || null;
      const sentIdSet = new Set(targetIds);
      setItems((prev) =>
        prev.map((entry) => {
          if (!sentIdSet.has(entry.id)) return entry;
          return {
            ...entry,
            productionStatus: {
              ...(entry.productionStatus || {}),
              status: "queued_for_production",
              updated_at: nowIso,
              last_file_name: fileName || entry.productionStatus?.last_file_name || null,
              last_job_id: jobId || entry.productionStatus?.last_job_id || null,
            },
          };
        })
      );

      const missingCount = Number(payload?.missing_count);
      const normalizedMissingCount =
        Number.isFinite(missingCount) && missingCount > 0 ? Math.trunc(missingCount) : 0;
      const sentCount = Math.max(0, targetIds.length - normalizedMissingCount);
      const missingText =
        normalizedMissingCount > 0
          ? ` ${normalizedMissingCount} item(s) had missing payload JSON.`
          : "";
      setMessage(`Sent ${sentCount} product(s) to production queue.${missingText}`);
      await loadItems({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send selected products.");
    } finally {
      setIsSendingToProduction(false);
    }
  }, [loadItems, selectedIneligibleCount, selectedItemIds]);

  useEffect(() => {
    if (!message) {
      setMessageClosing(false);
      return;
    }
    setMessageClosing(false);
    const closeTimer = window.setTimeout(() => setMessageClosing(true), 3000);
    const clearTimer = window.setTimeout(() => {
      setMessage(null);
      setMessageClosing(false);
    }, 3280);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [message]);

  useEffect(() => {
    if (!error) {
      setErrorClosing(false);
      return;
    }
    setErrorClosing(false);
    const closeTimer = window.setTimeout(() => setErrorClosing(true), 3000);
    const clearTimer = window.setTimeout(() => {
      setError(null);
      setErrorClosing(false);
    }, 3280);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [error]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (categoryPopoverOpen) {
      setCategoryDraft(categorySelections);
    }
  }, [categoryPopoverOpen, categorySelections]);

  useEffect(() => {
    const controller = new AbortController();
    const loadCategories = async () => {
      setCategoriesLoading(true);
      setCategoriesError(null);
      try {
        const response = await fetch("/api/digideal/categories?provider=digideal", {
          signal: controller.signal,
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to load categories.");
        }
        const payload = (await response.json()) as { categories?: CategoryNode[] };
        setCategories(Array.isArray(payload.categories) ? payload.categories : []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setCategoriesError(
          err instanceof Error ? err.message : "Failed to load categories."
        );
        setCategories([]);
      } finally {
        setCategoriesLoading(false);
      }
    };

    void loadCategories();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (filteredCategories.length === 0) {
      setActiveL1(null);
      return;
    }
    if (!activeL1 || !filteredCategories.some((node) => node.name === activeL1)) {
      setActiveL1(filteredCategories[0].name);
    }
  }, [activeL1, filteredCategories]);

  useEffect(() => {
    if (filteredCategories.length === 0 || filteredL2Nodes.length === 0) {
      setActiveL2(null);
      return;
    }
    setActiveL2((prev) =>
      prev && filteredL2Nodes.some((child) => child.name === prev)
        ? prev
        : filteredL2Nodes[0].name
    );
  }, [filteredCategories, filteredL2Nodes]);

  useEffect(() => {
    setSelectedItemIds((prev) => {
      if (prev.length === 0) return prev;
      const valid = new Set(items.map((item) => item.id));
      return prev.filter((id) => valid.has(id));
    });
  }, [items]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    offerDialogOpenRef.current = offerDialogOpen;
    offerDialogItemIdRef.current = offerDialogItem?.id || "";
  }, [offerDialogItem?.id, offerDialogOpen]);

  useEffect(() => {
    let active = true;
    const loadViewerRole = async () => {
      try {
        const response = await fetch("/api/settings/profile", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        if (!active) return;
        setViewerPriceRole(deriveViewerPriceRole(payload));
      } catch {
        // Keep default visibility when profile lookup fails.
      }
    };
    loadViewerRole();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const hasActiveBackgroundJobs = items.some((item) => {
      const searchStatus = toText(item.searchJob?.status).toLowerCase();
      const sourceStatus = toText(item.sourceJob?.status).toLowerCase();
      const taxonomyStatus = toText(item.googleTaxonomy?.status).toLowerCase();
      const payloadStatus = normalizePayloadStatus(item.selection?.payload_status);
      return (
        searchStatus === "queued" ||
        searchStatus === "running" ||
        sourceStatus === "queued" ||
        sourceStatus === "running" ||
        taxonomyStatus === "queued" ||
        taxonomyStatus === "running" ||
        payloadStatus === "queued" ||
        payloadStatus === "fetching"
      );
    });
    if (!hasActiveBackgroundJobs) return;

    const timer = setInterval(() => {
      void loadItems({ silent: true });
    }, 4000);
    return () => clearInterval(timer);
  }, [items, loadItems]);

  useEffect(() => {
    if (supplierTranslateBusyRef.current) return;

    const candidate = items.find((item) => {
      if (!Array.isArray(item.search?.offers) || item.search.offers.length === 0) return false;
      const pendingOfferTitles = item.search.offers.filter((offer) => {
        const subject = toText(offer?.subject);
        if (!subject || !hasCjk(subject)) return false;
        const existingEn = toText(offer?.subject_en);
        return !existingEn || hasCjk(existingEn);
      });
      if (pendingOfferTitles.length === 0) {
        supplierTranslateAttemptsRef.current.delete(item.id);
        return false;
      }
      const attempts = supplierTranslateAttemptsRef.current.get(item.id) ?? 0;
      return attempts < 4;
    });

    if (!candidate) return;

    supplierTranslateBusyRef.current = true;
    supplierTranslateAttemptsRef.current.set(
      candidate.id,
      (supplierTranslateAttemptsRef.current.get(candidate.id) ?? 0) + 1
    );

    let timeoutId = 0;
    const controller = new AbortController();
    timeoutId = window.setTimeout(() => controller.abort(), 15000);

    void fetch("/api/production/suppliers/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: PROVIDER,
        product_id: candidate.id,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        await response.json().catch(() => null);
        await loadItems();
      })
      .catch(() => null)
      .finally(() => {
        window.clearTimeout(timeoutId);
        supplierTranslateBusyRef.current = false;
      });
  }, [items, loadItems]);

  useEffect(() => {
    if (!offerDialogOpen || !offerDialogItem?.id) return;
    const latest = items.find((entry) => entry.id === offerDialogItem.id);
    if (!latest) return;

    setOfferDialogItem((prev) => (prev && prev.id === latest.id ? latest : prev));
    setOfferDialogOffers(Array.isArray(latest.search?.offers) ? latest.search.offers : []);
    const latestSelected = toText(latest.selection?.selected_offer_id);
    if (!selectingOfferId && latestSelected && latestSelected !== selectedOfferId) {
      setSelectedOfferId(latestSelected);
    }
  }, [items, offerDialogItem?.id, offerDialogOpen, selectedOfferId, selectingOfferId]);

  useEffect(() => {
    let cancelled = false;
    if (supplierGalleryCandidates.length === 0) {
      setSupplierGalleryVisibleImages([]);
      setSupplierGalleryFiltering(false);
      return;
    }

    const quickNonVariant = supplierGalleryCandidates.filter(
      (entry) => !supplierVariantImageIdentitySet.has(entry.identity)
    );
    const quickVariant = supplierGalleryCandidates.filter((entry) =>
      supplierVariantImageIdentitySet.has(entry.identity)
    );
    const quickCandidates =
      quickNonVariant.length > 0
        ? [...quickNonVariant, ...quickVariant]
        : supplierGalleryCandidates;
    setSupplierGalleryVisibleImages(quickCandidates.slice(0, 120));
    if (quickCandidates.length === 0) {
      setSupplierGalleryFiltering(false);
      return;
    }

    setSupplierGalleryFiltering(true);
    const run = async () => {
      const filteredImages: Array<{
        entry: SupplierGalleryImageEntry;
        probe: SupplierGalleryProbeResult | null;
      }> = [];

      for (const entry of quickCandidates) {
        const cacheKey = entry.identity || entry.full || entry.thumb;
        let probe = supplierGalleryProbeCacheRef.current.get(cacheKey);
        if (probe === undefined) {
          const probeUrl =
            buildLargePreviewImageUrl(entry.full || entry.thumb, 640) ||
            resolveProbeImageUrl(entry.full || entry.thumb);
          probe = await probeSupplierImage(probeUrl);
          supplierGalleryProbeCacheRef.current.set(cacheKey, probe ?? null);
        }
        const hasMinimumDimensions =
          !probe ||
          (probe.width >= MIN_SUPPLIER_GALLERY_DIMENSION &&
            probe.height >= MIN_SUPPLIER_GALLERY_DIMENSION);
        if (!hasMinimumDimensions) {
          continue;
        }
        const hasMinimumBytes =
          !probe ||
          probe.byteSize === null ||
          probe.byteSize >= MIN_SUPPLIER_GALLERY_BYTES;
        if (!hasMinimumBytes) {
          continue;
        }
        filteredImages.push({ entry, probe });
      }
      if (cancelled) return;

      const scoreEntry = (probe: SupplierGalleryProbeResult | null) => {
        if (!probe) return 0;
        const area = Math.max(0, probe.width) * Math.max(0, probe.height);
        return area * 1000000 + Math.max(0, probe.byteSize ?? 0);
      };

      const dedupeBySignatureKeepLargest = (
        rows: Array<{
          entry: SupplierGalleryImageEntry;
          probe: SupplierGalleryProbeResult | null;
        }>
      ) => {
        const out: Array<{
          entry: SupplierGalleryImageEntry;
          probe: SupplierGalleryProbeResult | null;
        }> = [];
        const seenBySignature = new Map<string, number>();
        rows.forEach((row) => {
          const signature = row.probe?.signature || `id:${row.entry.identity || row.entry.key}`;
          const existingIndex = seenBySignature.get(signature);
          if (existingIndex === undefined) {
            seenBySignature.set(signature, out.length);
            out.push(row);
            return;
          }
          const existing = out[existingIndex];
          if (scoreEntry(row.probe) > scoreEntry(existing.probe)) {
            out[existingIndex] = row;
          }
        });
        return out;
      };

      const finalImages = dedupeBySignatureKeepLargest(filteredImages).map((row) => row.entry);
      if (cancelled) return;
      setSupplierGalleryVisibleImages(
        (finalImages.length > 0 ? finalImages : quickCandidates).slice(0, 120)
      );
      setSupplierGalleryFiltering(false);
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [supplierGalleryCandidates, supplierVariantImageIdentitySet]);

  useEffect(() => {
    const scroller = supplierGalleryStripRef.current;
    if (!scroller) return;
    scroller.scrollLeft = 0;
  }, [offerDialogItem?.id, supplierGalleryVisibleImages.length]);

  useEffect(() => {
    const warmCandidates = items
      .filter((item) => {
        const supplierSelected = Boolean(
          toText(item.selection?.selected_offer_id) ||
            toText(item.selection?.selected_detail_url)
        );
        const payloadStatus = normalizePayloadStatus(item.selection?.payload_status);
        const cached = variantsCacheRef.current[item.id];
        const cachedComboCount = Array.isArray(cached?.combos)
          ? cached.combos.length
          : 0;
        const cachedGalleryCount = Array.isArray(cached?.gallery_images)
          ? cached.gallery_images.length
          : 0;
        const cachedHasVariantData = cachedComboCount > 0 || cachedGalleryCount > 0;
        if (cachedHasVariantData) {
          variantWarmAttemptsRef.current.delete(item.id);
          return false;
        }
        const attempts = variantWarmAttemptsRef.current.get(item.id) ?? 0;
        return (
          supplierSelected &&
          payloadStatus === "ready" &&
          attempts < 4
        );
      })
      .slice(0, 12);
    if (warmCandidates.length === 0) return;
    warmCandidates.forEach((item) => {
      const cached = variantsCacheRef.current[item.id];
      const cachedComboCount = Array.isArray(cached?.combos)
        ? cached.combos.length
        : 0;
      const cachedGalleryCount = Array.isArray(cached?.gallery_images)
        ? cached.gallery_images.length
        : 0;
      const forceRefresh = Boolean(cached) && cachedComboCount === 0 && cachedGalleryCount === 0;
      variantWarmAttemptsRef.current.set(
        item.id,
        (variantWarmAttemptsRef.current.get(item.id) ?? 0) + 1
      );
      void fetchVariants(item, {
        background: true,
        force: forceRefresh,
        waitForPayload: true,
      }).then((payload) => {
        const comboCount = Array.isArray(payload?.combos) ? payload.combos.length : 0;
        const galleryCount = Array.isArray(payload?.gallery_images)
          ? payload.gallery_images.length
          : 0;
        if (comboCount > 0 || galleryCount > 0) {
          variantWarmAttemptsRef.current.delete(item.id);
        }
      });
    });
  }, [items, fetchVariants]);

  useEffect(() => {
    const preloadRawUrls: string[] = [];
    for (const item of items) {
      const offers = Array.isArray(item.search?.offers) ? item.search.offers : [];
      for (const offer of offers.slice(0, 12)) {
        const raw = extractOfferImageUrl(offer);
        if (raw) preloadRawUrls.push(raw);
      }
    }
    if (preloadRawUrls.length === 0) return;

    const seen = supplierOfferImageWarmRef.current;
    const nextRaw = Array.from(new Set(preloadRawUrls)).filter((url) => !seen.has(url));
    if (nextRaw.length === 0) return;

    const warmTargets = nextRaw.slice(0, 180);
    const preloaders: HTMLImageElement[] = [];

    warmTargets.forEach((raw) => {
      seen.add(raw);
      const thumb = buildImageProxyUrl(raw, 128, 128);
      if (!thumb) return;

      const img = new Image();
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.loading = "eager";
      img.src = thumb;
      preloaders.push(img);

      void fetch(thumb, { cache: "force-cache" }).catch(() => undefined);
    });

    return () => {
      preloaders.forEach((img) => {
        img.src = "";
      });
    };
  }, [items]);

  useEffect(() => {
    if (!variants || !Array.isArray(variants.combos) || variants.combos.length === 0) return;

    const thumbUrls = variants.combos
      .map((combo) => {
        const raw = normalizeImageUrl(
          combo.image_thumb_url ||
            combo.image_url ||
            (combo as unknown as Record<string, unknown>).imageUrl ||
            (combo as unknown as Record<string, unknown>).img ||
            (combo as unknown as Record<string, unknown>).image
        );
        return buildImageProxyUrl(raw, 88, 88) || raw;
      })
      .filter(Boolean);
    const zoomUrls = variants.combos
      .map((combo) => {
        const raw = normalizeImageUrl(
          combo.image_zoom_url ||
            combo.image_full_url ||
            combo.image_url ||
            (combo as unknown as Record<string, unknown>).imageUrl ||
            (combo as unknown as Record<string, unknown>).img ||
            (combo as unknown as Record<string, unknown>).image
        );
        return buildImageProxyUrl(raw, 420, 420) || raw;
      })
      .filter(Boolean);
    const preloadUrls = Array.from(
      new Set([...thumbUrls.slice(0, 80), ...zoomUrls.slice(0, 24)])
    );
    if (preloadUrls.length === 0) return;

    const preloaded: HTMLImageElement[] = [];
    preloadUrls.forEach((url) => {
      const image = new Image();
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.src = url;
      preloaded.push(image);
    });

    return () => {
      preloaded.forEach((img) => {
        img.src = "";
      });
    };
  }, [variants]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Product Suggestions</Text>
      </div>

      {message || error ? (
        <div className={styles.flashStack}>
          {message ? (
            <div
              className={mergeClasses(
                styles.flashItem,
                messageClosing && styles.flashItemClosing
              )}
            >
              <MessageBar intent="success">{message}</MessageBar>
            </div>
          ) : null}
          {error ? (
            <div
              className={mergeClasses(
                styles.flashItem,
                errorClosing && styles.flashItemClosing
              )}
            >
              <MessageBar intent="error">{error}</MessageBar>
            </div>
          ) : null}
        </div>
      ) : null}

      <Card className={styles.toolbarCard}>
        <div className={styles.toolbarTop}>
          <div className={styles.toolbarSearchWrap}>
            <Field label={<span className={styles.compactFieldLabel}>Search suggestions</span>}>
              <Input
                value={searchQuery}
                placeholder="Search product name, ID, source URL, supplier title..."
                onChange={(_, data) => setSearchQuery(data.value)}
              />
            </Field>
          </div>
          <div className={styles.toolbarFilters}>
            <Field
              label={<span className={styles.compactFieldLabel}>Category</span>}
              className={styles.filterField}
            >
              <Popover
                open={categoryPopoverOpen}
                onOpenChange={(_, data) => setCategoryPopoverOpen(data.open)}
                positioning={{
                  position: "below",
                  align: "start",
                  offset: { mainAxis: 6 },
                }}
              >
                <PopoverTrigger disableButtonEnhancement>
                  <Button appearance="outline" className={styles.categoryTrigger}>
                    {categorySummary}
                  </Button>
                </PopoverTrigger>
                <PopoverSurface className={styles.categoryPopover}>
                  {categoriesLoading ? (
                    <Spinner label="Loading categories..." />
                  ) : categoriesError ? (
                    <MessageBar intent="error">{categoriesError}</MessageBar>
                  ) : categories.length === 0 ? (
                    <Text>No categories available.</Text>
                  ) : (
                    <>
                      <Input
                        value={categorySearch}
                        onChange={(_, data) => setCategorySearch(data.value)}
                        placeholder="Search categories..."
                        className={styles.categorySearch}
                      />
                      <div className={styles.categoryColumns}>
                        <div className={styles.categoryColumn}>
                          <Text className={styles.categoryColumnTitle}>Level 1</Text>
                          {filteredCategories.map((l1) => (
                            <div
                              key={l1.name}
                              className={mergeClasses(
                                styles.categoryItem,
                                styles.categoryItemInteractive
                              )}
                              role="button"
                              tabIndex={0}
                              onClick={() => setActiveL1(l1.name)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setActiveL1(l1.name);
                                }
                              }}
                            >
                              <Checkbox
                                checked={draftKeys.has(`l1:${l1.name}`)}
                                className={styles.categoryCheckbox}
                                aria-label={`Select ${l1.name}`}
                                onChange={() => toggleDraftCategory("l1", l1.name)}
                                onClick={(event) => event.stopPropagation()}
                              />
                              <span
                                className={mergeClasses(
                                  styles.categoryNavButton,
                                  activeL1 === l1.name ? styles.categoryNavActive : undefined
                                )}
                              >
                                {l1.name}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className={styles.categoryColumn}>
                          <Text className={styles.categoryColumnTitle}>Level 2</Text>
                          {filteredL2Nodes.map((l2) => {
                            const value = activeL1 ? `${activeL1} > ${l2.name}` : l2.name;
                            return (
                              <div
                                key={l2.name}
                                className={mergeClasses(
                                  styles.categoryItem,
                                  styles.categoryItemInteractive
                                )}
                                role="button"
                                tabIndex={0}
                                onClick={() => setActiveL2(l2.name)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    setActiveL2(l2.name);
                                  }
                                }}
                              >
                                <Checkbox
                                  checked={draftKeys.has(`l2:${value}`)}
                                  className={styles.categoryCheckbox}
                                  aria-label={`Select ${l2.name}`}
                                  onChange={() => toggleDraftCategory("l2", value)}
                                  onClick={(event) => event.stopPropagation()}
                                />
                                <span
                                  className={mergeClasses(
                                    styles.categoryNavButton,
                                    activeL2 === l2.name ? styles.categoryNavActive : undefined
                                  )}
                                >
                                  {l2.name}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div className={styles.categoryColumn}>
                          <Text className={styles.categoryColumnTitle}>Level 3</Text>
                          {filteredL3Nodes.map((l3) => {
                            const value =
                              activeL1 && activeL2
                                ? `${activeL1} > ${activeL2} > ${l3.name}`
                                : l3.name;
                            return (
                              <div
                                key={l3.name}
                                className={mergeClasses(
                                  styles.categoryItem,
                                  styles.categoryItemInteractive
                                )}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleDraftCategory("l3", value);
                                  }
                                }}
                              >
                                <Checkbox
                                  checked={draftKeys.has(`l3:${value}`)}
                                  className={styles.categoryCheckbox}
                                  aria-label={`Select ${l3.name}`}
                                  onChange={() => toggleDraftCategory("l3", value)}
                                  onClick={(event) => event.stopPropagation()}
                                />
                                <span className={styles.categoryNavButton}>{l3.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                  <div className={styles.categoryActions}>
                    {categorySelections.length > 0 ? (
                      <Button
                        appearance="subtle"
                        onClick={() => {
                          setCategoryDraft([]);
                          setCategorySelections([]);
                          setCategoryPopoverOpen(false);
                        }}
                      >
                        Clear
                      </Button>
                    ) : null}
                    <Button
                      appearance="primary"
                      onClick={() => {
                        setCategorySelections(categoryDraft);
                        setCategoryPopoverOpen(false);
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                </PopoverSurface>
              </Popover>
            </Field>

            <Field
              label={<span className={styles.compactFieldLabel}>Source</span>}
              className={styles.filterField}
            >
              <Dropdown
                className={mergeClasses(styles.dropdownCompact, styles.filterField)}
                selectedOptions={[sourceFilter]}
                value={sourceFilterLabel[sourceFilter]}
                onOptionSelect={(_, data) =>
                  setSourceFilter((data.optionValue as SourceFilter) || "all")
                }
              >
                <Option value="all">All Sources</Option>
                <Option value="image">Images</Option>
                <Option value="url">URLs</Option>
              </Dropdown>
            </Field>

            <Field
              label={<span className={styles.compactFieldLabel}>Supplier</span>}
              className={styles.filterField}
            >
              <Dropdown
                className={mergeClasses(styles.dropdownCompact, styles.filterField)}
                selectedOptions={[supplierFilter]}
                value={supplierFilterLabel[supplierFilter]}
                onOptionSelect={(_, data) =>
                  setSupplierFilter((data.optionValue as SupplierFilter) || "all")
                }
              >
                <Option value="all">All Supplier States</Option>
                <Option value="not_started">Supplier Not Started</Option>
                <Option value="searching">Supplier Searching</Option>
                <Option value="selected">Supplier Selected</Option>
              </Dropdown>
            </Field>

            <Field
              label={<span className={styles.compactFieldLabel}>Variants</span>}
              className={styles.filterField}
            >
              <Dropdown
                className={mergeClasses(styles.dropdownCompact, styles.filterField)}
                selectedOptions={[variantFilter]}
                value={variantFilterLabel[variantFilter]}
                onOptionSelect={(_, data) =>
                  setVariantFilter((data.optionValue as VariantFilter) || "all")
                }
              >
                <Option value="all">All Variant States</Option>
                <Option value="not_picked">Variants Not Picked</Option>
                <Option value="picked">Variants Picked</Option>
              </Dropdown>
            </Field>
          </div>
          <div className={styles.toolbarActions}>
            {isLoading ? <Spinner size="tiny" label="Loading" /> : null}
            <Button
              appearance="outline"
              className={
                selectedItemIds.length > 0 && !isDeleting ? styles.deleteButtonActive : undefined
              }
              disabled={selectedItemIds.length === 0 || isDeleting}
              onClick={deleteSelectedSuggestions}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
            <Button
              appearance={canSendSelectedToProduction ? "primary" : "outline"}
              className={
                canSendSelectedToProduction && !isSendingToProduction
                  ? styles.sendButtonActive
                  : undefined
              }
              disabled={!canSendSelectedToProduction || isSendingToProduction}
              onClick={sendSelectedToProduction}
            >
              {isSendingToProduction ? "Sending..." : "Send to Production"}
            </Button>
            <Button appearance="primary" onClick={openAddDialog}>
              Add Products
            </Button>
          </div>
        </div>
      </Card>

      <Card className={styles.tableCard}>
        <Table className={styles.table}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell className={styles.imageCol}>Image</TableHeaderCell>
              <TableHeaderCell className={styles.productCol}>Product</TableHeaderCell>
              <TableHeaderCell>Supplier</TableHeaderCell>
              <TableHeaderCell>Pick Variants</TableHeaderCell>
              <TableHeaderCell>Supplier Link</TableHeaderCell>
              <TableHeaderCell>Variant Data</TableHeaderCell>
              <TableHeaderCell className={styles.sourceDataCol}>Source Data</TableHeaderCell>
              <TableHeaderCell className={styles.priceCol}>Price</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Production JSON</TableHeaderCell>
              <TableHeaderCell className={styles.selectCol}>
                <Checkbox
                  checked={selectAllState}
                  aria-label="Select all visible products"
                  onChange={(_, data) =>
                    toggleSelectAllVisible(Boolean(data.checked) || data.checked === "mixed")
                  }
                />
              </TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell>No suggestions match the current filters.</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => {
                const searching = Boolean(activeSearchIds[item.id]);
                const payloadStatus = normalizePayloadStatus(item.selection?.payload_status);
                const payloadError = normalizePayloadErrorText(item.selection?.payload_error);
                const searchJobStatus = toText(item.searchJob?.status).toLowerCase();
                const searchJobErrorRaw = toText(item.searchJob?.error);
                const searchJobError = normalizeSuggestionErrorText(searchJobErrorRaw);
                const supplierSelected = Boolean(
                  toText(item.selection?.selected_offer_id) || toText(item.selection?.selected_detail_url)
                );
                const hasPickedVariants = Boolean(
                  item.variantMetrics && item.variantMetrics.selectedCount > 0
                );
                const hasSupplierOffers =
                  item.search.offerCount > 0 ||
                  (Array.isArray(item.search.offers) && item.search.offers.length > 0);
                const selectedOfferTitleEn = toText(
                  (item.selection?.selected_offer as Record<string, unknown> | undefined)?.subject_en
                );
                const selectedOfferTitleAny = toText(
                  (item.selection?.selected_offer as Record<string, unknown> | undefined)?.subject
                );
                const displayTitleFull =
                  selectedOfferTitleEn || toText(item.title) || selectedOfferTitleAny || item.id;
                const displayTitle = truncateTitleText(displayTitleFull, 40);
                const taxonomyPath = toText(
                  item.googleTaxonomy?.path ||
                    [item.googleTaxonomy?.l1, item.googleTaxonomy?.l2, item.googleTaxonomy?.l3]
                      .map((entry) => toText(entry))
                      .filter(Boolean)
                      .join(" > ")
                );
                const taxonomyParts = taxonomyPath
                  ? taxonomyPath
                      .split(">")
                      .map((entry) => entry.trim())
                      .filter(Boolean)
                  : [];
                const taxonomyStatus = toText(item.googleTaxonomy?.status).toLowerCase();
                const taxonomyError = toText(item.googleTaxonomy?.error);
                const taxonomyIsBusy =
                  taxonomyStatus === "queued" || taxonomyStatus === "running";
                const external = item.externalData || null;
                const sourceProductUrl = firstValidUrl(
                  external?.finalUrl,
                  external?.inputUrl,
                  item.crawlFinalUrl,
                  item.sourceUrl
                );
                const sourceLinkMeta = getSourceLinkMeta(sourceProductUrl);
                const sourceJobStatus = toText(item.sourceJob?.status).toLowerCase();
                const sourceJobStage = toText(item.sourceJob?.stage).toLowerCase();
                const sourceJobActive =
                  sourceJobStatus === "queued" || sourceJobStatus === "running";
                const hasSourceContext =
                  Boolean(sourceLinkMeta) ||
                  sourceJobActive ||
                  sourceJobStatus === "done" ||
                  sourceJobStatus === "error" ||
                  item.sourceType === "url";
                const productSourceLabel = sourceLinkMeta?.domain || "—";
                const visiblePricing = filterPricingByViewerRole(
                  Array.isArray(item.pricing) ? (item.pricing as PricingEntry[]) : [],
                  viewerPriceRole
                );
                const sekPricing = visiblePricing.filter(
                  (entry) => normalizeCurrencyCode(entry.currency || entry.market) === "SEK"
                );
                const productionStatusKey = getSuggestionProductionStatusKey(
                  item.productionStatus
                );
                const productionStatusLabel =
                  productionStatusKey === "production_done"
                    ? "Production Done"
                    : productionStatusKey === "none"
                      ? "-"
                      : "In Production";
                const sourceTitleText = toText(
                  external?.status?.title?.value || external?.title || item.title
                );
                const sourceDescriptionText = toText(
                  external?.status?.description?.value ||
                    external?.description ||
                    item.description
                );
                const fallbackImageCount = Array.isArray(item.galleryImageUrls)
                  ? item.galleryImageUrls.length
                  : 0;
                const rawImageCount = Number(
                  external?.status?.images?.count ??
                    (Array.isArray(external?.galleryImageUrls)
                      ? external.galleryImageUrls.length
                      : fallbackImageCount)
                );
                const sourceImageCount = Number.isFinite(rawImageCount) && rawImageCount > 0
                  ? Math.trunc(rawImageCount)
                  : item.mainImageUrl
                    ? 1
                    : 0;
                const sourceTitleOk =
                  typeof external?.status?.title?.ok === "boolean"
                    ? Boolean(external?.status?.title?.ok)
                    : Boolean(sourceTitleText);
                const sourceDescriptionOk =
                  typeof external?.status?.description?.ok === "boolean"
                    ? Boolean(external?.status?.description?.ok)
                    : Boolean(sourceDescriptionText);
                const sourceImagesOk =
                  typeof external?.status?.images?.ok === "boolean"
                    ? Boolean(external?.status?.images?.ok)
                    : sourceImageCount > 0;
                const sourceErrors = Array.isArray(external?.errors)
                  ? external.errors
                      .map((entry) => normalizeSuggestionErrorText(entry))
                      .filter(Boolean)
                  : [];
                const primaryItemError = Array.isArray(item.errors)
                  ? normalizeSuggestionErrorText(item.errors[0])
                  : "";
                const aiModel = toText(external?.aiReview?.model);
                const isSourceCrawlLoading =
                  sourceJobActive &&
                  (sourceJobStage === "queued" ||
                    sourceJobStage === "crawl" ||
                    sourceJobStage === "");
                const isAiCleanupLoading =
                  sourceJobActive &&
                  (sourceJobStage === "ai_cleanup" ||
                    sourceJobStage === "crawl" ||
                    sourceJobStage === "queued" ||
                    sourceJobStage === "");
                const titleState = isSourceCrawlLoading && !sourceTitleOk
                  ? "loading"
                  : sourceTitleOk
                    ? "ok"
                    : "bad";
                const descriptionState = isSourceCrawlLoading && !sourceDescriptionOk
                  ? "loading"
                  : sourceDescriptionOk
                    ? "ok"
                    : "bad";
                const imagesState = isSourceCrawlLoading && !sourceImagesOk
                  ? "loading"
                  : sourceImagesOk
                    ? "ok"
                    : "bad";
                const aiState = isAiCleanupLoading
                  ? "loading"
                  : aiModel
                    ? "ok"
                    : "bad";
                const aiLabel = isAiCleanupLoading
                  ? sourceJobStage === "ai_cleanup"
                    ? "AI Cleanup running..."
                    : "AI Cleanup waiting..."
                  : aiModel
                    ? "AI Cleanup OK"
                    : "AI cleanup unavailable";

                const searchIsBusy =
                  searching || searchJobStatus === "queued" || searchJobStatus === "running";
                const isLegacyStaleSearchError = /reset stale supplier search/i.test(
                  searchJobErrorRaw
                );
                const searchJobErrorText = isLegacyStaleSearchError ? "" : searchJobError;
                const hasSearchDataLoaded =
                  Boolean(item.search.fetchedAt) ||
                  item.search.offerCount > 0 ||
                  (Array.isArray(item.search.offers) && item.search.offers.length > 0) ||
                  searchJobStatus === "done";
                const productErrorText =
                  primaryItemError ||
                  sourceErrors[0] ||
                  (searchJobStatus === "error" && !hasSearchDataLoaded
                    ? searchJobErrorText
                    : "");
                const searchButtonLabel = supplierSelected
                  ? "Supplier Selected"
                  : searchIsBusy
                    ? "Finding Suppliers..."
                    : item.search.offerCount > 0
                      ? `${item.search.offerCount} supplier(s)`
                      : "Find Supplier";

                const isPayloadLoading = payloadStatus === "fetching" || payloadStatus === "queued";
                const supplierStatusText = payloadStatus === "failed"
                  ? payloadError ||
                    (hideSupplier1688Details ? "Supplier data failed" : "1688 data failed")
                  : isPayloadLoading
                    ? hideSupplier1688Details
                      ? "Fetching supplier data..."
                      : "Fetching 1688 data..."
                  : payloadStatus === "ready"
                    ? hideSupplier1688Details
                      ? "Supplier data fetched ✓"
                      : "1688 data fetched ✓"
                    : searchIsBusy
                      ? "Finding suppliers..."
                      : hasSearchDataLoaded
                        ? "Supplier data loaded ✓"
                        : searchJobStatus === "error"
                          ? searchJobErrorText || "Not fetched yet"
                          : "Not fetched yet";
                const supplierStatusBusy = searchIsBusy || isPayloadLoading;

                const variantsReady =
                  payloadStatus === "ready" && Boolean(item.selection?.payload_file_name);
                const variantsButtonLabel = hasPickedVariants
                  ? "Variants Picked"
                  : "Pick Variants";
                const variantsStatusText = !supplierSelected
                  ? "Select supplier first"
                  : isPayloadLoading
                    ? hideSupplier1688Details
                      ? "Fetching supplier data..."
                      : "Fetching 1688 data..."
                    : payloadStatus === "failed"
                      ? payloadError ||
                        (hideSupplier1688Details ? "Supplier data failed" : "1688 data failed")
                      : hasPickedVariants && item.variantMetrics
                        ? `Picked: ${item.variantMetrics.selectedCount}/${item.variantMetrics.availableCount}`
                        : variantsReady
                          ? "No variants chosen"
                          : hideSupplier1688Details
                            ? "Waiting for supplier data"
                            : "Waiting for 1688 data";
                const canViewJson =
                  isAdminViewer &&
                  Boolean(item.selection?.payload_file_name) &&
                  hasPickedVariants;

                return (
                  <TableRow key={item.id}>
                    <TableCell className={styles.imageCol}>
                      {item.mainImageUrl ? (
                        <Tooltip
                          relationship="label"
                          withArrow
                          positioning={{ position: "after", align: "center", offset: 8 }}
                          content={{
                            className: mergeClasses(
                              styles.thumbZoomTooltipContent,
                              styles.thumbZoomTooltipMainContent
                            ),
                            children: (
                              <img
                                src={item.mainImageUrl}
                                alt={displayTitleFull || item.id}
                                className={styles.thumbZoomImageMain}
                                referrerPolicy="no-referrer"
                                loading="lazy"
                                decoding="async"
                              />
                            ),
                          }}
                        >
                          <div className={styles.thumbShell}>
                            <img
                              src={item.mainImageUrl}
                              alt={displayTitleFull || item.id}
                              className={styles.thumb}
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                        </Tooltip>
                      ) : (
                        <div className={styles.thumbShell} />
                      )}
                    </TableCell>
                    <TableCell className={styles.productCol}>
                      <div className={styles.titleCell}>
                        <Text className={styles.titleText}>{displayTitle}</Text>
                        <Text className={styles.productMeta}>
                          <span>{productSourceLabel}</span>
                          <span className={styles.productMetaSeparator}>/</span>
                          {sourceLinkMeta ? (
                            <a
                              href={sourceLinkMeta.url}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.sourceInlineLink}
                            >
                              Open Source Link
                            </a>
                          ) : item.mainImageUrl ? (
                            <button
                              type="button"
                              className={styles.sourceInlineAction}
                              disabled={sourceDialogSaving || sourceJobActive}
                              onClick={() => openSourceDialog(item)}
                            >
                              Add Source Link
                            </button>
                          ) : (
                            <span>No source link</span>
                          )}
                          <span className={styles.productMetaSeparator}>/</span>
                          <span>{formatDateTime(item.createdAt)}</span>
                        </Text>
                        {taxonomyIsBusy ? (
                          <Text className={styles.taxonomyStatusRow}>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={styles.sourceInlineLoaderIcon}
                              aria-hidden="true"
                            >
                              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                              <path d="M12 3a9 9 0 1 0 9 9" />
                            </svg>
                            Fetching Google Taxonomy
                          </Text>
                        ) : taxonomyParts.length > 0 ? (
                          <div className={styles.taxonomyBreadcrumbRow}>
                            {(() => {
                              const visibleTaxonomyParts = taxonomyParts.slice(0, 3);
                              return visibleTaxonomyParts.map((part, index) => {
                              const level = (index === 0
                                ? "l1"
                                : index === 1
                                  ? "l2"
                                  : "l3") as "l1" | "l2" | "l3";
                              const value = taxonomyParts.slice(0, index + 1).join(" > ");
                              return (
                                <span key={`${item.id}-taxonomy-${level}-${value}`}>
                                  <button
                                    type="button"
                                    className={styles.taxonomyBreadcrumbLink}
                                    onClick={() => {
                                      setCategorySelections([{ level, value }]);
                                    }}
                                  >
                                    {part}
                                  </button>
                                  {index < visibleTaxonomyParts.length - 1 ? (
                                    <span className={styles.taxonomyBreadcrumbDivider}>/</span>
                                  ) : null}
                                </span>
                              );
                              });
                            })()}
                          </div>
                        ) : taxonomyStatus === "error" && taxonomyError ? (
                          <Text className={styles.warningText}>{taxonomyError}</Text>
                        ) : null}
                        {productErrorText ? (
                          <Text size={100} className={styles.warningText}>
                            {productErrorText}
                          </Text>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={styles.variantCellStack}>
                        <Button
                          appearance="outline"
                          size="small"
                          className={mergeClasses(
                            styles.linkButton,
                            supplierSelected
                              ? styles.supplierSelectedButton
                              : hasSupplierOffers && !searchIsBusy
                                ? styles.actionNeededBlueButton
                              : undefined
                          )}
                          disabled={!item.mainImageUrl || searchIsBusy}
                          onClick={() => openSupplierDialog(item)}
                        >
                          {searchButtonLabel}
                        </Button>
                        <Text size={100} className={styles.variantMetaTight}>
                          {supplierStatusBusy ? (
                            <span>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={styles.supplierInlineLoaderIcon}
                                aria-hidden="true"
                              >
                                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                                <path d="M12 3a9 9 0 1 0 9 9" />
                              </svg>{" "}
                              {supplierStatusText}
                            </span>
                          ) : (
                            supplierStatusText
                          )}
                        </Text>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={styles.variantCellStack}>
                        <Button
                          appearance="outline"
                          size="small"
                          className={mergeClasses(
                            styles.linkButton,
                            hasPickedVariants
                              ? styles.supplierSelectedButton
                              : supplierSelected
                                ? styles.actionNeededBlueButton
                                : undefined
                          )}
                          disabled={!supplierSelected}
                          onClick={() => openSupplierDialog(item)}
                        >
                          {variantsButtonLabel}
                        </Button>
                        <Text
                          size={100}
                          className={mergeClasses(
                            styles.variantMetaTight,
                            styles.variantMetaMultiline
                          )}
                        >
                          {variantsStatusText}
                        </Text>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={styles.variantCellStack}>
                        {hideSupplier1688Details ? (
                          <Text>-</Text>
                        ) : item.selection?.selected_detail_url ? (
                          <>
                            <Button
                              appearance="outline"
                              size="small"
                              as="a"
                              href={item.selection.selected_detail_url}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.linkButton}
                            >
                              Visit Supplier
                            </Button>
                            <Text size={100} className={styles.variantMetaTight}>
                              1688.com
                            </Text>
                          </>
                        ) : (
                          <Text>-</Text>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={styles.variantCellStack}>
                        {item.variantMetrics ? (
                          <div className={styles.variantDataList}>
                            {(() => {
                              const priceMin = Number(
                                item.variantMetrics.priceMinCny ??
                                  item.variantMetrics.purchasePriceCny
                              );
                              const priceMax = Number(
                                item.variantMetrics.priceMaxCny ??
                                  item.variantMetrics.purchasePriceCny
                              );
                              const weightMin = Number(
                                item.variantMetrics.weightMinGrams ??
                                  item.variantMetrics.weightGrams
                              );
                              const weightMax = Number(
                                item.variantMetrics.weightMaxGrams ??
                                  item.variantMetrics.weightGrams
                              );
                              const hasPriceRange =
                                Number.isFinite(priceMin) &&
                                Number.isFinite(priceMax) &&
                                Math.abs(priceMax - priceMin) > 1e-9;
                              const hasWeightRange =
                                Number.isFinite(weightMin) &&
                                Number.isFinite(weightMax) &&
                                Math.abs(weightMax - weightMin) > 0;

                              const hasPrice =
                                Number.isFinite(priceMin) && Number.isFinite(priceMax);
                              const hasWeight =
                                Number.isFinite(weightMin) && Number.isFinite(weightMax);
                              const priceLabel = hasPriceRange ? "Price Span:" : "Price:";
                              const priceValueText = !hasPrice
                                ? "-"
                                : hasPriceRange
                                  ? `${formatCompactNumber(priceMin)}-${formatCompactNumber(
                                      priceMax
                                    )} CNY`
                                  : `${formatCompactNumber(priceMin)} CNY`;
                              const weightLabel = hasWeightRange ? "Weight Range:" : "Weight:";
                              const weightValueText = !hasWeight
                                ? "-"
                                : hasWeightRange
                                  ? `${Math.round(weightMin)}-${Math.round(weightMax)} grams`
                                  : `${Math.round(weightMin)} grams`;

                              return (
                                <>
                                  {hideSupplier1688Details ? null : (
                                    <Text className={styles.variantDataLine}>
                                      <span className={styles.variantDataLabel}>{priceLabel}</span>
                                      <span
                                        className={mergeClasses(
                                          styles.variantDataValue,
                                          priceValueText === "-" ? styles.variantDataValueMuted : undefined
                                        )}
                                      >
                                        {priceValueText}
                                      </span>
                                    </Text>
                                  )}
                                  <Text className={styles.variantDataLine}>
                                    <span className={styles.variantDataLabel}>{weightLabel}</span>
                                    <span
                                      className={mergeClasses(
                                        styles.variantDataValue,
                                        weightValueText === "-" ? styles.variantDataValueMuted : undefined
                                      )}
                                    >
                                      {weightValueText}
                                    </span>
                                  </Text>
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <Text className={styles.variantMetaTight}>No variant metrics yet</Text>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={styles.sourceDataCol}>
                      {!hasSourceContext ? (
                        <Text>-</Text>
                      ) : (
                        <div className={styles.urlCell}>
                          <div className={styles.urlStatusList}>
                            <div className={styles.statusRow}>
                              <span className={styles.statusIcon}>
                                {titleState === "loading" ? (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className={styles.sourceInlineLoaderIcon}
                                    aria-hidden="true"
                                  >
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                                    <path d="M12 3a9 9 0 1 0 9 9" />
                                  </svg>
                                ) : titleState === "ok" ? (
                                  "✓"
                                ) : (
                                  "✕"
                                )}
                              </span>
                              <Text
                                className={mergeClasses(
                                  styles.statusItem,
                                  titleState === "loading"
                                    ? styles.statusLoadingText
                                    : titleState === "ok"
                                      ? styles.statusOk
                                      : styles.statusBad
                                )}
                              >
                                Title
                              </Text>
                            </div>

                            <div className={styles.statusRow}>
                              <span className={styles.statusIcon}>
                                {descriptionState === "loading" ? (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className={styles.sourceInlineLoaderIcon}
                                    aria-hidden="true"
                                  >
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                                    <path d="M12 3a9 9 0 1 0 9 9" />
                                  </svg>
                                ) : descriptionState === "ok" ? (
                                  "✓"
                                ) : (
                                  "✕"
                                )}
                              </span>
                              <Text
                                className={mergeClasses(
                                  styles.statusItem,
                                  descriptionState === "loading"
                                    ? styles.statusLoadingText
                                    : descriptionState === "ok"
                                      ? styles.statusOk
                                      : styles.statusBad
                                )}
                              >
                                Product Description
                              </Text>
                            </div>

                            <div className={styles.statusRow}>
                              <span className={styles.statusIcon}>
                                {imagesState === "loading" ? (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className={styles.sourceInlineLoaderIcon}
                                    aria-hidden="true"
                                  >
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                                    <path d="M12 3a9 9 0 1 0 9 9" />
                                  </svg>
                                ) : imagesState === "ok" ? (
                                  "✓"
                                ) : (
                                  "✕"
                                )}
                              </span>
                              <Text
                                className={mergeClasses(
                                  styles.statusItem,
                                  imagesState === "loading"
                                    ? styles.statusLoadingText
                                    : imagesState === "ok"
                                      ? styles.statusOk
                                      : styles.statusBad
                                )}
                              >
                                Product Images ({sourceImageCount})
                              </Text>
                            </div>

                            <div className={styles.statusRow}>
                              <span className={styles.statusIcon}>
                                {aiState === "loading" ? (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className={styles.sourceInlineLoaderIcon}
                                    aria-hidden="true"
                                  >
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                                    <path d="M12 3a9 9 0 1 0 9 9" />
                                  </svg>
                                ) : aiState === "ok" ? (
                                  "✓"
                                ) : (
                                  "✕"
                                )}
                              </span>
                              <Text
                                className={mergeClasses(
                                  styles.statusItem,
                                  aiState === "loading"
                                    ? styles.statusLoadingText
                                    : aiState === "ok"
                                      ? styles.statusOk
                                      : styles.statusBad
                                )}
                              >
                                {aiLabel}
                              </Text>
                            </div>
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={styles.priceCol}>
                      <div className={styles.priceStack}>
                        {sekPricing.length === 0 ? (
                          <Text>-</Text>
                        ) : (
                          sekPricing.map((entry) => (
                            <Badge
                              key={`${item.id}-${normalizeCurrencyCode(entry.currency || entry.market)}`}
                              className={styles.priceBadgeGreen}
                            >
                              {(() => {
                                const basePrice = Number(entry.b2bPrice);
                                const maybeMin = Number(entry.b2bPriceMin);
                                const maybeMax = Number(entry.b2bPriceMax);
                                const priceMin = Number.isFinite(maybeMin)
                                  ? maybeMin
                                  : Number.isFinite(basePrice)
                                    ? basePrice
                                    : NaN;
                                const priceMax = Number.isFinite(maybeMax)
                                  ? maybeMax
                                  : Number.isFinite(basePrice)
                                    ? basePrice
                                    : NaN;
                                if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
                                  return formatCurrencyValue(entry.b2bPrice, entry.currency);
                                }
                                const low = Math.min(priceMin, priceMax);
                                const high = Math.max(priceMin, priceMax);
                                const currency = normalizeCurrencyCode(
                                  entry.currency || entry.market
                                );
                                const hasRange = Math.abs(high - low) > 1e-9;
                                return hasRange
                                  ? `${formatCompactNumber(low)}-${formatCompactNumber(
                                      high
                                    )} ${currency}`
                                  : `${formatCompactNumber(low)} ${currency}`;
                              })()}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Text
                        className={mergeClasses(
                          styles.productionStatusText,
                          productionStatusKey === "production_done"
                            ? styles.productionStatusDone
                            : productionStatusKey !== "none"
                              ? styles.productionStatusInProgress
                              : undefined
                        )}
                      >
                        {productionStatusLabel}
                      </Text>
                    </TableCell>
                    <TableCell>
                      {canViewJson ? (
                        <Button
                          appearance="outline"
                          size="small"
                          className={styles.linkButton}
                          onClick={() => openPayloadJson(item)}
                        >
                          View JSON
                        </Button>
                      ) : (
                        <Text>-</Text>
                      )}
                    </TableCell>
                    <TableCell className={styles.selectCol}>
                      <Checkbox
                        checked={selectedIdSet.has(item.id)}
                        aria-label={`Select ${item.id}`}
                        onChange={(_, data) => toggleRowSelected(item.id, Boolean(data.checked))}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog
        open={addDialogOpen}
        onOpenChange={(_, data) => {
          setAddDialogOpen(data.open);
          if (!data.open) setIsAddDialogDragOver(false);
        }}
      >
        <DialogSurface className={styles.addDialogSurface}>
          <DialogBody className={styles.addDialogBody}>
            <DialogTitle>Add products from URLs or images</DialogTitle>
            <DialogContent>
              <div className={styles.paneCard}>
                <Field label="Product URLs (one per line)">
                  <Textarea
                    value={urlsText}
                    resize="vertical"
                    rows={8}
                    placeholder="https://www.amazon.com/...&#10;https://fyndiq.se/..."
                    onChange={(_, data) => setUrlsText(data.value)}
                  />
                </Field>
                <div className={styles.selectedMeta}>
                  <Badge appearance="outline">{parsedUrls.length} URL(s)</Badge>
                  <Text className={styles.helperText}>
                    URLs are crawled for title, description, and gallery images.
                  </Text>
                </div>
              </div>

              <div className={styles.paneCard}>
                <Text weight="semibold">Drop images or ZIP batch</Text>
                <div
                  className={mergeClasses(
                    styles.dropZone,
                    isAddDialogDragOver ? styles.dropZoneActive : "",
                    isSubmitting && fileStats.hasZip ? styles.dropZoneLoading : ""
                  )}
                  onDragOver={(event) => {
                    if (isSubmitting) return;
                    event.preventDefault();
                    setIsAddDialogDragOver(true);
                  }}
                  onDragLeave={() => setIsAddDialogDragOver(false)}
                  onDrop={(event) => {
                    if (isSubmitting) return;
                    event.preventDefault();
                    setIsAddDialogDragOver(false);
                    handleFiles(event.dataTransfer.files);
                  }}
                >
                  {isSubmitting && fileStats.hasZip ? (
                    <Spinner label="Uploading ZIP and counting files..." />
                  ) : (
                    <>
                      <Text>Drop images or `.zip` files here</Text>
                      <Button
                        appearance="outline"
                        disabled={isSubmitting}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose Files
                      </Button>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.zip,application/zip,application/x-zip-compressed"
                    className={styles.fileInputHidden}
                    onChange={(event) => handleFiles(event.currentTarget.files)}
                  />
                </div>
                <div className={styles.selectedMeta}>
                  <Badge appearance="outline">{fileStats.total} file(s)</Badge>
                  <Text className={styles.helperText}>
                    {fileStats.zipCount > 0
                      ? `${fileStats.zipCount} ZIP file(s) selected. ZIP contents are counted after upload.`
                      : "Images are standardized to max 750 x 750 before sourcing."}
                  </Text>
                </div>
              </div>
            </DialogContent>
            <DialogActions className={styles.addDialogActions}>
              <Text className={styles.addDialogFooterMeta}>
                {parsedUrls.length} URL(s) and {fileStats.total} file(s) ready
              </Text>
              <div className={styles.saveActions}>
                <Button
                  appearance="secondary"
                  onClick={() => setAddDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Close
                </Button>
                <Button
                  appearance="primary"
                  disabled={isSubmitting || (parsedUrls.length === 0 && fileStats.total === 0)}
                  onClick={submitBatch}
                >
                  {isSubmitting ? "Finding..." : "Find Products"}
                </Button>
              </div>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={sourceDialogOpen}
        onOpenChange={(_, data) => {
          setSourceDialogOpen(data.open);
          if (!data.open) {
            setSourcePreviewHover(false);
            setSourceImageCopying(false);
            setSourceDialogItem(null);
            setSourceUrlDraft("");
          }
        }}
      >
        <DialogSurface className={styles.sourceDialogSurface}>
          <DialogBody className={styles.sourceDialogBody}>
            <DialogTitle>Add Source URL</DialogTitle>
            <DialogContent>
              <div className={styles.sourceDialogPreview}>
                <div
                  className={styles.sourceDialogPreviewFrame}
                  onMouseEnter={() => setSourcePreviewHover(true)}
                  onMouseLeave={() => setSourcePreviewHover(false)}
                >
                  {sourceDialogImageUrl ? (
                    <img
                      src={sourceDialogImageUrl}
                      alt={toText(sourceDialogItem?.title) || toText(sourceDialogItem?.id) || "source-image"}
                      className={styles.sourceDialogPreviewImg}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className={styles.sourceDialogPreviewImg} />
                  )}
                  {sourcePreviewHover && sourceDialogImageUrl ? (
                    <div className={styles.sourceDialogPreviewOverlay}>
                      <Button
                        size="small"
                        appearance="secondary"
                        disabled={sourceImageCopying}
                        onClick={copySourceDialogImageToClipboard}
                      >
                        {sourceImageCopying ? "Copying..." : "Copy"}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <Button
                  appearance="outline"
                  size="small"
                  className={styles.sourceDialogSearchButton}
                  disabled={!sourceDialogGoogleSearchUrl}
                  onClick={openSourceDialogGoogleImageSearch}
                >
                  Google Image Search
                </Button>
                <Text className={styles.sourceDialogPreviewMeta}>
                  Opens Google image search with this image URL prefilled.
                </Text>
              </div>
              <Field label="Product URL">
                <Input
                  value={sourceUrlDraft}
                  placeholder="https://www.amazon.com/..."
                  onChange={(_, data) => setSourceUrlDraft(data.value)}
                />
              </Field>
            </DialogContent>
            <DialogActions className={styles.sourceDialogActions}>
              <Button
                appearance="secondary"
                disabled={sourceDialogSaving}
                onClick={() => {
                  setSourcePreviewHover(false);
                  setSourceImageCopying(false);
                  setSourceDialogOpen(false);
                  setSourceDialogItem(null);
                  setSourceUrlDraft("");
                }}
              >
                Close
              </Button>
              <Button
                appearance="primary"
                disabled={sourceDialogSaving || !/^https?:\/\//i.test(sourceUrlDraft.trim())}
                onClick={saveSourceLink}
              >
                {sourceDialogSaving ? "Saving..." : "Save"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={offerDialogOpen}
        onOpenChange={(_, data) => {
          setOfferDialogOpen(data.open);
          if (!data.open) {
            setPacksPopoverOpen(false);
            setPacksDraft("");
            setVariantDraftOverrides({});
            setSupplierImagePreviewEntry(null);
          }
        }}
      >
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody>
            <DialogTitle>
              Select Supplier{supplierDialogTitleText ? ` - ${supplierDialogTitleText}` : ""}
            </DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <div className={styles.dialogBody}>
                <div className={styles.panel}>
                  <div className={styles.saveRow}>
                    <Text weight="semibold">Supplier Offers</Text>
                    <div className={styles.saveActions}>
                      <Button
                        appearance="outline"
                        size="small"
                        className={styles.actionOutlineButton}
                        disabled={!offerDialogItem || offerDialogBusy || Boolean(selectingOfferId)}
                        onClick={async () => {
                          if (!offerDialogItem) return;
                          setOfferDialogBusy(true);
                          try {
                            const offers = await runSupplierSearch(offerDialogItem, true);
                            if (offers) {
                              setOfferDialogOffers(offers);
                            }
                            await loadItems();
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Unable to refresh offers."
                            );
                          } finally {
                            setOfferDialogBusy(false);
                          }
                        }}
                      >
                        Refresh Offer
                      </Button>
                    </div>
                  </div>

                  {offerDialogBusy ? <Spinner label="Loading offers..." /> : null}

                  <div className={styles.scroll}>
                    {offerDialogOffers.length === 0 ? (
                      <Text>No offers loaded yet.</Text>
                    ) : (
                      offerDialogOffers.map((offer) => {
                        const offerId = toText(offer.offerId);
                        const selected = selectedOfferId === offerId;
                        const isSelectingOffer = selectingOfferId === offerId;
                        const canSelectOffer =
                          Boolean(offerId) &&
                          !offerDialogBusy &&
                          !variantsLoading &&
                          !variantsSaving &&
                          !Boolean(selectingOfferId);
                        const offerImageUrlRaw = extractOfferImageUrl(offer);
                        const offerImageUrl =
                          buildImageProxyUrl(offerImageUrlRaw, 160, 160) || offerImageUrlRaw;
                        const offerImageZoomUrl =
                          buildLargePreviewImageUrl(offerImageUrlRaw || offerImageUrl, 420) ||
                          offerImageUrlRaw ||
                          offerImageUrl;
                        const detailUrlRaw = toText(offer.detailUrl);
                        const offerLink = /^https?:\/\//i.test(detailUrlRaw)
                          ? detailUrlRaw
                          : detailUrlRaw.startsWith("//")
                            ? `https:${detailUrlRaw}`
                            : "";
                        const titleEnRaw = toText(offer.subject_en);
                        const titleEn = titleEnRaw && !hasCjk(titleEnRaw) ? titleEnRaw : "";
                        const titleZh = toText(offer.subject);
                        return (
                          <div
                            key={`${offerId}-${toText(offer.detailUrl)}`}
                            className={mergeClasses(
                              styles.offerCard,
                              selected ? styles.offerCardSelected : undefined,
                              canSelectOffer ? styles.offerCardInteractive : styles.offerCardDisabled
                            )}
                            role="button"
                            tabIndex={canSelectOffer ? 0 : -1}
                            onClick={() => {
                              if (!canSelectOffer) return;
                              void selectSupplierOfferById(offer);
                            }}
                            onKeyDown={(event) => {
                              if (!canSelectOffer) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                void selectSupplierOfferById(offer);
                              }
                            }}
                          >
                            {offerImageUrl ? (
                              <Tooltip
                                relationship="label"
                                withArrow
                                positioning={{ position: "after", align: "center", offset: 8 }}
                                content={{
                                  className: styles.thumbZoomTooltipContent,
                                  children: (
                                    <img
                                      src={offerImageZoomUrl}
                                      alt={offerId || "offer"}
                                      className={styles.thumbZoomImage}
                                      referrerPolicy="no-referrer"
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  ),
                                }}
                              >
                                <img
                                  src={offerImageUrl}
                                  alt={offerId || "offer"}
                                  className={styles.offerImage}
                                  referrerPolicy="no-referrer"
                                  loading="lazy"
                                  decoding="async"
                                />
                              </Tooltip>
                            ) : (
                              <div className={styles.offerImage} />
                            )}
                            <div className={styles.offerMeta}>
                              <Text className={styles.offerTitleEn}>
                                {titleEn || titleZh || "Untitled offer"}
                              </Text>
                              <Text className={styles.offerTitleZh}>
                                {titleZh || "-"}
                              </Text>
                              {isSelectingOffer ? (
                                <Text size={100} className={styles.variantMetaTight}>
                                  Selecting supplier...
                                </Text>
                              ) : selected ? (
                                <Badge appearance="filled" size="small" className={styles.offerSelectedBadge}>
                                  Selected
                                </Badge>
                              ) : null}
                              {isAdminViewer && offerLink ? (
                                <a
                                  href={offerLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.offerOpenLink}
                                  onClick={(event) => event.stopPropagation()}
                                  onKeyDown={(event) => event.stopPropagation()}
                                >
                                  Open supplier link
                                </a>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div
                  className={mergeClasses(
                    styles.panel,
                    styles.panelRight,
                    styles.panelRightLayout
                  )}
                >
                  <div className={styles.supplierMediaTop}>
                    <div className={styles.supplierMediaPane}>
                      <Text className={styles.supplierMediaTitle}>Original Image</Text>
                      <div className={styles.supplierSourceCard}>
                        {dialogSourceMainImageUrl ? (
                          <img
                            src={dialogSourceMainImageUrl}
                            alt={toText(offerDialogItem?.title) || toText(offerDialogItem?.id) || "source"}
                            className={styles.supplierSourceImage}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className={styles.supplierSourcePlaceholder}>
                            <Text className={styles.supplierGalleryEmpty}>No source image</Text>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={styles.supplierMediaPane}>
                      <Text className={styles.supplierMediaTitle}>Supplier Images</Text>
                      <div className={styles.supplierGalleryCard}>
                        <div
                          ref={supplierGalleryStripRef}
                          className={mergeClasses(
                            styles.supplierGalleryScroller,
                            isSingleSupplierGalleryImage
                              ? styles.supplierGalleryScrollerSingle
                              : undefined,
                            supplierGalleryFiltering
                              ? styles.supplierGalleryScrollerLoading
                              : undefined
                          )}
                        >
                          {supplierGalleryVisibleImages.length === 0 ? (
                            <Text className={styles.supplierGalleryEmpty}>
                              {supplierGalleryFiltering
                                ? "Loading images..."
                                : "No extra supplier images"}
                            </Text>
                          ) : (
                            supplierGalleryVisibleImages.map((entry) => (
                              <button
                                key={entry.key}
                                type="button"
                                className={mergeClasses(
                                  styles.supplierGalleryThumbButton,
                                  isSingleSupplierGalleryImage
                                    ? styles.supplierGalleryThumbButtonSingle
                                    : undefined
                                )}
                                onClick={() => setSupplierImagePreviewEntry(entry)}
                                aria-label="Preview supplier image"
                              >
                                <img
                                  src={entry.thumb}
                                  alt="supplier-gallery-thumb"
                                  className={styles.supplierGalleryThumbImage}
                                  referrerPolicy="no-referrer"
                                  loading="lazy"
                                  decoding="async"
                                />
                              </button>
                            ))
                          )}
                        </div>
                        {supplierGalleryFiltering ? (
                          <div className={styles.supplierGalleryLoadingOverlay}>
                            <div className={styles.supplierGalleryLoadingInner}>
                              <Spinner size="tiny" />
                              <Text className={styles.supplierGalleryLoadingText}>
                                Loading images.
                              </Text>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className={styles.variantsSectionWrap}>
                    <div
                      className={mergeClasses(
                        styles.variantsSectionContent,
                        variantSelectionIsLoading ? styles.variantsSectionLoading : undefined
                      )}
                    >
                      <div className={styles.saveRow}>
                        <Text weight="semibold">Variant Selection</Text>
                        <div className={styles.saveActions}>
                          <Popover
                            open={packsPopoverOpen}
                            onOpenChange={(_, data) => {
                              setPacksPopoverOpen(data.open);
                              if (data.open) {
                                setPacksDraft(packsText);
                              }
                            }}
                            positioning={{ position: "below", align: "end", offset: { mainAxis: 6 } }}
                          >
                            <PopoverTrigger disableButtonEnhancement>
                              <Button
                                appearance="outline"
                                size="small"
                                className={mergeClasses(
                                  hasAppliedPacks ? styles.packsButtonAdded : styles.actionOutlineButton
                                )}
                                disabled={!offerDialogItem || variantsSaving}
                              >
                                {hasAppliedPacks ? "Packs Added" : "Add Packs"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverSurface className={styles.packsPopoverSurface}>
                              <div className={styles.packsPopoverBody}>
                                <Field
                                  label={<span className={styles.packsFieldLabel}>Pack Quantities</span>}
                                >
                                  <Input
                                    className={styles.packsInputCompact}
                                    value={packsDraft}
                                    placeholder="e.g. 1, 2, 4"
                                    onChange={(_, data) =>
                                      setPacksDraft(data.value.replace(/[^\d,\s]/g, ""))
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        applyPacksDraft();
                                      }
                                    }}
                                  />
                                </Field>
                                <div className={styles.packsBadgeWrap}>
                                  {draftPackValues.length > 0 ? (
                                    draftPackValues.map((pack) => (
                                      <Tooltip key={`pack-${pack}`} relationship="label" content="Remove Pack">
                                        <button
                                          type="button"
                                          className={styles.packsBadgeButton}
                                          onClick={() => removeDraftPack(pack)}
                                        >
                                          <Badge appearance="outline" size="small" className={styles.packsBadge}>
                                            {`${pack}-PACK`}
                                          </Badge>
                                        </button>
                                      </Tooltip>
                                    ))
                                  ) : (
                                    <Text className={styles.packsBadgeEmpty}>No packs added yet.</Text>
                                  )}
                                </div>
                                <div className={styles.packsPopoverActions}>
                                  <Button
                                    size="small"
                                    appearance="secondary"
                                    onClick={() => {
                                      setPacksDraft(packsText);
                                      setPacksPopoverOpen(false);
                                    }}
                                  >
                                    Close
                                  </Button>
                                  <Button size="small" appearance="primary" onClick={applyPacksDraft}>
                                    Apply
                                  </Button>
                                </div>
                              </div>
                            </PopoverSurface>
                          </Popover>
                          <Button
                            appearance="outline"
                            size="small"
                            className={styles.actionOutlineButton}
                            disabled={!offerDialogItem || variantsLoading || variantsSaving}
                            onClick={async () => {
                              if (!offerDialogItem) return;
                              const reloaded = await fetchVariants(offerDialogItem, {
                                force: true,
                                waitForPayload: true,
                              });
                              const comboCount = Array.isArray(reloaded?.combos)
                                ? reloaded.combos.length
                                : 0;
                              const galleryCount = Array.isArray(reloaded?.gallery_images)
                                ? reloaded.gallery_images.length
                                : 0;
                              if (comboCount > 0 || galleryCount > 0) return;

                              const latestItem =
                                itemsRef.current.find((entry) => entry.id === offerDialogItem.id) ||
                                offerDialogItem;
                              const payloadStatus = normalizePayloadStatus(
                                latestItem.selection?.payload_status
                              );
                              const hasSelectedSupplier = Boolean(
                                toText(latestItem.selection?.selected_offer_id) ||
                                  toText(latestItem.selection?.selected_detail_url)
                              );
                              if (
                                !hasSelectedSupplier ||
                                (payloadStatus !== "ready" && payloadStatus !== "failed")
                              ) {
                                return;
                              }

                              const retryResponse = await fetch(
                                "/api/production/suppliers/payload/retry",
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    provider: PROVIDER,
                                    product_id: offerDialogItem.id,
                                  }),
                                }
                              ).catch(() => null);
                              if (!retryResponse?.ok) return;
                              await retryResponse.json().catch(() => null);
                              await sleep(900);
                              await loadItems({ silent: true });
                              await fetchVariants(offerDialogItem, {
                                force: true,
                                waitForPayload: true,
                              });
                            }}
                          >
                            Reload Variants
                          </Button>
                          <Button
                            appearance="primary"
                            size="small"
                            disabled={!variants || variantsLoading || variantsSaving}
                            onClick={saveVariantSelection}
                          >
                            {variantsSaving ? "Saving..." : "Save Variants"}
                          </Button>
                        </div>
                      </div>

                      {variants ? (
                        <div
                          className={mergeClasses(
                            styles.variantsTableWrap,
                            styles.variantsTableWrapFlex,
                            styles.variantsTableWrapLeftScroll
                          )}
                        >
                      <Table className={styles.variantsTable}>
                        <TableHeader>
                          <TableRow>
                            <TableHeaderCell className={styles.variantImageCol}>
                              <span className={styles.variantHeaderText}>Image</span>
                            </TableHeaderCell>
                            <TableHeaderCell className={styles.variantNameCol}>
                              <span className={styles.variantHeaderText}>Variant</span>
                            </TableHeaderCell>
                            <TableHeaderCell className={styles.variantPriceCol}>
                              <span
                                className={mergeClasses(
                                  styles.variantHeaderText,
                                  styles.variantHeaderTextRight
                                )}
                              >
                                {allowCnyPriceEditing ? "Price (CNY)" : "Price (SEK)"}
                              </span>
                            </TableHeaderCell>
                            <TableHeaderCell className={styles.variantWeightCol}>
                              <span
                                className={mergeClasses(
                                  styles.variantHeaderText,
                                  styles.variantHeaderTextRight
                                )}
                              >
                                Weight (g)
                              </span>
                            </TableHeaderCell>
                            <TableHeaderCell
                              className={mergeClasses(
                                styles.variantPickCol,
                                styles.variantPickHeaderCell
                              )}
                            >
                              <div className={styles.variantPickCheckWrap}>
                                <Checkbox
                                  checked={
                                    allVariantsSelected
                                      ? true
                                      : someVariantsSelected
                                        ? "mixed"
                                        : false
                                  }
                                  onChange={(_, data) => toggleAllVariants(Boolean(data.checked))}
                                  aria-label="Select all variants"
                                />
                              </div>
                            </TableHeaderCell>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {variants.combos.map((combo) => {
                            const checked = selectedVariantIndexes.includes(combo.index);
                            const variantImageThumbCandidate = normalizeImageUrl(
                              combo.image_thumb_url ||
                                (combo as unknown as Record<string, unknown>).imageThumbUrl ||
                                combo.image_url ||
                                (combo as unknown as Record<string, unknown>).imageUrl ||
                                (combo as unknown as Record<string, unknown>).img ||
                                (combo as unknown as Record<string, unknown>).image
                            );
                            const variantImageDirectCandidate = normalizeImageUrl(
                              combo.image_full_url ||
                                combo.image_zoom_url ||
                                combo.image_url ||
                                (combo as unknown as Record<string, unknown>).imageFullUrl ||
                                (combo as unknown as Record<string, unknown>).imageZoomUrl ||
                                (combo as unknown as Record<string, unknown>).imageUrl ||
                                (combo as unknown as Record<string, unknown>).img ||
                                (combo as unknown as Record<string, unknown>).image
                            );
                            const variantImageThumbPrimary =
                              buildImageProxyUrl(variantImageThumbCandidate, 88, 88) ||
                              variantImageThumbCandidate ||
                              variantImageDirectCandidate;
                            const variantImageThumbFallback =
                              variantImageDirectCandidate &&
                              variantImageDirectCandidate !== variantImageThumbPrimary
                                ? variantImageDirectCandidate
                                : "";
                            const variantImageZoomPrimary =
                              buildImageProxyUrl(
                                variantImageDirectCandidate || variantImageThumbCandidate,
                                420,
                                420
                              ) ||
                              variantImageDirectCandidate ||
                              variantImageThumbCandidate;
                            const variantImageZoomFallback =
                              variantImageDirectCandidate &&
                              variantImageDirectCandidate !== variantImageZoomPrimary
                                ? variantImageDirectCandidate
                                : "";
                            const variantNameEn = [
                              toText(combo.t1_en),
                              toText(combo.t2_en),
                              toText(combo.t3_en),
                            ]
                              .filter(Boolean)
                              .join(" / ");
                            const variantNameZh = [
                              toText(combo.t1_zh) || toText(combo.t1),
                              toText(combo.t2_zh) || toText(combo.t2),
                              toText(combo.t3_zh) || toText(combo.t3),
                            ]
                              .filter(Boolean)
                              .join(" / ");
                            const noVariantLabels = ![
                              toText(combo.t1_en),
                              toText(combo.t2_en),
                              toText(combo.t3_en),
                              toText(combo.t1_zh),
                              toText(combo.t2_zh),
                              toText(combo.t3_zh),
                              toText(combo.t1),
                              toText(combo.t2),
                              toText(combo.t3),
                            ].some(Boolean);
                            const variantNameEnDisplay = noVariantLabels
                              ? "No variants"
                              : variantNameEn || variantNameZh || "-";
                            const variantNameZhDisplay = noVariantLabels
                              ? "无产品选择"
                              : variantNameZh || "-";
                            const variantDraft = resolveVariantDraft(combo);
                            const comboPurchaseCny =
                              toPositiveDecimal(variantDraft.price) ??
                              toPositiveDecimal(combo.price) ??
                              toPositiveDecimal(combo.price_raw);
                            const comboWeightGrams =
                              toWeightGramsValue(variantDraft.weightGrams) ??
                              toWeightGramsValue(combo.weight_grams) ??
                              toWeightGramsValue(combo.weight_raw);
                            const comboSekPrice = computeSekPriceFromPricingContext(
                              comboPurchaseCny,
                              comboWeightGrams,
                              variants.sek_pricing_context
                            );
                            return (
                              <TableRow key={`variant-${combo.index}`}>
                                <TableCell className={styles.variantImageCol}>
                                  <div className={styles.variantImageCellCenter}>
                                    {variantImageThumbPrimary ? (
                                      variantImageZoomPrimary ? (
                                        <Tooltip
                                          relationship="label"
                                          withArrow
                                          positioning={{ position: "after", align: "center", offset: 8 }}
                                          content={{
                                            className: styles.thumbZoomTooltipContent,
                                            children: (
                                              <div className={styles.thumbZoomFrame}>
                                                <img
                                                  src={variantImageZoomPrimary}
                                                  alt={variantNameEnDisplay || variantNameZhDisplay || `variant-${combo.index}`}
                                                  className={styles.thumbZoomImage}
                                                  referrerPolicy="no-referrer"
                                                  loading="lazy"
                                                  decoding="async"
                                                  onError={(event) => {
                                                    const img = event.currentTarget;
                                                    const fallback = variantImageZoomFallback;
                                                    if (!fallback || img.src === fallback) return;
                                                    img.src = fallback;
                                                  }}
                                                />
                                              </div>
                                            ),
                                          }}
                                        >
                                          <img
                                            src={variantImageThumbPrimary}
                                            alt={variantNameEnDisplay || variantNameZhDisplay || `variant-${combo.index}`}
                                            className={styles.variantImageThumb}
                                            referrerPolicy="no-referrer"
                                            loading="lazy"
                                            decoding="async"
                                            onError={(event) => {
                                              const img = event.currentTarget;
                                              const fallback = variantImageThumbFallback;
                                              if (!fallback || img.src === fallback) return;
                                              img.src = fallback;
                                            }}
                                          />
                                        </Tooltip>
                                      ) : (
                                        <img
                                          src={variantImageThumbPrimary}
                                          alt={variantNameEnDisplay || variantNameZhDisplay || `variant-${combo.index}`}
                                          className={styles.variantImageThumb}
                                          referrerPolicy="no-referrer"
                                          loading="lazy"
                                          decoding="async"
                                          onError={(event) => {
                                            const img = event.currentTarget;
                                            const fallback = variantImageThumbFallback;
                                            if (!fallback || img.src === fallback) return;
                                            img.src = fallback;
                                          }}
                                        />
                                      )
                                    ) : (
                                      <div className={styles.variantImageMissingIconWrap}>
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          className={styles.variantImageMissingIcon}
                                        >
                                          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                                          <path d="M15 8h.01" />
                                          <path d="M6 13l2.644 -2.644a1.21 1.21 0 0 1 1.712 0l3.644 3.644" />
                                          <path d="M13 13l1.644 -1.644a1.21 1.21 0 0 1 1.712 0l1.644 1.644" />
                                          <path d="M4 8v-2a2 2 0 0 1 2 -2h2" />
                                          <path d="M4 16v2a2 2 0 0 0 2 2h2" />
                                          <path d="M16 4h2a2 2 0 0 1 2 2v2" />
                                          <path d="M16 20h2a2 2 0 0 0 2 -2v-2" />
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className={styles.variantNameCol}>
                                  <span className={styles.variantLabel}>
                                    <span className={styles.variantNameEn}>
                                      {variantNameEnDisplay}
                                    </span>
                                    <span className={styles.variantNameZh}>
                                      {variantNameZhDisplay}
                                    </span>
                                  </span>
                                </TableCell>
                                <TableCell className={styles.variantPriceCol}>
                                  <div className={styles.variantValueWrap}>
                                    {allowCnyPriceEditing ? (
                                      <Input
                                        size="small"
                                        className={styles.variantEditInput}
                                        inputMode="decimal"
                                        value={variantDraft.price}
                                        onChange={(_, data) =>
                                          updateVariantDraftField(
                                            combo,
                                            "price",
                                            data.value.replace(/[^\d.,]/g, "")
                                          )
                                        }
                                      />
                                    ) : comboSekPrice !== null ? (
                                      <Badge className={styles.priceBadgeGreen}>
                                        {`${formatCompactNumber(comboSekPrice)} SEK`}
                                      </Badge>
                                    ) : (
                                      <Text>-</Text>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className={styles.variantWeightCol}>
                                  <div className={styles.variantValueWrap}>
                                    <Input
                                      size="small"
                                      className={styles.variantEditInput}
                                      inputMode="decimal"
                                      value={variantDraft.weightGrams}
                                      onChange={(_, data) =>
                                        updateVariantDraftField(
                                          combo,
                                          "weightGrams",
                                          data.value.replace(/[^\d.,]/g, "")
                                        )
                                      }
                                    />
                                  </div>
                                </TableCell>
                                <TableCell
                                  className={mergeClasses(
                                    styles.variantPickCol,
                                    styles.variantPickCell
                                  )}
                                >
                                  <div className={styles.variantPickCheckWrap}>
                                    <Checkbox
                                      checked={checked}
                                      onChange={(_, data) =>
                                        toggleVariantIndex(combo.index, Boolean(data.checked))
                                      }
                                    />
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        </Table>
                      </div>
                      ) : (
                        <Text>No variants loaded.</Text>
                      )}
                    </div>
                    {variantSelectionIsLoading ? (
                      <div className={styles.variantsSectionLoadingOverlay}>
                        <Spinner label="Loading variants..." />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {supplierImagePreviewEntry && typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.supplierImagePreviewBackdrop}
              onClick={() => {
                setSupplierImagePreviewEntry(null);
                setSupplierImagePreviewDialogHover(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Supplier Image Preview"
                className={styles.supplierImagePreviewDialog}
                onClick={(event) => event.stopPropagation()}
                onMouseEnter={() => setSupplierImagePreviewDialogHover(true)}
                onMouseLeave={() => setSupplierImagePreviewDialogHover(false)}
              >
                <div className={styles.supplierImagePreviewBody}>
                  <button
                    type="button"
                    aria-label="Close supplier image preview"
                    className={mergeClasses(
                      styles.supplierImagePreviewCloseButton,
                      supplierImagePreviewDialogHover
                        ? styles.supplierImagePreviewCloseButtonActive
                        : undefined
                    )}
                    onClick={() => {
                      setSupplierImagePreviewEntry(null);
                      setSupplierImagePreviewDialogHover(false);
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={styles.supplierImagePreviewCloseIcon}
                    >
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M18 6l-12 12" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </button>
                  <Text weight="semibold" className={styles.supplierImagePreviewTitle}>
                    Supplier Image Preview
                  </Text>
                  <div className={styles.supplierImagePreviewContent}>
                    <div className={styles.supplierImagePreviewFrame}>
                      <img
                        src={
                          buildLargePreviewImageUrl(
                            supplierImagePreviewEntry.full || supplierImagePreviewEntry.thumb,
                            500
                          ) ||
                          supplierImagePreviewEntry.full ||
                          supplierImagePreviewEntry.thumb
                        }
                        alt="Supplier preview"
                        className={styles.supplierImagePreviewImage}
                        referrerPolicy="no-referrer"
                        loading="eager"
                        decoding="async"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <Dialog open={jsonDialogOpen} onOpenChange={(_, data) => setJsonDialogOpen(data.open)}>
        <DialogSurface className={styles.jsonDialog}>
          <DialogBody className={styles.jsonDialogBody}>
            <DialogTitle>{jsonDialogTitle}</DialogTitle>
            <DialogContent className={styles.jsonDialogContent}>
              <div className={styles.jsonEditorWrap}>
                <div className={styles.jsonRawWrap}>
                  <textarea
                    readOnly
                    value={jsonDialogText}
                    className={styles.jsonNativeTextarea}
                  />
                </div>
              </div>
            </DialogContent>
            <DialogActions className={styles.jsonDialogActions}>
              <Button appearance="secondary" onClick={() => setJsonDialogOpen(false)}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
