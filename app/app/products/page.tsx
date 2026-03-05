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
  Badge,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { getThumbnailUrl } from "@/lib/product-media";
import { useDebouncedValue } from "@/hooks/use-debounced";
import { useShiftRangeSelection } from "@/hooks/use-shift-range-selection";
import { useI18n } from "@/components/i18n-provider";

type CategoryNode = {
  name: string;
  children: CategoryNode[];
};

type CategorySelection = {
  level: "l1" | "l2" | "l3";
  value: string;
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
    alignItems: "flex-end",
    gap: "12px",
  },
  topLeft: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: "12px",
  },
  topRight: {
    marginLeft: "auto",
  },
  searchInput: {
    width: "520px",
    maxWidth: "100%",
    fontSize: tokens.fontSizeBase300,
    "& input": {
      fontSize: tokens.fontSizeBase300,
    },
  },
  searchLabelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    width: "100%",
  },
  advancedSearchButton: {
    border: "none",
    padding: 0,
    background: "transparent",
    cursor: "pointer",
    color: tokens.colorNeutralForeground4,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightRegular,
    lineHeight: tokens.lineHeightBase100,
    fontFamily: tokens.fontFamilyBase,
    "&:hover": {
      color: tokens.colorNeutralForeground2,
      textDecorationLine: "underline",
    },
    "&:disabled": {
      cursor: "not-allowed",
      color: tokens.colorNeutralForeground4,
      opacity: 0.6,
      textDecorationLine: "none",
    },
  },
  advancedSearchButtonActive: {
    color: tokens.colorBrandForeground1,
  },
  advancedSearchSummary: {
    marginTop: "4px",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  advancedDataDialog: {
    width: "min(1200px, 96vw)",
    maxHeight: "80vh",
  },
  advancedDataBody: {
    display: "flex",
    flexDirection: "column",
  },
  advancedDataContent: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  advancedDataSection: {
    width: "100%",
  },
  advancedDataLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    marginBottom: "4px",
    display: "block",
  },
  advancedDataBlock: {
    maxHeight: "220px",
    overflow: "auto",
    padding: "10px 12px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: "8px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase200,
    fontFamily: tokens.fontFamilyMonospace,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  filterLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground4,
    fontWeight: tokens.fontWeightRegular,
    lineHeight: tokens.lineHeightBase100,
  },
  dropdownCompact: {
    minWidth: "unset",
    width: "auto",
    maxWidth: "100%",
  },
  filterButton: {
    minWidth: "180px",
    justifyContent: "space-between",
    fontWeight: tokens.fontWeightRegular,
  },
  filterButtonText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  filterPopover: {
    padding: "8px",
    minWidth: "220px",
    maxHeight: "260px",
    overflowY: "auto",
  },
  filterOption: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 6px",
    borderRadius: "6px",
    cursor: "pointer",
    "& .fui-Checkbox__label": {
      fontWeight: tokens.fontWeightRegular,
    },
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  categoryTrigger: {
    justifyContent: "space-between",
    width: "100%",
    textAlign: "left",
    fontWeight: tokens.fontWeightRegular,
  },
  categoryPopover: {
    padding: "12px",
    minWidth: "660px",
    maxWidth: "790px",
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
  bottomRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: "12px",
  },
  bottomLeft: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: "12px",
  },
  bottomRight: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "flex-end",
  },
  filterField: {
    minWidth: "180px",
  },
  dropdownField: {
    width: "auto",
    minWidth: "unset",
  },
  dateField: {
    minWidth: "160px",
  },
  rangeButton: {
    minWidth: "180px",
    justifyContent: "space-between",
    fontWeight: tokens.fontWeightRegular,
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
  tableCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
    // Allow the hover preview image to render outside the card without getting clipped.
    overflow: "visible",
  },
  table: {
    width: "100%",
    "& .fui-TableCell": {
      paddingTop: "8px",
      paddingBottom: "8px",
    },
  },
  tableStatusCell: {
    textAlign: "center",
    paddingTop: "24px",
    paddingBottom: "24px",
  },
  tableStatusContent: {
    display: "inline-flex",
    width: "100%",
    minHeight: "56px",
    alignItems: "center",
    justifyContent: "center",
  },
  tableLoadingContent: {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
  tableLoadingLabel: {
    color: tokens.colorNeutralForeground3,
  },
  tableRowReEditing: {
    backgroundColor: "#fff8d8",
    ":hover": {
      backgroundColor: "#fff2bf",
    },
  },
  tableRowSelectable: {
    cursor: "pointer",
  },
  tableRowSelected: {
    backgroundColor: "#eaf4ff",
    "&:hover": {
      backgroundColor: "#eaf4ff",
    },
  },
  statusBadge: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    padding: "2px 8px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: tokens.fontWeightSemibold,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground2,
  },
  statusBadgeReEditing: {
    backgroundColor: "#fff4ce",
    border: "1px solid #f2c94c",
    color: "#8a6d00",
  },
  statusBadgeActive: {
    backgroundColor: "#e8f6ea",
    border: "1px solid #86b98d",
    color: "#2e6b36",
  },
  deliveryBadgeDigiDeal: {
    backgroundColor: "#deecff",
    border: "1px solid #98c4ff",
    color: "#0b4d8c",
  },
  deliveryBadgeLetsDeal: {
    backgroundColor: "#e8f8ef",
    border: "1px solid #9edab3",
    color: "#1f6a3a",
  },
  imageCol: {
    width: "83px",
    paddingLeft: "8px",
    paddingRight: 0,
    boxSizing: "border-box",
    overflow: "visible",
  },
  productCol: {
    minWidth: "455px",
    width: "455px",
    paddingLeft: "15px",
    paddingRight: "20px",
  },
  spuCol: {
    minWidth: "96px",
    width: "96px",
    maxWidth: "96px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  supplierCol: {
    minWidth: "160px",
    width: "160px",
    maxWidth: "180px",
  },
  deliveryCol: {
    minWidth: "120px",
    width: "120px",
    maxWidth: "140px",
  },
  publishedCol: {
    minWidth: "180px",
    width: "180px",
    maxWidth: "220px",
  },
  productStack: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  productTitleLink: {
    color: tokens.colorNeutralForeground1,
    textDecorationLine: "none",
    transitionProperty: "color",
    transitionDuration: "120ms",
    transitionTimingFunction: "ease",
    "&:hover": {
      color: tokens.colorNeutralForeground2,
    },
  },
  productTitleText: {
    fontWeight: 600,
    lineHeight: "1.2",
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  dateStack: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    paddingBlock: "2px",
  },
  dateRow: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  dateLabel: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    color: tokens.colorNeutralForeground3,
  },
  dateValue: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    lineHeight: tokens.lineHeightBase200,
  },
  dateValueRecent: {
    color: "#107c10",
    fontWeight: tokens.fontWeightBold,
  },
  selectCol: {
    width: "56px",
    minWidth: "56px",
    maxWidth: "56px",
    paddingLeft: "6px",
    paddingRight: "6px",
    textAlign: "right",
  },
  actionCol: {
    width: "auto",
    minWidth: "140px",
    whiteSpace: "nowrap",
  },
  cellStack: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  thumbnail: {
    width: "75px",
    height: "75px",
    borderRadius: "12px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  thumbnailWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    "&:hover .previewLayer": {
      opacity: 1,
      transform: "translateY(-50%)",
    },
    "&:focus-within .previewLayer": {
      opacity: 1,
      transform: "translateY(-50%)",
    },
  },
  previewLayer: {
    position: "absolute",
    left: "calc(100% + 12px)",
    top: "50%",
    // Keep the preview above table/card chrome.
    zIndex: 1000,
    opacity: 0,
    transform: "translateY(-50%)",
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
    width: "350px",
    height: "350px",
    maxWidth: "56vw",
    maxHeight: "56vh",
    objectFit: "contain",
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: "10px",
  },
  metaText: {
    color: tokens.colorNeutralForeground3,
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
  variantBadge: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorBrandForeground2,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `0.5px solid ${tokens.colorBrandStroke2}`,
    borderRadius: "999px",
    paddingInline: "4px",
    paddingBlock: "0px",
    minHeight: "20px",
    minWidth: "20px",
    width: "auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  variantBadgeInteractive: {
    cursor: "pointer",
    transitionProperty: "color, border-color",
    transitionDuration: "120ms",
    transitionTimingFunction: "ease",
    "&:hover": {
      color: tokens.colorBrandForeground1,
      border: `0.5px solid ${tokens.colorBrandStroke1}`,
    },
    "&:focus-visible": {
      color: tokens.colorBrandForeground1,
      border: `0.5px solid ${tokens.colorBrandStroke1}`,
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "2px",
    },
  },
  variantMetaRow: {
    display: "inline-flex",
    alignItems: "flex-start",
    gap: "8px",
  },
  priceStack: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    lineHeight: "1.1",
  },
  variantPopover: {
    padding: "8px",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow16,
    backgroundColor: tokens.colorNeutralBackground1,
    width: "max-content",
    maxWidth: "90vw",
  },
  variantTable: {
    width: "max-content",
    minWidth: "unset",
    tableLayout: "auto",
    fontSize: tokens.fontSizeBase100,
    lineHeight: "1.1",
    "& .fui-TableCell": {
      paddingTop: "1px",
      paddingBottom: "1px",
      fontSize: tokens.fontSizeBase100,
      lineHeight: "1.1",
    },
    "& .fui-TableHeaderCell": {
      paddingTop: "1px",
      paddingBottom: "1px",
      fontSize: tokens.fontSizeBase100,
      color: tokens.colorNeutralForeground3,
      lineHeight: "1.05",
    },
  },
  variantValueCell: {
    maxWidth: "200px",
    whiteSpace: "normal",
    wordBreak: "break-word",
  },
  saveCell: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  supplierCell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "6px",
  },
  deliveryCell: {
    display: "inline-flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
  },
  publishedCell: {
    display: "inline-flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
  },
  publishedBadge: {
    backgroundColor: "#edf5ff",
    border: "1px solid #b5d0ff",
    color: "#0b4d8c",
  },
  supplierName: {
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tableActionButton: {
    borderRadius: "6px",
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    opacity: 1,
    minHeight: "28px",
    paddingInline: "10px",
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    fontWeight: tokens.fontWeightSemibold,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
      opacity: 1,
    },
    "&:disabled": {
      backgroundColor: tokens.colorNeutralBackground1,
      opacity: 1,
    },
  },
  listSaveButton: {
    paddingInline: "10px",
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
  selectCheckboxWrap: {
    display: "flex",
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  viewButton: {
    fontWeight: tokens.fontWeightSemibold,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground1,
    },
  },
  viewLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "28px",
    paddingInline: "10px",
    borderRadius: "6px",
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    opacity: 1,
    textDecorationLine: "none",
    "&:hover": {
      textDecorationLine: "none",
      backgroundColor: tokens.colorNeutralBackground2,
      opacity: 1,
    },
  },
  supplierLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "28px",
    paddingInline: "10px",
    borderRadius: "6px",
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    textDecorationLine: "none",
    opacity: 1,
    "&:hover": {
      textDecorationLine: "none",
      backgroundColor: tokens.colorNeutralBackground2,
      opacity: 1,
    },
  },
  supplierLinkDisabled: {
    color: tokens.colorNeutralForegroundDisabled,
    border: `1px solid ${tokens.colorNeutralStrokeDisabled}`,
    cursor: "not-allowed",
    pointerEvents: "none",
  },
  wishlistMenuItemInList: {
    backgroundColor: "#e9f7ec",
    color: "#1f6f3b",
    opacity: 1,
    "&:hover": {
      backgroundColor: "#e9f7ec",
    },
    "&:active": {
      backgroundColor: "#e9f7ec",
    },
  },
  wishlistMenuItemRow: {
    width: "100%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  wishlistMenuCheck: {
    color: "#1f6f3b",
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: 1,
  },
  selectionActions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px",
    justifyContent: "flex-end",
  },
  unselectButton: {
    selectors: {
      "&:not(:disabled)": {
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        backgroundColor: tokens.colorNeutralBackground1,
        color: tokens.colorNeutralForeground1,
      },
      "&:not(:disabled):hover": {
        backgroundColor: tokens.colorNeutralBackground2,
      },
    },
  },
  selectionCount: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: "12px",
  },
  deliveryDialog: {
    width: "min(864px, 96vw)",
  },
  deliveryDialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  deliveryDialogSubtitle: {
    marginTop: "-4px",
  },
  deliveryListTableWrap: {
    maxHeight: "360px",
    overflowY: "auto",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
  },
  deliveryCreateRow: {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
  },
  deliveryCreateInput: {
    flex: 1,
  },
  deliveryListRowSelectable: {
    cursor: "pointer",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  deliveryListRowSelected: {
    backgroundColor: "#eaf4ff",
    "&:hover": {
      backgroundColor: "#eaf4ff",
    },
  },
  deliveryDialogActions: {
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "4px",
  },
});

type ProductListItem = {
  id: string;
  spu: string;
  workflow_status?: string | null;
  workflow_run?: string | null;
  title: string | null;
  subtitle: string | null;
  tags: string | null;
  product_type: string | null;
  shopify_category_name: string | null;
  google_taxonomy_l1?: string | null;
  google_taxonomy_l2?: string | null;
  google_taxonomy_l3?: string | null;
  images: unknown;
  image_folder: string | null;
  vendor?: string | null;
  supplier_1688_url?: string | null;
  created_at: string | null;
  updated_at: string | null;
  variant_count: number;
  is_exported: boolean;
  latest_exported_at: string | null;
  published_channels?: string[];
  delivery_partners?: string[];
  wishlist_ids?: string[];
  thumbnail_url?: string | null;
  small_image_url?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  b2c_price_min?: number | null;
  b2c_price_max?: number | null;
  variant_preview?: Array<{
    sku: string | null;
    option1: string | null;
    option2: string | null;
    option3: string | null;
    option4: string | null;
    variation_color_se: string | null;
    variation_size_se: string | null;
    variation_other_se: string | null;
    variation_amount_se: string | null;
    b2b_dropship_price_se: number | null;
    b2b_dropship_price_no: number | null;
    b2b_dropship_price_dk: number | null;
    b2b_dropship_price_fi: number | null;
  }>;
};

type Wishlist = {
  id: string;
  name: string;
  created_at: string | null;
  item_count?: number;
};

type DeliveryPartner = "digideal" | "letsdeal";

type DeliveryList = {
  id: string;
  name: string;
  partner?: string | null;
  created_at: string | null;
  item_count?: number;
};

type ProductVariantPreview = NonNullable<ProductListItem["variant_preview"]>[number];

const pageSizeOptions = [25, 50, 100, 200];
const priceFormatter = new Intl.NumberFormat("sv-SE", {
  maximumFractionDigits: 0,
});
const PUBLISHED_CHANNEL_RANK: Record<string, number> = {
  tingelo: 0,
  sparkler: 1,
  wellando: 2,
};
const CJK_CHAR_PATTERN = /[\u3400-\u9FFF\uF900-\uFAFF]/g;
const DELIVERY_PARTNER_LABEL: Record<DeliveryPartner, string> = {
  digideal: "DigiDeal.se",
  letsdeal: "LetsDeal",
};

const formatPriceValue = (value: number) => priceFormatter.format(value);

const formatPriceRange = (
  min: number | null | undefined,
  max: number | null | undefined,
  notAvailableLabel: string,
  currencyLabel: string
) => {
  if (min === null || min === undefined) {
    if (max === null || max === undefined) return notAvailableLabel;
    return `${formatPriceValue(max)} ${currencyLabel}`;
  }
  if (max === null || max === undefined) {
    return `${formatPriceValue(min)} ${currencyLabel}`;
  }
  if (min === max) {
    return `${formatPriceValue(min)} ${currencyLabel}`;
  }
  return `${formatPriceValue(min)} - ${formatPriceValue(max)} ${currencyLabel}`;
};

const formatShortDate = (value?: string | null) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const RECENT_DAYS_WINDOW = 7;

const isDateWithinDays = (value: string | null | undefined, days: number) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = Date.now();
  const maxAgeMs = days * 24 * 60 * 60 * 1000;
  const ageMs = now - date.getTime();
  return ageMs >= 0 && ageMs <= maxAgeMs;
};

const toExternalUrl = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  return `https://${raw.replace(/^\/+/, "")}`;
};

const sortPublishedChannels = (channels: string[]) =>
  channels
    .slice()
    .sort(
      (left, right) =>
        (PUBLISHED_CHANNEL_RANK[left] ?? 99) - (PUBLISHED_CHANNEL_RANK[right] ?? 99)
    );

const formatRangeSummary = (
  from: string,
  to: string,
  emptyLabel: string
) => {
  if (!from && !to) return emptyLabel;
  if (from && to) {
    return `${formatShortDate(from)} - ${formatShortDate(to)}`;
  }
  if (from) {
    return `${formatShortDate(from)} →`;
  }
  return `→ ${formatShortDate(to)}`;
};

const readResponseError = async (response: Response, fallback: string) => {
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

const sanitizeSwedishVariantPart = (value: string | null) => {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const cleaned = raw
    .replace(CJK_CHAR_PATTERN, "")
    .replace(/[，。；：、]/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*[/|]\s*$/g, "")
    .replace(/^\s*[/|]\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || raw;
};

const buildSwedishVariantLabel = (variant: ProductVariantPreview) =>
  [
    variant.variation_color_se,
    variant.variation_size_se,
    variant.variation_other_se,
    variant.variation_amount_se,
  ]
    .map(sanitizeSwedishVariantPart)
    .filter(Boolean)
    .join(" / ");

const buildProductHref = (id: string, spu: string | null | undefined) => {
  const normalizedSpu = String(spu ?? "").trim();
  if (normalizedSpu) {
    return `/app/products/spu/${encodeURIComponent(normalizedSpu)}`;
  }
  return `/app/products/${id}`;
};

const normalizeDeliveryPartner = (value: string | null | undefined): DeliveryPartner => {
  return String(value ?? "").trim().toLowerCase() === "letsdeal"
    ? "letsdeal"
    : "digideal";
};

function ProductsPageInner() {
  const styles = useStyles();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();

  const sortOptions = useMemo(
    () => [
      { value: "updated_desc", label: t("products.sort.updatedNewest") },
      { value: "added_desc", label: t("products.sort.addedNewest") },
      { value: "title_asc", label: t("products.sort.titleAZ") },
    ],
    [t]
  );
  const savedFilterOptions = useMemo(
    () => [
      { value: "all", label: t("products.savedFilter.showAll") },
      { value: "saved", label: t("products.savedFilter.showSaved") },
      { value: "unsaved", label: t("products.savedFilter.showNotSaved") },
    ],
    [t]
  );

  const [searchInput, setSearchInput] = useState("");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [advancedError, setAdvancedError] = useState<string | null>(null);
  const [advancedQuery, setAdvancedQuery] = useState<string>("");
  const [advancedCoreTerms, setAdvancedCoreTerms] = useState<string[]>([]);
  const [advancedSupportTerms, setAdvancedSupportTerms] = useState<string[]>([]);
  const [advancedPrompt, setAdvancedPrompt] = useState<string | null>(null);
  const [advancedRawResponse, setAdvancedRawResponse] = useState<string | null>(null);
  const [advancedRawJson, setAdvancedRawJson] = useState<Record<string, unknown> | null>(null);
  const [advancedDataOpen, setAdvancedDataOpen] = useState(false);
  const [sort, setSort] = useState("updated_desc");
  const [savedFilter, setSavedFilter] = useState("all");
  const [wishlistFilterId, setWishlistFilterId] = useState("all");
  const [categorySelections, setCategorySelections] = useState<CategorySelection[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<CategorySelection[]>([]);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [activeL1, setActiveL1] = useState<string | null>(null);
  const [activeL2, setActiveL2] = useState<string | null>(null);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [vendorOptions, setVendorOptions] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [updatedFrom, setUpdatedFrom] = useState("");
  const [updatedTo, setUpdatedTo] = useState("");
  const [addedFrom, setAddedFrom] = useState("");
  const [addedTo, setAddedTo] = useState("");
  const [hasVariants, setHasVariants] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [activeMarkets, setActiveMarkets] = useState<string[]>(["SE"]);
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [wishlistsLoading, setWishlistsLoading] = useState(true);
  const [wishlistsError, setWishlistsError] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [deliveryPartner, setDeliveryPartner] = useState<DeliveryPartner>("digideal");
  const [deliveryTargetProductIds, setDeliveryTargetProductIds] = useState<string[]>([]);
  const [deliveryLists, setDeliveryLists] = useState<DeliveryList[]>([]);
  const [deliveryListsLoading, setDeliveryListsLoading] = useState(false);
  const [deliveryListsError, setDeliveryListsError] = useState<string | null>(null);
  const [selectedDeliveryListId, setSelectedDeliveryListId] = useState<string | null>(
    null
  );
  const [deliveryNewListName, setDeliveryNewListName] = useState("");
  const [isCreatingDeliveryList, setIsCreatingDeliveryList] = useState(false);
  const [addingDeliveryListId, setAddingDeliveryListId] = useState<string | null>(null);
  const [deleteSelectionDialogOpen, setDeleteSelectionDialogOpen] = useState(false);
  const [pendingSaveProductIds, setPendingSaveProductIds] = useState<string[] | null>(
    null
  );
  const [isSavingSelection, setIsSavingSelection] = useState(false);
  const [isApplyingAction, setIsApplyingAction] = useState(false);
  const isRestoringRef = useRef(false);
  const skipUrlSyncRef = useRef(false);
  const loadRequestRef = useRef(0);
  const clearSelection = useCallback(() => {
    setSelectedRows(new Set());
    setDeleteSelectionDialogOpen(false);
  }, []);
  const searchParams = useSearchParams();
  const urlSearch = searchParams.toString();

  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const effectiveQuery =
    advancedMode && advancedQuery ? advancedQuery : debouncedSearch;
  const advancedCoreParam = advancedMode
    ? advancedCoreTerms
        .map((term) => term.trim())
        .filter(Boolean)
        .join("|")
    : "";

  const runAdvancedSearch = async () => {
    const query = searchInput.trim();
    if (!query || advancedLoading) return;
    setAdvancedLoading(true);
    setAdvancedError(null);
    try {
      const response = await fetch("/api/products/advanced-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message =
          payload?.error || t("products.filters.advancedSearchError");
        throw new Error(message);
      }
      const payload = await response.json();
      const nextQuery = String(payload?.expanded_query || query).trim();
      setAdvancedMode(true);
      setAdvancedQuery(nextQuery);
      setAdvancedCoreTerms(
        Array.isArray(payload?.core_terms) ? payload.core_terms : []
      );
      setAdvancedSupportTerms(
        Array.isArray(payload?.support_terms) ? payload.support_terms : []
      );
      setAdvancedPrompt(typeof payload?.prompt === "string" ? payload.prompt : null);
      setAdvancedRawResponse(
        typeof payload?.raw_response === "string" ? payload.raw_response : null
      );
      setAdvancedRawJson(
        payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null
      );
      setAdvancedDataOpen(false);
      setPage(1);
    } catch (err) {
      setAdvancedError((err as Error).message);
    } finally {
      setAdvancedLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchInput("");
    setAdvancedMode(false);
    setAdvancedQuery("");
    setAdvancedCoreTerms([]);
    setAdvancedSupportTerms([]);
    setAdvancedPrompt(null);
    setAdvancedRawResponse(null);
    setAdvancedRawJson(null);
    setAdvancedDataOpen(false);
    setAdvancedError(null);
    setPage(1);
  };
  const categorySearchNormalized = categorySearch.trim().toLowerCase();
  const categoryTokens = useMemo(
    () => categorySearchNormalized.split(/\s+/).filter(Boolean),
    [categorySearchNormalized]
  );
  const matchCategoryTokens = useMemo(
    () => (value: string) => {
      if (categoryTokens.length === 0) return true;
      const normalized = value.toLowerCase();
      return categoryTokens.some((token) => normalized.includes(token));
    },
    [categoryTokens]
  );
  const filteredCategories = useMemo(() => {
    if (categoryTokens.length === 0) return categories;
    return categories.filter((l1) => {
      if (matchCategoryTokens(l1.name)) {
        return true;
      }
      return (l1.children ?? []).some((l2) => {
        if (matchCategoryTokens(l2.name)) {
          return true;
        }
        return (l2.children ?? []).some((l3) =>
          matchCategoryTokens(l3.name)
        );
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

  const noBrandToken = "__no_brand__";
  const noVendorToken = "__no_vendor__";
  const brandLabel =
    selectedBrands.length === 0
      ? t("products.filters.brandPlaceholder")
      : selectedBrands.length === 1
        ? selectedBrands[0] === noBrandToken
          ? t("products.filters.noBrand")
          : selectedBrands[0]
        : t("products.filters.selectedCount", { count: selectedBrands.length });
  const vendorLabel =
    selectedVendors.length === 0
      ? t("products.filters.vendorPlaceholder")
      : selectedVendors.length === 1
        ? selectedVendors[0] === noVendorToken
          ? t("products.filters.noVendor")
          : selectedVendors[0]
        : t("products.filters.selectedCount", { count: selectedVendors.length });
  const updatedRangeSummary = formatRangeSummary(
    updatedFrom,
    updatedTo,
    t("products.filters.rangeAll")
  );
  const addedRangeSummary = formatRangeSummary(
    addedFrom,
    addedTo,
    t("products.filters.rangeAll")
  );

  const toggleBrand = (value: string) => {
    setSelectedBrands((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const toggleVendor = (value: string) => {
    setSelectedVendors((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const categorySummary =
    categorySelections.length === 0
      ? t("discovery.categories.all")
      : categorySelections.length <= 2
        ? categorySelections.map((item) => item.value).join(", ")
        : t("discovery.categories.selectedCount", {
            count: categorySelections.length,
          });
  const draftKeys = new Set(
    categoryDraft.map((item) => `${item.level}:${item.value}`)
  );
  const toggleDraftCategory = (level: "l1" | "l2" | "l3", value: string) => {
    setCategoryDraft((prev) => {
      const key = `${level}:${value}`;
      const exists = prev.some(
        (item) => item.level === level && item.value === value
      );
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

  const safeDecode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const parseCategoryParam = (value: string | null) => {
    if (!value) return [];
    return value
      .split("|")
      .map((entry) => {
        const [levelRaw, ...rest] = entry.split(":");
        const level = levelRaw as CategorySelection["level"];
        const encodedValue = rest.join(":");
        if (level !== "l1" && level !== "l2" && level !== "l3") return null;
        if (!encodedValue) return null;
        return { level, value: safeDecode(encodedValue) };
      })
      .filter((entry): entry is CategorySelection => Boolean(entry));
  };

  const buildCategoryParam = (selections: CategorySelection[]) => {
    if (selections.length === 0) return null;
    return selections
      .map(
        (selection) =>
          `${selection.level}:${encodeURIComponent(selection.value)}`
      )
      .join("|");
  };

  useEffect(() => {
    const controller = new AbortController();
    const loadFilters = async () => {
      try {
        const response = await fetch("/api/products/filters", {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json();
        setBrandOptions(Array.isArray(payload.brands) ? payload.brands : []);
        setVendorOptions(Array.isArray(payload.vendors) ? payload.vendors : []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    };

    loadFilters();

    return () => controller.abort();
  }, []);

  const fetchWishlists = useCallback(
    async (signal?: AbortSignal) => {
      setWishlistsLoading(true);
      setWishlistsError(null);
      try {
        const response = await fetch("/api/products/wishlists", { signal });
        if (!response.ok) {
          throw new Error(t("products.lists.error"));
        }
        const payload = await response.json();
        setWishlists(Array.isArray(payload.items) ? payload.items : []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setWishlistsError((err as Error).message);
        }
      } finally {
        setWishlistsLoading(false);
      }
    },
    [t]
  );

  const fetchDeliveryLists = useCallback(
    async (partner: DeliveryPartner, signal?: AbortSignal) => {
      setDeliveryListsLoading(true);
      setDeliveryListsError(null);
      try {
        const params = new URLSearchParams();
        params.set("partner", partner);
        const response = await fetch(
          `/api/product-delivery/digideal/lists?${params.toString()}`,
          {
          signal,
          }
        );
        if (!response.ok) {
          throw new Error(await readResponseError(response, t("products.delivery.errorLoad")));
        }
        const payload = await response.json();
        setDeliveryLists(Array.isArray(payload?.items) ? payload.items : []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setDeliveryListsError((err as Error).message);
        }
      } finally {
        setDeliveryListsLoading(false);
      }
    },
    [t]
  );

  const openDeliveryDialog = useCallback(
    (productIds: string[], partner: DeliveryPartner) => {
      const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
      if (uniqueProductIds.length === 0) return;
      setDeliveryPartner(partner);
      setDeliveryTargetProductIds(uniqueProductIds);
      setSelectedDeliveryListId(null);
      setDeliveryNewListName("");
      setDeliveryDialogOpen(true);
      void fetchDeliveryLists(partner);
    },
    [fetchDeliveryLists]
  );

  const addItemsToDeliveryList = useCallback(
    async (listId: string) => {
      if (deliveryTargetProductIds.length === 0) return;
      setAddingDeliveryListId(listId);
      setError(null);
      try {
        const response = await fetch("/api/product-delivery/digideal/lists/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listId,
            productIds: deliveryTargetProductIds,
          }),
        });
        if (!response.ok) {
          throw new Error(await readResponseError(response, t("products.delivery.errorAdd")));
        }
        setProducts((prev) =>
          prev.map((product) => {
            if (!deliveryTargetProductIds.includes(product.id)) return product;
            const partner = deliveryPartner;
            const partners = Array.isArray(product.delivery_partners)
              ? product.delivery_partners
              : [];
            if (partners.includes(partner)) return product;
            return {
              ...product,
              delivery_partners: [...partners, partner],
            };
          })
        );
        await fetchDeliveryLists(deliveryPartner);
        setDeliveryDialogOpen(false);
        setSelectedDeliveryListId(null);
        clearSelection();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setAddingDeliveryListId(null);
      }
    },
    [deliveryTargetProductIds, deliveryPartner, fetchDeliveryLists, t, clearSelection]
  );

  const createDeliveryList = useCallback(
    async () => {
      const trimmed = deliveryNewListName.trim();
      if (!trimmed) return;
      setIsCreatingDeliveryList(true);
      setError(null);
      try {
        const response = await fetch("/api/product-delivery/digideal/lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, partner: deliveryPartner }),
        });
        if (!response.ok) {
          throw new Error(
            await readResponseError(response, t("products.delivery.errorCreate"))
          );
        }
        const payload = await response.json().catch(() => null);
        const createdListId =
          payload &&
          typeof payload === "object" &&
          typeof (payload as { item?: { id?: unknown } }).item?.id === "string"
            ? ((payload as { item: { id: string } }).item.id as string)
            : null;
        if (createdListId) {
          setSelectedDeliveryListId(createdListId);
        }
        await fetchDeliveryLists(deliveryPartner);
        setDeliveryNewListName("");
        if (createdListId) {
          setSelectedDeliveryListId(createdListId);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsCreatingDeliveryList(false);
      }
    },
    [deliveryNewListName, deliveryPartner, fetchDeliveryLists, t]
  );

  const saveSelectedDeliveryList = useCallback(() => {
    if (!selectedDeliveryListId) return;
    void addItemsToDeliveryList(selectedDeliveryListId);
  }, [selectedDeliveryListId, addItemsToDeliveryList]);

  useEffect(() => {
    if (!selectedDeliveryListId) return;
    // During list creation/refresh, keep the current selection to avoid
    // clearing a just-created list before the refreshed dataset lands.
    if (isCreatingDeliveryList || deliveryListsLoading) return;
    if (!deliveryLists.some((list) => list.id === selectedDeliveryListId)) {
      setSelectedDeliveryListId(null);
    }
  }, [
    deliveryLists,
    selectedDeliveryListId,
    isCreatingDeliveryList,
    deliveryListsLoading,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    fetchWishlists(controller.signal);
    return () => controller.abort();
  }, [fetchWishlists]);

  useEffect(() => {
    if (wishlistsLoading || wishlistsError) return;
    if (wishlistFilterId === "all") return;
    if (!wishlists.some((list) => list.id === wishlistFilterId)) {
      setWishlistFilterId("all");
    }
  }, [wishlists, wishlistFilterId, wishlistsLoading, wishlistsError]);

  useEffect(() => {
    const controller = new AbortController();
    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        const response = await fetch("/api/products/categories", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(t("products.error.load"));
        }
        const payload = await response.json();
        setCategories(Array.isArray(payload.categories) ? payload.categories : []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      } finally {
        setCategoriesLoading(false);
      }
    };

    loadCategories();

    return () => controller.abort();
  }, [t]);

  useEffect(() => {
    if (categoryPopoverOpen) {
      setCategoryDraft(categorySelections);
    }
  }, [categoryPopoverOpen, categorySelections]);

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
    const params = new URLSearchParams(urlSearch);
    const nextSearch = params.get("q") ?? "";
    const nextSort = params.get("sort") ?? "updated_desc";
    const nextCategories = parseCategoryParam(params.get("categories"));
    const nextBrands = params.getAll("brand").filter(Boolean);
    const nextVendors = params.getAll("vendor").filter(Boolean);
    const nextUpdatedFrom = params.get("updatedFrom") ?? "";
    const nextUpdatedTo = params.get("updatedTo") ?? "";
    const nextAddedFrom = params.get("addedFrom") ?? "";
    const nextAddedTo = params.get("addedTo") ?? "";
    const nextHasVariants = params.get("hasVariants") === "true";
    const nextSavedFilter = params.get("saved") ?? "all";
    const nextWishlist = params.get("wishlistId") ?? "all";
    const nextPage = Math.max(1, Number(params.get("page") ?? "1"));
    const nextPageSize = Math.min(
      200,
      Math.max(1, Number(params.get("pageSize") ?? "25"))
    );

    skipUrlSyncRef.current = true;
    isRestoringRef.current = true;
    setSearchInput(nextSearch);
    setSort(nextSort);
    setCategorySelections(nextCategories);
    setSelectedBrands(nextBrands);
    setSelectedVendors(nextVendors);
    setUpdatedFrom(nextUpdatedFrom);
    setUpdatedTo(nextUpdatedTo);
    setAddedFrom(nextAddedFrom);
    setAddedTo(nextAddedTo);
    setHasVariants(nextHasVariants);
    setSavedFilter(nextSavedFilter);
    setWishlistFilterId(nextWishlist);
    setPage(nextPage);
    setPageSize(nextPageSize);
  }, [urlSearch]);

  useEffect(() => {
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    setPage(1);
  }, [
    debouncedSearch,
    sort,
    categorySelections,
    selectedBrands,
    selectedVendors,
    savedFilter,
    wishlistFilterId,
    updatedFrom,
    updatedTo,
    addedFrom,
    addedTo,
    hasVariants,
    pageSize,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++loadRequestRef.current;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (effectiveQuery) params.set("q", effectiveQuery);
      if (advancedCoreParam) params.set("coreTerms", advancedCoreParam);
      if (sort) params.set("sort", sort);
      const categoryParam = buildCategoryParam(categorySelections);
      if (categoryParam) params.set("categories", categoryParam);
      selectedBrands.forEach((brand) => params.append("brand", brand));
      selectedVendors.forEach((vendor) => params.append("vendor", vendor));
      if (updatedFrom) params.set("updatedFrom", updatedFrom);
      if (updatedTo) params.set("updatedTo", updatedTo);
      if (addedFrom) params.set("addedFrom", addedFrom);
      if (addedTo) params.set("addedTo", addedTo);
      if (hasVariants) params.set("hasVariants", "true");
      if (savedFilter !== "all") params.set("saved", savedFilter);
      if (wishlistFilterId !== "all") params.set("wishlistId", wishlistFilterId);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      try {
        const response = await fetch(`/api/products?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(t("products.error.load"));
        }

        const payload = await response.json();
        if (requestId !== loadRequestRef.current) return;
        setProducts(payload.items ?? []);
        setTotal(payload.total ?? 0);
        setActiveMarkets(
          Array.isArray(payload.active_markets) && payload.active_markets.length > 0
            ? payload.active_markets
            : ["SE"]
        );
      } catch (err) {
        if (
          requestId === loadRequestRef.current &&
          (err as Error).name !== "AbortError"
        ) {
          setError((err as Error).message);
        }
      } finally {
        if (requestId === loadRequestRef.current) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [
    effectiveQuery,
    advancedCoreParam,
    sort,
    categorySelections,
    selectedBrands,
    selectedVendors,
    updatedFrom,
    updatedTo,
    addedFrom,
    addedTo,
    hasVariants,
    savedFilter,
    wishlistFilterId,
    page,
    pageSize,
  ]);

  useEffect(() => {
    if (skipUrlSyncRef.current) {
      skipUrlSyncRef.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (sort !== "updated_desc") params.set("sort", sort);
    const categoryParam = buildCategoryParam(categorySelections);
    if (categoryParam) params.set("categories", categoryParam);
    selectedBrands.forEach((brand) => params.append("brand", brand));
    selectedVendors.forEach((vendor) => params.append("vendor", vendor));
    if (updatedFrom) params.set("updatedFrom", updatedFrom);
    if (updatedTo) params.set("updatedTo", updatedTo);
    if (addedFrom) params.set("addedFrom", addedFrom);
    if (addedTo) params.set("addedTo", addedTo);
    if (hasVariants) params.set("hasVariants", "true");
    if (savedFilter !== "all") params.set("saved", savedFilter);
    if (wishlistFilterId !== "all") params.set("wishlistId", wishlistFilterId);
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 25) params.set("pageSize", String(pageSize));

    const nextQuery = params.toString();
    const currentQuery = urlSearch;
    if (nextQuery === currentQuery) return;
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.push(nextUrl);
  }, [
    debouncedSearch,
    sort,
    categorySelections,
    selectedBrands,
    selectedVendors,
    updatedFrom,
    updatedTo,
    addedFrom,
    addedTo,
    hasVariants,
    savedFilter,
    wishlistFilterId,
    page,
    pageSize,
    pathname,
    router,
    urlSearch,
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const normalizedMarkets = useMemo(
    () => activeMarkets.map((market) => market.toUpperCase()),
    [activeMarkets]
  );
  const marketColumns = useMemo(
    () =>
      [
        {
          key: "SE",
          label: "SE",
          currency: "SEK",
          getValue: (variant: ProductVariantPreview) =>
            variant.b2b_dropship_price_se,
        },
        {
          key: "NO",
          label: "NO",
          currency: "NOK",
          getValue: (variant: ProductVariantPreview) =>
            variant.b2b_dropship_price_no,
        },
        {
          key: "DK",
          label: "DK",
          currency: "DKK",
          getValue: (variant: ProductVariantPreview) =>
            variant.b2b_dropship_price_dk,
        },
        {
          key: "FI",
          label: "FI",
          currency: "EUR",
          getValue: (variant: ProductVariantPreview) =>
            variant.b2b_dropship_price_fi,
        },
      ].filter((column) => normalizedMarkets.includes(column.key)),
    [normalizedMarkets]
  );
  const orderedProductIds = useMemo(
    () => products.map((product) => product.id),
    [products]
  );
  const { clearAnchor: clearRowSelectionAnchor, toggleWithRange: applyRowSelection } =
    useShiftRangeSelection<string>({
      orderedIds: orderedProductIds,
      selectedIds: selectedRows,
      setSelectedIds: setSelectedRows,
    });
  const isInteractiveRowTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest(
        "a,button,input,textarea,select,label,[role='button'],[role='menuitem'],[data-no-row-select='true']"
      )
    );
  }, []);
  const allSelected =
    products.length > 0 && products.every((product) => selectedRows.has(product.id));
  const someSelected = products.some((product) => selectedRows.has(product.id));
  const selectAllState = allSelected ? true : someSelected ? "mixed" : false;
  const selectedItems = useMemo(
    () => products.filter((product) => selectedRows.has(product.id)),
    [products, selectedRows]
  );
  const hasSelection = selectedItems.length > 0;

  useEffect(() => {
    if (!hasSelection) {
      setDeleteSelectionDialogOpen(false);
    }
  }, [hasSelection]);

  const saveItemsToWishlist = async (
    wishlistId: string,
    productIds: string[],
    wishlistName?: string
  ) => {
    if (productIds.length === 0) return;
    setIsSavingSelection(true);
    setError(null);
    try {
      const response = await fetch("/api/products/wishlists/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wishlistId,
          items: productIds.map((id) => ({ product_id: id })),
        }),
      });
      if (!response.ok) {
        let message = t("products.lists.saveError");
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch {
          // ignore parse failures
        }
        throw new Error(message);
      }
      setProducts((prev) =>
        prev.map((product) => {
          if (!productIds.includes(product.id)) return product;
          const existing = Array.isArray(product.wishlist_ids)
            ? product.wishlist_ids
            : [];
          if (existing.includes(wishlistId)) return product;
          return {
            ...product,
            wishlist_ids: [...existing, wishlistId],
          };
        })
      );
      if (wishlistName) {
        await fetchWishlists();
      }
      if (selectedRows.size > 0) {
        clearSelection();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSavingSelection(false);
    }
  };

  const saveSelectedToWishlist = async (
    wishlistId: string,
    wishlistName?: string
  ) => {
    await saveItemsToWishlist(
      wishlistId,
      selectedItems.map((item) => item.id),
      wishlistName
    );
  };

  const saveProductToWishlist = async (productId: string, wishlistId: string) => {
    await saveItemsToWishlist(wishlistId, [productId]);
  };

  const handleDeleteSelectedProducts = async () => {
    const productIds = selectedItems.map((item) => item.id);
    if (productIds.length === 0 || isApplyingAction) return;

    setIsApplyingAction(true);
    setError(null);
    try {
      const response = await fetch("/api/products/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          productIds,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof payload?.error === "string" && payload.error
            ? payload.error
            : t("products.actions.deleteError");
        throw new Error(message);
      }

      const failed: Array<{ spu?: unknown; id?: unknown }> = Array.isArray(
        payload?.failed
      )
        ? payload.failed
        : [];
      const deleted: Array<{ id?: unknown }> = Array.isArray(payload?.deleted)
        ? payload.deleted
        : [];
      const deletedIds = new Set(
        deleted
          .map((entry: { id?: unknown }) => String(entry.id ?? "").trim())
          .filter(Boolean)
      );

      if (deletedIds.size > 0) {
        setProducts((prev) => prev.filter((product) => !deletedIds.has(product.id)));
        setTotal((prev) => Math.max(0, prev - deletedIds.size));
      }

      clearSelection();

      if (failed.length > 0) {
        const preview = failed
          .slice(0, 3)
          .map((entry: { spu?: unknown; id?: unknown }) =>
            String(entry.spu ?? entry.id ?? "").trim()
          )
          .filter(Boolean)
          .join(", ");

        setError(
          t("products.actions.deletePartialError", {
            count: failed.length,
            details: preview || t("common.notAvailable"),
          })
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsApplyingAction(false);
    }
  };

  const handleSendSelectedToReEdit = async () => {
    const productIds = selectedItems.map((item) => item.id);
    if (productIds.length === 0 || isApplyingAction) return;

    setIsApplyingAction(true);
    setError(null);
    try {
      const response = await fetch("/api/products/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "re_edit",
          productIds,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof payload?.error === "string" && payload.error
            ? payload.error
            : "Unable to queue products for re-edit.";
        throw new Error(message);
      }

      const queuedRows: Array<{ id?: unknown; spu?: unknown }> = Array.isArray(payload?.queued)
        ? payload.queued
        : [];
      const failedRows: Array<{ id?: unknown; spu?: unknown; error?: unknown }> = Array.isArray(
        payload?.failed
      )
        ? payload.failed
        : [];
      const queuedIds = new Set(
        queuedRows
          .map((entry) => String(entry.id ?? "").trim())
          .filter(Boolean)
      );
      const queuedSpus = new Set(
        queuedRows
          .map((entry) => String(entry.spu ?? "").trim())
          .filter(Boolean)
      );

      if (queuedIds.size > 0 || queuedSpus.size > 0) {
        setProducts((prev) =>
          prev.map((product) => {
            if (!queuedIds.has(product.id) && !queuedSpus.has(product.spu)) {
              return product;
            }
            return {
              ...product,
              workflow_status: "re_editing",
              workflow_run:
                typeof payload?.run === "string" && payload.run.trim()
                  ? payload.run.trim()
                  : product.workflow_run ?? null,
            };
          })
        );
      }

      clearSelection();

      if (failedRows.length > 0) {
        const preview = failedRows
          .slice(0, 3)
          .map((entry) => String(entry.spu ?? entry.id ?? "").trim())
          .filter(Boolean)
          .join(", ");
        setError(
          `Queued ${queuedRows.length}/${productIds.length} for re-edit. Failed: ${
            failedRows.length
          } (${preview || t("common.notAvailable")}).`
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsApplyingAction(false);
    }
  };

  const createWishlist = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const response = await fetch("/api/products/wishlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!response.ok) {
      let message = t("products.lists.createError");
      try {
        const payload = await response.json();
        if (payload?.error) message = payload.error;
      } catch {
        // ignore parse failures
      }
      throw new Error(message);
    }
    const payload = await response.json();
    return payload.item as Wishlist;
  };

  const handleCreateWishlist = async () => {
    if (!newListName.trim()) return;
    setIsSavingSelection(true);
    setError(null);
    try {
      const productIds =
        pendingSaveProductIds ?? selectedItems.map((item) => item.id);
      const created = await createWishlist(newListName);
      if (!created) return;
      setWishlists((prev) => [created, ...prev]);
      setNewListName("");
      setNewListDialogOpen(false);
      await saveItemsToWishlist(created.id, productIds, created.name);
      setPendingSaveProductIds(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSavingSelection(false);
    }
  };

  const rows = useMemo(
    () =>
      products.map((product) => {
        const title = product.title ?? product.spu;
        const thumb = product.thumbnail_url ?? getThumbnailUrl(product, null);
        const preview = product.small_image_url ?? thumb;
        const isSelected = selectedRows.has(product.id);
        const priceLabel = formatPriceRange(
          product.price_min,
          product.price_max,
          t("common.notAvailable"),
          t("common.currencySek")
        );
        const b2cPriceLabel = formatPriceRange(
          product.b2c_price_min,
          product.b2c_price_max,
          t("common.notAvailable"),
          t("common.currencySek")
        );
        const taxonomyParts = [
          product.google_taxonomy_l1,
          product.google_taxonomy_l2,
          product.google_taxonomy_l3,
        ].filter(Boolean) as string[];
        const taxonomyLevels = ["l1", "l2", "l3"] as const;
        const previewVariants = product.variant_preview ?? [];
        const hasPreview =
          product.variant_count > 1 && previewVariants.length > 1;
        const workflowStatus =
          String(product.workflow_status ?? "")
            .trim()
            .toLowerCase() || "active";
        const isReEditing = workflowStatus === "re_editing";
        const workflowStatusLabel = isReEditing ? "Re-editing" : "Active";
        const reEditParams = new URLSearchParams();
        reEditParams.set("tab", "spu");
        if (product.workflow_run) {
          reEditParams.set("run", product.workflow_run);
        }
        if (product.spu) {
          reEditParams.set("spu", product.spu);
        }
        const reEditHref = `/app/production/draft-explorer?${reEditParams.toString()}`;
        const canOpenReEdit = isReEditing && reEditParams.toString().length > 0;
        const supplierUrl = toExternalUrl(product.supplier_1688_url);
        const deliveryPartners = Array.isArray(product.delivery_partners)
          ? product.delivery_partners
          : [];
        const normalizedDeliveryPartners = Array.from(
          new Set(
            deliveryPartners
              .map((value) => normalizeDeliveryPartner(value))
              .filter(Boolean)
          )
        );
        const productWishlistIds = Array.isArray(product.wishlist_ids)
          ? product.wishlist_ids
          : [];
        const productWishlistIdSet = new Set(productWishlistIds);
        const wishlistsAlreadyIn = wishlists.filter((list) =>
          productWishlistIdSet.has(list.id)
        );
        const wishlistsAvailable = wishlists.filter(
          (list) => !productWishlistIdSet.has(list.id)
        );
        const publishedChannels = sortPublishedChannels(
          Array.isArray(product.published_channels)
            ? product.published_channels.filter((value) => Boolean(value))
            : []
        );
        const publishedChannelLabels = publishedChannels
          .map((channel) => {
            if (channel === "tingelo") {
              return t("products.published.channel.tingelo");
            }
            if (channel === "sparkler") {
              return t("products.published.channel.sparkler");
            }
            if (channel === "wellando") {
              return t("products.published.channel.wellando");
            }
            return null;
          })
          .filter((value): value is string => Boolean(value));
        const isCreatedRecent = isDateWithinDays(
          product.created_at,
          RECENT_DAYS_WINDOW
        );
        const isUpdatedRecent = isDateWithinDays(
          product.updated_at,
          RECENT_DAYS_WINDOW
        );
        const hasRecentDate = isCreatedRecent || isUpdatedRecent;
        const dateValueClassName = mergeClasses(
          styles.dateValue,
          hasRecentDate ? styles.dateValueRecent : undefined
        );

        return (
          <TableRow
            key={product.id}
            className={mergeClasses(
              styles.tableRowSelectable,
              isSelected ? styles.tableRowSelected : undefined,
              isReEditing ? styles.tableRowReEditing : undefined
            )}
            onClick={(event) => {
              if (isInteractiveRowTarget(event.target)) return;
              applyRowSelection(product.id, !isSelected, event);
            }}
          >
            <TableCell className={styles.imageCol}>
              {thumb ? (
                <span className={styles.thumbnailWrap}>
                  <Image
                    src={thumb}
                    alt={title}
                    className={styles.thumbnail}
                    loading="lazy"
                  />
                  {preview ? (
                    <span
                      className={mergeClasses(styles.previewLayer, "previewLayer")}
                      aria-hidden="true"
                    >
                      <span className={styles.previewBox}>
                        <Image
                          src={preview}
                          alt={title}
                          className={styles.previewImage}
                          loading="lazy"
                        />
                      </span>
                    </span>
                  ) : null}
                </span>
              ) : (
                <div className={styles.thumbnail} />
              )}
            </TableCell>
            <TableCell className={styles.productCol}>
              <div className={styles.productStack}>
                <Link
                  href={buildProductHref(product.id, product.spu)}
                  className={styles.productTitleLink}
                >
                  <Text as="span" className={styles.productTitleText}>
                    {title}
                  </Text>
                </Link>
                {taxonomyParts.length > 0 ? (
                  <div className={styles.breadcrumbRow}>
                    {taxonomyParts.map((crumb, index) => (
                      <span key={`${crumb}-${index}`}>
                        <button
                          type="button"
                          className={styles.breadcrumbLink}
                          onClick={() => {
                            setCategorySelections([
                              { level: taxonomyLevels[index], value: crumb },
                            ]);
                            setPage(1);
                          }}
                        >
                          {crumb}
                        </button>
                        {index < taxonomyParts.length - 1 ? (
                          <span className={styles.breadcrumbDivider}> / </span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                ) : (
                  <Text size={200} className={styles.metaText}>
                    {t("products.uncategorized")}
                  </Text>
                )}
              </div>
            </TableCell>
            <TableCell className={styles.spuCol}>
              <Text size={200}>{product.spu}</Text>
            </TableCell>
            <TableCell className={styles.supplierCol}>
              <div className={styles.supplierCell}>
                {supplierUrl ? (
                  <a
                    href={supplierUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.supplierLink}
                  >
                    {t("products.table.supplierLink")}
                  </a>
                ) : (
                  <span
                    className={mergeClasses(
                      styles.supplierLink,
                      styles.supplierLinkDisabled
                    )}
                  >
                    {t("products.table.supplierLink")}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell>
              <div className={styles.dateStack}>
                <div className={styles.dateRow}>
                  <Text className={styles.dateLabel}>
                    {t("products.table.createdLabel")}
                  </Text>
                  <Text className={dateValueClassName}>
                    {formatShortDate(product.created_at)}
                  </Text>
                </div>
                <div className={styles.dateRow}>
                  <Text className={styles.dateLabel}>
                    {t("products.table.updated")}
                  </Text>
                  <Text className={dateValueClassName}>
                    {formatShortDate(product.updated_at)}
                  </Text>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className={styles.variantMetaRow}>
                {hasPreview ? (
                  <Popover
                    openOnHover
                    positioning={{
                      position: "after",
                      align: "start",
                      offset: { mainAxis: 8, crossAxis: 0 },
                      pinned: true,
                    }}
                  >
                    <PopoverTrigger disableButtonEnhancement>
                      <Badge
                        appearance="outline"
                        color="brand"
                        size="small"
                        className={mergeClasses(
                          styles.variantBadge,
                          styles.variantBadgeInteractive
                        )}
                        style={{ backgroundColor: tokens.colorNeutralBackground1 }}
                        aria-label={t("products.variant.count", {
                          count: product.variant_count,
                        })}
                        tabIndex={0}
                      >
                        {product.variant_count}
                      </Badge>
                    </PopoverTrigger>
                    <PopoverSurface className={styles.variantPopover}>
                      <Table size="small" className={styles.variantTable}>
                        <TableHeader>
                          <TableRow>
                            <TableHeaderCell>{t("common.sku")}</TableHeaderCell>
                            <TableHeaderCell>{t("common.variant")}</TableHeaderCell>
                            {marketColumns.map((column) => (
                              <TableHeaderCell key={column.key}>
                                {column.label}
                              </TableHeaderCell>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewVariants.map((variant, index) => {
                            const variantName = buildSwedishVariantLabel(variant);
                            return (
                              <TableRow key={`${variant.sku ?? "sku"}-${index}`}>
                                <TableCell>{variant.sku ?? t("common.notAvailable")}</TableCell>
                                <TableCell className={styles.variantValueCell}>
                                  {variantName || t("products.variant.default")}
                                </TableCell>
                                {marketColumns.map((column) => (
                                  <TableCell key={`${variant.sku}-${column.key}`}>
                                    {formatCurrency(
                                      column.getValue(variant),
                                      column.currency
                                    )}
                                  </TableCell>
                                ))}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </PopoverSurface>
                  </Popover>
                ) : (
                  <Badge
                    appearance="outline"
                    color="brand"
                    size="small"
                    className={styles.variantBadge}
                    style={{ backgroundColor: tokens.colorNeutralBackground1 }}
                    aria-label={t("products.variant.count", {
                      count: product.variant_count,
                    })}
                  >
                    {product.variant_count}
                  </Badge>
                )}
                <div className={styles.priceStack}>
                  <Text size={200} className={styles.metaText}>
                    B2B: {priceLabel}
                  </Text>
                  <Text size={200} className={styles.metaText}>
                    B2C: {b2cPriceLabel}
                  </Text>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className={styles.saveCell}>
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <Button
                      appearance="outline"
                      size="small"
                      className={mergeClasses(
                        styles.tableActionButton,
                        styles.listSaveButton
                      )}
                    >
                      {t("common.save")}
                    </Button>
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      {wishlistsLoading ? (
                        <MenuItem disabled>{t("products.lists.loading")}</MenuItem>
                      ) : wishlistsError ? (
                        <MenuItem disabled>{wishlistsError}</MenuItem>
                      ) : wishlists.length === 0 ? (
                        <MenuItem disabled>{t("products.lists.empty")}</MenuItem>
                      ) : (
                        <>
                          {wishlistsAlreadyIn.map((list) => (
                            <MenuItem
                              key={list.id}
                              disabled
                              className={styles.wishlistMenuItemInList}
                            >
                              <span className={styles.wishlistMenuItemRow}>
                                <span>{list.name}</span>
                                <span className={styles.wishlistMenuCheck}>✓</span>
                              </span>
                            </MenuItem>
                          ))}
                          {wishlistsAlreadyIn.length > 0 &&
                          wishlistsAvailable.length > 0 ? (
                            <MenuDivider />
                          ) : null}
                          {wishlistsAvailable.map((list) => (
                            <MenuItem
                              key={list.id}
                              onClick={() => saveProductToWishlist(product.id, list.id)}
                            >
                              {list.name}
                            </MenuItem>
                          ))}
                        </>
                      )}
                      <MenuDivider />
                      <MenuItem
                        onClick={() => {
                          setPendingSaveProductIds([product.id]);
                          setNewListDialogOpen(true);
                        }}
                      >
                        {t("products.lists.new")}
                      </MenuItem>
                      <MenuDivider />
                      <MenuItem onClick={() => openDeliveryDialog([product.id], "digideal")}>
                        Deliver to DigiDeal.se
                      </MenuItem>
                      <MenuItem onClick={() => openDeliveryDialog([product.id], "letsdeal")}>
                        Deliver to LetsDeal
                      </MenuItem>
                    </MenuList>
                  </MenuPopover>
                </Menu>
              </div>
            </TableCell>
            <TableCell>
              <Link
                href={buildProductHref(product.id, product.spu)}
                className={styles.viewLink}
              >
                {t("common.view")}
              </Link>
            </TableCell>
            <TableCell className={styles.publishedCol}>
              <div className={styles.publishedCell}>
                {publishedChannelLabels.map((label) => (
                  <span
                    key={`${product.id}-${label}`}
                    className={mergeClasses(styles.statusBadge, styles.publishedBadge)}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </TableCell>
            <TableCell>
              {canOpenReEdit ? (
                <Link
                  href={reEditHref}
                  className={styles.viewLink}
                  title="Open in Draft Explorer"
                >
                  editing
                </Link>
              ) : (
                <span
                  className={mergeClasses(
                    styles.statusBadge,
                    isReEditing ? styles.statusBadgeReEditing : styles.statusBadgeActive
                  )}
                >
                  {workflowStatusLabel}
                </span>
              )}
            </TableCell>
            <TableCell className={styles.deliveryCol}>
              <div className={styles.deliveryCell}>
                {normalizedDeliveryPartners.map((partner) => (
                  <span
                    key={`${product.id}-${partner}`}
                    className={mergeClasses(
                      styles.statusBadge,
                      partner === "letsdeal"
                        ? styles.deliveryBadgeLetsDeal
                        : styles.deliveryBadgeDigiDeal
                    )}
                  >
                    {DELIVERY_PARTNER_LABEL[partner]}
                  </span>
                ))}
              </div>
            </TableCell>
            <TableCell>
              <div className={styles.selectCheckboxWrap}>
                <Checkbox
                  checked={isSelected}
                  aria-label={t("common.selectItem", { item: title })}
                  className={styles.selectCheckbox}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event, data) => {
                    applyRowSelection(product.id, data.checked === true, event);
                  }}
                />
              </div>
            </TableCell>
          </TableRow>
        );
      }),
    [
      products,
      marketColumns,
      selectedRows,
      styles,
      t,
      wishlists,
      wishlistsLoading,
      wishlistsError,
      saveProductToWishlist,
      openDeliveryDialog,
      isInteractiveRowTarget,
      applyRowSelection,
    ]
  );

  return (
    <div className={styles.layout}>
      <Card className={styles.controlsCard}>
        <div className={styles.topRow}>
          <div className={styles.topLeft}>
            <Field
              label={
                <span className={styles.searchLabelRow}>
                  <span className={styles.filterLabel}>
                    {t("products.filters.search")}
                  </span>
                  <button
                    type="button"
                    className={mergeClasses(
                      styles.advancedSearchButton,
                      advancedMode ? styles.advancedSearchButtonActive : undefined
                    )}
                    onClick={runAdvancedSearch}
                    disabled={!searchInput.trim() || advancedLoading}
                  >
                    {advancedLoading
                      ? t("products.filters.advancedSearchLoading")
                      : t("products.filters.advancedSearch")}
                  </button>
                  <button
                    type="button"
                    className={styles.advancedSearchButton}
                    onClick={clearSearch}
                    disabled={!searchInput.trim() && !advancedMode}
                  >
                    {t("common.clear")}
                  </button>
                  {advancedRawJson ? (
                    <button
                      type="button"
                      className={styles.advancedSearchButton}
                      onClick={() => setAdvancedDataOpen(true)}
                    >
                      {t("products.filters.advancedSearchShowData")}
                    </button>
                  ) : null}
                </span>
              }
              className={styles.filterField}
            >
              <Input
                value={searchInput}
                onChange={(_, data) => {
                  setSearchInput(data.value);
                  if (advancedMode) {
                    setAdvancedMode(false);
                    setAdvancedQuery("");
                    setAdvancedCoreTerms([]);
                    setAdvancedSupportTerms([]);
                    setAdvancedPrompt(null);
                    setAdvancedRawResponse(null);
                    setAdvancedRawJson(null);
                    setAdvancedDataOpen(false);
                  }
                  if (advancedError) {
                    setAdvancedError(null);
                  }
                }}
                placeholder={t("products.filters.searchPlaceholder")}
                className={styles.searchInput}
              />
            </Field>
            <Field
              label={<span className={styles.filterLabel}>{t("products.filters.category")}</span>}
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
                                  activeL1 === l1.name ? styles.categoryNavActive : undefined
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
                          {filteredL2Nodes.map((l2) => (
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
                                checked={draftKeys.has(`l2:${l2.name}`)}
                                className={styles.categoryCheckbox}
                                aria-label={t("common.selectItem", { item: l2.name })}
                                onChange={() => toggleDraftCategory("l2", l2.name)}
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
                          ))}
                        </div>
                        <div className={styles.categoryColumn}>
                          <Text className={styles.categoryColumnTitle}>
                            {t("discovery.categories.level3")}
                          </Text>
                          {filteredL3Nodes.map((l3) => (
                            <div
                              key={l3.name}
                              className={mergeClasses(
                                styles.categoryItem,
                                styles.categoryItemInteractive
                              )}
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleDraftCategory("l3", l3.name)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  toggleDraftCategory("l3", l3.name);
                                }
                              }}
                            >
                              <Checkbox
                                checked={draftKeys.has(`l3:${l3.name}`)}
                                className={styles.categoryCheckbox}
                                aria-label={t("common.selectItem", { item: l3.name })}
                                onChange={() => toggleDraftCategory("l3", l3.name)}
                                onClick={(event) => event.stopPropagation()}
                              />
                              <span className={styles.categoryNavButton}>{l3.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  <div className={styles.categoryActions}>
                    {categorySelections.length > 0 ? (
                      <Button appearance="subtle" onClick={clearCategory}>
                        {t("common.clear")}
                      </Button>
                    ) : null}
                    <Button
                      appearance="primary"
                      onClick={() => {
                        setCategorySelections(categoryDraft);
                        setCategoryPopoverOpen(false);
                      }}
                    >
                      {t("common.done")}
                    </Button>
                  </div>
                </PopoverSurface>
              </Popover>
            </Field>
            <Field
              label={<span className={styles.filterLabel}>{t("products.filters.brand")}</span>}
              className={styles.filterField}
            >
              <Popover>
                <PopoverTrigger disableButtonEnhancement>
                  <Button appearance="outline" className={styles.filterButton}>
                    <span className={styles.filterButtonText}>{brandLabel}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverSurface className={styles.filterPopover}>
                  <div className={styles.filterOption}>
                    <Checkbox
                      checked={selectedBrands.includes(noBrandToken)}
                      label={t("products.filters.noBrand")}
                      onChange={() => toggleBrand(noBrandToken)}
                    />
                  </div>
                  {brandOptions.length === 0 ? (
                    <Text size={200} className={styles.metaText}>
                      {t("common.notAvailable")}
                    </Text>
                  ) : (
                    brandOptions.map((brand) => (
                      <div key={brand} className={styles.filterOption}>
                        <Checkbox
                          checked={selectedBrands.includes(brand)}
                          label={brand}
                          onChange={() => toggleBrand(brand)}
                        />
                      </div>
                    ))
                  )}
                </PopoverSurface>
              </Popover>
            </Field>
            <Field
              label={<span className={styles.filterLabel}>{t("products.filters.vendor")}</span>}
              className={styles.filterField}
            >
              <Popover>
                <PopoverTrigger disableButtonEnhancement>
                  <Button appearance="outline" className={styles.filterButton}>
                    <span className={styles.filterButtonText}>{vendorLabel}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverSurface className={styles.filterPopover}>
                  <div className={styles.filterOption}>
                    <Checkbox
                      checked={selectedVendors.includes(noVendorToken)}
                      label={t("products.filters.noVendor")}
                      onChange={() => toggleVendor(noVendorToken)}
                    />
                  </div>
                  {vendorOptions.length === 0 ? (
                    <Text size={200} className={styles.metaText}>
                      {t("common.notAvailable")}
                    </Text>
                  ) : (
                    vendorOptions.map((vendor) => (
                      <div key={vendor} className={styles.filterOption}>
                        <Checkbox
                          checked={selectedVendors.includes(vendor)}
                          label={vendor}
                          onChange={() => toggleVendor(vendor)}
                        />
                      </div>
                    ))
                  )}
                </PopoverSurface>
              </Popover>
            </Field>
          </div>
        </div>

        <div className={styles.bottomRow}>
          <div className={styles.bottomLeft}>
            <Field
              label={<span className={styles.filterLabel}>{t("products.filters.updated")}</span>}
              className={styles.dropdownField}
            >
              <Dropdown
                value={sortOptions.find((option) => option.value === sort)?.label}
                selectedOptions={[sort]}
                onOptionSelect={(_, data) => setSort(String(data.optionValue))}
                className={styles.dropdownCompact}
              >
                {sortOptions.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field
              label={<span className={styles.filterLabel}>{t("products.filters.pages")}</span>}
              className={styles.dropdownField}
            >
              <Dropdown
                value={t("products.filters.pageSizeValue", { size: pageSize })}
                selectedOptions={[String(pageSize)]}
                onOptionSelect={(_, data) => {
                  const next = Number(data.optionValue);
                  if (!Number.isNaN(next)) {
                    setPageSize(next);
                  }
                }}
                className={styles.dropdownCompact}
              >
                {pageSizeOptions.map((size) => (
                  <Option
                    key={size}
                    value={String(size)}
                    text={t("products.filters.pageSizeValue", { size })}
                  >
                    {t("products.filters.pageSizeValue", { size })}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field
              label={<span className={styles.filterLabel}>{t("products.filters.show")}</span>}
              className={styles.dropdownField}
            >
              <Dropdown
                value={
                  savedFilterOptions.find((option) => option.value === savedFilter)
                    ?.label
                }
                selectedOptions={[savedFilter]}
                onOptionSelect={(_, data) =>
                  setSavedFilter(String(data.optionValue))
                }
                className={styles.dropdownCompact}
              >
                {savedFilterOptions.map((option) => (
                  <Option
                    key={option.value}
                    value={option.value}
                    text={option.label}
                  >
                    {option.label}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field
              label={
                <span className={styles.filterLabel}>
                  {t("products.filters.updatedRange")}
                </span>
              }
              className={styles.filterField}
            >
              <Popover positioning={{ position: "below", align: "start" }}>
                <PopoverTrigger disableButtonEnhancement>
                  <Button appearance="outline" className={styles.rangeButton}>
                    <span className={styles.filterButtonText}>
                      {updatedRangeSummary}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverSurface className={styles.rangePopover}>
                  <Field label={t("products.filters.rangeFrom")}>
                    <Input
                      type="date"
                      value={updatedFrom}
                      onChange={(_, data) => setUpdatedFrom(data.value)}
                    />
                  </Field>
                  <Field label={t("products.filters.rangeTo")}>
                    <Input
                      type="date"
                      value={updatedTo}
                      onChange={(_, data) => setUpdatedTo(data.value)}
                    />
                  </Field>
                  <div className={styles.rangeActions}>
                    <Button
                      appearance="subtle"
                      onClick={() => {
                        setUpdatedFrom("");
                        setUpdatedTo("");
                      }}
                    >
                      {t("common.clear")}
                    </Button>
                  </div>
                </PopoverSurface>
              </Popover>
            </Field>
            <Field
              label={
                <span className={styles.filterLabel}>
                  {t("products.filters.addedRange")}
                </span>
              }
              className={styles.filterField}
            >
              <Popover positioning={{ position: "below", align: "start" }}>
                <PopoverTrigger disableButtonEnhancement>
                  <Button appearance="outline" className={styles.rangeButton}>
                    <span className={styles.filterButtonText}>
                      {addedRangeSummary}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverSurface className={styles.rangePopover}>
                  <Field label={t("products.filters.rangeFrom")}>
                    <Input
                      type="date"
                      value={addedFrom}
                      onChange={(_, data) => setAddedFrom(data.value)}
                    />
                  </Field>
                  <Field label={t("products.filters.rangeTo")}>
                    <Input
                      type="date"
                      value={addedTo}
                      onChange={(_, data) => setAddedTo(data.value)}
                    />
                  </Field>
                  <div className={styles.rangeActions}>
                    <Button
                      appearance="subtle"
                      onClick={() => {
                        setAddedFrom("");
                        setAddedTo("");
                      }}
                    >
                      {t("common.clear")}
                    </Button>
                  </div>
                </PopoverSurface>
              </Popover>
            </Field>
          </div>
          <div className={styles.bottomRight}>
            <Field
              label={
                <span className={styles.filterLabel}>
                  {t("products.selection.label")}
                </span>
              }
              className={styles.filterField}
            >
              <div className={styles.selectionActions}>
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <Button
                      appearance={hasSelection ? "primary" : "outline"}
                      disabled={!hasSelection || isSavingSelection || isApplyingAction}
                    >
                      {t("products.actions.label")}
                    </Button>
                  </MenuTrigger>
                    <MenuPopover>
                      <MenuList>
                        <Menu positioning="after-top">
                          <MenuTrigger disableButtonEnhancement>
                            <MenuItem
                              disabled={!hasSelection || isSavingSelection || isApplyingAction}
                              hasSubmenu
                            >
                              {t("common.save")}
                            </MenuItem>
                          </MenuTrigger>
                          <MenuPopover>
                            <MenuList>
                              {wishlistsLoading ? (
                                <MenuItem disabled>{t("products.lists.loading")}</MenuItem>
                              ) : wishlistsError ? (
                                <MenuItem disabled>{wishlistsError}</MenuItem>
                              ) : wishlists.length === 0 ? (
                                <MenuItem disabled>{t("products.lists.empty")}</MenuItem>
                              ) : (
                                wishlists.map((list) => (
                                  <MenuItem
                                    key={list.id}
                                    onClick={() =>
                                      saveSelectedToWishlist(list.id, list.name)
                                    }
                                  >
                                    {list.name}
                                  </MenuItem>
                                ))
                              )}
                              <MenuItem
                                onClick={() => {
                                  setPendingSaveProductIds(null);
                                  setNewListDialogOpen(true);
                                }}
                              >
                                {t("products.lists.new")}
                              </MenuItem>
                            </MenuList>
                          </MenuPopover>
                        </Menu>
                        <MenuDivider />
                        <MenuItem
                          disabled={!hasSelection || isApplyingAction}
                          onClick={() => void handleSendSelectedToReEdit()}
                        >
                          Edit Products
                        </MenuItem>
                        <Menu positioning="after-top">
                          <MenuTrigger disableButtonEnhancement>
                            <MenuItem disabled={!hasSelection || isApplyingAction} hasSubmenu>
                              {t("products.actions.deliver")}
                            </MenuItem>
                        </MenuTrigger>
                        <MenuPopover>
                          <MenuList>
                            <Menu positioning="after-top">
                              <MenuTrigger disableButtonEnhancement>
                                <MenuItem
                                  disabled={!hasSelection || isApplyingAction}
                                  hasSubmenu
                                >
                                  {t("products.actions.deliverTo")}
                                </MenuItem>
                              </MenuTrigger>
                              <MenuPopover>
                                <MenuList>
                                  <MenuItem
                                    disabled={!hasSelection || isApplyingAction}
                                    onClick={() =>
                                      openDeliveryDialog(
                                        selectedItems.map((item) => item.id),
                                        "digideal"
                                      )
                                    }
                                  >
                                    Deliver to DigiDeal.se
                                  </MenuItem>
                                  <MenuItem
                                    disabled={!hasSelection || isApplyingAction}
                                    onClick={() =>
                                      openDeliveryDialog(
                                        selectedItems.map((item) => item.id),
                                        "letsdeal"
                                      )
                                    }
                                  >
                                    Deliver to LetsDeal
                                  </MenuItem>
                                </MenuList>
                              </MenuPopover>
                            </Menu>
                          </MenuList>
                        </MenuPopover>
                      </Menu>
                      <MenuItem onClick={() => setDeleteSelectionDialogOpen(true)}>
                        {t("products.actions.deleteSelected")}
                      </MenuItem>
                    </MenuList>
                  </MenuPopover>
                </Menu>
                <Button
                  appearance="outline"
                  onClick={clearSelection}
                  disabled={!hasSelection || isApplyingAction}
                  className={styles.unselectButton}
                >
                  {t("common.unselect")}
                </Button>
                <Text className={styles.selectionCount}>
                  {t("products.selection.selectedCount", {
                    count: selectedItems.length,
                  })}
                </Text>
              </div>
            </Field>
          </div>
        </div>
      </Card>

      <Card className={styles.tableCard}>
        {advancedError ? (
          <MessageBar intent="warning">{advancedError}</MessageBar>
        ) : null}
        {error ? <MessageBar intent="error">{error}</MessageBar> : null}
        <Table className={styles.table} size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell
                className={styles.imageCol}
                aria-label={t("products.table.image")}
              />
              <TableHeaderCell className={styles.productCol}>
                {t("products.table.product")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.spuCol}>
                {t("products.table.spu")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.supplierCol}>
                {t("products.table.supplier")}
              </TableHeaderCell>
              <TableHeaderCell>
                {t("products.table.createdUpdated")}
              </TableHeaderCell>
              <TableHeaderCell>{t("products.table.variants")}</TableHeaderCell>
              <TableHeaderCell>{t("products.table.save")}</TableHeaderCell>
              <TableHeaderCell>{t("products.table.details")}</TableHeaderCell>
              <TableHeaderCell className={styles.publishedCol}>
                {t("products.table.published")}
              </TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell className={styles.deliveryCol}>
                {t("products.table.delivery")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.selectCol}>
                <div className={styles.selectCheckboxWrap}>
                  <Checkbox
                    aria-label={t("common.selectAll")}
                    checked={isLoading ? false : selectAllState}
                    disabled={isLoading || products.length === 0}
                    className={styles.selectCheckbox}
                    onChange={(_, data) => {
                      clearRowSelectionAnchor();
                      if (data.checked === true) {
                        setSelectedRows(new Set(products.map((product) => product.id)));
                      } else {
                        setSelectedRows(new Set());
                      }
                    }}
                  />
                </div>
              </TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={12} className={styles.tableStatusCell}>
                  <div className={styles.tableLoadingContent}>
                    <Spinner appearance="primary" />
                    <Text size={200} className={styles.tableLoadingLabel}>
                      {t("products.loading")}
                    </Text>
                  </div>
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className={styles.tableStatusCell}>
                  <div className={styles.tableStatusContent}>
                    <Text>{t("products.empty")}</Text>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows
            )}
          </TableBody>
        </Table>

        <div className={styles.pagination}>
          <Text size={200} className={styles.metaText}>
            {t("products.pagination.pageOf", { page, pageCount })}
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

      <Dialog
        open={newListDialogOpen}
        onOpenChange={(_, data) => {
          setNewListDialogOpen(data.open);
          if (!data.open) {
            setPendingSaveProductIds(null);
          }
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("products.lists.createTitle")}</DialogTitle>
            <Field label={t("products.lists.nameLabel")}>
              <Input
                value={newListName}
                onChange={(_, data) => setNewListName(data.value)}
                placeholder={t("products.lists.namePlaceholder")}
              />
            </Field>
            <DialogActions>
              <Button
                appearance="subtle"
                onClick={() => setNewListDialogOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleCreateWishlist}
                disabled={!newListName.trim() || isSavingSelection}
              >
                {t("common.ok")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={deliveryDialogOpen}
        onOpenChange={(_, data) => {
          setDeliveryDialogOpen(data.open);
          if (!data.open) {
            setDeliveryTargetProductIds([]);
            setDeliveryNewListName("");
            setDeliveryListsError(null);
            setSelectedDeliveryListId(null);
            setDeliveryPartner("digideal");
          }
        }}
      >
        <DialogSurface className={styles.deliveryDialog}>
          <DialogBody className={styles.deliveryDialogBody}>
            <DialogTitle>
              {t("products.delivery.dialogTitle")} - {DELIVERY_PARTNER_LABEL[deliveryPartner]}
            </DialogTitle>
            <Text size={200} className={styles.deliveryDialogSubtitle}>
              {t("products.delivery.dialogBody", {
                count: deliveryTargetProductIds.length,
              })}
            </Text>
            {deliveryListsError ? (
              <MessageBar intent="error">{deliveryListsError}</MessageBar>
            ) : null}
            <div className={styles.deliveryListTableWrap}>
              <Table size="small">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>{t("products.delivery.table.name")}</TableHeaderCell>
                    <TableHeaderCell>{t("products.delivery.table.items")}</TableHeaderCell>
                    <TableHeaderCell>{t("products.delivery.table.created")}</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryListsLoading ? (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Spinner size="tiny" label={t("products.delivery.loading")} />
                      </TableCell>
                    </TableRow>
                  ) : deliveryLists.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3}>{t("products.delivery.table.empty")}</TableCell>
                    </TableRow>
                  ) : (
                    deliveryLists.map((list) => (
                      <TableRow
                        key={list.id}
                        className={mergeClasses(
                          styles.deliveryListRowSelectable,
                          selectedDeliveryListId === list.id
                            ? styles.deliveryListRowSelected
                            : undefined
                        )}
                        tabIndex={0}
                        role="button"
                        onClick={() => setSelectedDeliveryListId(list.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedDeliveryListId(list.id);
                          }
                        }}
                      >
                        <TableCell>{list.name}</TableCell>
                        <TableCell>{list.item_count ?? 0}</TableCell>
                        <TableCell>
                          {formatDateTime(list.created_at) || t("common.notAvailable")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <Field label={t("products.delivery.createLabel")}>
              <div className={styles.deliveryCreateRow}>
                <Input
                  className={styles.deliveryCreateInput}
                  value={deliveryNewListName}
                  onChange={(_, data) => setDeliveryNewListName(data.value)}
                  placeholder={t("products.delivery.createPlaceholder")}
                />
                <Button
                  appearance="primary"
                  onClick={() => {
                    void createDeliveryList();
                  }}
                  disabled={!deliveryNewListName.trim() || isCreatingDeliveryList}
                >
                  {t("products.lists.new")}
                </Button>
              </div>
            </Field>
            <DialogActions className={styles.deliveryDialogActions}>
              <Button appearance="outline" onClick={() => setDeliveryDialogOpen(false)}>
                {t("common.close")}
              </Button>
              <Button
                appearance="primary"
                onClick={saveSelectedDeliveryList}
                disabled={
                  !selectedDeliveryListId ||
                  isCreatingDeliveryList ||
                  deliveryTargetProductIds.length === 0 ||
                  addingDeliveryListId !== null
                }
              >
                {addingDeliveryListId ? t("common.loading") : t("products.delivery.saveToList")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={deleteSelectionDialogOpen}
        onOpenChange={(_, data) => setDeleteSelectionDialogOpen(data.open)}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("products.actions.deleteConfirmTitle")}</DialogTitle>
            <Text>
              {t("products.actions.deleteConfirmBody", {
                count: selectedItems.length,
              })}
            </Text>
            <DialogActions>
              <Button
                appearance="subtle"
                onClick={() => setDeleteSelectionDialogOpen(false)}
                disabled={isApplyingAction}
              >
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleDeleteSelectedProducts}
                disabled={!hasSelection || isApplyingAction}
              >
                {isApplyingAction
                  ? t("products.actions.deleting")
                  : t("common.delete")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={advancedDataOpen}
        onOpenChange={(_, data) => setAdvancedDataOpen(data.open)}
      >
        <DialogSurface className={styles.advancedDataDialog}>
          <DialogBody className={styles.advancedDataBody}>
            <DialogTitle>{t("products.filters.advancedSearchDataTitle")}</DialogTitle>
            <div className={styles.advancedDataContent}>
              <div className={styles.advancedDataSection}>
                <Text className={styles.advancedDataLabel}>
                  {t("products.filters.advancedSearchDataInput")}
                </Text>
                <pre className={styles.advancedDataBlock}>{searchInput}</pre>
              </div>
              {advancedPrompt ? (
                <div className={styles.advancedDataSection}>
                  <Text className={styles.advancedDataLabel}>
                    {t("products.filters.advancedSearchDataPrompt")}
                  </Text>
                  <pre className={styles.advancedDataBlock}>{advancedPrompt}</pre>
                </div>
              ) : null}
              {advancedRawResponse ? (
                <div className={styles.advancedDataSection}>
                  <Text className={styles.advancedDataLabel}>
                    {t("products.filters.advancedSearchDataResponse")}
                  </Text>
                  <pre className={styles.advancedDataBlock}>{advancedRawResponse}</pre>
                </div>
              ) : null}
              {advancedRawJson ? (
                <div className={styles.advancedDataSection}>
                  <Text className={styles.advancedDataLabel}>
                    {t("products.filters.advancedSearchDataJson")}
                  </Text>
                  <pre className={styles.advancedDataBlock}>
                    {JSON.stringify(advancedRawJson, null, 2)}
                  </pre>
                </div>
              ) : null}
              <div className={styles.advancedDataSection}>
                <Text className={styles.advancedDataLabel}>
                  {t("products.filters.advancedSearchDataQuery")}
                </Text>
                <pre className={styles.advancedDataBlock}>
                  {advancedQuery || searchInput}
                </pre>
              </div>
            </div>
            <DialogActions>
              <Button appearance="subtle" onClick={() => setAdvancedDataOpen(false)}>
                {t("common.close")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsPageInner />
    </Suspense>
  );
}
