"use client";

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Input,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Image,
  MessageBar,
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
  Textarea,
  Text,
  Tooltip,
  Option,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  supplier_payload_status?: string | null;
  supplier_payload_source?: string | null;
  supplier_payload_error?: string | null;
  supplier_payload_saved_at?: string | null;
  supplier_payload_file_name?: string | null;
  supplier_payload_file_path?: string | null;
  supplier_payload_competitor_url?: string | null;
  supplier_payload_competitor_title?: string | null;
  supplier_payload_competitor_images?: number | null;
  supplier_payload_competitor_error?: string | null;
  supplier_variant_available_count?: number | null;
  supplier_variant_selected_count?: number | null;
  supplier_variant_packs_text?: string | null;
  production_status?: string | null;
  production_status_updated_at?: string | null;
  production_status_spu_assigned_at?: string | null;
  production_status_started_at?: string | null;
  production_status_done_at?: string | null;
  production_status_last_file_name?: string | null;
  production_status_last_job_id?: string | null;
  production_assigned_spu?: string | null;
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
  price_raw: string;
  price: number | null;
  weight_raw?: string;
  weight_grams?: number | null;
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

const DEFAULT_CROP_MARGIN_PX = 15;
const DEFAULT_CROP_RECT_FALLBACK: CropRectNorm = { x: 0.02, y: 0.02, w: 0.96, h: 0.96 };

type CatalogProduct = {
  id: string;
  spu: string | null;
  title: string | null;
  brand: string | null;
  vendor: string | null;
  thumbnail_url: string | null;
  small_image_url: string | null;
};

const QUEUE_PRODUCTION_STATUS_OPTIONS = [
  { value: "none", label: "No status" },
  { value: "queued_for_production", label: "Queued for Production" },
  { value: "spu_assigned", label: "SPU Assigned" },
  { value: "production_started", label: "Production Started" },
  { value: "production_done", label: "Production Done" },
] as const;

const QUEUE_STATUS_SET_OPTIONS = [
  { value: "variants_picked", label: "Variants picked" },
  { value: "variants_not_picked", label: "Variants not picked" },
  { value: "supplier_selected", label: "Supplier selected" },
  { value: "supplier_not_selected", label: "Supplier not selected" },
  { value: "linked_product", label: "Linked product" },
  { value: "linked_not_product", label: "No linked product" },
] as const;

const QUEUE_PROVIDER_OPTIONS = [
  { value: "fyndiq", label: "Fyndiq" },
  { value: "digideal", label: "DigiDeal" },
  { value: "cdon", label: "CDON" },
] as const;

const QUEUE_COMMENT_OPTIONS = [
  { value: "with", label: "With comments" },
  { value: "without", label: "No comments" },
] as const;

const useStyles = makeStyles({
  card: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
  },
  table: {
    width: "100%",
    tableLayout: "auto",
    "& .fui-TableCell": {
      paddingTop: "8px",
      paddingBottom: "8px",
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
  imageCol: {
    width: "78px",
    paddingLeft: "8px",
    paddingRight: 0,
    boxSizing: "border-box",
  },
  productCol: {
    width: "360px",
    maxWidth: "420px",
    minWidth: "300px",
    paddingLeft: "15px",
    paddingRight: "16px",
  },
  providerCol: {
    width: "120px",
  },
  sellerDataCol: {
    width: "230px",
    paddingLeft: "20px",
  },
  linkCol: {
    width: "92px",
  },
  linkedCol: {
    width: "150px",
  },
  statusCol: {
    width: "210px",
  },
  commentsCol: {
    width: "72px",
  },
  suppliersCol: {
    width: "250px",
  },
  variantsCol: {
    width: "170px",
  },
  selectCol: {
    width: "56px",
    paddingRight: "10px",
    paddingLeft: "10px",
  },
  tableSelectCheckbox: {
    "& input ~ .fui-Checkbox__indicator": {
      "--fui-Checkbox__indicator--backgroundColor": "#ffffff",
      backgroundColor: "#ffffff",
    } as any,
    "& input:not(:checked) ~ .fui-Checkbox__indicator": {
      borderColor: tokens.colorNeutralStroke1,
      color: "transparent",
    } as any,
    "& input:checked ~ .fui-Checkbox__indicator": {
      backgroundColor: "#ffffff",
      borderColor: tokens.colorBrandStroke1,
      color: tokens.colorBrandForeground1,
    } as any,
    "& input:disabled ~ .fui-Checkbox__indicator": {
      backgroundColor: "#ffffff",
      borderColor: tokens.colorNeutralStrokeDisabled,
      color: tokens.colorNeutralForegroundDisabled,
    } as any,
  },
  thumb: {
    width: "75px",
    height: "75px",
    borderRadius: "12px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  thumbZoomImage: {
    width: "220px",
    height: "220px",
    objectFit: "contain",
    backgroundColor: tokens.colorNeutralBackground1,
    display: "block",
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
  sellerSalesInline: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  sellerRowTop: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    minHeight: "20px",
  },
  sellerRowBottom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "8px",
    minWidth: 0,
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
    backgroundColor: tokens.colorNeutralBackground1,
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
    width: "fit-content",
    minWidth: "unset",
    paddingLeft: "10px",
    paddingRight: "10px",
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
    color: tokens.colorNeutralForeground3,
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
    width: "118px",
  },
  actionRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  queueActionsBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "10px",
    gap: "8px",
    flexWrap: "wrap",
  },
  queueFiltersBar: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  queueActionRight: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    marginLeft: "auto",
  },
  queueSearchInput: {
    width: "260px",
  },
  queueFilterDropdown: {
    minWidth: "180px",
    "& button": {
      fontSize: tokens.fontSizeBase200,
      fontFamily: tokens.fontFamilyBase,
    },
  },
  queueActionCount: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  queueSendButtonActive: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  statusStack: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
  },
  statusLine: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    lineHeight: "1.3",
  },
  statusLineActive: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  statusCurrent: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: "1.2",
  },
  statusCurrentNew: {
    color: tokens.colorNeutralForeground3,
  },
  statusCurrentDone: {
    color: "#1b851a",
  },
  statusTimestamp: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    lineHeight: "1.2",
    marginTop: "2px",
  },
  statusSpuLink: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    lineHeight: "1.2",
    textDecorationLine: "none",
    width: "fit-content",
    "&:hover": {
      color: tokens.colorBrandForeground1,
      textDecorationLine: "underline",
    },
  },
  commentDialog: {
    minWidth: "520px",
    maxWidth: "720px",
  },
  commentDialogBody: {
    display: "flex",
    flexDirection: "column",
    height: "min(52vh, 520px)",
    minHeight: "320px",
  },
  commentDialogContent: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    flex: 1,
    minHeight: 0,
  },
  commentHistory: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingRight: "2px",
  },
  commentList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxHeight: "none",
    flex: 1,
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
  commentComposer: {
    marginTop: "auto",
    paddingTop: "8px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  supplierDialog: {
    minWidth: "680px",
    maxWidth: "980px",
    maxHeight: "min(84vh, 820px)",
    position: "relative",
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
  },
  supplierRowHoverable: {
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  supplierRowSelected: {
    border: "1px solid #0f6cbd",
    backgroundColor: "#e6f2fb",
    "&:hover": {
      border: "1px solid #0f6cbd",
      backgroundColor: "#e6f2fb",
    },
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
    border: "1px solid #165a23",
    width: "fit-content",
    minWidth: "unset",
    paddingLeft: "10px",
    paddingRight: "10px",
    "&:hover": {
      backgroundColor: "#c3eccc",
    },
  },
  supplierControlRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "3px",
  },
  supplierMainRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  },
  supplierMetaTightRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    lineHeight: "1.1",
    whiteSpace: "nowrap",
    flexWrap: "wrap",
  },
  supplierMetaTightItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  },
  supplierMetaTightStatic: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  },
  supplierMetaTightItemFailed: {
    color: "#7a1616",
    fontWeight: tokens.fontWeightSemibold,
  },
  supplierMetaTightButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    color: "inherit",
    cursor: "pointer",
    fontSize: "inherit",
    lineHeight: "inherit",
    textDecorationLine: "none",
    "&:hover": {
      textDecorationLine: "underline",
    },
  },
  supplierMetaTightOk: {
    color: "#165a23",
    fontWeight: tokens.fontWeightSemibold,
  },
  supplierMetaTightFail: {
    color: "#a4262c",
    fontWeight: tokens.fontWeightSemibold,
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
  supplierJsonButton: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground3,
    width: "24px",
    minWidth: "24px",
    height: "24px",
    borderRadius: tokens.borderRadiusMedium,
    paddingLeft: 0,
    paddingRight: 0,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
      color: tokens.colorBrandForeground1,
    },
    "&:disabled": {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
  supplierJsonIcon: {
    width: "16px",
    height: "16px",
    display: "block",
  },
  supplierManualRow: {
    display: "inline-flex",
    alignItems: "flex-start",
    gap: "6px",
  },
  competitorOverrideDialog: {
    minWidth: "520px",
    maxWidth: "680px",
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
  jsonTabsRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
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
  jsonEditor: {
    display: "flex",
    width: "100%",
    flex: 1,
    minHeight: 0,
    height: "100%",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "12px",
    lineHeight: "1.45",
    overflow: "hidden",
    "&.fui-Textarea": {
      height: "100%",
    },
    "& .fui-Textarea__textarea": {
      height: "100%",
      minHeight: 0,
      overflow: "auto",
      whiteSpace: "pre",
    },
  },
  jsonNativeTextarea: {
    width: "100%",
    height: "100%",
    minHeight: 0,
    flex: 1,
    boxSizing: "border-box",
    resize: "none",
    overflow: "auto",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "12px",
    lineHeight: "1.45",
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: "10px 12px",
  },
  jsonFieldCompact: {
    "& .fui-Label": {
      fontSize: tokens.fontSizeBase100,
      color: tokens.colorNeutralForeground3,
      fontWeight: tokens.fontWeightRegular,
      lineHeight: tokens.lineHeightBase100,
    },
  },
  jsonReadableWrap: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    flex: 1,
    minHeight: 0,
    overflow: "auto",
  },
  jsonReadableGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1fr) minmax(220px, 1fr)",
    gap: "8px",
    "@media (max-width: 900px)": {
      gridTemplateColumns: "1fr",
    },
  },
  jsonReadableSection: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  jsonReadableSectionHeader: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.02em",
  },
  jsonReadableSectionText: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
  jsonReadableMono: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "12px",
    lineHeight: "1.4",
  },
  jsonLinkGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    "@media (max-width: 1000px)": {
      gridTemplateColumns: "1fr",
    },
  },
  jsonLinksPanel: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    padding: "6px 8px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    maxHeight: "120px",
    overflowY: "auto",
  },
  jsonLinksPanelTall: {
    maxHeight: "220px",
  },
  jsonLinksTitle: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
  },
  jsonLink: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorBrandForeground1,
    textDecorationLine: "none",
    overflowWrap: "anywhere",
    lineHeight: "1.3",
    "&:hover": {
      textDecorationLine: "underline",
      color: tokens.colorBrandForeground2,
    },
  },
  manualPayloadDialog: {
    minWidth: "540px",
    maxWidth: "760px",
  },
  variantsDialog: {
    width: "min(735px, 92vw)",
    maxWidth: "min(735px, 92vw)",
  },
  variantsDialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxHeight: "min(86vh, 860px)",
    minHeight: 0,
  },
  variantsListWrap: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    overflow: "auto",
    maxHeight: "420px",
  },
  variantsListTable: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
  },
  variantsListHeadCell: {
    position: "sticky",
    top: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    zIndex: 1,
    padding: "8px 10px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    textAlign: "left",
  },
  variantsListCell: {
    padding: "5px 10px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase200,
    verticalAlign: "middle",
  },
  variantEditInput: {
    width: "84px",
    maxWidth: "84px",
    minWidth: 0,
    "& input": {
      fontSize: tokens.fontSizeBase200,
      paddingBlock: "4px",
      paddingInline: "6px",
      fontVariantNumeric: "tabular-nums",
    },
  },
  variantImageThumb: {
    width: "49px",
    height: "49px",
    borderRadius: "6px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "block",
  },
  variantImageCellWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    lineHeight: 0,
  },
  variantImagePopoverSurface: {
    width: "270px",
    height: "270px",
    maxWidth: "none",
    maxHeight: "none",
    padding: "8px",
    boxSizing: "border-box",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
  },
  variantImageZoomWrap: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "8px",
    overflow: "hidden",
    boxSizing: "border-box",
  },
  variantImageZoom: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    objectPosition: "center center",
    backgroundColor: tokens.colorNeutralBackground3,
    display: "block",
  },
  variantLabelCell: {
    minWidth: 0,
  },
  variantsRowClickable: {
    cursor: "pointer",
  },
  variantsRowHoverable: {
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  variantsRowSelected: {
    backgroundColor: "#e6f2fb",
    "&:hover": {
      backgroundColor: "#e6f2fb",
    },
  },
  variantsPacksField: {
    maxWidth: "420px",
  },
  variantValueWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    minWidth: 0,
  },
  variantValueZh: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    lineHeight: "1.2",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    wordBreak: "break-word",
  },
  variantValueEn: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    lineHeight: "1.2",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    wordBreak: "break-word",
  },
  commentIconButton: {
    width: "22px",
    minWidth: "22px",
    height: "22px",
    paddingLeft: 0,
    paddingRight: 0,
  },
  commentIconButtonEmpty: {
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground4,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
      color: tokens.colorNeutralForeground3,
    },
  },
  commentIconButtonHasComments: {
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorBrandForeground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
      color: tokens.colorBrandForeground2,
    },
  },
  iconOnly: {
    width: "15px",
    height: "15px",
    display: "block",
  },
  removeIconButton: {
    width: "24px",
    minWidth: "24px",
    height: "24px",
    paddingLeft: 0,
    paddingRight: 0,
    color: tokens.colorNeutralForeground3,
    "&:hover": {
      color: tokens.colorPaletteRedForeground2,
    },
  },
  removeIcon: {
    width: "16px",
    height: "16px",
    display: "block",
  },
  variantsDialogActions: {
    justifyContent: "flex-end",
    width: "100%",
  },
  variantsHeaderRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "12px",
  },
  variantsHeaderLeft: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    minWidth: 0,
  },
  variantsHeaderRight: {
    display: "inline-flex",
    alignItems: "center",
    gap: "12px",
    flexShrink: 0,
  },
  variantsTitleStack: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  variantsTitleText: {
    fontSize: tokens.fontSizeBase300,
    lineHeight: "1.2",
    fontWeight: tokens.fontWeightSemibold,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  variantsTitleLink: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: "1.2",
    color: tokens.colorNeutralForeground3,
    textDecorationLine: "none",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "460px",
    "&:hover": {
      color: tokens.colorBrandForeground1,
      textDecorationLine: "underline",
    },
  },
  variantsTopActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    marginLeft: "auto",
  },
  variantsHeroThumbWrap: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  variantsHeroThumbFrame: {
    borderRadius: "12px",
    overflow: "hidden",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  variantsHeroThumbImage: {
    width: "auto",
    height: "auto",
    maxWidth: "150px",
    maxHeight: "75px",
    objectFit: "contain",
    display: "block",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  variantsHeroPopoverSurface: {
    padding: 0,
    borderRadius: "12px",
    overflow: "hidden",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow16,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  variantsHeroZoomImage: {
    width: "450px",
    maxWidth: "70vw",
    height: "auto",
    maxHeight: "70vh",
    objectFit: "contain",
    display: "block",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  rowStatusInProgress: {
    "& .fui-TableCell": {
      backgroundColor: "#fff8df",
    },
  },
  rowStatusQueued: {
    "& .fui-TableCell": {
      backgroundColor: "#eaf4ff",
    },
  },
  rowStatusDone: {
    "& .fui-TableCell": {
      backgroundColor: "#edf9ee",
    },
  },
  manualPayloadStack: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  manualPayloadFileInput: {
    maxWidth: "100%",
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
  supplierSearchingFooter: {
    display: "inline-flex",
    alignItems: "center",
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
  const [supplierHeroPreviewOpen, setSupplierHeroPreviewOpen] = useState(false);
  const [supplierHeroZoomReady, setSupplierHeroZoomReady] = useState(false);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [queueSearch, setQueueSearch] = useState("");
  const [queueProductionStatusFilters, setQueueProductionStatusFilters] = useState<Set<string>>(
    () => new Set(QUEUE_PRODUCTION_STATUS_OPTIONS.map((option) => option.value))
  );
  const [queueStatusSetFilters, setQueueStatusSetFilters] = useState<Set<string>>(
    () => new Set()
  );
  const [queueProviders, setQueueProviders] = useState<Set<string>>(
    () => new Set(QUEUE_PROVIDER_OPTIONS.map((option) => option.value))
  );
  const [queueCommentsFilters, setQueueCommentsFilters] = useState<Set<string>>(
    () => new Set(QUEUE_COMMENT_OPTIONS.map((option) => option.value))
  );
  const warmedVariantKeysRef = useRef<Set<string>>(new Set());
  const [competitorOverrideDialogOpen, setCompetitorOverrideDialogOpen] = useState(false);
  const [competitorOverrideTarget, setCompetitorOverrideTarget] = useState<ProductionItem | null>(
    null
  );
  const [competitorOverrideUrl, setCompetitorOverrideUrl] = useState("");
  const [competitorOverrideSaving, setCompetitorOverrideSaving] = useState(false);
  const [competitorOverrideError, setCompetitorOverrideError] = useState<string | null>(null);

  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [cropNaturalSize, setCropNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const [cropRect, setCropRect] = useState<CropRectNorm>(DEFAULT_CROP_RECT_FALLBACK);
  const cropTouchedRef = useRef(false);
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

  const [manualPayloadDialogOpen, setManualPayloadDialogOpen] = useState(false);
  const [manualPayloadTarget, setManualPayloadTarget] = useState<ProductionItem | null>(null);
  const [manualPayloadJsonText, setManualPayloadJsonText] = useState("");
  const [manualPayloadFileName, setManualPayloadFileName] = useState("");
  const [manualPayloadError, setManualPayloadError] = useState<string | null>(null);
  const [manualPayloadSaving, setManualPayloadSaving] = useState(false);
  const [sendingQueue, setSendingQueue] = useState(false);
  const [sendingQueueRowKeys, setSendingQueueRowKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [jsonInspectorOpen, setJsonInspectorOpen] = useState(false);
  const [jsonInspectorTarget, setJsonInspectorTarget] = useState<{
    provider: string;
    product_id: string;
    badge: string;
  } | null>(null);
  const [jsonInspectorText, setJsonInspectorText] = useState("");
  const [jsonInspectorReadableText, setJsonInspectorReadableText] = useState("");
  const [jsonInspectorTab, setJsonInspectorTab] = useState<"readable" | "raw">("readable");
  const [jsonInspectorLoading, setJsonInspectorLoading] = useState(false);
  const [jsonInspectorSaving, setJsonInspectorSaving] = useState(false);
  const [jsonInspectorError, setJsonInspectorError] = useState<string | null>(null);
  const [variantsDialogOpen, setVariantsDialogOpen] = useState(false);
  const [variantsTarget, setVariantsTarget] = useState<ProductionItem | null>(null);
  const [variantsCombos, setVariantsCombos] = useState<VariantCombo[]>([]);
  const [variantPriceDraftByIndex, setVariantPriceDraftByIndex] = useState<Record<number, string>>(
    {}
  );
  const [variantWeightDraftByIndex, setVariantWeightDraftByIndex] = useState<Record<number, string>>(
    {}
  );
  const [variantsTypeLabels, setVariantsTypeLabels] = useState<{
    t1: string;
    t2: string;
    t3: string;
  }>({ t1: "", t2: "", t3: "" });
  const [variantsSelectedIndexes, setVariantsSelectedIndexes] = useState<Set<number>>(
    () => new Set()
  );
  const [variantsPacksText, setVariantsPacksText] = useState("");
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsSaving, setVariantsSaving] = useState(false);
  const [variantsError, setVariantsError] = useState<string | null>(null);
  const [variantImagePreviewIndex, setVariantImagePreviewIndex] = useState<number | null>(null);
  const [variantsHeroPreviewOpen, setVariantsHeroPreviewOpen] = useState(false);
  const [variantsHeroZoomReady, setVariantsHeroZoomReady] = useState(false);

  const variantsHeroImageSrc = useMemo(() => {
    if (!variantsTarget) return null;
    const local =
      typeof variantsTarget.image_local_url === "string" && variantsTarget.image_local_url.trim()
        ? variantsTarget.image_local_url.trim()
        : typeof variantsTarget.image_local_path === "string" && variantsTarget.image_local_path.trim()
          ? `/api/discovery/local-image?path=${encodeURIComponent(variantsTarget.image_local_path)}`
          : null;
    return local || variantsTarget.image_url || null;
  }, [variantsTarget]);

  const supplierHeroImageSrc = useMemo(() => {
    if (!supplierTarget) return null;
    const local =
      typeof supplierTarget.image_local_url === "string" && supplierTarget.image_local_url.trim()
        ? supplierTarget.image_local_url.trim()
        : typeof supplierTarget.image_local_path === "string" && supplierTarget.image_local_path.trim()
          ? `/api/discovery/local-image?path=${encodeURIComponent(supplierTarget.image_local_path)}`
          : null;
    return local || supplierTarget.image_url || supplierSearchImageUrl || null;
  }, [supplierTarget, supplierSearchImageUrl]);

  useEffect(() => {
    if (!supplierDialogOpen || !supplierHeroImageSrc) {
      setSupplierHeroZoomReady(false);
      return;
    }
    if (typeof window === "undefined") return;

    let active = true;
    setSupplierHeroZoomReady(false);

    const img = new window.Image();
    img.decoding = "async";
    img.src = supplierHeroImageSrc;

    const markReady = async () => {
      try {
        if (typeof img.decode === "function") {
          await img.decode();
        }
      } catch {
        // ignore decode failures
      }
      if (active) setSupplierHeroZoomReady(true);
    };

    img.onload = () => {
      void markReady();
    };
    img.onerror = () => {
      // Don't block hover popover forever on transient image failures.
      if (active) setSupplierHeroZoomReady(true);
    };

    return () => {
      active = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [supplierDialogOpen, supplierHeroImageSrc]);

  useEffect(() => {
    if (!variantsDialogOpen || !variantsHeroImageSrc) {
      setVariantsHeroZoomReady(false);
      return;
    }
    if (typeof window === "undefined") return;

    let active = true;
    setVariantsHeroZoomReady(false);

    const img = new window.Image();
    img.decoding = "async";
    img.src = variantsHeroImageSrc;

    const markReady = async () => {
      try {
        if (typeof img.decode === "function") {
          await img.decode();
        }
      } catch {
        // ignore decode failures
      }
      if (active) setVariantsHeroZoomReady(true);
    };

    img.onload = () => {
      void markReady();
    };
    img.onerror = () => {
      // Don't block hover popover forever on transient image failures.
      if (active) setVariantsHeroZoomReady(true);
    };

    return () => {
      active = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [variantsDialogOpen, variantsHeroImageSrc]);

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
    setSupplierHeroPreviewOpen(false);
    setSupplierHeroZoomReady(false);
  }, []);

  const closeCropDialog = useCallback(() => {
    setCropDialogOpen(false);
    setCropImageUrl(null);
    setCropNaturalSize(null);
    setCropRect(DEFAULT_CROP_RECT_FALLBACK);
    cropTouchedRef.current = false;
    dragRef.current = null;
    setRecropSearching(false);
  }, []);

  const openManualPayloadDialog = useCallback((item: ProductionItem) => {
    setManualPayloadTarget(item);
    setManualPayloadDialogOpen(true);
    setManualPayloadJsonText("");
    setManualPayloadFileName("");
    setManualPayloadError(null);
    setManualPayloadSaving(false);
  }, []);

  const closeManualPayloadDialog = useCallback(() => {
    setManualPayloadDialogOpen(false);
    setManualPayloadTarget(null);
    setManualPayloadJsonText("");
    setManualPayloadFileName("");
    setManualPayloadError(null);
    setManualPayloadSaving(false);
  }, []);

  const closeJsonInspector = useCallback(() => {
    setJsonInspectorOpen(false);
    setJsonInspectorTarget(null);
    setJsonInspectorText("");
    setJsonInspectorReadableText("");
    setJsonInspectorTab("readable");
    setJsonInspectorLoading(false);
    setJsonInspectorSaving(false);
    setJsonInspectorError(null);
  }, []);

  const closeVariantsDialog = useCallback(() => {
    setVariantsDialogOpen(false);
    setVariantsTarget(null);
    setVariantsCombos([]);
    setVariantPriceDraftByIndex({});
    setVariantWeightDraftByIndex({});
    setVariantsTypeLabels({ t1: "", t2: "", t3: "" });
    setVariantsSelectedIndexes(new Set());
    setVariantsPacksText("");
    setVariantsLoading(false);
    setVariantsSaving(false);
    setVariantsError(null);
    setVariantImagePreviewIndex(null);
    setVariantsHeroPreviewOpen(false);
    setVariantsHeroZoomReady(false);
  }, []);

  const openCompetitorOverrideDialog = useCallback((item: ProductionItem) => {
    setCompetitorOverrideTarget(item);
    setCompetitorOverrideDialogOpen(true);
    setCompetitorOverrideUrl(
      typeof item.source_url === "string" && item.source_url.trim()
        ? item.source_url.trim()
        : typeof item.product_url === "string" && item.product_url.trim()
          ? item.product_url.trim()
          : ""
    );
    setCompetitorOverrideSaving(false);
    setCompetitorOverrideError(null);
  }, []);

  const closeCompetitorOverrideDialog = useCallback(() => {
    setCompetitorOverrideDialogOpen(false);
    setCompetitorOverrideTarget(null);
    setCompetitorOverrideUrl("");
    setCompetitorOverrideSaving(false);
    setCompetitorOverrideError(null);
  }, []);

  const handleSaveCompetitorOverride = useCallback(async () => {
    if (!competitorOverrideTarget) return;
    const url = competitorOverrideUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setCompetitorOverrideError("Please enter a valid http(s) URL.");
      return;
    }
    setCompetitorOverrideSaving(true);
    setCompetitorOverrideError(null);
    try {
      const response = await fetch("/api/production/suppliers/payload/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: competitorOverrideTarget.provider,
          product_id: competitorOverrideTarget.product_id,
          competitor_url: url,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to restart competitor scraping.");
      }
      setItems((prev) =>
        prev.map((entry) =>
          entry.provider === competitorOverrideTarget.provider &&
          entry.product_id === competitorOverrideTarget.product_id
            ? {
                ...entry,
                supplier_payload_status: "fetching",
                supplier_payload_error: null,
                supplier_payload_competitor_error: null,
              }
            : entry
        )
      );
      closeCompetitorOverrideDialog();
    } catch (err) {
      setCompetitorOverrideError(
        err instanceof Error ? err.message : "Unable to restart competitor scraping."
      );
    } finally {
      setCompetitorOverrideSaving(false);
    }
  }, [closeCompetitorOverrideDialog, competitorOverrideTarget, competitorOverrideUrl]);

  const openVariantsDialog = useCallback(async (item: ProductionItem) => {
    setVariantsDialogOpen(true);
    setVariantsTarget(item);
    setVariantsCombos([]);
    setVariantPriceDraftByIndex({});
    setVariantWeightDraftByIndex({});
    setVariantsTypeLabels({ t1: "", t2: "", t3: "" });
    setVariantsSelectedIndexes(new Set());
    setVariantsPacksText("");
    setVariantsLoading(true);
    setVariantsSaving(false);
    setVariantsError(null);
    try {
      const params = new URLSearchParams({
        provider: item.provider,
        product_id: item.product_id,
      });
      const response = await fetch(
        `/api/production/suppliers/variants?${params.toString()}`
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as any)?.error || "Unable to load variants."));
      }
      const combos = Array.isArray((payload as any)?.combos)
        ? ((payload as any).combos as VariantCombo[])
        : [];
      const selectedIndexes = Array.isArray((payload as any)?.selected_combo_indexes)
        ? ((payload as any).selected_combo_indexes as unknown[])
            .map((entry) => Number(entry))
            .filter((entry) => Number.isInteger(entry) && entry >= 0)
        : [];
      const safeSelected = new Set(
        selectedIndexes.filter((idx) => idx < combos.length)
      );
      const packsText =
        typeof (payload as any)?.packs_text === "string"
          ? (payload as any).packs_text
          : "";
      setVariantsCombos(combos);
      const nextPriceDrafts: Record<number, string> = {};
      const nextWeightDrafts: Record<number, string> = {};
      combos.forEach((combo, idx) => {
        const comboIndex =
          typeof combo?.index === "number" && Number.isFinite(combo.index)
            ? combo.index
            : idx;
        const priceDraft = (() => {
          if (typeof combo.price === "number" && Number.isFinite(combo.price)) {
            return combo.price.toFixed(2);
          }
          const raw = String(combo.price_raw || "").trim();
          const match = raw.match(/-?\\d+(?:\\.\\d+)?/);
          return match?.[0] ? match[0] : "";
        })();
        const weightDraft = (() => {
          if (
            typeof combo.weight_grams === "number" &&
            Number.isFinite(combo.weight_grams) &&
            combo.weight_grams > 0
          ) {
            return String(Math.round(combo.weight_grams));
          }
          const raw = String(combo.weight_raw || "").trim();
          if (!raw) return "";
          const normalized = raw.replace(/,/g, ".").trim().toLowerCase();
          const match = normalized.match(/-?\\d+(?:\\.\\d+)?/);
          if (!match?.[0]) return "";
          const num = Number(match[0]);
          if (!Number.isFinite(num) || num <= 0) return "";
          if (normalized.includes("kg") || normalized.includes("公斤") || normalized.includes("千克")) {
            return String(Math.round(num * 1000));
          }
          if (normalized.includes("g") || normalized.includes("克")) {
            return String(Math.round(num));
          }
          if (num <= 20 && normalized.includes(".")) {
            return String(Math.round(num * 1000));
          }
          return String(Math.round(num));
        })();
        nextPriceDrafts[comboIndex] = priceDraft;
        nextWeightDrafts[comboIndex] = weightDraft;
      });
      setVariantPriceDraftByIndex(nextPriceDrafts);
      setVariantWeightDraftByIndex(nextWeightDrafts);
      setVariantsTypeLabels({
        t1: typeof (payload as any)?.type1_label === "string" ? (payload as any).type1_label : "",
        t2: typeof (payload as any)?.type2_label === "string" ? (payload as any).type2_label : "",
        t3: typeof (payload as any)?.type3_label === "string" ? (payload as any).type3_label : "",
      });
      setVariantsSelectedIndexes(safeSelected);
      setVariantsPacksText(packsText);
    } catch (err) {
      setVariantsError(err instanceof Error ? err.message : "Unable to load variants.");
    } finally {
      setVariantsLoading(false);
    }
  }, []);

  const handleSaveVariants = useCallback(async () => {
    if (!variantsTarget) return;
    setVariantsSaving(true);
    setVariantsError(null);
    try {
      const selected = Array.from(variantsSelectedIndexes).sort((a, b) => a - b);
      const parseDraftPrice = (raw: string) => {
        const text = String(raw || "").trim();
        if (!text) return null;
        const normalized = text.replace(/,/g, ".");
        const n = Number(normalized);
        return Number.isFinite(n) ? n : null;
      };
      const parseDraftWeight = (raw: string) => {
        const text = String(raw || "").trim();
        if (!text) return null;
        const n = Number(text.replace(/,/g, "."));
        return Number.isFinite(n) ? Math.round(n) : null;
      };
      const comboOverrides = variantsCombos
        .map((combo) => {
          const idx = typeof combo.index === "number" ? combo.index : -1;
          const price = parseDraftPrice(variantPriceDraftByIndex[idx] ?? "");
          const weight = parseDraftWeight(variantWeightDraftByIndex[idx] ?? "");
          return {
            index: idx,
            price: price !== null && price > 0 ? price : null,
            weight_grams: weight !== null && weight > 0 ? weight : null,
          };
        })
        .filter(
          (entry) =>
            Number.isInteger(entry.index) &&
            entry.index >= 0 &&
            (entry.price !== null || entry.weight_grams !== null)
        );
      const response = await fetch("/api/production/suppliers/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: variantsTarget.provider,
          product_id: variantsTarget.product_id,
          selected_combo_indexes: selected,
          packs_text: variantsPacksText,
          combo_overrides: comboOverrides,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as any)?.error || "Unable to save variants."));
      }
      const selectedCount = Number((payload as any)?.selected_count);
      const availableCount = Number((payload as any)?.available_count);
      setItems((prev) =>
        prev.map((entry) =>
          entry.provider === variantsTarget.provider &&
          entry.product_id === variantsTarget.product_id
            ? {
                ...entry,
                supplier_variant_selected_count: Number.isFinite(selectedCount)
                  ? selectedCount
                  : entry.supplier_variant_selected_count ?? null,
                supplier_variant_available_count: Number.isFinite(availableCount)
                  ? availableCount
                  : entry.supplier_variant_available_count ?? null,
                supplier_variant_packs_text: variantsPacksText.trim() || null,
              }
            : entry
        )
      );
      closeVariantsDialog();
    } catch (err) {
      setVariantsError(err instanceof Error ? err.message : "Unable to save variants.");
    } finally {
      setVariantsSaving(false);
    }
  }, [
    closeVariantsDialog,
    variantsCombos,
    variantsPacksText,
    variantPriceDraftByIndex,
    variantWeightDraftByIndex,
    variantsSelectedIndexes,
    variantsTarget,
  ]);

  const openJsonInspector = useCallback(
    async (item: ProductionItem, badge: string) => {
      setJsonInspectorOpen(true);
      setJsonInspectorTarget({
        provider: item.provider,
        product_id: item.product_id,
        badge,
      });
      setJsonInspectorText("");
      setJsonInspectorReadableText("");
      setJsonInspectorTab("readable");
      setJsonInspectorLoading(true);
      setJsonInspectorSaving(false);
      setJsonInspectorError(null);
      try {
        const params = new URLSearchParams({
          provider: item.provider,
          product_id: item.product_id,
        });
        const response = await fetch(
          `/api/production/suppliers/payload/file?${params.toString()}`
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String((payload as any)?.error || "Unable to load JSON file."));
        }
        const text =
          typeof (payload as any)?.text === "string" ? (payload as any).text : "";
        const readable = (() => {
          try {
            return JSON.stringify(JSON.parse(text), null, 2);
          } catch {
            return text;
          }
        })();
        setJsonInspectorText(text);
        setJsonInspectorReadableText(readable);
      } catch (err) {
        setJsonInspectorError(err instanceof Error ? err.message : "Unable to load JSON file.");
      } finally {
        setJsonInspectorLoading(false);
      }
    },
    []
  );

  const handleSaveJsonInspector = useCallback(async () => {
    if (!jsonInspectorTarget) return;
    const sourceText = jsonInspectorText || jsonInspectorReadableText;
    const text = sourceText.trim();
    if (!text) {
      setJsonInspectorError("JSON content is empty.");
      return;
    }
    setJsonInspectorSaving(true);
    setJsonInspectorError(null);
    try {
      const response = await fetch("/api/production/suppliers/payload/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: jsonInspectorTarget.provider,
          product_id: jsonInspectorTarget.product_id,
          text,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as any)?.error || "Unable to save JSON file."));
      }
      closeJsonInspector();
    } catch (err) {
      setJsonInspectorError(err instanceof Error ? err.message : "Unable to save JSON file.");
    } finally {
      setJsonInspectorSaving(false);
    }
  }, [
    closeJsonInspector,
    jsonInspectorTarget,
    jsonInspectorText,
    jsonInspectorReadableText,
  ]);

  const handleManualPayloadFileChange = useCallback(
    async (ev: ChangeEvent<HTMLInputElement>) => {
      const file = ev.currentTarget.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        setManualPayloadJsonText(text);
        setManualPayloadFileName(file.name);
        setManualPayloadError(null);
      } catch {
        setManualPayloadError(t("production.suppliers.manualReadError"));
      } finally {
        ev.currentTarget.value = "";
      }
    },
    [t]
  );

  const handleSaveManualPayload = useCallback(async () => {
    if (!manualPayloadTarget) return;
    const text = manualPayloadJsonText.trim();
    if (!text) {
      setManualPayloadError(t("production.suppliers.manualMissing"));
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setManualPayloadError(t("production.suppliers.manualInvalidJson"));
      return;
    }

    setManualPayloadSaving(true);
    setManualPayloadError(null);
    try {
      const response = await fetch("/api/production/suppliers/payload/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: manualPayloadTarget.provider,
          product_id: manualPayloadTarget.product_id,
          payload: parsed,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("production.suppliers.manualSaveError"));
      }

      setItems((prev) =>
        prev.map((entry) =>
          entry.provider === manualPayloadTarget.provider &&
          entry.product_id === manualPayloadTarget.product_id
            ? {
                ...entry,
                supplier_payload_status: "ready",
                supplier_payload_source: "manual",
                supplier_payload_error: null,
                supplier_payload_saved_at: new Date().toISOString(),
                supplier_payload_file_name:
                  typeof payload?.saved?.file_name === "string"
                    ? payload.saved.file_name
                    : entry.supplier_payload_file_name,
                supplier_payload_file_path:
                  typeof payload?.saved?.file_path === "string"
                    ? payload.saved.file_path
                    : entry.supplier_payload_file_path,
              }
            : entry
        )
      );

      closeManualPayloadDialog();
    } catch (err) {
      setManualPayloadError(
        err instanceof Error ? err.message : t("production.suppliers.manualSaveError")
      );
    } finally {
      setManualPayloadSaving(false);
    }
  }, [closeManualPayloadDialog, manualPayloadJsonText, manualPayloadTarget, t]);

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

  const normalizeOfferPrice = useCallback((candidate: unknown): number | null => {
    if (candidate === null || candidate === undefined) return null;
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      if (Number.isInteger(candidate)) {
        // 1688 sometimes returns "9.000" as an integer 9000 (thousandths), which would
        // incorrectly show up as 90.00 if we always divide by 100. Use a narrow heuristic
        // before applying the default /100 scaling.
        if (candidate >= 1000 && candidate % 1000 === 0) {
          const asCents = candidate / 100;
          const asMillis = candidate / 1000;
          if (asCents >= 60 && asMillis > 0 && asMillis <= 60) {
            return asMillis;
          }
        }
        if (candidate >= 100 && candidate <= 100000) {
          return candidate / 100;
        }
      }
      return candidate;
    }
    const textRaw = String(candidate).trim();
    if (!textRaw) return null;
    const text = textRaw.replace(/[^0-9.,-]/g, "");
    if (!text) return null;
    const hasDecimalSeparator = text.includes(".") || text.includes(",");
    const normalizedText = text.includes(",") && !text.includes(".")
      ? text.replace(",", ".")
      : text.replace(/,/g, "");
    const raw = Number(normalizedText);
    if (!Number.isFinite(raw)) return null;
    if (!hasDecimalSeparator && Number.isInteger(raw)) {
      if (raw >= 1000 && raw % 1000 === 0) {
        const asCents = raw / 100;
        const asMillis = raw / 1000;
        if (asCents >= 60 && asMillis > 0 && asMillis <= 60) {
          return asMillis;
        }
      }
      if (raw >= 100 && raw <= 100000) {
        return raw / 100;
      }
    }
    return raw;
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
        const normalized = normalizeOfferPrice(candidate);
        if (!Number.isFinite(normalized as number)) continue;
        return formatRmb(normalized as number);
      }
      return null;
    },
    [formatRmb, normalizeOfferPrice]
  );

  const pickOfferPriceRmbNumber = useCallback((offer: SupplierOffer): number | null => {
    const candidates = [
      (offer as any)?.price,
      (offer as any)?.priceValue,
      (offer as any)?.priceRmb,
      (offer as any)?.oldPrice,
    ];
    for (const candidate of candidates) {
      const normalized = normalizeOfferPrice(candidate);
      if (!Number.isFinite(normalized as number)) continue;
      return normalized as number;
    }
    return null;
  }, [normalizeOfferPrice]);

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
      const isImageFetchError = (message: unknown) => {
        const msg = String(message || "").toLowerCase();
        return (
          msg.includes("handle image error") ||
          msg.includes("image_fetch_error") ||
          msg.includes("image fetch error")
        );
      };

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

        const fetchWithRetry = async () => {
          const delaysMs = [500, 1200, 2500, 5000, 8000];
          let lastError: Error | null = null;
          for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
            const response = await fetch(`/api/production/suppliers?${params.toString()}`);
            const payload = await response.json().catch(() => ({}));
            if (response.ok) return payload;
            const message = payload?.error || t("production.suppliers.errorLoad");
            const err = new Error(message);
            lastError = err;
            if (!isImageFetchError(message) || attempt >= delaysMs.length) throw err;
            await new Promise((resolve) => window.setTimeout(resolve, delaysMs[attempt]));
          }
          throw lastError || new Error(t("production.suppliers.errorLoad"));
        };

        const payload = await fetchWithRetry();
        const offers = Array.isArray(payload?.offers) ? payload.offers : [];
        setSupplierOffers(offers);
        const input = payload?.input ?? null;
        const recropSourceUrl =
          typeof input?.recrop?.imageUrl === "string" ? input.recrop.imageUrl : null;
        const usedPicUrl =
          recropSourceUrl ||
          (typeof input?.usedPicUrl === "string" ? input.usedPicUrl : null) ||
          (typeof input?.picUrl === "string" ? input.picUrl : null) ||
          imageUrl ||
          null;
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
        const msg =
          err instanceof Error ? err.message : t("production.suppliers.errorLoad");
        setSupplierError(
          isImageFetchError(msg)
            ? "1688 image search temporarily failed to fetch the image. Please retry in a moment."
            : msg
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
      supplierSearchImageUrl &&
      !supplierSearchImageUrl.includes("/api/discovery/local-image") &&
      !supplierSearchImageUrl.includes("/api/public/temp-images/")
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
    setCropRect(DEFAULT_CROP_RECT_FALLBACK);
    cropTouchedRef.current = false;
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
      cropTouchedRef.current = true;
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
      const recropSourceUrl =
        typeof input?.recrop?.imageUrl === "string" ? input.recrop.imageUrl : null;
      const usedPicUrl =
        recropSourceUrl ||
        (typeof input?.usedPicUrl === "string" ? input.usedPicUrl : null) ||
        (typeof input?.picUrl === "string" ? input.picUrl : null) ||
        cropImageUrl;
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
        const payloadStatus =
          selectedOffer &&
          typeof (selectedOffer as any)?._production_payload_status === "string"
            ? String((selectedOffer as any)._production_payload_status)
            : "fetching";
        const payloadSource =
          selectedOffer &&
          typeof (selectedOffer as any)?._production_payload_source === "string"
            ? String((selectedOffer as any)._production_payload_source)
            : "auto";
        const payloadError =
          selectedOffer &&
          typeof (selectedOffer as any)?._production_payload_error === "string"
            ? String((selectedOffer as any)._production_payload_error)
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
                  supplier_payload_status: payloadStatus,
                  supplier_payload_source: payloadSource,
                  supplier_payload_error: payloadError,
                  supplier_payload_saved_at: null,
                  supplier_variant_available_count: null,
                  supplier_variant_selected_count: null,
                  supplier_variant_packs_text: null,
                }
              : entry
          )
        );
      } else {
        setItems((prev) =>
          prev.map((entry) =>
            entry.provider === supplierTarget.provider &&
            entry.product_id === supplierTarget.product_id
              ? {
                  ...entry,
                  supplier_selected: true,
                  supplier_payload_status: "fetching",
                  supplier_payload_source: "auto",
                  supplier_payload_error: null,
                  supplier_payload_saved_at: null,
                  supplier_variant_available_count: null,
                  supplier_variant_selected_count: null,
                  supplier_variant_packs_text: null,
                }
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
    const allowed = new Set(
      items
        .filter((it) => {
          const queueStatus =
            typeof it.production_status === "string"
              ? it.production_status.trim().toLowerCase()
              : "";
          const isQueued =
            queueStatus === "queued_for_production" || queueStatus === "queued";
          const isDone =
            (typeof it.production_status_done_at === "string" &&
              it.production_status_done_at.trim().length > 0) ||
            queueStatus === "production_done";
          const hasSpu =
            typeof it.production_assigned_spu === "string" &&
            it.production_assigned_spu.trim().length > 0;
          return !(isDone && hasSpu) && !isQueued;
        })
        .map((it) => `${it.provider}:${it.product_id}`)
    );
    setSelectedKeys((prev) => {
      const next = new Set<string>();
      for (const key of prev) {
        if (allowed.has(key)) next.add(key);
      }
      return next;
    });
  }, [items]);

  useEffect(() => {
    if (!adminLoaded || !isAdmin) return;
    const candidates = items
      .filter((item) => {
        const key = `${item.provider}:${item.product_id}`;
        if (warmedVariantKeysRef.current.has(key)) return false;
        const payloadStatus = String(item.supplier_payload_status || "").toLowerCase();
        return payloadStatus === "ready" && Boolean(item.supplier_selected);
      })
      .slice(0, 2);
    if (candidates.length === 0) return;
    candidates.forEach((item) => {
      const key = `${item.provider}:${item.product_id}`;
      warmedVariantKeysRef.current.add(key);
      const params = new URLSearchParams({
        provider: item.provider,
        product_id: item.product_id,
      });
      // Warm variant parsing + translation in the background.
      fetch(`/api/production/suppliers/variants?${params.toString()}`).catch(() => {
        // allow retry on later render
        warmedVariantKeysRef.current.delete(key);
      });
    });
  }, [adminLoaded, isAdmin, items]);

  useEffect(() => {
    if (!adminLoaded || !isAdmin) return;
    const hasPendingPayload = items.some((item) => {
      const status =
        typeof item.supplier_payload_status === "string"
          ? item.supplier_payload_status.toLowerCase()
          : "";
      return status === "fetching" || status === "queued";
    });
    if (!hasPendingPayload) return;

    let cancelled = false;
    const reload = async () => {
      try {
        const response = await fetch("/api/discovery/production");
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled) return;
        if (Array.isArray(payload?.items)) {
          setItems(payload.items);
        }
      } catch {
        // best-effort polling
      }
    };

    const timer = window.setInterval(reload, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [adminLoaded, isAdmin, items]);

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
      // Prefer durable remote image URLs; local file paths may disappear over time.
      const imageUrl = item.image_url || localImageUrl;
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

  const sendQueueItems = useCallback(
    async (targetItems: ProductionItem[], options?: { bulk?: boolean }) => {
      if (!targetItems.length) return;
      const targetKeys = targetItems.map((item) => `${item.provider}:${item.product_id}`);
      const targetKeySet = new Set(targetKeys);
      const isBulk = Boolean(options?.bulk);
      setSendingQueueRowKeys((prev) => {
        const next = new Set(prev);
        targetKeys.forEach((key) => next.add(key));
        return next;
      });
      if (isBulk) setSendingQueue(true);
      setError(null);
      try {
        const response = await fetch("/api/production/queue/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: targetItems.map((item) => ({
              provider: item.provider,
              product_id: item.product_id,
            })),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || t("production.action.sendError"));
        }
        if (isBulk) setSelectedKeys(new Set());
        const nowIso = new Date().toISOString();
        setItems((prev) =>
          prev.map((entry) => {
            const key = `${entry.provider}:${entry.product_id}`;
            if (!targetKeySet.has(key)) return entry;
            return {
              ...entry,
              production_status: "queued_for_production",
              production_status_updated_at: nowIso,
            };
          })
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : t("production.action.sendError"));
      } finally {
        if (isBulk) setSendingQueue(false);
        setSendingQueueRowKeys((prev) => {
          const next = new Set(prev);
          targetKeys.forEach((key) => next.delete(key));
          return next;
        });
      }
    },
    [t]
  );

  const hasCjk = useCallback((value: string) => /[\u3400-\u9fff]/.test(value), []);

  const parsePacks = useCallback((raw: string | null | undefined) => {
    if (!raw) return [] as number[];
    const values = raw
      .split(",")
      .map((entry) => Number(entry.trim()))
      .filter((entry) => Number.isFinite(entry) && entry > 0);
    return Array.from(new Set(values));
  }, []);

  const formatPackList = useCallback((packs: number[]) => {
    if (packs.length === 0) return "";
    return packs.join(", ");
  }, []);

  const formatReadableJson = useCallback((text: string) => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }, []);

  const extractUrls = useCallback((text: string) => {
    const matches = text.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    const cleaned = matches.map((value) => value.replace(/[),.;]+$/g, ""));
    return Array.from(new Set(cleaned));
  }, []);

  const resolveVariantTexts = useCallback(
    (raw: string, zhRaw?: string, enRaw?: string) => {
      const rawText = String(raw || "").trim();
      const zh = String(zhRaw || "").trim();
      const en = String(enRaw || "").trim();

      let zhText = zh;
      let enText = en;
      if (!zhText && !enText) {
        if (rawText && hasCjk(rawText)) zhText = rawText;
        else if (rawText) enText = rawText;
      } else if (!zhText && rawText && rawText !== enText && hasCjk(rawText)) {
        zhText = rawText;
      } else if (!enText && rawText && rawText !== zhText && !hasCjk(rawText)) {
        enText = rawText;
      }

      if (!zhText && enText) zhText = enText;
      return { zhText, enText };
    },
    [hasCjk]
  );

  const getLatestProductionStatusKey = useCallback((item: ProductionItem) => {
    const queueStatus =
      typeof item.production_status === "string"
        ? item.production_status.trim().toLowerCase()
        : "";
    const hasDone = Boolean(
      (typeof item.production_status_done_at === "string" &&
        item.production_status_done_at.trim()) ||
        queueStatus === "production_done"
    );
    if (hasDone) return "production_done" as const;
    const hasStarted = Boolean(
      (typeof item.production_status_started_at === "string" &&
        item.production_status_started_at.trim()) ||
        queueStatus === "production_started"
    );
    if (hasStarted) return "production_started" as const;
    const hasSpuAssigned = Boolean(
      (typeof item.production_status_spu_assigned_at === "string" &&
        item.production_status_spu_assigned_at.trim()) ||
        queueStatus === "spu_assigned"
    );
    if (hasSpuAssigned) return "spu_assigned" as const;
    if (queueStatus === "queued_for_production" || queueStatus === "queued") {
      return "queued_for_production" as const;
    }
    return "none" as const;
  }, []);

  const isItemQueuedForProduction = useCallback(
    (item: ProductionItem) => getLatestProductionStatusKey(item) === "queued_for_production",
    [getLatestProductionStatusKey]
  );

  const isItemLockedForProduction = useCallback(
    (item: ProductionItem) => {
      const statusKey = getLatestProductionStatusKey(item);
      const producedSpu =
        typeof item.production_assigned_spu === "string"
          ? item.production_assigned_spu.trim()
          : "";
      return statusKey === "production_done" && producedSpu.length > 0;
    },
    [getLatestProductionStatusKey]
  );

  const filteredItems = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (q) {
        const text = [
          item.title ?? "",
          item.product_id,
          item.provider,
          item.taxonomy_l1 ?? "",
          item.taxonomy_l2 ?? "",
          item.taxonomy_l3 ?? "",
          item.identical_spu ?? "",
          item.supplier_selected_offer_title ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!text.includes(q)) return false;
      }

      const latestStatusKey = getLatestProductionStatusKey(item);
      if (!queueProductionStatusFilters.has(latestStatusKey)) {
        return false;
      }

      const variantsPicked =
        (typeof item.supplier_variant_selected_count === "number" &&
          item.supplier_variant_selected_count > 0) ||
        parsePacks(item.supplier_variant_packs_text).length > 0;
      const supplierSelected = Boolean(item.supplier_selected);
      const linkedProduct = Boolean(String(item.identical_spu ?? "").trim());

      if (queueStatusSetFilters.size > 0) {
        const variantsPass =
          !queueStatusSetFilters.has("variants_picked") &&
          !queueStatusSetFilters.has("variants_not_picked")
            ? true
            : (queueStatusSetFilters.has("variants_picked") && variantsPicked) ||
              (queueStatusSetFilters.has("variants_not_picked") && !variantsPicked);
        if (!variantsPass) return false;

        const supplierPass =
          !queueStatusSetFilters.has("supplier_selected") &&
          !queueStatusSetFilters.has("supplier_not_selected")
            ? true
            : (queueStatusSetFilters.has("supplier_selected") && supplierSelected) ||
              (queueStatusSetFilters.has("supplier_not_selected") && !supplierSelected);
        if (!supplierPass) return false;

        const linkedPass =
          !queueStatusSetFilters.has("linked_product") &&
          !queueStatusSetFilters.has("linked_not_product")
            ? true
            : (queueStatusSetFilters.has("linked_product") && linkedProduct) ||
              (queueStatusSetFilters.has("linked_not_product") && !linkedProduct);
        if (!linkedPass) return false;
      }

      if (
        queueProviders.size !== QUEUE_PROVIDER_OPTIONS.length &&
        !queueProviders.has(String(item.provider || "").toLowerCase())
      ) {
        return false;
      }

      const hasComments =
        typeof item.comment_count === "number" && item.comment_count > 0;
      if (!queueCommentsFilters.has(hasComments ? "with" : "without")) {
        return false;
      }

      return true;
    });
  }, [
    getLatestProductionStatusKey,
    items,
    parsePacks,
    queueCommentsFilters,
    queueProductionStatusFilters,
    queueProviders,
    queueSearch,
    queueStatusSetFilters,
  ]);

	  const content = useMemo(() => {
	    if (loading) {
	      return <Spinner label={t("production.loading")} />;
	    }
	    if (items.length === 0) {
	      return <Text>{t("production.empty")}</Text>;
	    }
      const selectedRows = items.filter((it) => {
        if (!selectedKeys.has(`${it.provider}:${it.product_id}`)) return false;
        return !isItemLockedForProduction(it) && !isItemQueuedForProduction(it);
      });
	    const selectedCount = selectedRows.length;
	    const selectableVisibleRowKeys = filteredItems
        .filter(
          (it) => !isItemLockedForProduction(it) && !isItemQueuedForProduction(it)
        )
        .map((it) => `${it.provider}:${it.product_id}`);
	    const visibleSelectedCount = selectableVisibleRowKeys.filter((k) => selectedKeys.has(k)).length;
	    const allSelected =
        selectableVisibleRowKeys.length > 0 &&
        visibleSelectedCount === selectableVisibleRowKeys.length;
	    const someSelected = visibleSelectedCount > 0 && !allSelected;
	    return (
        <>
          <div className={styles.queueActionsBar}>
            <div className={styles.queueFiltersBar}>
              <Input
                className={styles.queueSearchInput}
                placeholder="Search in queue..."
                value={queueSearch}
                onChange={(_, data) => setQueueSearch(data.value)}
              />
              <Dropdown
                multiselect
                className={styles.queueFilterDropdown}
                value={
                  queueProductionStatusFilters.size === QUEUE_PRODUCTION_STATUS_OPTIONS.length
                    ? "Production all"
                    : `Production (${queueProductionStatusFilters.size})`
                }
                selectedOptions={[...queueProductionStatusFilters]}
                onOptionSelect={(_, data) => {
                  const next = new Set((data.selectedOptions ?? []) as string[]);
                  if (next.size === 0) {
                    setQueueProductionStatusFilters(
                      new Set(QUEUE_PRODUCTION_STATUS_OPTIONS.map((option) => option.value))
                    );
                    return;
                  }
                  setQueueProductionStatusFilters(next);
                }}
              >
                {QUEUE_PRODUCTION_STATUS_OPTIONS.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Dropdown>
              <Dropdown
                multiselect
                className={styles.queueFilterDropdown}
                value={
                  queueStatusSetFilters.size === 0
                    ? "Status sets all"
                    : `Status sets (${queueStatusSetFilters.size})`
                }
                selectedOptions={[...queueStatusSetFilters]}
                onOptionSelect={(_, data) => {
                  setQueueStatusSetFilters(new Set((data.selectedOptions ?? []) as string[]));
                }}
              >
                {QUEUE_STATUS_SET_OPTIONS.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Dropdown>
              <Dropdown
                multiselect
                className={styles.queueFilterDropdown}
                value={
                  queueProviders.size === QUEUE_PROVIDER_OPTIONS.length
                    ? "Seller data all"
                    : `Seller data (${queueProviders.size})`
                }
                selectedOptions={[...queueProviders]}
                onOptionSelect={(_, data) => {
                  const next = new Set((data.selectedOptions ?? []) as string[]);
                  if (next.size === 0) {
                    setQueueProviders(
                      new Set(QUEUE_PROVIDER_OPTIONS.map((option) => option.value))
                    );
                    return;
                  }
                  setQueueProviders(next);
                }}
              >
                {QUEUE_PROVIDER_OPTIONS.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Dropdown>
              <Dropdown
                multiselect
                className={styles.queueFilterDropdown}
                value={
                  queueCommentsFilters.size === QUEUE_COMMENT_OPTIONS.length
                    ? "Comments all"
                    : `Comments (${queueCommentsFilters.size})`
                }
                selectedOptions={[...queueCommentsFilters]}
                onOptionSelect={(_, data) => {
                  const next = new Set((data.selectedOptions ?? []) as string[]);
                  if (next.size === 0) {
                    setQueueCommentsFilters(
                      new Set(QUEUE_COMMENT_OPTIONS.map((option) => option.value))
                    );
                    return;
                  }
                  setQueueCommentsFilters(next);
                }}
              >
                {QUEUE_COMMENT_OPTIONS.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Dropdown>
            </div>
            <div className={styles.queueActionRight}>
              <Text className={styles.queueActionCount}>
                {t("production.selection.selectedCount", { count: selectedCount })}
              </Text>
              <Button
                appearance={selectedCount > 0 ? "primary" : "outline"}
                className={selectedCount > 0 ? styles.queueSendButtonActive : undefined}
                disabled={selectedCount === 0 || sendingQueue}
                onClick={() => void sendQueueItems(selectedRows, { bulk: true })}
              >
                {sendingQueue ? t("production.action.sending") : "Send to Production"}
              </Button>
            </div>
          </div>
          {filteredItems.length === 0 ? <Text>No products match the current filters.</Text> : null}
          {filteredItems.length > 0 ? (
	      <Table className={styles.table}>
	        <TableHeader>
	          <TableRow>
            <TableHeaderCell className={styles.imageCol} />
            <TableHeaderCell className={styles.productCol}>
              {t("production.table.product")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.sellerDataCol}>
              {t("production.table.sellerData")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.linkCol}>
              {t("production.table.link")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.suppliersCol}>
              {t("production.table.suppliers")}
            </TableHeaderCell>
            <TableHeaderCell className={styles.variantsCol}>
              Variants
            </TableHeaderCell>
	            <TableHeaderCell className={styles.linkedCol}>
	              {t("production.table.linkedProduct")}
	            </TableHeaderCell>
              <TableHeaderCell className={styles.statusCol}>
                Status
              </TableHeaderCell>
	            <TableHeaderCell className={styles.commentsCol}>
	              {t("production.table.comments")}
	            </TableHeaderCell>
	            <TableHeaderCell className={styles.actionCell}>
	              {t("production.table.actions")}
	            </TableHeaderCell>
	            <TableHeaderCell className={styles.selectCol}>
	              <Checkbox
                  className={styles.tableSelectCheckbox}
                  disabled={selectableVisibleRowKeys.length === 0}
	                checked={allSelected ? true : someSelected ? "mixed" : false}
	                onChange={(_, data) => {
	                  const checked = data.checked === true;
	                  setSelectedKeys(() => {
	                    if (!checked) return new Set();
	                    return new Set(selectableVisibleRowKeys);
	                  });
	                }}
	                aria-label={t("production.table.selectAll")}
	              />
	            </TableHeaderCell>
	          </TableRow>
	        </TableHeader>
        <TableBody>
	          {filteredItems.map((item) => {
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
            const categoryParts = [
              item.taxonomy_l1 ? { label: item.taxonomy_l1, level: "l1" as const } : null,
              item.taxonomy_l2 ? { label: item.taxonomy_l2, level: "l2" as const } : null,
              item.taxonomy_l3 ? { label: item.taxonomy_l3, level: "l3" as const } : null,
            ].filter(Boolean) as Array<{ label: string; level: "l1" | "l2" | "l3" }>;
            const link = item.product_url || item.source_url;
            const commentCount = item.comment_count ?? 0;
            const hasComments = commentCount > 0;
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
              ) : null;
            const payloadStatusRaw =
              typeof item.supplier_payload_status === "string"
                ? item.supplier_payload_status.trim().toLowerCase()
                : "";
            const payloadStatus =
              payloadStatusRaw === "fetching" ||
              payloadStatusRaw === "queued" ||
              payloadStatusRaw === "ready" ||
              payloadStatusRaw === "failed"
                ? payloadStatusRaw
                : "";
            const payloadReady = payloadStatus === "ready";
            const competitorDataReady =
              payloadReady &&
              ((typeof item.supplier_payload_competitor_url === "string" &&
                item.supplier_payload_competitor_url.trim().length > 0) ||
                (typeof item.supplier_payload_competitor_title === "string" &&
                  item.supplier_payload_competitor_title.trim().length > 0) ||
                (typeof item.supplier_payload_competitor_images === "number" &&
                  item.supplier_payload_competitor_images > 0));
            const showCompetitorBadge =
              item.provider === "cdon" || item.provider === "fyndiq" || item.provider === "digideal";
            const competitorBadgeLabel =
              item.provider === "fyndiq"
                ? "Fyndiq"
                : item.provider === "digideal"
                  ? "DigiDeal"
                  : "CDON";
            const hasLinkedProduct = Boolean(String(item.identical_spu ?? "").trim());
            const linkedSpu = String(item.identical_spu ?? "").trim();
            const queueStatus =
              typeof item.production_status === "string"
                ? item.production_status.trim().toLowerCase()
                : "";
            const isQueuedForProductionStatus =
              queueStatus === "queued_for_production" || queueStatus === "queued";
            const spuAssignedAt =
              typeof item.production_status_spu_assigned_at === "string"
                ? item.production_status_spu_assigned_at
                : null;
            const productionStartedAt =
              typeof item.production_status_started_at === "string"
                ? item.production_status_started_at
                : null;
            const productionDoneAt =
              typeof item.production_status_done_at === "string"
                ? item.production_status_done_at
                : null;
            const statusUpdatedAt =
              typeof item.production_status_updated_at === "string"
                ? item.production_status_updated_at
                : null;
            const latestStatusLabel = productionDoneAt
              ? t("production.status.productionDone")
              : productionStartedAt
                ? t("production.status.productionStarted")
                : spuAssignedAt
                  ? t("production.status.spuAssigned")
                  : queueStatus === "production_done"
                    ? t("production.status.productionDone")
                    : queueStatus === "production_started"
                      ? t("production.status.productionStarted")
                      : queueStatus === "spu_assigned"
                        ? t("production.status.spuAssigned")
                        : isQueuedForProductionStatus
                          ? t("production.status.queuedForProduction")
                        : null;
            const latestStatusAt =
              productionDoneAt || productionStartedAt || spuAssignedAt || statusUpdatedAt;
            const displayStatusLabel = latestStatusLabel ?? "New Product";
            const displayStatusAt = latestStatusAt || item.created_at || null;
            const displayStatusTimestamp = displayStatusAt
              ? formatDateTime(displayStatusAt)
              : null;
            const statusIsNew = !latestStatusLabel;
            const statusIsDone = Boolean(productionDoneAt || queueStatus === "production_done");
            const statusCurrentClass = mergeClasses(
              styles.statusCurrent,
              statusIsNew ? styles.statusCurrentNew : statusIsDone ? styles.statusCurrentDone : undefined
            );
            const producedSpu =
              typeof item.production_assigned_spu === "string"
                ? item.production_assigned_spu.trim()
                : "";
            const isProductionLocked = isItemLockedForProduction(item);
            const isQueuedForProduction = isItemQueuedForProduction(item);
            const rowStatusClass = productionDoneAt || queueStatus === "production_done"
              ? styles.rowStatusDone
              : isQueuedForProduction
                ? styles.rowStatusQueued
              : productionStartedAt || spuAssignedAt || queueStatus === "spu_assigned" || queueStatus === "production_started"
                ? styles.rowStatusInProgress
                : undefined;

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
            const sellerPriceLabel = priceValue !== null ? formatCurrency(priceValue, "SEK") : "-";
            const canOpenPayloadJson = payloadReady && Boolean(item.supplier_payload_file_path);
            const variantsSelectedCount =
              typeof item.supplier_variant_selected_count === "number"
                ? item.supplier_variant_selected_count
                : null;
            const variantsPacks = parsePacks(item.supplier_variant_packs_text);
            const hasPickedVariants = (variantsSelectedCount ?? 0) > 0 || variantsPacks.length > 0;
            const variantsButtonLabel =
              hasPickedVariants
                ? "Variants Picked"
                : "Pick Variants";
            const variantsPackLine = variantsPacks.length > 0 ? `Packs: ${formatPackList(variantsPacks)}` : null;
            const supplierProcess1688State =
              payloadStatus === "ready" ? "ready" : payloadStatus === "failed" ? "failed" : "loading";
            const competitorPayloadError =
              typeof item.supplier_payload_competitor_error === "string"
                ? item.supplier_payload_competitor_error.trim()
                : "";
            const supplierProcessCompetitorState =
              competitorPayloadError
                ? "failed"
                : competitorDataReady
                  ? "ready"
                : payloadStatus === "failed" || payloadStatus === "ready"
                  ? "failed"
                  : "loading";
	            return (
	              <TableRow key={rowKey} className={rowStatusClass}>
                <TableCell className={styles.imageCol}>
                  {imageSrc ? (
                    <Tooltip
                      relationship="label"
                      withArrow
                      positioning={{ position: "after", align: "center", offset: 8 }}
                      content={
                        <img
                          src={imageSrc}
                          alt={title}
                          className={styles.thumbZoomImage}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          decoding="async"
                        />
                      }
                    >
                      <Image src={imageSrc} alt={title} className={styles.thumb} />
                    </Tooltip>
                  ) : null}
                </TableCell>
                <TableCell className={mergeClasses(styles.productCol)}>
                  <div className={styles.productCellStack}>
                    <Text className={styles.productTitle}>{title}</Text>
                    {categoryParts.length > 0 ? (
                      <div className={styles.breadcrumbRow}>
                        {categoryParts.map((part, idx) => {
                          const categoryParam = `${part.level}:${encodeURIComponent(part.label)}`;
                          return (
                            <span key={`${part.level}:${part.label}`}>
                              {idx > 0 ? (
                                <span className={styles.breadcrumbDivider}> / </span>
                              ) : null}
                              <a
                                href={`/app/discovery?categories=${categoryParam}`}
                                className={styles.breadcrumbLink}
                              >
                                {part.label}
                              </a>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <Text size={100} className={styles.cardMeta}>
                        -
                      </Text>
                    )}
                  </div>
                </TableCell>
                <TableCell className={styles.sellerDataCol}>
                  <div className={styles.cellStack}>
                    <div className={styles.sellerRowTop}>
                      <span className={styles.salesGroup}>
                        <Text size={200} className={styles.cardMeta}>
                          1d
                        </Text>
                        <span className={styles.salesButton}>{item.sold_today ?? 0}</span>
                      </span>
                      <span className={styles.salesGroup}>
                        <Text size={200} className={styles.cardMeta}>
                          7d
                        </Text>
                        <span className={styles.salesButton}>{item.sold_7d ?? 0}</span>
                      </span>
                      <span className={styles.salesGroup}>
                        <Text size={200} className={styles.cardMeta}>
                          {t("discovery.sales.all")}
                        </Text>
                        <span className={styles.salesButton}>{item.sold_all_time ?? 0}</span>
                      </span>
                    </div>
                    <div className={styles.sellerRowBottom}>
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
                      <div className={styles.priceRow}>
                        <Text className={styles.priceCurrent}>{sellerPriceLabel}</Text>
                        {isDigideal ? (
                          <Text className={styles.priceShipping}>({shippingCostLabel})</Text>
                        ) : null}
                        {prevPriceValue !== null && prevPriceValue > (priceValue ?? 0) ? (
                          <Text className={styles.pricePrevious}>
                            {formatCurrency(prevPriceValue, "SEK")}
                          </Text>
                        ) : null}
                      </div>
                    </div>
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
                <TableCell className={styles.suppliersCol}>
                  <div className={styles.supplierControlRow}>
                    <div className={styles.supplierMainRow}>
                      {supplierTooltipContent ? (
                        <Tooltip
                          content={supplierTooltipContent}
                          relationship="label"
                          positioning={{ position: "above", align: "center", offset: 10 }}
                        >
                          <Button
                            appearance="outline"
                            size="small"
                            className={mergeClasses(
                              supplierSelected ? styles.supplierSelectedButton : styles.linkButton
                            )}
                            onClick={() => openSupplierDialog(item)}
                          >
                            {supplierButtonLabel}
                          </Button>
                        </Tooltip>
                      ) : (
                        <Button
                          appearance="outline"
                          size="small"
                          className={mergeClasses(
                            supplierSelected ? styles.supplierSelectedButton : styles.linkButton
                          )}
                          onClick={() => openSupplierDialog(item)}
                        >
                          {supplierButtonLabel}
                        </Button>
                      )}
                      {supplierSelected ? (
                        <Tooltip content="View JSON file" relationship="label">
                          <Button
                            appearance="outline"
                            size="small"
                            className={styles.supplierJsonButton}
                            onClick={() => void openJsonInspector(item, "1688")}
                            disabled={!canOpenPayloadJson}
                            aria-label="View JSON file"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={styles.supplierJsonIcon}
                              aria-hidden="true"
                            >
                              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                              <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                              <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
                              <path d="M9 17h6" />
                              <path d="M9 13h6" />
                            </svg>
                          </Button>
                        </Tooltip>
                      ) : null}
                    </div>
                    {supplierSelected ? (
                      <div className={styles.supplierMetaTightRow}>
                        <span className={styles.supplierMetaTightItem}>
                          {supplierProcess1688State === "loading" ? (
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
                            </svg>
                          ) : null}
                          <span>
                            {supplierProcess1688State === "loading"
                              ? "Fetching 1688 data"
                              : supplierProcess1688State === "ready"
                                ? "1688 data fetched"
                                : "1688 data failed"}
                          </span>
                          {supplierProcess1688State === "ready" ? (
                            <span className={styles.supplierMetaTightOk}>✓</span>
                          ) : supplierProcess1688State === "failed" ? (
                            <span className={styles.supplierMetaTightFail}>✕</span>
                          ) : null}
                        </span>
                        {showCompetitorBadge ? (
                          <span
                            className={mergeClasses(
                              styles.supplierMetaTightItem,
                              supplierProcessCompetitorState === "failed"
                                ? styles.supplierMetaTightItemFailed
                                : undefined
                            )}
                          >
                            {supplierProcessCompetitorState === "failed" ? (
                              <button
                                type="button"
                                className={styles.supplierMetaTightButton}
                                onClick={() => openCompetitorOverrideDialog(item)}
                                title="Update competitor URL"
                              >
                                <span>{competitorBadgeLabel}</span>
                                <span className={styles.supplierMetaTightFail}>✕</span>
                              </button>
                            ) : (
                              <span className={styles.supplierMetaTightStatic}>
                                {supplierProcessCompetitorState === "loading" ? (
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
                                  </svg>
                                ) : null}
                                <span>{competitorBadgeLabel}</span>
                                {supplierProcessCompetitorState === "ready" ? (
                                  <span className={styles.supplierMetaTightOk}>✓</span>
                                ) : null}
                              </span>
                            )}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {supplierSelected && payloadStatus === "failed" ? (
                      <div className={styles.supplierManualRow}>
                        <Button
                          size="small"
                          appearance="outline"
                          className={styles.linkButton}
                          onClick={() => openManualPayloadDialog(item)}
                        >
                          {t("production.suppliers.manualAdd")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className={styles.variantsCol}>
                  <div className={styles.variantCellStack}>
                    <Button
                      appearance="outline"
                      size="small"
                      className={mergeClasses(
                        styles.linkButton,
                        hasPickedVariants
                          ? styles.supplierSelectedButton
                          : undefined
                      )}
                      disabled={!payloadReady || !item.supplier_payload_file_path}
                      onClick={() => void openVariantsDialog(item)}
                    >
                      {variantsButtonLabel}
                    </Button>
                    {!payloadReady ? (
                      <Text size={100} className={styles.variantMetaTight}>
                        Waiting for 1688 data
                      </Text>
                    ) : hasPickedVariants ? (
                      <>
                        {(variantsSelectedCount ?? 0) > 0 ? (
                          <Text size={100} className={styles.variantMetaTight}>
                            Picked: {variantsSelectedCount}
                          </Text>
                        ) : null}
                        {variantsPackLine ? (
                          <Text size={100} className={styles.variantMetaTight}>
                            {variantsPackLine}
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Text size={100} className={styles.variantMetaTight}>
                        No variants chosen
                      </Text>
                    )}
                  </div>
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
                          <span className={styles.linkButtonContent}>
	                          {t("production.linked.link")}
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
                              <path d="M4 6c0 1.657 3.582 3 8 3s8 -1.343 8 -3s-3.582 -3 -8 -3s-8 1.343 -8 3" />
                              <path d="M4 6v6c0 1.657 3.582 3 8 3c1.075 0 2.1 -.08 3.037 -.224" />
                              <path d="M20 12v-6" />
                              <path d="M4 12v6c0 1.657 3.582 3 8 3c.166 0 .331 -.002 .495 -.006" />
                              <path d="M16 19h6" />
                              <path d="M19 16v6" />
                            </svg>
                          </span>
	                      </Button>
	                    )}
		                  </div>
                    </TableCell>
                    <TableCell className={styles.statusCol}>
                      <div className={styles.statusStack}>
                        <Text className={statusCurrentClass}>{displayStatusLabel}</Text>
                        {displayStatusTimestamp ? (
                          <Text className={styles.statusTimestamp}>{displayStatusTimestamp}</Text>
                        ) : null}
                        {latestStatusLabel === t("production.status.productionDone") && producedSpu ? (
                          <a
                            href={`/app/products/spu/${encodeURIComponent(producedSpu)}`}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.statusSpuLink}
                          >
                            {producedSpu}
                          </a>
                        ) : null}
                      </div>
                    </TableCell>
	                <TableCell className={styles.commentsCol}>
	                  <Button
	                    appearance="outline"
	                    size="small"
	                    className={mergeClasses(
                        styles.commentIconButton,
                        hasComments
                          ? styles.commentIconButtonHasComments
                          : styles.commentIconButtonEmpty
                      )}
	                    onClick={() => openCommentDialog(item)}
                      aria-label={
                        hasComments
                          ? `${commentCount} ${t("production.table.comments")}`
                          : t("production.comments.none")
                      }
	                  >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={styles.iconOnly}
                        aria-hidden="true"
                      >
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M8 9h8" />
                        <path d="M8 13h6" />
                        <path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12" />
                      </svg>
	                  </Button>
	                </TableCell>
	                <TableCell className={styles.actionCell}>
	                  <div className={styles.actionRow}>
		                    <Button
		                      appearance="outline"
		                      size="small"
		                      className={styles.linkButton}
                          onClick={() => void sendQueueItems([item])}
                          disabled={
                            isProductionLocked ||
                            isQueuedForProduction ||
                            sendingQueueRowKeys.has(rowKey) ||
                            !item.supplier_payload_file_path
                          }
		                    >
		                      {sendingQueueRowKeys.has(rowKey)
                            ? t("production.action.sending")
                            : t("production.action.produce")}
		                    </Button>
	                    <Button
	                      appearance="outline"
	                      size="small"
	                      className={mergeClasses(styles.linkButton, styles.removeIconButton)}
	                      onClick={() => handleRemove(item)}
	                      disabled={removingKey === rowKey}
                        aria-label={t("production.action.remove")}
	                    >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={styles.removeIcon}
                          aria-hidden="true"
                        >
                          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                          <path d="M4 7l16 0" />
                          <path d="M10 11l0 6" />
                          <path d="M14 11l0 6" />
                          <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
	                          <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
	                        </svg>
	                    </Button>
		                  </div>
		                </TableCell>
	                <TableCell className={styles.selectCol}>
	                  <Checkbox
                        className={styles.tableSelectCheckbox}
	                    checked={selectedKeys.has(rowKey)}
                      disabled={isProductionLocked || isQueuedForProduction}
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
          ) : null}
        </>
	    );
	  }, [
    handleRemove,
    filteredItems,
    items,
    loading,
    normalizeSupplierImageUrl,
    openCommentDialog,
    openJsonInspector,
    openLinkedDialog,
    openManualPayloadDialog,
    openCompetitorOverrideDialog,
    openVariantsDialog,
	    openSupplierDialog,
    parsePacks,
    queueCommentsFilters,
    queueProductionStatusFilters,
    queueProviders,
    queueSearch,
    queueStatusSetFilters,
    formatPackList,
    resolveVariantTexts,
	    removingKey,
      sendQueueItems,
	      sendingQueue,
	      sendingQueueRowKeys,
	      isItemLockedForProduction,
      isItemQueuedForProduction,
		    selectedKeys,
    supplierBgStatus,
    styles,
    t,
  ]);

  const parsedJsonInspector = useMemo(() => {
    const raw = String(jsonInspectorText || "").trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }, [jsonInspectorText]);

  const jsonReadableItem = useMemo(() => {
    const root = parsedJsonInspector;
    if (!root) return null;
    if (Array.isArray(root) && root.length > 0 && root[0] && typeof root[0] === "object") {
      return root[0] as Record<string, unknown>;
    }
    if (root && typeof root === "object") {
      const rec = root as Record<string, unknown>;
      if (Array.isArray(rec.items) && rec.items[0] && typeof rec.items[0] === "object") {
        return rec.items[0] as Record<string, unknown>;
      }
      return rec;
    }
    return null;
  }, [parsedJsonInspector]);

  const jsonReadableDetails = useMemo(() => {
    const item = jsonReadableItem as Record<string, unknown> | null;
    const empty = {
      url1688: "",
      mainImage1688: "",
      competitorUrl: "",
      imageUrls1688: [] as string[],
      supplementaryImageUrls: [] as string[],
      variantImageUrls: [] as string[],
      competitorImageUrls: [] as string[],
      detectedLinks: [] as string[],
      variantCombos: [] as Array<Record<string, unknown>>,
      variantImageRows: [] as Array<{ name: string; url: string }>,
    };
    if (!item) return empty;

    const text = (value: unknown) =>
      typeof value === "string" ? value.trim() : "";
    const toUrlArray = (value: unknown): string[] => {
      if (!value) return [];
      const raw = Array.isArray(value) ? value : [value];
      const urls: string[] = [];
      raw.forEach((entry) => {
        if (typeof entry === "string") {
          const v = entry.trim();
          if (v.startsWith("http://") || v.startsWith("https://")) urls.push(v);
          return;
        }
        if (entry && typeof entry === "object") {
          const obj = entry as Record<string, unknown>;
          const candidates = [obj.url_full, obj.url, obj.image, obj.image_url];
          candidates.forEach((candidate) => {
            if (typeof candidate === "string") {
              const v = candidate.trim();
              if (v.startsWith("http://") || v.startsWith("https://")) urls.push(v);
            }
          });
        }
      });
      return Array.from(new Set(urls));
    };

    const competitorData =
      item.competitor_data && typeof item.competitor_data === "object"
        ? (item.competitor_data as Record<string, unknown>)
        : null;
    const variations =
      item.variations && typeof item.variations === "object"
        ? (item.variations as Record<string, unknown>)
        : null;
    const variantCombos = Array.isArray(variations?.combos)
      ? (variations?.combos as Array<Record<string, unknown>>)
      : [];
    const variantImages = Array.isArray(item.variant_images_1688)
      ? (item.variant_images_1688 as Array<Record<string, unknown>>)
      : [];
    const variantImageRows = variantImages
      .map((entry) => {
        const name = text(entry.name);
        const url = text(entry.url_full) || text(entry.url);
        return { name, url };
      })
      .filter((entry) => Boolean(entry.url));

    return {
      url1688: text(item.url_1688),
      mainImage1688: text(item.main_image_1688),
      competitorUrl: text(competitorData?.source_url),
      imageUrls1688: toUrlArray(item.image_urls_1688),
      supplementaryImageUrls: toUrlArray(item.supplementary_image_urls),
      variantImageUrls: Array.from(
        new Set([
          ...toUrlArray(item.variant_image_urls),
          ...toUrlArray(item.variant_images_1688),
        ])
      ),
      competitorImageUrls: toUrlArray(competitorData?.image_urls),
      detectedLinks: extractUrls(jsonInspectorText),
      variantCombos,
      variantImageRows,
    };
  }, [extractUrls, jsonInspectorText, jsonReadableItem]);

  const updateJsonReadableItemField = useCallback(
    (field: string, value: unknown) => {
      if (!parsedJsonInspector) return;
      const nextRoot = structuredClone(parsedJsonInspector as any);
      if (Array.isArray(nextRoot) && nextRoot[0] && typeof nextRoot[0] === "object") {
        (nextRoot[0] as any)[field] = value;
      } else if (nextRoot && typeof nextRoot === "object") {
        const rec = nextRoot as any;
        if (Array.isArray(rec.items) && rec.items[0] && typeof rec.items[0] === "object") {
          rec.items[0][field] = value;
        } else {
          rec[field] = value;
        }
      }
      const nextText = JSON.stringify(nextRoot, null, 2);
      setJsonInspectorText(nextText);
      setJsonInspectorReadableText(nextText);
    },
    [parsedJsonInspector]
  );

  return (
    <>
      <Card className={styles.card}>
        <Text size={600} weight="semibold">
          {t("production.title")}
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
          <DialogBody className={styles.commentDialogBody}>
            <DialogTitle>{t("production.comments.title")}</DialogTitle>
            <DialogContent className={styles.commentDialogContent}>
              <div className={styles.commentHistory}>
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
              </div>
              <div className={styles.commentComposer}>
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
        open={variantsDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closeVariantsDialog();
          }
        }}
      >
        <DialogSurface className={styles.variantsDialog}>
          <DialogBody className={styles.variantsDialogBody}>
            <DialogTitle>Pick Variants</DialogTitle>
            <DialogContent className={styles.commentSection}>
              <div className={styles.variantsHeaderRow}>
                <div className={styles.variantsHeaderLeft}>
                  {variantsHeroImageSrc ? (
                    <div
                      className={styles.variantsHeroThumbWrap}
                      onMouseEnter={() => setVariantsHeroPreviewOpen(true)}
                      onMouseLeave={() => setVariantsHeroPreviewOpen(false)}
                    >
                      <Popover
                        open={variantsHeroPreviewOpen && variantsHeroZoomReady}
                        positioning={{ position: "after", align: "start", offset: 10 }}
                      >
                        <PopoverTrigger disableButtonEnhancement>
                          <div className={styles.variantsHeroThumbFrame}>
                            <img
                              src={variantsHeroImageSrc}
                              alt="Product"
                              className={styles.variantsHeroThumbImage}
                              referrerPolicy="no-referrer"
                              loading="eager"
                              decoding="async"
                            />
                          </div>
                        </PopoverTrigger>
                        <PopoverSurface className={styles.variantsHeroPopoverSurface}>
                          <img
                            src={variantsHeroImageSrc}
                            alt="Product zoom"
                            className={styles.variantsHeroZoomImage}
                            referrerPolicy="no-referrer"
                            loading="eager"
                            decoding="async"
                          />
                        </PopoverSurface>
                      </Popover>
                    </div>
                  ) : null}
                  {variantsTarget ? (
                    <div className={styles.variantsTitleStack}>
                      <Text className={styles.variantsTitleText}>
                        {variantsTarget.title ?? variantsTarget.product_id}
                      </Text>
                      {(() => {
                        const variantsProductUrl =
                          (typeof variantsTarget.supplier_selected_offer_detail_url === "string" &&
                          variantsTarget.supplier_selected_offer_detail_url.trim()
                            ? variantsTarget.supplier_selected_offer_detail_url.trim()
                            : null) ||
                          (typeof variantsTarget.supplier_1688_url === "string" &&
                          variantsTarget.supplier_1688_url.trim()
                            ? variantsTarget.supplier_1688_url.trim()
                            : null) ||
                          (typeof variantsTarget.product_url === "string" &&
                          variantsTarget.product_url.trim()
                            ? variantsTarget.product_url.trim()
                            : null) ||
                          (typeof variantsTarget.source_url === "string" &&
                          variantsTarget.source_url.trim()
                            ? variantsTarget.source_url.trim()
                            : null);
                        if (!variantsProductUrl) return null;
                        return (
                          <a
                            href={variantsProductUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.variantsTitleLink}
                            title={variantsProductUrl}
                          >
                            {variantsProductUrl}
                          </a>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>
                <div className={styles.variantsHeaderRight}>
                  <div className={styles.variantsTopActions}>
                    <Button
                      appearance="outline"
                      size="small"
                      onClick={() =>
                        setVariantsSelectedIndexes(
                          new Set(variantsCombos.map((combo) => combo.index))
                        )
                      }
                      disabled={variantsLoading || variantsCombos.length === 0}
                    >
                      Select all
                    </Button>
                    <Button
                      appearance="outline"
                      size="small"
                      onClick={() => setVariantsSelectedIndexes(new Set())}
                      disabled={variantsLoading || variantsCombos.length === 0}
                    >
                      Clear
                    </Button>
                    <Text size={200} className={styles.cardMeta}>
                      {variantsSelectedIndexes.size} selected
                    </Text>
                  </div>
                </div>
              </div>
              {variantsError ? <MessageBar intent="error">{variantsError}</MessageBar> : null}
              {variantsLoading ? (
                <Spinner label="Loading variants..." />
              ) : variantsCombos.length === 0 ? (
                <Text>No variant combinations found in the 1688 JSON. You can still set packs below.</Text>
              ) : (
                <>
                  <div className={styles.variantsListWrap}>
                    <table className={styles.variantsListTable}>
                      <thead>
                        <tr>
                          <th className={styles.variantsListHeadCell} style={{ width: 42 }}>
                            Pick
                          </th>
                          <th className={styles.variantsListHeadCell} style={{ width: 56 }}>
                            Image
                          </th>
                          <th className={styles.variantsListHeadCell}>
                            Variant
                          </th>
                          <th className={styles.variantsListHeadCell} style={{ width: 120 }}>
                            Price (RMB)
                          </th>
                          <th className={styles.variantsListHeadCell} style={{ width: 100 }}>
                            Weight (g)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {variantsCombos.map((combo) => {
                          const checked = variantsSelectedIndexes.has(combo.index);
                          const t1Value = resolveVariantTexts(combo.t1, combo.t1_zh, combo.t1_en);
                          const t2Value = resolveVariantTexts(combo.t2, combo.t2_zh, combo.t2_en);
                          const t3Value = resolveVariantTexts(combo.t3, combo.t3_zh, combo.t3_en);
                          const zhParts = [t1Value.zhText, t2Value.zhText, t3Value.zhText].filter(Boolean);
                          const enParts = [t1Value.enText, t2Value.enText, t3Value.enText]
                            .filter(Boolean)
                            .filter((v, i, arr) => arr.indexOf(v) === i);
                          return (
                            <tr
                              key={combo.index}
                              className={mergeClasses(
                                styles.variantsRowClickable,
                                !checked ? styles.variantsRowHoverable : undefined,
                                checked ? styles.variantsRowSelected : undefined
                              )}
                              onClick={() => {
                                setVariantsSelectedIndexes((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(combo.index)) next.delete(combo.index);
                                  else next.add(combo.index);
                                  return next;
                                });
                              }}
                            >
                              <td className={styles.variantsListCell}>
                                <Checkbox
                                  checked={checked}
                                  onClick={(ev) => ev.stopPropagation()}
                                  onChange={(_, data) => {
                                    setVariantsSelectedIndexes((prev) => {
                                      const next = new Set(prev);
                                      if (data.checked) next.add(combo.index);
                                      else next.delete(combo.index);
                                      return next;
                                    });
                                  }}
                                  aria-label={`Pick variant ${combo.index + 1}`}
                                />
                              </td>
                              <td className={styles.variantsListCell}>
                                {combo.image_url ? (
                                  <div
                                    className={styles.variantImageCellWrap}
                                    onMouseEnter={() => setVariantImagePreviewIndex(combo.index)}
                                    onMouseLeave={() => setVariantImagePreviewIndex((prev) => (prev === combo.index ? null : prev))}
                                  >
                                    <Popover
                                      open={variantImagePreviewIndex === combo.index}
                                      positioning={{ position: "after", align: "center", offset: 6 }}
                                    >
                                      <PopoverTrigger disableButtonEnhancement>
                                        <img
                                          src={combo.image_url}
                                          alt={zhParts[0] || enParts[0] || "Variant"}
                                          className={styles.variantImageThumb}
                                          referrerPolicy="no-referrer"
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      </PopoverTrigger>
                                      <PopoverSurface className={styles.variantImagePopoverSurface}>
                                        <div className={styles.variantImageZoomWrap}>
                                          <img
                                            src={combo.image_url}
                                            alt={zhParts[0] || enParts[0] || "Variant"}
                                            className={styles.variantImageZoom}
                                            referrerPolicy="no-referrer"
                                            loading="lazy"
                                            decoding="async"
                                          />
                                        </div>
                                      </PopoverSurface>
                                    </Popover>
                                  </div>
                                ) : null}
                              </td>
                              <td className={mergeClasses(styles.variantsListCell, styles.variantLabelCell)}>
                                <div className={styles.variantValueWrap}>
                                  <span className={styles.variantValueZh}>
                                    {zhParts.length > 0 ? zhParts.join(" / ") : enParts.join(" / ") || "-"}
                                  </span>
                                  {enParts.length > 0 && enParts.join(" / ") !== zhParts.join(" / ") ? (
                                    <span className={styles.variantValueEn}>{enParts.join(" / ")}</span>
                                  ) : null}
                                </div>
                              </td>
                              <td className={styles.variantsListCell}>
                                <div onClick={(ev) => ev.stopPropagation()}>
                                  <Input
                                    className={styles.variantEditInput}
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={variantPriceDraftByIndex[combo.index] ?? ""}
                                    onChange={(_, data) =>
                                      setVariantPriceDraftByIndex((prev) => ({
                                        ...prev,
                                        [combo.index]: data.value,
                                      }))
                                    }
                                  />
                                </div>
                              </td>
                              <td className={styles.variantsListCell}>
                                <div onClick={(ev) => ev.stopPropagation()}>
                                  <Input
                                    className={styles.variantEditInput}
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={variantWeightDraftByIndex[combo.index] ?? ""}
                                    onChange={(_, data) =>
                                      setVariantWeightDraftByIndex((prev) => ({
                                        ...prev,
                                        [combo.index]: data.value,
                                      }))
                                    }
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <Field label="Packs (comma-separated)" className={styles.variantsPacksField}>
                <Textarea
                  value={variantsPacksText}
                  onChange={(_, data) => setVariantsPacksText(data.value)}
                  resize="vertical"
                  rows={1}
                  placeholder="1, 2, 4"
                />
              </Field>
            </DialogContent>
            <DialogActions className={styles.variantsDialogActions}>
              <Button appearance="secondary" onClick={closeVariantsDialog}>
                Close
              </Button>
              <Button appearance="primary" onClick={handleSaveVariants} disabled={variantsSaving}>
                {variantsSaving ? "Saving..." : "Save"}
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
                <div className={styles.variantsHeaderRow}>
                  <div className={styles.variantsHeaderLeft}>
                    {supplierHeroImageSrc ? (
                      <div
                        className={styles.variantsHeroThumbWrap}
                        onMouseEnter={() => setSupplierHeroPreviewOpen(true)}
                        onMouseLeave={() => setSupplierHeroPreviewOpen(false)}
                      >
                        <Popover
                          open={supplierHeroPreviewOpen && supplierHeroZoomReady}
                          positioning={{ position: "after", align: "start", offset: 10 }}
                        >
                          <PopoverTrigger disableButtonEnhancement>
                            <div className={styles.variantsHeroThumbFrame}>
                              <img
                                src={supplierHeroImageSrc}
                                alt="Product"
                                className={styles.variantsHeroThumbImage}
                                referrerPolicy="no-referrer"
                                loading="eager"
                                decoding="async"
                              />
                            </div>
                          </PopoverTrigger>
                          <PopoverSurface className={styles.variantsHeroPopoverSurface}>
                            <img
                              src={supplierHeroImageSrc}
                              alt="Product zoom"
                              className={styles.variantsHeroZoomImage}
                              referrerPolicy="no-referrer"
                              loading="eager"
                              decoding="async"
                            />
                          </PopoverSurface>
                        </Popover>
                      </div>
                    ) : null}
                    <div className={styles.variantsTitleStack}>
                      <Text className={styles.variantsTitleText}>
                        {supplierTarget.title ?? supplierTarget.product_id}
                      </Text>
                    </div>
                  </div>
                  <div className={styles.variantsHeaderRight}>
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
                          !isSelected ? styles.supplierRowHoverable : undefined,
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
                    <div className={mergeClasses(styles.cardMeta, styles.supplierSearchingFooter)}>
                      <Spinner size="tiny" />
                      <Text size={200}>{t("production.suppliers.searchingFooter")}</Text>
                    </div>
                  );
                })()
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
                                const naturalW = img.naturalWidth;
                                const naturalH = img.naturalHeight;
                                setCropNaturalSize({ w: naturalW, h: naturalH });

                                // Default crop: full image minus 15px padding on each side.
                                if (!cropTouchedRef.current) {
                                  const marginX = Math.min(
                                    DEFAULT_CROP_MARGIN_PX,
                                    Math.floor((naturalW - 1) / 2)
                                  );
                                  const marginY = Math.min(
                                    DEFAULT_CROP_MARGIN_PX,
                                    Math.floor((naturalH - 1) / 2)
                                  );
                                  setCropRect(
                                    clampRect({
                                      x: marginX / naturalW,
                                      y: marginY / naturalH,
                                      w: (naturalW - marginX * 2) / naturalW,
                                      h: (naturalH - marginY * 2) / naturalH,
                                    })
                                  );
                                }
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
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog
        open={manualPayloadDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) closeManualPayloadDialog();
        }}
      >
        <DialogSurface className={styles.manualPayloadDialog}>
          <DialogBody>
            <DialogTitle>{t("production.suppliers.manualTitle")}</DialogTitle>
            <DialogContent className={styles.manualPayloadStack}>
              {manualPayloadTarget ? (
                <Text size={200}>
                  {manualPayloadTarget.title ?? manualPayloadTarget.product_id}
                </Text>
              ) : null}
              <Text size={200} className={styles.cardMeta}>
                {t("production.suppliers.manualHelp")}
              </Text>
              {manualPayloadError ? (
                <MessageBar intent="error">{manualPayloadError}</MessageBar>
              ) : null}
              <Field
                label={t("production.suppliers.manualFileLabel")}
                hint={manualPayloadFileName || undefined}
              >
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleManualPayloadFileChange}
                  className={styles.manualPayloadFileInput}
                />
              </Field>
              <Field label={t("production.suppliers.manualJsonLabel")}>
                <Textarea
                  value={manualPayloadJsonText}
                  onChange={(_, data) => setManualPayloadJsonText(data.value)}
                  placeholder={t("production.suppliers.manualJsonPlaceholder")}
                  resize="vertical"
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeManualPayloadDialog}>
                {t("production.suppliers.close")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleSaveManualPayload}
                disabled={manualPayloadSaving || manualPayloadJsonText.trim().length === 0}
              >
                {t("production.suppliers.manualSave")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog
        open={competitorOverrideDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) closeCompetitorOverrideDialog();
        }}
      >
        <DialogSurface className={styles.competitorOverrideDialog}>
          <DialogBody>
            <DialogTitle>Update Competitor URL</DialogTitle>
            <DialogContent className={styles.commentSection}>
              {competitorOverrideTarget ? (
                <Text size={200}>
                  {competitorOverrideTarget.title ?? competitorOverrideTarget.product_id}
                </Text>
              ) : null}
              {competitorOverrideError ? (
                <MessageBar intent="error">{competitorOverrideError}</MessageBar>
              ) : null}
              <Field label="Competitor product URL">
                <Input
                  value={competitorOverrideUrl}
                  onChange={(_, data) => setCompetitorOverrideUrl(data.value)}
                  placeholder="https://..."
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeCompetitorOverrideDialog}>
                Close
              </Button>
              <Button
                appearance="primary"
                onClick={handleSaveCompetitorOverride}
                disabled={competitorOverrideSaving}
              >
                {competitorOverrideSaving ? "Saving..." : "Save"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog
        open={jsonInspectorOpen}
        onOpenChange={(_, data) => {
          if (!data.open) closeJsonInspector();
        }}
      >
        <DialogSurface className={styles.jsonDialog}>
          <DialogBody className={styles.jsonDialogBody}>
            <DialogTitle>
              {jsonInspectorTarget
                ? `${jsonInspectorTarget.badge} JSON`
                : "JSON Inspector"}
            </DialogTitle>
            <DialogContent className={styles.jsonDialogContent}>
              <div className={styles.jsonTabsRow}>
                <Button
                  size="small"
                  appearance={jsonInspectorTab === "readable" ? "primary" : "outline"}
                  onClick={() => setJsonInspectorTab("readable")}
                >
                  Readable Version
                </Button>
                <Button
                  size="small"
                  appearance={jsonInspectorTab === "raw" ? "primary" : "outline"}
                  onClick={() => setJsonInspectorTab("raw")}
                >
                  Raw JSON
                </Button>
              </div>
              {jsonInspectorError ? (
                <MessageBar intent="error">{jsonInspectorError}</MessageBar>
              ) : null}
              {jsonInspectorLoading ? (
                <Spinner />
              ) : (
                <div className={styles.jsonEditorWrap}>
                  {jsonInspectorTab === "readable" ? (
                    <div className={styles.jsonReadableWrap}>
                      {!jsonReadableItem ? (
                        <>
                          <Text className={styles.cardMeta}>
                            Unable to parse JSON into a readable form. Use Raw JSON.
                          </Text>
                          <div className={styles.jsonRawWrap}>
                            <textarea
                              value={jsonInspectorText}
                              onChange={(event) => {
                                setJsonInspectorText(event.target.value);
                                setJsonInspectorReadableText(event.target.value);
                              }}
                              className={styles.jsonNativeTextarea}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={styles.jsonReadableGrid}>
                            <Field label="SKU" className={styles.jsonFieldCompact}>
                              <Input
                                value={String((jsonReadableItem as any)?.sku ?? "")}
                                onChange={(_, data) =>
                                  updateJsonReadableItemField("sku", data.value)
                                }
                              />
                            </Field>
                            <Field label="1688 URL" className={styles.jsonFieldCompact}>
                              <Input
                                value={String((jsonReadableItem as any)?.url_1688 ?? "")}
                                onChange={(_, data) =>
                                  updateJsonReadableItemField("url_1688", data.value)
                                }
                              />
                            </Field>
                            <Field label="Main 1688 Image URL" className={styles.jsonFieldCompact}>
                              <Input
                                value={String((jsonReadableItem as any)?.main_image_1688 ?? "")}
                                onChange={(_, data) =>
                                  updateJsonReadableItemField("main_image_1688", data.value)
                                }
                              />
                            </Field>
                            <Field label="Competitor URL" className={styles.jsonFieldCompact}>
                              <Input
                                value={String(
                                  (jsonReadableItem as any)?.competitor_data?.source_url ?? ""
                                )}
                                onChange={(_, data) => {
                                  const next = {
                                    ...((jsonReadableItem as any)?.competitor_data || {}),
                                    source_url: data.value,
                                  };
                                  updateJsonReadableItemField("competitor_data", next);
                                }}
                              />
                            </Field>
                            <Field label="Competitor Title" className={styles.jsonFieldCompact}>
                              <Input
                                value={String(
                                  (jsonReadableItem as any)?.competitor_data?.title ??
                                    (jsonReadableItem as any)?.title_competitor ??
                                    ""
                                )}
                                onChange={(_, data) => {
                                  const next = {
                                    ...((jsonReadableItem as any)?.competitor_data || {}),
                                    title: data.value,
                                  };
                                  updateJsonReadableItemField("competitor_data", next);
                                }}
                              />
                            </Field>
                            <Field label="1688 Readable Text" className={styles.jsonFieldCompact}>
                              <Textarea
                                value={String((jsonReadableItem as any)?.readable_1688 ?? "")}
                                onChange={(_, data) =>
                                  updateJsonReadableItemField("readable_1688", data.value)
                                }
                                resize="vertical"
                                rows={8}
                                className={styles.jsonReadableMono}
                              />
                            </Field>
                            <Field label="Competitor Description" className={styles.jsonFieldCompact}>
                              <Textarea
                                value={String(
                                  (jsonReadableItem as any)?.competitor_data?.description ??
                                    ""
                                )}
                                onChange={(_, data) => {
                                  const next = {
                                    ...((jsonReadableItem as any)?.competitor_data || {}),
                                    description: data.value,
                                  };
                                  updateJsonReadableItemField("competitor_data", next);
                                }}
                                resize="vertical"
                                rows={8}
                                className={styles.jsonReadableMono}
                              />
                            </Field>
                          </div>
                          <div className={styles.jsonLinkGrid}>
                            <div className={mergeClasses(styles.jsonLinksPanel, styles.jsonLinksPanelTall)}>
                              <Text className={styles.jsonLinksTitle}>
                                1688 Images ({jsonReadableDetails.imageUrls1688.length})
                              </Text>
                              {jsonReadableDetails.imageUrls1688.length > 0 ? (
                                jsonReadableDetails.imageUrls1688.map((url) => (
                                  <a
                                    key={url}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.jsonLink}
                                  >
                                    {url}
                                  </a>
                                ))
                              ) : (
                                <Text className={styles.jsonReadableSectionText}>No links found.</Text>
                              )}
                            </div>
                            <div className={mergeClasses(styles.jsonLinksPanel, styles.jsonLinksPanelTall)}>
                              <Text className={styles.jsonLinksTitle}>
                                Variant Images ({jsonReadableDetails.variantImageUrls.length})
                              </Text>
                              {jsonReadableDetails.variantImageUrls.length > 0 ? (
                                jsonReadableDetails.variantImageUrls.map((url) => (
                                  <a
                                    key={url}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.jsonLink}
                                  >
                                    {url}
                                  </a>
                                ))
                              ) : (
                                <Text className={styles.jsonReadableSectionText}>No links found.</Text>
                              )}
                            </div>
                            <div className={mergeClasses(styles.jsonLinksPanel, styles.jsonLinksPanelTall)}>
                              <Text className={styles.jsonLinksTitle}>
                                Supplementary Images ({jsonReadableDetails.supplementaryImageUrls.length})
                              </Text>
                              {jsonReadableDetails.supplementaryImageUrls.length > 0 ? (
                                jsonReadableDetails.supplementaryImageUrls.map((url) => (
                                  <a
                                    key={url}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.jsonLink}
                                  >
                                    {url}
                                  </a>
                                ))
                              ) : (
                                <Text className={styles.jsonReadableSectionText}>No links found.</Text>
                              )}
                            </div>
                            <div className={mergeClasses(styles.jsonLinksPanel, styles.jsonLinksPanelTall)}>
                              <Text className={styles.jsonLinksTitle}>
                                Competitor Images ({jsonReadableDetails.competitorImageUrls.length})
                              </Text>
                              {jsonReadableDetails.competitorImageUrls.length > 0 ? (
                                jsonReadableDetails.competitorImageUrls.map((url) => (
                                  <a
                                    key={url}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.jsonLink}
                                  >
                                    {url}
                                  </a>
                                ))
                              ) : (
                                <Text className={styles.jsonReadableSectionText}>No links found.</Text>
                              )}
                            </div>
                          </div>
                          <div className={styles.jsonReadableSection}>
                            <Text className={styles.jsonReadableSectionHeader}>
                              Variant Combinations ({jsonReadableDetails.variantCombos.length})
                            </Text>
                            {jsonReadableDetails.variantCombos.length > 0 ? (
                              jsonReadableDetails.variantCombos.map((combo, index) => {
                                const labelZh = [combo.t1_zh, combo.t2_zh, combo.t3_zh]
                                  .filter((entry) => typeof entry === "string" && entry.trim())
                                  .join(" / ");
                                const labelEn = [combo.t1_en, combo.t2_en, combo.t3_en]
                                  .filter((entry) => typeof entry === "string" && entry.trim())
                                  .join(" / ");
                                const fallback = [combo.t1, combo.t2, combo.t3]
                                  .filter((entry) => typeof entry === "string" && entry.trim())
                                  .join(" / ");
                                const price =
                                  typeof combo.priceRaw === "string" && combo.priceRaw.trim()
                                    ? combo.priceRaw
                                    : typeof combo.price === "number"
                                      ? `¥${combo.price}`
                                      : "-";
                                return (
                                  <Text key={`${index}:${fallback}`} className={styles.jsonReadableSectionText}>
                                    {labelZh || fallback || "-"}
                                    {labelEn ? ` · ${labelEn}` : ""}
                                    {` · ${price}`}
                                  </Text>
                                );
                              })
                            ) : (
                              <Text className={styles.jsonReadableSectionText}>No variants found.</Text>
                            )}
                          </div>
                          <div className={styles.jsonLinksPanel}>
                            <Text className={styles.jsonLinksTitle}>
                              All Detected URLs ({jsonReadableDetails.detectedLinks.length})
                            </Text>
                            {jsonReadableDetails.detectedLinks.length > 0 ? (
                              jsonReadableDetails.detectedLinks.map((url) => (
                                <a
                                  key={url}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={styles.jsonLink}
                                >
                                  {url}
                                </a>
                              ))
                            ) : (
                              <Text className={styles.jsonReadableSectionText}>No links found.</Text>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className={styles.jsonRawWrap}>
                      <textarea
                        value={jsonInspectorText}
                        onChange={(event) => {
                          setJsonInspectorText(event.target.value);
                          setJsonInspectorReadableText(event.target.value);
                        }}
                        className={styles.jsonNativeTextarea}
                      />
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
            <DialogActions className={styles.jsonDialogActions}>
              <Button appearance="secondary" onClick={closeJsonInspector}>
                {t("production.suppliers.close")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleSaveJsonInspector}
                disabled={jsonInspectorLoading || jsonInspectorSaving}
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
