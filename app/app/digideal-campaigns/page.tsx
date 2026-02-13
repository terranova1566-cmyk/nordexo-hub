"use client";

import {
  Badge,
  Checkbox,
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
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/components/i18n-provider";

type DigidealItem = {
  product_id: string;
  identical_spu: string | null;
  digideal_group_id?: string | null;
  digideal_group_count?: number | null;
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
  google_taxonomy_id?: number | null;
  google_taxonomy_path?: string | null;
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
  supplier_locked?: boolean | null;
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
  supplier_variant_available_count?: number | null;
  supplier_variant_selected_count?: number | null;
  supplier_variant_packs_text?: string | null;
  shipping_cost: number | null;
  estimated_rerun_price: number | null;
  report_exists: boolean;
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

type DigidealResponse = {
  items: DigidealItem[];
  page: number;
  pageSize: number;
  total: number;
  error?: string;
};

type DigidealView = {
  id: string;
  name: string;
  created_at: string | null;
  item_count: number;
};

type SellerOption = {
  seller_name: string;
  product_count: number;
};

type CategoryNode = {
  name: string;
  children: CategoryNode[];
};

type CategorySelection = {
  level: "l1" | "l2" | "l3";
  // Value is a Google taxonomy prefix path. Example:
  // - l1: "Home & Garden"
  // - l2: "Home & Garden > Lighting"
  // - l3: "Home & Garden > Lighting > Lamps"
  value: string;
};

type CatalogProduct = {
  id: string;
  spu: string | null;
  title: string | null;
  brand: string | null;
  vendor: string | null;
  thumbnail_url: string | null;
  small_image_url: string | null;
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

const TrashIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    aria-hidden="true"
    focusable="false"
    className={className}
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
  topActions: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "flex-end",
    gap: "8px",
    flexWrap: "wrap",
  },
  bottomRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: "12px",
  },
  searchInput: {
    width: "260px",
    maxWidth: "100%",
    fontSize: tokens.fontSizeBase300,
    "& input": {
      fontSize: tokens.fontSizeBase300,
    },
  },
  inlineFilterRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
  },
  inlineNumberInput: {
    width: "110px",
    maxWidth: "100%",
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
  filterFieldNarrow: {
    minWidth: "150px",
  },
  dropdownCompact: {
    minWidth: "unset",
    width: "auto",
    maxWidth: "100%",
  },
  rangeButton: {
    minWidth: "180px",
    justifyContent: "space-between",
    fontWeight: tokens.fontWeightRegular,
  },
  filterButtonText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rangePopover: {
    padding: "12px",
    minWidth: "220px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  rangeActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "4px",
  },
  categoryTrigger: {
    justifyContent: "space-between",
    width: "100%",
    textAlign: "left",
    fontWeight: tokens.fontWeightRegular,
    minWidth: "240px",
  },
  categoryPopover: {
    padding: "12px",
    minWidth: "660px",
    maxWidth: "860px",
  },
  viewsTrigger: {
    justifyContent: "space-between",
    width: "100%",
    textAlign: "left",
    fontWeight: tokens.fontWeightRegular,
    minWidth: "200px",
  },
  viewsPopover: {
    padding: "10px",
    minWidth: "320px",
    maxWidth: "420px",
  },
  viewsList: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  viewsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    width: "100%",
  },
  viewsOption: {
    border: "none",
    background: "transparent",
    padding: "6px 8px",
    borderRadius: "6px",
    cursor: "pointer",
    textAlign: "left",
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: tokens.colorNeutralForeground1,
    transition: "background-color 0.12s ease",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  viewsOptionActive: {
    backgroundColor: tokens.colorNeutralBackground3,
    fontWeight: tokens.fontWeightSemibold,
  },
  viewDeleteIconButton: {
    border: "none",
    background: "transparent",
    width: "28px",
    height: "28px",
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "6px",
    cursor: "pointer",
    color: tokens.colorNeutralForeground3,
    transition: "background-color 0.12s ease, color 0.12s ease",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground3,
      color: tokens.colorStatusDangerBorder1,
    },
  },
  deletePromptRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    width: "100%",
  },
  deletePromptActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  deleteDangerButton: {
    border: `1px solid ${tokens.colorStatusDangerBorder1}`,
    color: tokens.colorStatusDangerBorder1,
    backgroundColor: tokens.colorNeutralBackground1,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  createViewDialogSurface: {
    minWidth: "380px",
    maxWidth: "520px",
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
  sellerPopover: {
    padding: "12px",
    minWidth: "260px",
    maxWidth: "360px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  sellerList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    maxHeight: "340px",
    overflowY: "auto",
    paddingRight: "4px",
  },
  sellerActions: {
    display: "flex",
    justifyContent: "flex-end",
  },
  fieldLabelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  supplierShowLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    color: tokens.colorBrandForeground1,
    textDecorationLine: "none",
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase100,
    "&:hover": {
      textDecorationLine: "underline",
    },
  },
  externalLinkIcon: {
    width: "14px",
    height: "14px",
    flexShrink: 0,
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
  priceMatchRow: {
    backgroundColor: "#fffdef",
    "& .fui-TableCell": {
      backgroundColor: "#fffdef",
    },
    "&:hover": {
      backgroundColor: "#fff4d6",
    },
    "&:hover .fui-TableCell": {
      backgroundColor: "#fff4d6",
    },
  },
  imageCol: {
    width: "158px",
    paddingLeft: "8px",
    paddingRight: 0,
    boxSizing: "border-box",
  },
  productCol: {
    minWidth: "420px",
    width: "420px",
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
    minWidth: "90px",
    width: "90px",
    maxWidth: "90px",
  },
  linkCol: {
    minWidth: "90px",
    width: "90px",
    maxWidth: "90px",
  },
  estimatedPriceCol: {
    minWidth: "200px",
  },
  linkedProductCol: {
    minWidth: "180px",
  },
  optimizeCol: {
    // Slightly narrower to free up space for the product/title column.
    width: "84px",
    minWidth: "84px",
    maxWidth: "84px",
  },
  selectCol: {
    width: "54px",
    minWidth: "54px",
    maxWidth: "54px",
    paddingLeft: "8px",
    paddingRight: "8px",
    textAlign: "center",
  },
  selectCheckboxWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  checkboxWhite: {
    "& input:not(:checked) ~ .fui-Checkbox__indicator": {
      // Fluent UI Checkbox uses a CSS variable for the indicator fill.
      "--fui-Checkbox__indicator--backgroundColor": "#ffffff",
    } as any,
  },
  linkedProductStack: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "6px",
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
  linkButton: {
    backgroundColor: tokens.colorNeutralBackground1,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  supplierAddButton: {
    backgroundColor: "#ffe480",
    border: "1px solid #e0c666",
    "&:hover": {
      backgroundColor: "#f5db70",
      border: "1px solid #d2ba5f",
    },
    "&:active": {
      backgroundColor: "#edd36a",
      border: "1px solid #c8b255",
    },
  },
  supplierActionSplit: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  },
  supplierSplitCaretButton: {
    minWidth: "32px",
    paddingInline: "6px",
  },
  supplierSplitCaretIcon: {
    width: "14px",
    height: "14px",
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
  estimatedPriceBadge: {
    borderRadius: "999px",
    paddingInline: "8px",
    paddingBlock: "2px",
    border: "1px solid #2e7d32",
    color: "#2e7d32",
    backgroundColor: "#dfffd4",
    opacity: 1,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    "&.fui-Badge": {
      backgroundColor: "#dfffd4",
      opacity: 1,
    },
    "&.fui-Badge--outline": {
      backgroundColor: "#dfffd4",
      opacity: 1,
    },
    fontWeight: tokens.fontWeightSemibold,
  },
  estimatedPriceBadgeSlot: {
    width: "10ch",
    display: "flex",
    justifyContent: "flex-start",
  },
  estimatedPriceRow: {
    // Keep edit buttons aligned while keeping the badge tight.
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "4px",
  },
  estimatedPriceActionRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
  supplierStatusInline: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase100,
  },
  supplierStatusItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    whiteSpace: "nowrap",
  },
  supplierStatusOk: {
    color: "#1b851a",
    fontWeight: tokens.fontWeightSemibold,
  },
  supplierStatusFail: {
    color: "#b42318",
    fontWeight: tokens.fontWeightSemibold,
  },
  supplierInlineLoaderIcon: {
    width: "12px",
    height: "12px",
    animationName: {
      "0%": { transform: "rotate(0deg)" },
      "100%": { transform: "rotate(360deg)" },
    },
    animationDuration: "1s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
  supplierSearchDialog: {
    width: "min(980px, 94vw)",
    maxWidth: "min(980px, 94vw)",
  },
  supplierSearchContent: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  supplierSearchHeaderRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "8px",
  },
  supplierSearchTitle: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  supplierSearchRows: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "62vh",
    overflowY: "auto",
    paddingRight: "4px",
  },
  supplierSearchError: {
    marginBottom: "4px",
  },
  supplierRow: {
    display: "grid",
    gridTemplateColumns: "96px minmax(0, 1fr)",
    gap: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    padding: "8px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  supplierRowClickable: {
    cursor: "pointer",
    transition: "background-color 120ms ease, border-color 120ms ease",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
      border: `1px solid ${tokens.colorNeutralStroke1}`,
    },
  },
  supplierRowSelected: {
    backgroundColor: "#eaf4ff",
    border: "1px solid #0f6cbd",
  },
  supplierThumb: {
    width: "96px",
    height: "96px",
    borderRadius: "8px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  supplierMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: 0,
  },
  supplierTitle: {
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    color: tokens.colorNeutralForeground1,
    wordBreak: "break-word",
  },
  supplierTitleEn: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    color: tokens.colorNeutralForeground3,
    wordBreak: "break-word",
  },
  supplierMetaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  supplierMetaItem: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    whiteSpace: "nowrap",
  },
  supplierLinkRow: {
    display: "flex",
    alignItems: "center",
  },
  supplierMetaLink: {
    fontSize: tokens.fontSizeBase200,
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    color: tokens.colorBrandForeground1,
    textDecorationLine: "none",
    "&:hover": {
      textDecorationLine: "underline",
    },
  },
  supplierExternalIcon: {
    width: "14px",
    height: "14px",
  },
  variantsDialog: {
    width: "min(1080px, 95vw)",
    maxWidth: "min(1080px, 95vw)",
  },
  variantsDialogBody: {
    maxHeight: "86vh",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  variantsHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },
  variantsTitleStack: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  variantsTitleText: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  variantsTitleLink: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    textDecorationLine: "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    "&:hover": {
      color: tokens.colorBrandForeground1,
      textDecorationLine: "underline",
    },
  },
  variantsTopActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  variantsListWrap: {
    overflow: "auto",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "8px",
    maxHeight: "48vh",
  },
  variantsListTable: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
    "& th, & td": {
      borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    },
  },
  variantsListHeadCell: {
    textAlign: "left",
    padding: "8px",
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: tokens.colorNeutralBackground2,
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  variantsListCell: {
    padding: "8px",
    verticalAlign: "middle",
    fontSize: tokens.fontSizeBase200,
  },
  variantsRowClickable: {
    cursor: "pointer",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  variantImageCellWrap: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  variantImageThumb: {
    width: "44px",
    height: "44px",
    objectFit: "cover",
    borderRadius: "6px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    display: "block",
  },
  variantImagePopoverSurface: {
    padding: "6px",
    borderRadius: "8px",
  },
  variantImageZoomWrap: {
    width: "250px",
    height: "250px",
    borderRadius: "6px",
    overflow: "hidden",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  variantImageZoom: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },
  variantLabelCell: {
    minWidth: 0,
  },
  variantValueWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  variantValueZh: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    wordBreak: "break-word",
  },
  variantValueEn: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    wordBreak: "break-word",
  },
  variantsPacksField: {
    marginTop: "8px",
  },
  variantsDialogActions: {
    justifyContent: "flex-end",
  },
  estimatedPriceEditButton: {
    minWidth: "unset",
    paddingInline: "8px",
    marginLeft: "0px",
  },
  supplierDialog: {
    minWidth: "420px",
    maxWidth: "520px",
  },
  linkedDialogSurface: {
    // Target: ~70% viewport width so the dialog doesn't feel fullscreen, but
    // still leaves room for the right-side results list.
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
    gridTemplateColumns: "480px minmax(0, 1fr)",
    gap: "16px",
    flex: "1 1 auto",
    minHeight: 0,
  },
  linkedLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minHeight: 0,
  },
  linkedRight: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minHeight: 0,
  },
  linkedActionsBar: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
  },
  linkedHeroFrame: {
    width: "100%",
    borderRadius: "14px",
    padding: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  linkedHeroImage: {
    width: "100%",
    maxHeight: "220px",
    objectFit: "contain",
    backgroundColor: "transparent",
    borderRadius: "10px",
  },
  linkedSupplementGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 150px)",
    gap: "10px",
    justifyContent: "start",
  },
  linkedSupplementFrame: {
    width: "150px",
    height: "150px",
    borderRadius: "14px",
    overflow: "hidden",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  linkedSupplementImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    backgroundColor: "transparent",
  },
  linkedHeaderTitle: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase300,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
  },
  linkedCurrentBox: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "12px",
    padding: "10px 12px",
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  linkedCurrentLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground4,
  },
  linkedCurrentLink: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    textDecorationLine: "none",
    "&:hover": {
      textDecorationLine: "underline",
    },
  },
  linkedHeaderMeta: {
    display: "grid",
    gridTemplateColumns: "auto auto",
    gap: "4px 12px",
    justifyItems: "end",
    alignItems: "center",
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground4,
    whiteSpace: "nowrap",
  },
  linkedDivider: {
    height: "1px",
    backgroundColor: tokens.colorNeutralStroke2,
    marginTop: "4px",
  },
  linkedManualRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: "10px",
    flexWrap: "wrap",
  },
  linkedManualInput: {
    minWidth: "240px",
    flex: "1 1 240px",
  },
  linkedResultsWrap: {
    flex: "1 1 auto",
    overflowY: "auto",
    overflowX: "visible",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    minHeight: 0,
  },
  linkedResultRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 14px",
    minHeight: "84px",
    width: "100%",
    background: "transparent",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    transition: "background-color 0.12s ease",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  linkedResultRowSelected: {
    backgroundColor: tokens.colorBrandBackground2,
    "&:hover": {
      backgroundColor: tokens.colorBrandBackground2,
    },
  },
  linkedResultImageWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    "&:hover .linkedPreviewLayer": {
      opacity: 1,
      transform: "translateY(0)",
    },
    "&:focus-within .linkedPreviewLayer": {
      opacity: 1,
      transform: "translateY(0)",
    },
  },
  linkedPreviewLayer: {
    position: "absolute",
    left: "calc(100% + 12px)",
    top: 0,
    zIndex: 1000,
    opacity: 0,
    transform: "translateY(-4px)",
    transition: "opacity 120ms ease, transform 120ms ease",
    pointerEvents: "none",
  },
  linkedPreviewBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow16,
  },
  linkedPreviewImage: {
    width: "300px",
    height: "300px",
    objectFit: "contain",
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: "10px",
  },
  linkedResultImage: {
    width: "66px",
    height: "66px",
    borderRadius: "12px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground2,
    flex: "0 0 auto",
  },
  linkedResultText: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
    flex: "1 1 auto",
  },
  linkedResultPrimary: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    lineHeight: tokens.lineHeightBase200,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  linkedResultSecondary: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground4,
    lineHeight: tokens.lineHeightBase100,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  linkedResultSku: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase100,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  linkedResultSpu: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground4,
    fontWeight: tokens.fontWeightSemibold,
    flex: "0 0 auto",
    whiteSpace: "nowrap",
  },
  supplierHeroFrame: {
    width: "100%",
    borderRadius: "12px",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  supplierHeroImage: {
    width: "100%",
    height: "240px",
    objectFit: "cover",
    display: "block",
  },
  supplierDialogContent: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    paddingBottom: "8px",
  },
  supplierDialogTitle: {
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase300,
  },
  supplierDialogMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  supplierDetailRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
  },
  supplierDetailHalf: {
    flex: 1,
    minWidth: 0,
  },
  cellStack: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  productCellStack: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  metaStack: {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
  },
  metaInlineRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "10px",
    flexWrap: "wrap",
  },
  rerunLinkRow: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: "6px",
    flexWrap: "wrap",
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
  groupIdLink: {
    backgroundColor: "transparent",
    border: "none",
    padding: "0px",
    margin: "0px",
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    color: tokens.colorBrandForeground1,
    cursor: "pointer",
    textDecorationLine: "none",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    fontWeight: "inherit",
    verticalAlign: "baseline",
    "&:hover": {
      textDecorationLine: "underline",
    },
    "&:focus-visible": {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "2px",
      borderRadius: "4px",
    },
  },
  rerunCountLink: {
    color: "#257d1c",
  },
  groupIdLabel: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    color: tokens.colorNeutralForeground4,
    whiteSpace: "nowrap",
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
    justifyContent: "flex-start",
    textAlign: "left",
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
    // Solid fill so the badge stays readable even when row background colors change.
    backgroundColor: "#ffffff",
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
    backgroundColor: "#ffffff",
    "&.fui-Badge": {
      backgroundColor: "#ffffff",
    },
    "&.fui-Badge--outline": {
      backgroundColor: "#ffffff",
    },
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
  const [categorySelections, setCategorySelections] = useState<CategorySelection[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<CategorySelection[]>([]);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [activeL1, setActiveL1] = useState<string | null>(null);
  const [activeL2, setActiveL2] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [views, setViews] = useState<DigidealView[]>([]);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [viewsError, setViewsError] = useState<string | null>(null);
  const [viewsPopoverOpen, setViewsPopoverOpen] = useState(false);
  const [viewIdFilter, setViewIdFilter] = useState<string | null>(null);
  const [viewsRefreshToken, setViewsRefreshToken] = useState(0);
  const [createViewDialogOpen, setCreateViewDialogOpen] = useState(false);
  const [createViewName, setCreateViewName] = useState("");
  const [createViewSaving, setCreateViewSaving] = useState(false);
  const [createViewError, setCreateViewError] = useState<string | null>(null);
  const [pendingViewProductIds, setPendingViewProductIds] = useState<string[]>([]);
  const [firstSeenFrom, setFirstSeenFrom] = useState("");
  const [firstSeenTo, setFirstSeenTo] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("first_seen_desc");
  const [minSoldMetric, setMinSoldMetric] = useState("sold_all_time");
  const [minSold, setMinSold] = useState("");
  const [inactiveMode, setInactiveMode] = useState("any");
  const [inactiveDays, setInactiveDays] = useState("");
  const [groupIdFilter, setGroupIdFilter] = useState<string | null>(null);
  // Empty = no seller filtering (all sellers).
  const [sellerFilters, setSellerFilters] = useState<string[]>([]);
  const [sellerPopoverOpen, setSellerPopoverOpen] = useState(false);
  const [sellerDraft, setSellerDraft] = useState<Set<string>>(new Set());
  const [priceMatch, setPriceMatch] = useState("all");
  const [sellerOptions, setSellerOptions] = useState<SellerOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRerunDialogOpen, setIsRerunDialogOpen] = useState(false);
  const [rerunComment, setRerunComment] = useState("");
  const [rerunTargetTitle, setRerunTargetTitle] = useState<string | null>(null);
  const [rerunTargetIds, setRerunTargetIds] = useState<string[]>([]);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [hoveredRemoveId, setHoveredRemoveId] = useState<string | null>(null);
  const [isRerunSaving, setIsRerunSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
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
  const [supplierSearchDialogOpen, setSupplierSearchDialogOpen] = useState(false);
  const [supplierSearchTarget, setSupplierSearchTarget] = useState<DigidealItem | null>(null);
  const [supplierOffers, setSupplierOffers] = useState<SupplierOffer[]>([]);
  const [supplierSearchLoading, setSupplierSearchLoading] = useState(false);
  const [supplierSearchError, setSupplierSearchError] = useState<string | null>(null);
  const [supplierSelectedOfferId, setSupplierSelectedOfferId] = useState("");
  const [supplierSelected, setSupplierSelected] = useState<SupplierSelection | null>(null);
  const [supplierSearchSaving, setSupplierSearchSaving] = useState(false);
  const [supplierLockedUrl, setSupplierLockedUrl] = useState<string | null>(null);
  const [supplierTranslating, setSupplierTranslating] = useState(false);
  const [supplierPriceSortDir, setSupplierPriceSortDir] = useState<"asc" | "desc" | null>(null);
  const [variantsDialogOpen, setVariantsDialogOpen] = useState(false);
  const [variantsTarget, setVariantsTarget] = useState<DigidealItem | null>(null);
  const [variantsCombos, setVariantsCombos] = useState<VariantCombo[]>([]);
  const [variantsSelectedIndexes, setVariantsSelectedIndexes] = useState<Set<number>>(
    () => new Set()
  );
  const [variantsPacksText, setVariantsPacksText] = useState("");
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsSaving, setVariantsSaving] = useState(false);
  const [variantsError, setVariantsError] = useState<string | null>(null);
  const [variantImagePreviewIndex, setVariantImagePreviewIndex] = useState<number | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [linkedDialogOpen, setLinkedDialogOpen] = useState(false);
  const [linkedTarget, setLinkedTarget] = useState<DigidealItem | null>(null);
  const [linkedResults, setLinkedResults] = useState<CatalogProduct[]>([]);
  const [linkedSelectedId, setLinkedSelectedId] = useState<string | null>(null);
  const [linkedManualSpu, setLinkedManualSpu] = useState("");
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [linkedSaving, setLinkedSaving] = useState(false);
  const [linkedError, setLinkedError] = useState<string | null>(null);

  const openRerunDialog = (title: string, productIds: string | string[]) => {
    const ids = Array.isArray(productIds) ? productIds : [productIds];
    setRerunTargetTitle(title);
    setRerunTargetIds(ids.filter(Boolean));
    setRerunComment("");
    setIsRerunDialogOpen(true);
  };

  const closeRerunDialog = () => {
    setIsRerunDialogOpen(false);
    setRerunTargetIds([]);
  };

  const selectedCount = selectedIds.size;

  const selectableIds = useMemo(
    () =>
      items
        .filter(
          (item) =>
            !String(item.seller_name ?? "")
              .trim()
              .toLowerCase()
              .includes("nordexo")
        )
        .map((item) => item.product_id)
        .filter(Boolean),
    [items]
  );

  const selectAllState = useMemo(() => {
    if (selectableIds.length === 0) return false;
    let selectedVisible = 0;
    for (const id of selectableIds) {
      if (selectedIds.has(id)) selectedVisible += 1;
    }
    if (selectedVisible === 0) return false;
    if (selectedVisible === selectableIds.length) return true;
    return "mixed" as const;
  }, [selectedIds, selectableIds]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(selectableIds);
      const next = new Set(Array.from(prev).filter((id) => allowed.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectableIds]);

  const toggleRowSelected = useCallback((productId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(productId);
      } else {
        next.delete(productId);
      }
      return next;
    });
  }, []);

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

  const closeSupplierSearchDialog = useCallback(() => {
    setSupplierSearchDialogOpen(false);
    setSupplierSearchTarget(null);
    setSupplierOffers([]);
    setSupplierSearchLoading(false);
    setSupplierSearchError(null);
    setSupplierSelectedOfferId("");
    setSupplierSelected(null);
    setSupplierSearchSaving(false);
    setSupplierLockedUrl(null);
    setSupplierTranslating(false);
    setSupplierPriceSortDir(null);
  }, []);

  const closeVariantsDialog = useCallback(() => {
    setVariantsDialogOpen(false);
    setVariantsTarget(null);
    setVariantsCombos([]);
    setVariantsSelectedIndexes(new Set());
    setVariantsPacksText("");
    setVariantsLoading(false);
    setVariantsSaving(false);
    setVariantsError(null);
    setVariantImagePreviewIndex(null);
  }, []);

  const hasCjk = useCallback((value: string) => /[\u3400-\u9fff]/.test(value), []);

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

  const normalizeSupplierImageUrl = useCallback((value: string | null | undefined) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.startsWith("//")) return `https:${raw}`;
    if (/^https?:\/\//i.test(raw)) return raw;
    return raw;
  }, []);

  const formatRmb = useCallback((value: number | null | undefined) => {
    if (!Number.isFinite(value as number)) return null;
    return `¥${Number(value).toFixed(2)}`;
  }, []);

  const normalizeOfferPrice = useCallback((value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const textRaw = String(value).trim();
    if (!textRaw) return null;
    const text = textRaw.replace(/[^0-9.,-]/g, "");
    if (!text) return null;
    const hasDecimalSeparator = text.includes(".") || text.includes(",");
    const normalizedText = text.includes(",") && !text.includes(".")
      ? text.replace(",", ".")
      : text.replace(/,/g, "");
    const raw = Number(normalizedText);
    if (!Number.isFinite(raw)) return null;
    if (!hasDecimalSeparator && Number.isInteger(raw) && raw >= 100 && raw <= 100000) {
      return raw / 100;
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

  const pickOfferPriceRmbNumber = useCallback(
    (offer: SupplierOffer): number | null => {
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
    },
    [normalizeOfferPrice]
  );

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
      const price = pickOfferPriceRmb(offer);
      return { price, sold, moq, location };
    },
    [pickOfferPriceRmb]
  );

  const openSupplierSearchDialog = useCallback(
    async (item: DigidealItem) => {
      setSupplierSearchTarget(item);
      setSupplierSearchDialogOpen(true);
      setSupplierSearchError(null);
      setSupplierOffers([]);
      setSupplierSelectedOfferId("");
      setSupplierSelected(null);
      setSupplierSearchLoading(true);
      setSupplierSearchSaving(false);
      setSupplierLockedUrl(null);
      setSupplierTranslating(false);
      setSupplierPriceSortDir(null);
      try {
        const params = new URLSearchParams({
          provider: "digideal",
          product_id: item.product_id,
        });
        const imageUrls = normalizeImageUrls(item.image_urls);
        const imageUrl = item.primary_image_url || imageUrls[0] || null;
        if (imageUrl) params.set("image_url", imageUrl);

        const response = await fetch(`/api/production/suppliers?${params.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load supplier suggestions.");
        }

        const offers = Array.isArray(payload?.offers) ? payload.offers : [];
        setSupplierOffers(offers);
        const selectedPayload = payload?.selected ?? null;
        const selectedOfferId =
          typeof selectedPayload?.selected_offer_id === "string"
            ? String(selectedPayload.selected_offer_id)
            : "";
        setSupplierSelectedOfferId(selectedOfferId);
        setSupplierSelected(
          selectedPayload && typeof selectedPayload === "object"
            ? {
                provider: "digideal",
                product_id: item.product_id,
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
        const lockedUrl =
          typeof payload?.locked_supplier_url === "string" && payload.locked_supplier_url.trim()
            ? payload.locked_supplier_url.trim()
            : null;
        setSupplierLockedUrl(lockedUrl);

        const needsTranslation = offers.some((offer: SupplierOffer) => {
          const subject = typeof offer?.subject === "string" ? offer.subject.trim() : "";
          const en = typeof offer?.subject_en === "string" ? offer.subject_en.trim() : "";
          return Boolean(subject) && !en;
        });
        if (needsTranslation) {
          setSupplierTranslating(true);
          fetch("/api/production/suppliers/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: "digideal",
              product_id: item.product_id,
            }),
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
            .finally(() => setSupplierTranslating(false));
        }
      } catch (err) {
        setSupplierSearchError(
          err instanceof Error ? err.message : "Unable to load supplier suggestions."
        );
      } finally {
        setSupplierSearchLoading(false);
      }
    },
    []
  );

  const handleSaveSupplierSearch = useCallback(async () => {
    if (!supplierSearchTarget) return;
    if (supplierLockedUrl) return;
    const offerId = supplierSelectedOfferId.trim();
    if (!offerId) return;

    setSupplierSearchSaving(true);
    setSupplierSearchError(null);
    try {
      const response = await fetch("/api/production/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "digideal",
          product_id: supplierSearchTarget.product_id,
          offer_id: offerId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to save supplier selection.");
      }
      closeSupplierSearchDialog();
      setRefreshToken((prev) => prev + 1);
    } catch (err) {
      setSupplierSearchError(
        err instanceof Error ? err.message : "Unable to save supplier selection."
      );
    } finally {
      setSupplierSearchSaving(false);
    }
  }, [
    closeSupplierSearchDialog,
    supplierLockedUrl,
    supplierSearchTarget,
    supplierSelectedOfferId,
  ]);

  const openVariantsDialog = useCallback(async (item: DigidealItem) => {
    setVariantsDialogOpen(true);
    setVariantsTarget(item);
    setVariantsCombos([]);
    setVariantsSelectedIndexes(new Set());
    setVariantsPacksText("");
    setVariantsLoading(true);
    setVariantsSaving(false);
    setVariantsError(null);
    setVariantImagePreviewIndex(null);
    try {
      const params = new URLSearchParams({
        provider: "digideal",
        product_id: item.product_id,
      });
      const response = await fetch(`/api/production/suppliers/variants?${params.toString()}`);
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
      const safeSelected = new Set(selectedIndexes.filter((idx) => idx < combos.length));
      const packsText =
        typeof (payload as any)?.packs_text === "string"
          ? (payload as any).packs_text
          : "";
      setVariantsCombos(combos);
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
      const response = await fetch("/api/production/suppliers/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "digideal",
          product_id: variantsTarget.product_id,
          selected_combo_indexes: selected,
          packs_text: variantsPacksText,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as any)?.error || "Unable to save variants."));
      }
      setItems((prev) =>
        prev.map((entry) =>
          entry.product_id === variantsTarget.product_id
            ? {
                ...entry,
                supplier_variant_selected_count:
                  Number.isFinite(Number((payload as any)?.selected_count))
                    ? Number((payload as any).selected_count)
                    : entry.supplier_variant_selected_count ?? null,
                supplier_variant_available_count:
                  Number.isFinite(Number((payload as any)?.available_count))
                    ? Number((payload as any).available_count)
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
  }, [closeVariantsDialog, variantsPacksText, variantsSelectedIndexes, variantsTarget]);

  const openLinkedDialog = (item: DigidealItem) => {
    setLinkedTarget(item);
    setLinkedDialogOpen(true);
    setLinkedResults([]);
    setLinkedSelectedId(null);
    setLinkedManualSpu("");
    setLinkedError(null);
  };

  const closeLinkedDialog = () => {
    setLinkedDialogOpen(false);
    setLinkedTarget(null);
    setLinkedResults([]);
    setLinkedSelectedId(null);
    setLinkedManualSpu("");
    setLinkedError(null);
    setLinkedLoading(false);
    setLinkedSaving(false);
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

  const isItemProductionActive = (item: DigidealItem) => {
    const rawStatus =
      typeof item.digideal_rerun_status === "string"
        ? item.digideal_rerun_status.trim()
        : "";
    const normalized = (rawStatus || (item.digideal_add_rerun ? "Queued" : "")).toLowerCase();
    return ["queued", "being produced", "done"].includes(normalized);
  };

  const bulkAddSelectedDirect = async () => {
    if (bulkAdding) return;
    const selected = items.filter(
      (item) =>
        selectedIds.has(item.product_id) &&
        !isItemProductionActive(item) &&
        !String(item.seller_name ?? "").trim().toLowerCase().includes("nordexo")
    );
    if (selected.length === 0) return;
    setBulkAdding(true);
    setError(null);
    const failed: string[] = [];

    for (const item of selected) {
      const ok = await addToProduction(item, { addToPipeline: true, addDirectly: true });
      if (!ok) {
        failed.push(item.product_id);
      }
    }

    setBulkAdding(false);
    setSelectedIds(new Set(failed));
    if (failed.length > 0) {
      setError(`Failed to add ${failed.length} of ${selected.length} deal(s).`);
    }
  };

  const openBulkRerunDialog = () => {
    const selected = items.filter(
      (item) =>
        selectedIds.has(item.product_id) &&
        !isItemProductionActive(item) &&
        !String(item.seller_name ?? "").trim().toLowerCase().includes("nordexo")
    );
    const ids = selected.map((item) => item.product_id).filter(Boolean);
    if (ids.length === 0) return;
    openRerunDialog(`${ids.length} selected deal(s)`, ids);
  };

  const addProductsToView = async (viewId: string, productIds: string[]) => {
    const unique = Array.from(
      new Set(productIds.map((id) => String(id ?? "").trim()).filter(Boolean))
    );
    if (!viewId || unique.length === 0) return;

    const response = await fetch("/api/digideal/views/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewId, productIds: unique }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to add items to view.");
    }

    setViewsRefreshToken((prev) => prev + 1);
  };

  const openCreateViewDialog = (productIds: string[]) => {
    setPendingViewProductIds(productIds.map((id) => String(id ?? "").trim()).filter(Boolean));
    setCreateViewName("");
    setCreateViewError(null);
    setCreateViewDialogOpen(true);
  };

  const closeCreateViewDialog = () => {
    setCreateViewDialogOpen(false);
    setCreateViewName("");
    setPendingViewProductIds([]);
    setCreateViewError(null);
  };

  const handleCreateViewSave = async () => {
    const name = createViewName.trim();
    if (!name) {
      setCreateViewError("Name is required.");
      return;
    }

    setCreateViewSaving(true);
    setCreateViewError(null);
    try {
      const response = await fetch("/api/digideal/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to create view.");
      }
      const payload = (await response.json()) as { item?: DigidealView };
      const created = payload?.item;
      if (!created?.id) {
        throw new Error("View creation failed.");
      }

      // Optimistic: add immediately, then refresh counts.
      setViews((prev) => [created, ...prev]);

      if (pendingViewProductIds.length > 0) {
        try {
          await addProductsToView(created.id, pendingViewProductIds);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to add items to view.");
        }
      } else {
        setViewsRefreshToken((prev) => prev + 1);
      }

      closeCreateViewDialog();
    } catch (err) {
      setCreateViewError(err instanceof Error ? err.message : "Failed to create view.");
    } finally {
      setCreateViewSaving(false);
    }
  };

  const handleDeleteViewConfirm = async (view: DigidealView) => {
    if (!view?.id) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        t("digideal.views.deletePrompt", {
          name: view.name,
        })
      );
      if (!ok) return;
    }
    try {
      const response = await fetch("/api/digideal/views", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: view.id }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to delete view.");
      }

      if (viewIdFilter === view.id) {
        setViewIdFilter(null);
        setPage(1);
      }

      setViewsRefreshToken((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete view.");
    }
  };

  const resetAllFilters = () => {
    setSearch("");
    setCategorySelections([]);
    setCategoryDraft([]);
    setCategoryPopoverOpen(false);
    setCategorySearch("");
    setViewIdFilter(null);
    setFirstSeenFrom("");
    setFirstSeenTo("");
    setStatus("all");
    setPriceMatch("all");
    setGroupIdFilter(null);
    setSellerFilters([]);
    setSellerPopoverOpen(false);
    setSort("first_seen_desc");
    setPage(1);
    setPageSize(25);
    setMinSoldMetric("sold_all_time");
    setMinSold("");
    setInactiveMode("any");
    setInactiveDays("");
    setSelectedIds(new Set());
    setError(null);
    setRefreshToken((prev) => prev + 1);
  };

  const handleRerunSave = async () => {
    const ids = rerunTargetIds.filter(Boolean);
    if (ids.length === 0) {
      closeRerunDialog();
      return;
    }

    setIsRerunSaving(true);
    setError(null);
    const failed: string[] = [];

    for (const productId of ids) {
      const target = items.find((entry) => entry.product_id === productId);
      if (!target) {
        failed.push(productId);
        continue;
      }
      const ok = await addToProduction(target, {
        comment: rerunComment,
        addToPipeline: true,
        addDirectly: true,
      });
      if (!ok) {
        failed.push(productId);
      }
    }

    setIsRerunSaving(false);
    if (failed.length === 0) {
      setSelectedIds(new Set());
      closeRerunDialog();
      return;
    }

    setRerunTargetIds(failed);
    setSelectedIds(new Set(failed));
    setError(`Failed to add ${failed.length} of ${ids.length} deal(s).`);
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

  const handleSupplierRemove = async () => {
    if (!supplierTarget) {
      closeSupplierDialog();
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
          remove_supplier: true,
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

  const handleLinkedSave = async () => {
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
      setLinkedError("Select a product or enter an SPU.");
      return;
    }

    setLinkedSaving(true);
    setLinkedError(null);
    try {
      const response = await fetch("/api/digideal/identical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: linkedTarget.product_id,
          identical_spu: spu,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to save linked product.");
      }

      const savedSpu = String(payload?.item?.identical_spu ?? spu).trim() || spu;
      setItems((prev) =>
        prev.map((entry) =>
          entry.product_id === linkedTarget.product_id
            ? { ...entry, identical_spu: savedSpu }
            : entry
        )
      );
      closeLinkedDialog();
      setRefreshToken((prev) => prev + 1);
    } catch (err) {
      setLinkedError(
        err instanceof Error ? err.message : "Failed to save linked product."
      );
    } finally {
      setLinkedSaving(false);
    }
  };

  const handleLinkedUnlink = async () => {
    if (!linkedTarget) {
      closeLinkedDialog();
      return;
    }
    if (!isAdmin) return;
    if (!linkedTarget.identical_spu) return;

    setLinkedSaving(true);
    setLinkedError(null);
    try {
      const response = await fetch("/api/digideal/identical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: linkedTarget.product_id,
          identical_spu: null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to unlink product.");
      }

      setItems((prev) =>
        prev.map((entry) =>
          entry.product_id === linkedTarget.product_id
            ? { ...entry, identical_spu: null }
            : entry
        )
      );
      setLinkedTarget((prev) =>
        prev ? { ...prev, identical_spu: null } : prev
      );
      setLinkedSelectedId(null);
      setLinkedManualSpu("");
      setRefreshToken((prev) => prev + 1);
    } catch (err) {
      setLinkedError(
        err instanceof Error ? err.message : "Failed to unlink product."
      );
    } finally {
      setLinkedSaving(false);
    }
  };

  const debouncedSearch = useDebouncedValue(search, 300);

  const firstSeenRangeSummary = useMemo(() => {
    if (!firstSeenFrom && !firstSeenTo) return t("products.filters.rangeAll");
    if (firstSeenFrom && firstSeenTo) return `${firstSeenFrom} - ${firstSeenTo}`;
    if (firstSeenFrom) {
      return `${t("products.filters.rangeFrom")} ${firstSeenFrom}`;
    }
    return `${t("products.filters.rangeTo")} ${firstSeenTo}`;
  }, [firstSeenFrom, firstSeenTo, t]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    categorySelections,
    firstSeenFrom,
    firstSeenTo,
    status,
    sort,
    pageSize,
    sellerFilters,
    viewIdFilter,
  ]);

  const allSellerNames = useMemo(
    () => sellerOptions.map((seller) => seller.seller_name),
    [sellerOptions]
  );

  const sellerSummary = useMemo(() => {
    if (sellerFilters.length === 0) return t("digideal.seller.all");
    if (sellerFilters.length === 1) return sellerFilters[0];
    return `${sellerFilters.length} sellers`;
  }, [sellerFilters, t]);

  const viewSummary = useMemo(() => {
    if (!viewIdFilter) return t("digideal.views.all");
    const match = views.find((view) => view.id === viewIdFilter);
    if (!match) return t("digideal.views.all");
    return `${match.name} (${match.item_count ?? 0})`;
  }, [viewIdFilter, views, t]);

  const buildCategoryParam = (selections: CategorySelection[]) => {
    if (selections.length === 0) return null;
    return selections
      .map((selection) => `${selection.level}:${selection.value}`)
      .join("|");
  };

  const categorySummary =
    categorySelections.length === 0
      ? t("discovery.categories.all")
      : categorySelections.length <= 2
        ? categorySelections
            .map((item) => {
              const tokens = String(item.value ?? "")
                .split(">")
                .map((token) => token.trim())
                .filter(Boolean);
              return tokens[tokens.length - 1] ?? item.value;
            })
            .join(", ")
        : t("discovery.categories.selectedCount", {
            count: categorySelections.length,
          });

  const draftKeys = new Set(
    categoryDraft.map((item) => `${item.level}:${item.value}`)
  );

  const toggleDraftCategory = (level: "l1" | "l2" | "l3", value: string) => {
    setCategoryDraft((prev) => {
      const exists = prev.some((item) => item.level === level && item.value === value);
      if (exists) {
        return prev.filter((item) => !(item.level === level && item.value === value));
      }
      return [...prev, { level, value }];
    });
  };

  const clearCategory = () => {
    setCategoryDraft([]);
    setCategorySelections([]);
  };

  useEffect(() => {
    if (categoryPopoverOpen) {
      setCategoryDraft(categorySelections);
    }
  }, [categoryPopoverOpen, categorySelections]);

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
    if (!sellerPopoverOpen) return;
    const base = sellerFilters.length > 0 ? sellerFilters : allSellerNames;
    setSellerDraft(new Set(base));
  }, [sellerPopoverOpen, sellerFilters, allSellerNames]);

  const applySellerFilters = () => {
    const selected = Array.from(sellerDraft)
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    const unique = Array.from(new Set(selected));

    if (unique.length === 0 || unique.length === allSellerNames.length) {
      setSellerFilters([]);
    } else {
      const order = new Map(allSellerNames.map((name, index) => [name, index]));
      unique.sort(
        (a, b) =>
          (order.get(a) ?? 9999) - (order.get(b) ?? 9999) ||
          a.localeCompare(b)
      );
      setSellerFilters(unique);
    }

    setSellerPopoverOpen(false);
    setPage(1);
  };

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
    const controller = new AbortController();
    const loadCategories = async () => {
      setCategoriesLoading(true);
      setCategoriesError(null);
      try {
        const response = await fetch("/api/digideal/categories", {
          signal: controller.signal,
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to load categories.");
        }
        const payload = (await response.json()) as { categories?: CategoryNode[] };
        setCategories(payload.categories ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setCategoriesError(err instanceof Error ? err.message : "Failed to load categories.");
        setCategories([]);
      } finally {
        setCategoriesLoading(false);
      }
    };

    loadCategories();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadViews = async () => {
      setViewsLoading(true);
      setViewsError(null);
      try {
        const response = await fetch("/api/digideal/views", {
          signal: controller.signal,
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to load views.");
        }
        const payload = (await response.json()) as { items?: DigidealView[] };
        setViews(Array.isArray(payload.items) ? payload.items : []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setViewsError(err instanceof Error ? err.message : "Failed to load views.");
        setViews([]);
      } finally {
        setViewsLoading(false);
      }
    };

    loadViews();

    return () => controller.abort();
  }, [viewsRefreshToken]);

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

      const inputText = String(
        linkedTarget.title_h1 ||
          linkedTarget.listing_title ||
          linkedTarget.product_slug ||
          linkedTarget.product_id ||
          ""
      )
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
          throw new Error(text || "Advanced search failed.");
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
          throw new Error(text || "Catalog search failed.");
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
              .filter(
                (row: CatalogProduct | null): row is CatalogProduct => Boolean(row)
              )
          : [];

        if (isActive) {
          setLinkedResults(mapped);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (isActive) {
          setLinkedError(err instanceof Error ? err.message : "Advanced search failed.");
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
  }, [linkedDialogOpen, linkedTarget?.product_id]);

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
        const categoryParam = buildCategoryParam(categorySelections);
        if (categoryParam) params.set("categories", categoryParam);
        if (firstSeenFrom) params.set("firstSeenFrom", firstSeenFrom);
        if (firstSeenTo) params.set("firstSeenTo", firstSeenTo);
        if (sellerFilters.length > 0) {
          params.set("sellers", sellerFilters.join("|"));
        }
        const minSoldValue = Number(minSold);
        if (Number.isFinite(minSoldValue) && minSoldValue > 0) {
          params.set("minSold", String(minSoldValue));
          params.set("minSoldMetric", minSoldMetric);
        }
        const inactiveDaysValue = Number(inactiveDays);
        if (inactiveMode !== "any" && Number.isFinite(inactiveDaysValue) && inactiveDaysValue > 0) {
          params.set("inactiveMode", inactiveMode);
          params.set("inactiveDays", String(inactiveDaysValue));
        }
        if (groupIdFilter) {
          params.set("groupId", groupIdFilter);
        }
        if (viewIdFilter) {
          params.set("viewId", viewIdFilter);
        }
        if (priceMatch && priceMatch !== "all") {
          params.set("priceMatch", priceMatch);
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
    categorySelections,
    firstSeenFrom,
    firstSeenTo,
    status,
    sort,
    minSoldMetric,
    minSold,
    inactiveMode,
    inactiveDays,
    groupIdFilter,
    viewIdFilter,
    sellerFilters,
    priceMatch,
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
        const googlePath =
          typeof item.google_taxonomy_path === "string"
            ? item.google_taxonomy_path.trim()
            : "";
        const googleParts = googlePath
          ? googlePath
              .split(">")
              .map((token) => token.trim())
              .filter(Boolean)
          : [];
        const googleBreadcrumbs = [
          googleParts[0]
            ? {
                level: "l1" as const,
                label: googleParts[0],
                value: googleParts[0],
              }
            : null,
          googleParts[0] && googleParts[1]
            ? {
                level: "l2" as const,
                label: googleParts[1],
                value: `${googleParts[0]} > ${googleParts[1]}`,
              }
            : null,
          googleParts[0] && googleParts[1] && googleParts[2]
            ? {
                level: "l3" as const,
                label: googleParts[2],
                value: `${googleParts[0]} > ${googleParts[1]} > ${googleParts[2]}`,
              }
            : null,
        ].filter(
          (
            entry
          ): entry is { level: "l1" | "l2" | "l3"; label: string; value: string } =>
            Boolean(entry)
        );
        const priceValue = item.last_price ?? null;
        const prevPrice = item.last_original_price ?? null;
        const shippingCost =
          typeof item.shipping_cost === "number" ? item.shipping_cost : null;
        const shippingCostLabel =
          shippingCost !== null
            ? shippingCost === 0
              ? "0 kr"
              : formatCurrency(shippingCost, "SEK")
            : "—";
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
        const canManageSupplier = isAdmin && !isNordexo;
        const hasManualSupplierData =
          item.purchase_price !== null ||
          item.weight_grams !== null ||
          item.weight_kg !== null ||
          (typeof item.supplier_url === "string" && Boolean(item.supplier_url.trim()));
        const supplierSelected = Boolean(item.supplier_selected);
        const supplierPayloadStatus = String(item.supplier_payload_status ?? "")
          .trim()
          .toLowerCase();
        const supplierPayloadReady =
          supplierPayloadStatus === "ready" &&
          Boolean(item.supplier_payload_file_path);
        const supplierPayloadFailed = supplierPayloadStatus === "failed";
        const supplierPayloadLoading =
          supplierPayloadStatus === "fetching" ||
          supplierPayloadStatus === "queued" ||
          supplierPayloadStatus === "processing";
        const supplierActionLabel = supplierPayloadReady
          ? "Pick Variant"
          : hasManualSupplierData
            ? t("digideal.supplier.edit")
            : t("digideal.supplier.add");
        const highlightAddSupplier =
          canManageSupplier &&
          !supplierPayloadReady &&
          !hasManualSupplierData &&
          !supplierSelected;
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
            className={mergeClasses(
              hasEstimatedPrice && !isProductionActive
                ? styles.priceMatchRow
                : undefined,
              isProductionActive ? styles.productionRow : undefined
            )}
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
              <div className={styles.productCellStack}>
                <Text className={styles.productTitle}>
                  {title}
                  <span className={styles.productIdInline}>
                    {`\u00A0(ID: ${productId})`}
                  </span>
                </Text>
                <div className={styles.metaStack}>
                  {googleBreadcrumbs.length > 0 ? (
                    <div className={styles.breadcrumbRow}>
                      {googleBreadcrumbs.map((crumb, index) => (
                        <span key={`${crumb.level}-${crumb.value}`}>
                          <button
                            type="button"
                            className={styles.breadcrumbLink}
                            onClick={() => {
                              setCategorySelections([
                                { level: crumb.level, value: crumb.value },
                              ]);
                              setPage(1);
                            }}
                          >
                            {crumb.label}
                          </button>
                          {index < googleBreadcrumbs.length - 1 ? (
                            <span className={styles.breadcrumbDivider}> / </span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div
                    className={mergeClasses(
                      styles.metaText,
                      styles.metaLine,
                      styles.metaLineTight
                    )}
                  >
	                    <div className={styles.metaInlineRow}>
	                      <span>
	                        {item.first_seen_at ? formatDate(item.first_seen_at) : "-"} /{" "}
	                        {item.last_seen_at ? formatDate(item.last_seen_at) : "-"}
	                      </span>
	                      {item.digideal_group_id &&
	                      typeof item.digideal_group_count === "number" &&
	                      item.digideal_group_count > 1 ? (
	                        <span className={styles.rerunLinkRow}>
	                          <button
	                            type="button"
	                            className={mergeClasses(
	                              styles.groupIdLink,
	                              styles.rerunCountLink
	                            )}
	                            onClick={() => {
	                              setGroupIdFilter(item.digideal_group_id ?? null);
	                              setPage(1);
	                            }}
	                            title="Show all reruns for this deal"
	                          >
	                            {`Reruns: ${item.digideal_group_count}`}
	                          </button>
	                          {groupIdFilter ? (
	                            <button
	                              type="button"
	                              className={styles.groupIdLink}
	                              onClick={() => {
	                                setGroupIdFilter(null);
	                                setPage(1);
	                              }}
	                              title="Exit rerun view"
	                            >
	                              (view all)
	                            </button>
	                          ) : null}
	                        </span>
	                      ) : null}
	                    </div>
	                  </div>
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
                    if (!seller || seller === "-") return;
                    setSellerFilters([seller]);
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
                  {shippingCost !== null ? (
                    <Text className={styles.priceShipping}>
                      ({shippingCostLabel})
                    </Text>
                  ) : (
                    <Text className={styles.priceShipping}>—</Text>
                  )}
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
            <TableCell className={styles.optimizeCol}>
              {isNordexo ? (
                "-"
              ) : (
                <Button
                  appearance="outline"
                  size="small"
                  className={styles.linkButton}
                  onClick={() => {
                    if (!hasReport) return;
                    openOptimizeDialog(title, item.product_id);
                  }}
                  disabled={!hasReport}
                >
                  {t("digideal.optimize.analyze")}
                </Button>
              )}
            </TableCell>
            <TableCell className={styles.linkedProductCol}>
              {isNordexo ? (
                "-"
              ) : (
                <div className={styles.linkedProductStack}>
                  {item.identical_spu ? (
                    <div className={styles.linkedSpuRow}>
                      <a
                        href={`/app/products/spu/${encodeURIComponent(
                          item.identical_spu
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.linkedSpuLink}
                      >
                        {item.identical_spu}
                      </a>
                      {isAdmin ? (
                        <Tooltip content="Relink product" relationship="label">
                          <button
                            type="button"
                            className={styles.linkedRelinkButton}
                            aria-label="Relink product"
                            onClick={() => openLinkedDialog(item)}
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
                        </Tooltip>
                      ) : null}
                    </div>
                  ) : isAdmin ? (
                    <Button
                      appearance="outline"
                      size="small"
                      className={styles.linkButton}
                      onClick={() => openLinkedDialog(item)}
                    >
                      {t("digideal.linkedProduct.link")}
                    </Button>
                  ) : (
                    "-"
                  )}
                </div>
              )}
            </TableCell>
	            <TableCell className={styles.estimatedPriceCol}>
	              <div className={styles.estimatedPriceRow}>
	                <div className={styles.estimatedPriceActionRow}>
	                  {hasEstimatedPrice ? (
	                    <div className={styles.estimatedPriceBadgeSlot}>
	                      <Badge
	                        appearance="outline"
	                        className={styles.estimatedPriceBadge}
	                      >
	                        {estimatedPriceLabel}
	                      </Badge>
	                    </div>
	                  ) : (
	                    canManageSupplier ? (
	                      highlightAddSupplier ? null : (
	                        <div className={styles.estimatedPriceBadgeSlot} />
	                      )
	                    ) : (
	                      <Text className={styles.estimatedPriceText}>-</Text>
	                    )
	                  )}
	                  {canManageSupplier ? (
	                    supplierPayloadReady ? (
	                      <Menu>
	                        <MenuTrigger disableButtonEnhancement>
	                          <Button
	                            appearance="outline"
	                            size="small"
	                            className={styles.linkButton}
	                          >
	                            {supplierActionLabel}
	                          </Button>
	                        </MenuTrigger>
	                        <MenuPopover>
	                          <MenuList>
	                            <MenuItem onClick={() => openSupplierDialog(item)}>
	                              {t("digideal.supplier.manualInput")}
	                            </MenuItem>
	                            <MenuItem onClick={() => void openVariantsDialog(item)}>
	                              Pick Variant
	                            </MenuItem>
	                          </MenuList>
	                        </MenuPopover>
	                      </Menu>
	                    ) : hasManualSupplierData ? (
	                      <Button
	                        appearance="outline"
	                        size="small"
	                        className={styles.linkButton}
	                        onClick={() => openSupplierDialog(item)}
	                      >
	                        {t("digideal.supplier.edit")}
	                      </Button>
	                    ) : (
	                      <Menu>
	                        <MenuTrigger disableButtonEnhancement>
	                          <Button
	                            appearance="outline"
	                            size="small"
	                            className={mergeClasses(
	                              styles.linkButton,
	                              highlightAddSupplier ? styles.supplierAddButton : undefined
	                            )}
	                          >
	                            {supplierActionLabel}
	                          </Button>
	                        </MenuTrigger>
	                        <MenuPopover>
	                          <MenuList>
	                            <MenuItem onClick={() => openSupplierDialog(item)}>
	                              {t("digideal.supplier.manualInput")}
	                            </MenuItem>
	                            <MenuItem onClick={() => void openSupplierSearchDialog(item)}>
	                              {t("digideal.supplier.imageSearch")}
	                            </MenuItem>
	                          </MenuList>
	                        </MenuPopover>
	                      </Menu>
	                    )
	                  ) : null}
	                </div>
	                {canManageSupplier &&
	                (supplierPayloadLoading || supplierPayloadReady || supplierPayloadFailed) ? (
	                  <div className={styles.supplierStatusInline}>
	                    <span className={styles.supplierStatusItem}>
	                      {supplierPayloadLoading ? (
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
                      <span>1688</span>
                      {supplierPayloadReady ? (
                        <span className={styles.supplierStatusOk}>✓</span>
                      ) : supplierPayloadFailed ? (
                        <span className={styles.supplierStatusFail}>✕</span>
                      ) : null}
                    </span>
                  </div>
                ) : null}
              </div>
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
	                              {t("digideal.rerun.addToProduction")}
	                            </MenuItem>
	                            <MenuItem
	                              onClick={() => openRerunDialog(title, item.product_id)}
	                              disabled={isAdding}
	                            >
	                              {t("digideal.rerun.addWithComment")}
	                            </MenuItem>
	                            <Menu positioning={{ position: "before", align: "start" }}>
	                              <MenuTrigger disableButtonEnhancement>
	                                <MenuItem disabled={isAdding}>
	                                  {t("digideal.views.addToView")}
	                                </MenuItem>
	                              </MenuTrigger>
	                              <MenuPopover>
	                                <MenuList>
	                                  <MenuItem
	                                    onClick={() =>
	                                      openCreateViewDialog([item.product_id])
	                                    }
	                                  >
	                                    {t("digideal.views.addNew")}
	                                  </MenuItem>
                                      <MenuDivider />
	                                  {viewsLoading ? (
	                                    <MenuItem disabled>
	                                      {t("digideal.views.loading")}
	                                    </MenuItem>
	                                  ) : views.length === 0 ? (
	                                    <MenuItem disabled>
	                                      {t("digideal.views.empty")}
	                                    </MenuItem>
	                                  ) : (
	                                    views.map((view) => (
	                                      <MenuItem
	                                        key={view.id}
	                                        onClick={() => {
	                                          void addProductsToView(view.id, [
	                                            item.product_id,
	                                          ]).catch((err) => {
	                                            setError(
	                                              err instanceof Error
	                                                ? err.message
	                                                : "Failed to add items to list."
	                                            );
	                                          });
	                                        }}
	                                      >
	                                        {`${view.name} (${view.item_count ?? 0})`}
	                                      </MenuItem>
	                                    ))
	                                  )}
	                                </MenuList>
	                              </MenuPopover>
	                            </Menu>
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
            <TableCell className={styles.selectCol}>
              <div className={styles.selectCheckboxWrap}>
                <Checkbox
                  checked={selectedIds.has(item.product_id)}
                  disabled={isNordexo}
                  aria-label="Select row"
                  className={styles.checkboxWhite}
                  onChange={(_, data) =>
                    toggleRowSelected(item.product_id, Boolean(data.checked))
                  }
                />
              </div>
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
      openLinkedDialog,
      openCreateViewDialog,
      addProductsToView,
      viewsLoading,
      views,
      groupIdFilter,
      isAdmin,
      selectedIds,
      toggleRowSelected,
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
                setStatus(String(data.optionValue) || "all")
              }
              className={mergeClasses(styles.dropdownCompact, styles.filterField)}
            >
              <Option value="all">{t("digideal.status.all")}</Option>
              <Option value="online">{t("digideal.status.online")}</Option>
              <Option value="offline">{t("digideal.status.offline")}</Option>
            </Dropdown>
          </Field>
          <Field
            label={<span className={styles.filterLabel}>{t("digideal.filters.priceMatch")}</span>}
          >
            <Dropdown
              value={
                priceMatch === "have"
                  ? t("digideal.priceMatch.have")
                  : priceMatch === "none"
                    ? t("digideal.priceMatch.none")
                    : t("digideal.priceMatch.all")
              }
              selectedOptions={[priceMatch]}
              onOptionSelect={(_, data) =>
                setPriceMatch(String(data.optionValue) || "all")
              }
              className={mergeClasses(styles.dropdownCompact, styles.filterFieldNarrow)}
            >
              <Option value="all">{t("digideal.priceMatch.all")}</Option>
              <Option value="have">{t("digideal.priceMatch.have")}</Option>
              <Option value="none">{t("digideal.priceMatch.none")}</Option>
            </Dropdown>
          </Field>
          <Field
            label={<span className={styles.filterLabel}>{t("digideal.filters.category")}</span>}
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
                  <Spinner label={t("discovery.categories.loading")} />
                ) : categoriesError ? (
                  <MessageBar intent="error">{categoriesError}</MessageBar>
                ) : categories.length === 0 ? (
                  <Text>{t("discovery.categories.empty")}</Text>
                ) : (
                  <>
                    <Input
                      value={categorySearch}
                      onChange={(_, data) => setCategorySearch(data.value)}
                      placeholder={t("discovery.categories.searchPlaceholder")}
                      className={styles.categorySearch}
                    />
                    <div className={styles.categoryColumns}>
                      <div className={styles.categoryColumn}>
                        <Text className={styles.categoryColumnTitle}>
                          {t("discovery.categories.level1")}
                        </Text>
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
                              aria-label={t("common.selectItem", { item: l1.name })}
                              onChange={() => toggleDraftCategory("l1", l1.name)}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <span
                              className={mergeClasses(
                                styles.categoryNavButton,
                                activeL1 === l1.name
                                  ? styles.categoryNavActive
                                  : undefined
                              )}
                            >
                              {l1.name}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className={styles.categoryColumn}>
                        <Text className={styles.categoryColumnTitle}>
                          {t("discovery.categories.level2")}
                        </Text>
                        {filteredL2Nodes.map((l2) => {
                          const value = activeL1
                            ? `${activeL1} > ${l2.name}`
                            : l2.name;
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
                                aria-label={t("common.selectItem", { item: l2.name })}
                                onChange={() => toggleDraftCategory("l2", value)}
                                onClick={(event) => event.stopPropagation()}
                              />
                              <span
                                className={mergeClasses(
                                  styles.categoryNavButton,
                                  activeL2 === l2.name
                                    ? styles.categoryNavActive
                                    : undefined
                                )}
                              >
                                {l2.name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className={styles.categoryColumn}>
                        <Text className={styles.categoryColumnTitle}>
                          {t("discovery.categories.level3")}
                        </Text>
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
                              onClick={() => toggleDraftCategory("l3", value)}
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
                                aria-label={t("common.selectItem", { item: l3.name })}
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
                        clearCategory();
                        setCategoryPopoverOpen(false);
                        setPage(1);
                      }}
                    >
                      {t("common.clear")}
                    </Button>
                  ) : null}
                  <Button
                    appearance="primary"
                    onClick={() => {
                      setCategorySelections(categoryDraft);
                      setCategoryPopoverOpen(false);
                      setPage(1);
                    }}
                  >
                    {t("common.done")}
                  </Button>
                </div>
	              </PopoverSurface>
	            </Popover>
	          </Field>
	          <Field
	            label={<span className={styles.filterLabel}>{t("digideal.views.show")}</span>}
	            className={styles.filterField}
	          >
	            <Popover
	              open={viewsPopoverOpen}
	              onOpenChange={(_, data) => setViewsPopoverOpen(data.open)}
	              positioning={{ position: "below", align: "start", offset: { mainAxis: 6 } }}
	            >
	              <PopoverTrigger disableButtonEnhancement>
	                <Button appearance="outline" className={styles.viewsTrigger}>
	                  {viewSummary}
	                </Button>
	              </PopoverTrigger>
	              <PopoverSurface className={styles.viewsPopover}>
	                {viewsLoading ? (
	                  <Spinner label={t("digideal.views.loading")} />
	                ) : viewsError ? (
	                  <MessageBar intent="error">{viewsError}</MessageBar>
	                ) : (
	                  <div className={styles.viewsList}>
	                    <button
	                      type="button"
	                      className={mergeClasses(
	                        styles.viewsOption,
	                        !viewIdFilter ? styles.viewsOptionActive : undefined
	                      )}
	                      onClick={() => {
	                        setViewIdFilter(null);
	                        setViewsPopoverOpen(false);
	                        setPage(1);
	                      }}
	                    >
	                      {t("digideal.views.all")}
	                    </button>
	                    {views.map((view) => (
	                      <div key={view.id} className={styles.viewsRow}>
	                        <button
	                          type="button"
	                          className={mergeClasses(
	                            styles.viewsOption,
	                            viewIdFilter === view.id
	                              ? styles.viewsOptionActive
	                              : undefined
	                          )}
	                          onClick={() => {
	                            setViewIdFilter(view.id);
	                            setViewsPopoverOpen(false);
	                            setPage(1);
	                          }}
	                        >
	                          {`${view.name} (${view.item_count ?? 0})`}
	                        </button>
	                        <button
	                          type="button"
	                          className={styles.viewDeleteIconButton}
	                          aria-label={t("digideal.views.deleteAria", {
	                            name: view.name,
	                          })}
	                          onClick={(event) => {
	                            event.stopPropagation();
	                            setViewsPopoverOpen(false);
	                            void handleDeleteViewConfirm(view);
	                          }}
	                        >
	                          <TrashIcon />
	                        </button>
	                      </div>
	                    ))}
	                  </div>
	                )}
	              </PopoverSurface>
	            </Popover>
	          </Field>
	          <div className={styles.topActions}>
	            <Button appearance="outline" size="medium" onClick={resetAllFilters}>
	              {t("digideal.filters.resetAll")}
	            </Button>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button
                  appearance="primary"
                  size="medium"
                  disabled={selectedCount === 0 || bulkAdding}
                >
                  {t("digideal.rerun.add")}
                </Button>
              </MenuTrigger>
              <MenuPopover>
	                <MenuList>
	                  <MenuItem
	                    onClick={bulkAddSelectedDirect}
	                    disabled={selectedCount === 0 || bulkAdding}
	                  >
	                    {t("digideal.rerun.addToProduction")}
	                  </MenuItem>
	                  <MenuItem
	                    onClick={openBulkRerunDialog}
	                    disabled={selectedCount === 0 || bulkAdding}
	                  >
	                    {t("digideal.rerun.addWithComment")}
	                  </MenuItem>
	                  <Menu positioning={{ position: "before", align: "start" }}>
	                    <MenuTrigger disableButtonEnhancement>
	                      <MenuItem disabled={selectedCount === 0 || bulkAdding}>
	                        {t("digideal.views.addToView")}
	                      </MenuItem>
	                    </MenuTrigger>
	                    <MenuPopover>
	                      <MenuList>
	                        <MenuItem
	                          onClick={() => openCreateViewDialog(Array.from(selectedIds))}
	                          disabled={selectedCount === 0 || bulkAdding}
	                        >
	                          {t("digideal.views.addNew")}
	                        </MenuItem>
                            <MenuDivider />
	                        {viewsLoading ? (
	                          <MenuItem disabled>{t("digideal.views.loading")}</MenuItem>
	                        ) : views.length === 0 ? (
	                          <MenuItem disabled>{t("digideal.views.empty")}</MenuItem>
	                        ) : (
	                          views.map((view) => (
	                            <MenuItem
	                              key={view.id}
	                              onClick={() => {
	                                void addProductsToView(
	                                  view.id,
	                                  Array.from(selectedIds)
	                                ).catch((err) => {
	                                  setError(
	                                    err instanceof Error
	                                      ? err.message
	                                      : "Failed to add items to list."
	                                  );
	                                });
	                              }}
	                            >
	                              {`${view.name} (${view.item_count ?? 0})`}
	                            </MenuItem>
	                          ))
	                        )}
	                      </MenuList>
	                    </MenuPopover>
	                  </Menu>
	                </MenuList>
	              </MenuPopover>
	            </Menu>
	          </div>
	        </div>
        <div className={styles.bottomRow}>
          <Field
            label={
              <span className={styles.filterLabel}>
                {t("digideal.filters.firstSeenRange")}
              </span>
            }
            className={styles.filterField}
          >
            <Popover positioning={{ position: "below", align: "start" }}>
              <PopoverTrigger disableButtonEnhancement>
                <Button appearance="outline" className={styles.rangeButton}>
                  <span className={styles.filterButtonText}>
                    {firstSeenRangeSummary}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverSurface className={styles.rangePopover}>
                <Field label={t("products.filters.rangeFrom")}>
                  <Input
                    type="date"
                    value={firstSeenFrom}
                    onChange={(_, data) => setFirstSeenFrom(data.value)}
                  />
                </Field>
                <Field label={t("products.filters.rangeTo")}>
                  <Input
                    type="date"
                    value={firstSeenTo}
                    onChange={(_, data) => setFirstSeenTo(data.value)}
                  />
                </Field>
                <div className={styles.rangeActions}>
                  <Button
                    appearance="subtle"
                    onClick={() => {
                      setFirstSeenFrom("");
                      setFirstSeenTo("");
                    }}
                  >
                    {t("common.clear")}
                  </Button>
                </div>
              </PopoverSurface>
            </Popover>
          </Field>
          <Field
            label={<span className={styles.filterLabel}>{t("digideal.filters.minSold")}</span>}
            className={styles.filterField}
          >
            <div className={styles.inlineFilterRow}>
              <Dropdown
                value={
                  minSoldMetric === "sold_today"
                    ? t("digideal.sort.soldToday")
                    : minSoldMetric === "sold_7d"
                      ? t("digideal.sort.sold7d")
                      : t("digideal.sort.soldAll")
                }
                selectedOptions={[minSoldMetric]}
                onOptionSelect={(_, data) => {
                  setMinSoldMetric(String(data.optionValue) || "sold_all_time");
                  setPage(1);
                }}
                className={styles.dropdownCompact}
              >
                <Option value="sold_all_time">{t("digideal.sort.soldAll")}</Option>
                <Option value="sold_7d">{t("digideal.sort.sold7d")}</Option>
                <Option value="sold_today">{t("digideal.sort.soldToday")}</Option>
              </Dropdown>
              <Input
                type="number"
                value={minSold}
                placeholder={t("digideal.filters.minSoldPlaceholder")}
                onChange={(_, data) => {
                  setMinSold(data.value);
                  setPage(1);
                }}
                className={styles.inlineNumberInput}
              />
            </div>
          </Field>
          <Field
            label={<span className={styles.filterLabel}>{t("digideal.filters.inactivity")}</span>}
            className={styles.filterField}
          >
            <div className={styles.inlineFilterRow}>
              <Dropdown
                value={
                  inactiveMode === "no_sales"
                    ? t("digideal.filters.inactiveMode.noSales")
                    : inactiveMode === "offline"
                      ? t("digideal.filters.inactiveMode.offline")
                      : t("digideal.filters.inactiveMode.any")
                }
                selectedOptions={[inactiveMode]}
                onOptionSelect={(_, data) => {
                  setInactiveMode(String(data.optionValue) || "any");
                  setPage(1);
                }}
                className={styles.dropdownCompact}
              >
                <Option value="any">{t("digideal.filters.inactiveMode.any")}</Option>
                <Option value="no_sales">{t("digideal.filters.inactiveMode.noSales")}</Option>
                <Option value="offline">{t("digideal.filters.inactiveMode.offline")}</Option>
              </Dropdown>
              <Input
                type="number"
                value={inactiveDays}
                placeholder={t("digideal.filters.inactiveDaysPlaceholder")}
                onChange={(_, data) => {
                  setInactiveDays(data.value);
                  setPage(1);
                }}
                disabled={inactiveMode === "any"}
                className={styles.inlineNumberInput}
              />
            </div>
          </Field>
          <Field label={<span className={styles.filterLabel}>{t("digideal.filters.seller")}</span>}>
            <Popover
              positioning={{ position: "below", align: "start" }}
              open={sellerPopoverOpen}
              onOpenChange={(_, data) => setSellerPopoverOpen(data.open)}
            >
              <PopoverTrigger disableButtonEnhancement>
                <Button appearance="outline" className={styles.rangeButton}>
                  <span className={styles.filterButtonText}>{sellerSummary}</span>
                </Button>
              </PopoverTrigger>
              <PopoverSurface className={styles.sellerPopover}>
                <div className={styles.sellerList}>
                  {sellerOptions.map((seller) => {
                    const name = seller.seller_name;
                    const checked = sellerDraft.has(name);
                    return (
                      <Checkbox
                        key={name}
                        checked={checked}
                        label={name}
                        onChange={(_, data) => {
                          const isChecked = Boolean(data.checked);
                          setSellerDraft((prev) => {
                            const next = new Set(prev);
                            if (isChecked) {
                              next.add(name);
                            } else {
                              next.delete(name);
                            }
                            return next;
                          });
                        }}
                      />
                    );
                  })}
                </div>
                <div className={styles.sellerActions}>
                  <Button
                    appearance="primary"
                    size="small"
                    onClick={applySellerFilters}
                    disabled={sellerOptions.length === 0}
                  >
                    Filter
                  </Button>
                </div>
              </PopoverSurface>
            </Popover>
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
                <TableHeaderCell className={styles.optimizeCol}>
                  {t("digideal.table.optimize")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.linkedProductCol}>
                  {t("digideal.table.linkedProduct")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.estimatedPriceCol}>
                  {t("digideal.table.estimatedRerunPrice")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.rerunCol}>
                  {t("digideal.table.rerun")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.selectCol}>
                  <div className={styles.selectCheckboxWrap}>
                    <Checkbox
                      checked={selectAllState}
                      aria-label="Select all"
                      disabled={selectableIds.length === 0}
                      className={styles.checkboxWhite}
                      onChange={(_, data) => {
                        const checked = Boolean(data.checked);
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          selectableIds.forEach((id) => {
                            if (checked) {
                              next.add(id);
                            } else {
                              next.delete(id);
                            }
                          });
                          return next;
                        });
                      }}
                    />
                  </div>
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
        open={createViewDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closeCreateViewDialog();
          }
        }}
      >
        <DialogSurface className={styles.createViewDialogSurface}>
          <DialogBody>
            <DialogTitle>{t("digideal.views.createTitle")}</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <Field label={t("digideal.views.nameLabel")}>
                <Input
                  value={createViewName}
                  onChange={(_, data) => setCreateViewName(data.value)}
                  placeholder={t("digideal.views.namePlaceholder")}
                />
              </Field>
              {createViewError ? (
                <MessageBar intent="error">{createViewError}</MessageBar>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeCreateViewDialog}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleCreateViewSave}
                disabled={createViewSaving}
              >
                {t("common.save")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={linkedDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closeLinkedDialog();
          }
        }}
      >
      <DialogSurface className={styles.linkedDialogSurface}>
          <DialogBody className={styles.linkedDialogBody}>
            <DialogTitle>{t("digideal.linkedProduct.dialog.title")}</DialogTitle>
            {linkedTarget ? (
              (() => {
                const title =
                  linkedTarget.title_h1 ||
                  linkedTarget.listing_title ||
                  linkedTarget.product_slug ||
                  linkedTarget.product_id;
                const imageUrls = normalizeImageUrls(linkedTarget.image_urls);
                const imageSrc =
                  linkedTarget.primary_image_url || imageUrls[0] || null;
                const supplementalImages = Array.from(
                  new Set(
                    imageUrls
                      .map((url) => String(url ?? "").trim())
                      .filter(Boolean)
                      .filter((url) => (imageSrc ? url !== imageSrc : true))
                  )
                ).slice(0, 6);

                return (
                  <div className={styles.linkedDialogGrid}>
                    <div className={styles.linkedLeft}>
                      {imageSrc ? (
                        <div className={styles.linkedHeroFrame}>
                          <Image
                            src={imageSrc}
                            alt={title}
                            className={styles.linkedHeroImage}
                          />
                        </div>
                      ) : null}
                      {supplementalImages.length > 0 ? (
                        <div className={styles.linkedSupplementGrid}>
                          {supplementalImages.map((url, index) => (
                            <div
                              key={`${url}-${index}`}
                              className={styles.linkedSupplementFrame}
                            >
                              <Image
                                src={url}
                                alt={`${title} image ${index + 2}`}
                                className={styles.linkedSupplementImage}
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <Text className={styles.linkedHeaderTitle}>{title}</Text>
                      {linkedTarget.identical_spu ? (
                        <div className={styles.linkedCurrentBox}>
                          <Text className={styles.linkedCurrentLabel}>
                            Linked SPU
                          </Text>
                          <a
                            href={`/app/products/spu/${encodeURIComponent(
                              linkedTarget.identical_spu
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.linkedCurrentLink}
                          >
                            {linkedTarget.identical_spu}
                          </a>
                        </div>
                      ) : null}
                      {linkedError ? (
                        <MessageBar intent="error">{linkedError}</MessageBar>
                      ) : null}
                      <Field
                        label={
                          <span className={styles.filterLabel}>
                            {t("digideal.linkedProduct.dialog.manualLabel")}
                          </span>
                        }
                      >
                        <Input
                          value={linkedManualSpu}
                          onChange={(_, data) => setLinkedManualSpu(data.value)}
                          placeholder={t(
                            "digideal.linkedProduct.dialog.manualPlaceholder"
                          )}
                        />
                      </Field>
                    </div>

                    <div className={styles.linkedRight}>
                      {linkedLoading ? (
                        <Spinner label={t("digideal.loading")} />
                      ) : (
                        <div className={styles.linkedResultsWrap}>
                          {linkedResults.length === 0 ? (
                            <Text size={200} className={styles.metaText}>
                              -
                            </Text>
                          ) : (
                            linkedResults.map((row) => {
                              const isSelected = row.id === linkedSelectedId;
                              const rowTitle = row.title ?? row.spu ?? row.id;
                              const rowSku = row.spu
                                ? String(row.spu).trim()
                                : "";
                              const secondary = [row.brand, row.vendor]
                                .map((value) => String(value ?? "").trim())
                                .filter(Boolean)
                                .join(" · ");
                              const imageSrc =
                                row.thumbnail_url || row.small_image_url || null;
                              return (
                                <button
                                  key={row.id}
                                  type="button"
                                  className={mergeClasses(
                                    styles.linkedResultRow,
                                    isSelected
                                      ? styles.linkedResultRowSelected
                                      : undefined
                                  )}
                                  onClick={() => setLinkedSelectedId(row.id)}
                                >
                                  {imageSrc ? (
                                    <span className={styles.linkedResultImageWrap}>
                                      <Image
                                        src={imageSrc}
                                        alt={rowTitle}
                                        className={styles.linkedResultImage}
                                      />
                                      <span
                                        className={mergeClasses(
                                          styles.linkedPreviewLayer,
                                          "linkedPreviewLayer"
                                        )}
                                        aria-hidden="true"
                                      >
                                        <span className={styles.linkedPreviewBox}>
                                          <Image
                                            src={imageSrc}
                                            alt=""
                                            className={styles.linkedPreviewImage}
                                          />
                                        </span>
                                      </span>
                                    </span>
                                  ) : (
                                    <div className={styles.linkedResultImage} />
                                  )}
                                  <div className={styles.linkedResultText}>
                                    <span className={styles.linkedResultPrimary}>
                                      {rowTitle}
                                    </span>
                                    {rowSku ? (
                                      <span className={styles.linkedResultSku}>
                                        {rowSku}
                                      </span>
                                    ) : null}
                                    <span className={styles.linkedResultSecondary}>
                                      {secondary || "\u00A0"}
                                    </span>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}

                      <div className={styles.linkedActionsBar}>
                        <Button appearance="secondary" onClick={closeLinkedDialog}>
                          {t("common.close")}
                        </Button>
                        {isAdmin && linkedTarget.identical_spu ? (
                          <Button
                            appearance="outline"
                            onClick={handleLinkedUnlink}
                            disabled={linkedSaving}
                          >
                            {t("digideal.linkedProduct.dialog.unlink")}
                          </Button>
                        ) : null}
                        {isAdmin ? (
                          <Button
                            appearance="primary"
                            onClick={handleLinkedSave}
                            disabled={
                              linkedSaving ||
                              (!linkedManualSpu.trim() && !linkedSelectedId)
                            }
                          >
                            {t("digideal.linkedProduct.dialog.save")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : null}
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
                <>
                  {(() => {
                    const title =
                      supplierTarget.listing_title ||
                      supplierTarget.title_h1 ||
                      supplierTarget.product_slug ||
                      supplierTarget.product_id;
                    const imageUrls = normalizeImageUrls(supplierTarget.image_urls);
                    const imageSrc =
                      supplierTarget.primary_image_url || imageUrls[0] || null;
                    return (
                      <>
                        {imageSrc ? (
                          <div className={styles.supplierHeroFrame}>
                            <Image
                              src={imageSrc}
                              alt={title}
                              className={styles.supplierHeroImage}
                            />
                          </div>
                        ) : null}
                        <Text size={400} className={styles.supplierDialogTitle}>
                          {title}
                        </Text>
                      </>
                    );
                  })()}
                </>
              ) : null}
              {supplierError ? (
                <MessageBar intent="error">{supplierError}</MessageBar>
              ) : null}
              <Field
                label={
                  <div className={styles.fieldLabelRow}>
                    <span className={styles.filterLabel}>
                      {t("digideal.supplier.dialog.urlLabel")}
                    </span>
                    {supplierUrlDraft.trim() ? (
                      <a
                        className={styles.supplierShowLink}
                        href={supplierUrlDraft.trim()}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("digideal.supplier.dialog.showProduct")}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={styles.externalLinkIcon}
                          aria-hidden="true"
                        >
                          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                          <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
                          <path d="M11 13l9 -9" />
                          <path d="M15 4h5v5" />
                        </svg>
                      </a>
                    ) : null}
                  </div>
                }
              >
                <Input
                  value={supplierUrlDraft}
                  onChange={(_, data) => setSupplierUrlDraft(data.value)}
                  placeholder={t("digideal.supplier.dialog.urlPlaceholder")}
                />
              </Field>
              <div className={styles.supplierDetailRow}>
                <Field
                  className={styles.supplierDetailHalf}
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
                  className={styles.supplierDetailHalf}
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
              </div>
            </DialogContent>
            <DialogActions>
              {supplierTarget &&
              (Boolean(supplierTarget.supplier_url) ||
                Boolean(supplierTarget.purchase_price) ||
                Boolean(supplierTarget.weight_grams) ||
                Boolean(supplierTarget.weight_kg)) ? (
                <Button
                  appearance="outline"
                  onClick={handleSupplierRemove}
                  disabled={supplierSaving}
                  className={styles.linkButton}
                >
                  {t("digideal.supplier.dialog.remove")}
                </Button>
              ) : null}
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
        open={supplierSearchDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) closeSupplierSearchDialog();
        }}
      >
        <DialogSurface className={styles.supplierSearchDialog}>
          <DialogBody>
            <DialogTitle>Find Supplier</DialogTitle>
            <DialogContent className={styles.supplierSearchContent}>
              <div className={styles.supplierSearchHeaderRow}>
                <Text className={styles.supplierSearchTitle}>
                  {supplierSearchTarget
                    ? supplierSearchTarget.listing_title ||
                      supplierSearchTarget.title_h1 ||
                      supplierSearchTarget.product_slug ||
                      supplierSearchTarget.product_id
                    : ""}
                </Text>
                <Button
                  appearance="outline"
                  size="small"
                  className={styles.linkButton}
                  onClick={() =>
                    setSupplierPriceSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
                  }
                >
                  Filter by Price {supplierPriceSortDir === "asc" ? "↓" : "↑"}
                </Button>
              </div>
              {supplierLockedUrl ? (
                <MessageBar>
                  A supplier is already set in DigiDeal EST rerun price. You can view suggestions,
                  but that manual supplier remains the selected one.
                </MessageBar>
              ) : null}
              {supplierSearchError ? (
                <MessageBar intent="error" className={styles.supplierSearchError}>
                  {supplierSearchError}
                </MessageBar>
              ) : null}
              {supplierSearchLoading ? (
                <Spinner label="Loading suppliers..." />
              ) : (
                <div className={styles.supplierSearchRows}>
                  {supplierSelected?.selected_offer
                    ? (() => {
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
                            : offerId || "#selected";
                        const titleEn =
                          typeof offer?.subject_en === "string" ? offer.subject_en.trim() : "";
                        const imageUrl = normalizeSupplierImageUrl(
                          typeof offer?.imageUrl === "string" ? offer.imageUrl : ""
                        );
                        const meta = buildOfferMeta(offer);
                        return (
                          <div className={mergeClasses(styles.supplierRow, styles.supplierRowSelected)}>
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
                              ) : null}
                              <div className={styles.supplierMetaRow}>
                                {meta.price ? (
                                  <Text className={styles.supplierMetaItem}>Price: {meta.price}</Text>
                                ) : null}
                                {meta.sold ? (
                                  <Text className={styles.supplierMetaItem}>Sales: {meta.sold}</Text>
                                ) : null}
                                {meta.moq ? (
                                  <Text className={styles.supplierMetaItem}>MOQ: {meta.moq}</Text>
                                ) : null}
                                {meta.location ? (
                                  <Text className={styles.supplierMetaItem}>
                                    Location: {meta.location}
                                  </Text>
                                ) : null}
                              </div>
                              {url ? (
                                <div className={styles.supplierLinkRow}>
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.supplierMetaLink}
                                  >
                                    See on 1688.com
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className={styles.supplierExternalIcon}
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
                      })()
                    : null}
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
                            if (!offerId || supplierLockedUrl) return;
                            setSupplierSelectedOfferId(offerId);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(ev) => {
                            if (ev.key !== "Enter" && ev.key !== " ") return;
                            ev.preventDefault();
                            if (!offerId || supplierLockedUrl) return;
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
                              <Text className={styles.supplierTitleEn}>Translating title...</Text>
                            ) : null}
                            <div className={styles.supplierMetaRow}>
                              {meta.price ? (
                                <Text className={styles.supplierMetaItem}>Price: {meta.price}</Text>
                              ) : null}
                              {meta.sold ? (
                                <Text className={styles.supplierMetaItem}>Sales: {meta.sold}</Text>
                              ) : null}
                              {meta.moq ? (
                                <Text className={styles.supplierMetaItem}>MOQ: {meta.moq}</Text>
                              ) : null}
                              {meta.location ? (
                                <Text className={styles.supplierMetaItem}>
                                  Location: {meta.location}
                                </Text>
                              ) : null}
                            </div>
                            {url ? (
                              <div className={styles.supplierLinkRow}>
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={styles.supplierMetaLink}
                                  onClick={(ev) => ev.stopPropagation()}
                                >
                                  See on 1688.com
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className={styles.supplierExternalIcon}
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
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeSupplierSearchDialog}>
                Close
              </Button>
              <Button
                appearance="primary"
                onClick={handleSaveSupplierSearch}
                disabled={
                  supplierSearchSaving ||
                  supplierSelectedOfferId.trim().length === 0 ||
                  Boolean(supplierLockedUrl)
                }
              >
                Save
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog
        open={variantsDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) closeVariantsDialog();
        }}
      >
        <DialogSurface className={styles.variantsDialog}>
          <DialogBody className={styles.variantsDialogBody}>
            <DialogTitle>Pick Variants</DialogTitle>
            <DialogContent>
              <div className={styles.variantsHeaderRow}>
                {variantsTarget ? (
                  <div className={styles.variantsTitleStack}>
                    <Text className={styles.variantsTitleText}>
                      {variantsTarget.listing_title ||
                        variantsTarget.title_h1 ||
                        variantsTarget.product_slug ||
                        variantsTarget.product_id}
                    </Text>
                    {(() => {
                      const variantsProductUrl =
                        (typeof variantsTarget.supplier_selected_offer_detail_url === "string" &&
                        variantsTarget.supplier_selected_offer_detail_url.trim()
                          ? variantsTarget.supplier_selected_offer_detail_url.trim()
                          : null) ||
                        (typeof variantsTarget.supplier_url === "string" &&
                        variantsTarget.supplier_url.trim()
                          ? variantsTarget.supplier_url.trim()
                          : null) ||
                        (typeof variantsTarget.product_url === "string" &&
                        variantsTarget.product_url.trim()
                          ? variantsTarget.product_url.trim()
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
                ) : (
                  <span />
                )}
                <div className={styles.variantsTopActions}>
                  <Button
                    appearance="outline"
                    size="small"
                    onClick={() =>
                      setVariantsSelectedIndexes(new Set(variantsCombos.map((combo) => combo.index)))
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
                  <Text size={200} className={styles.supplierSearchTitle}>
                    {variantsSelectedIndexes.size} selected
                  </Text>
                </div>
              </div>
              {variantsError ? <MessageBar intent="error">{variantsError}</MessageBar> : null}
              {variantsLoading ? (
                <Spinner label="Loading variants..." />
              ) : variantsCombos.length === 0 ? (
                <Text>No variant combinations found in the 1688 JSON. You can still set packs below.</Text>
              ) : (
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
                        <th className={styles.variantsListHeadCell}>Variant</th>
                        <th className={styles.variantsListHeadCell} style={{ width: 140 }}>
                          Price (RMB)
                        </th>
                        <th className={styles.variantsListHeadCell} style={{ width: 110 }}>
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
                            className={styles.variantsRowClickable}
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
                                  onMouseLeave={() =>
                                    setVariantImagePreviewIndex((prev) =>
                                      prev === combo.index ? null : prev
                                    )
                                  }
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
                                  {zhParts.length > 0
                                    ? zhParts.join(" / ")
                                    : enParts.join(" / ") || "-"}
                                </span>
                                {enParts.length > 0 && enParts.join(" / ") !== zhParts.join(" / ") ? (
                                  <span className={styles.variantValueEn}>{enParts.join(" / ")}</span>
                                ) : null}
                              </div>
                            </td>
                            <td className={styles.variantsListCell}>
                              {typeof combo.price === "number"
                                ? `¥${combo.price.toFixed(2)}`
                                : combo.price_raw || "-"}
                            </td>
                            <td className={styles.variantsListCell}>
                              {typeof combo.weight_grams === "number" &&
                              Number.isFinite(combo.weight_grams)
                                ? `${Math.round(combo.weight_grams)}`
                                : combo.weight_raw || "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
