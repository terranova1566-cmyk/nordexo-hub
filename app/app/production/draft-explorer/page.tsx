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
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Textarea,
  Spinner,
  Switch,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  mergeClasses,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatDate, formatDateTime } from "@/lib/format";

type DraftEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  modifiedAt: string;
  pixelQualityScore?: number | null;
  zimageUpscaled?: boolean;
};

type DraftFolder = {
  name: string;
  path: string;
  modifiedAt: string;
};

type DraftRunPreviewItem = {
  draft_spu: string;
  title: string;
  draft_main_image_url: string | null;
  preview_image_path?: string | null;
  preview_image_modified_at?: string | null;
};

type DraftFolderTreeNode = {
  name: string;
  path: string;
  modifiedAt: string;
  fileCount: number;
  children: DraftFolderTreeNode[];
};

type RunSpuOption = {
  name: string;
  path: string;
};

type ExplorerContextMenuState = {
  entry: DraftEntry;
  image: boolean;
  x: number;
  y: number;
};

type AiEditProvider = "chatgpt" | "gemini" | "zimage";
type AiPromptMode =
  | "template"
  | "direct"
  | "white_background"
  | "auto_center_white"
  | "eraser"
  | "upscale";
type AiTemplatePreset = "standard" | "digideal_main" | "product_scene";
type AiResolveDecision = "keep_original" | "replace_with_ai" | "keep_both";
type AiEditJobStatus = "queued" | "running";

type PendingAiEditRecord = {
  id: string;
  originalPath: string;
  pendingPath: string;
  pendingPixelQualityScore?: number | null;
  provider: AiEditProvider;
  mode: AiPromptMode;
  prompt: string;
  status: "pending";
  createdAt: string;
  updatedAt: string;
};

type AiEditRuntimeJob = {
  provider: AiEditProvider;
  mode: AiPromptMode;
  status: AiEditJobStatus;
  startedAt: number;
};

type DraftSpuRow = {
  id: string;
  draft_spu: string;
  draft_title: string | null;
  draft_subtitle: string | null;
  draft_status: string | null;
  draft_source: string | null;
  draft_supplier_1688_url: string | null;
  draft_updated_at: string | null;
  draft_created_at: string | null;
  draft_description_html: string | null;
  draft_product_description_main_html: string | null;
  draft_mf_product_description_short_html: string | null;
  draft_mf_product_description_extended_html: string | null;
  draft_mf_product_short_title: string | null;
  draft_mf_product_long_title: string | null;
  draft_mf_product_subtitle: string | null;
  draft_mf_product_bullets_short: string | null;
  draft_mf_product_bullets: string | null;
  draft_mf_product_bullets_long: string | null;
  draft_mf_product_specs: string | null;
  draft_image_folder: string | null;
  draft_main_image_url: string | null;
  draft_image_urls: string[] | null;
  draft_variant_image_urls: string[] | null;
  draft_raw_row: Record<string, unknown> | null;
  image_count: number;
  variant_image_count: number;
  video_count: number;
  variant_count: number;
};

type DraftSkuRow = {
  id: string;
  draft_sku: string | null;
  draft_spu: string | null;
  draft_option1: string | null;
  draft_option2: string | null;
  draft_option3: string | null;
  draft_option4: string | null;
  draft_option_combined_zh: string | null;
  draft_price: number | string | null;
  draft_weight: number | string | null;
  draft_weight_unit: string | null;
  draft_variant_image_url: string | null;
  draft_status: string | null;
  draft_updated_at: string | null;
  draft_raw_row: Record<string, unknown> | null;
};

type EditingCell = {
  table: "spu" | "sku";
  id: string;
  field: string;
};

type DraftVariantEditorRow = {
  key: string;
  id: string | null;
  draft_spu: string;
  draft_sku: string;
  draft_option1: string;
  draft_option2: string;
  draft_option3: string;
  draft_option4: string;
  draft_option_combined_zh: string;
  draft_price: string;
  draft_weight: string;
  draft_weight_unit: string;
  draft_variant_image_url: string;
  variation_color_se: string;
  variation_size_se: string;
  variation_other_se: string;
  variation_amount_se: string;
  draft_raw_row: Record<string, unknown>;
};

type DraftVariantEditorEditableField =
  | "draft_sku"
  | "variation_color_se"
  | "variation_size_se"
  | "variation_other_se"
  | "variation_amount_se"
  | "draft_option_combined_zh"
  | "draft_option1"
  | "draft_option2"
  | "draft_option3"
  | "draft_option4"
  | "draft_price"
  | "draft_weight";

type VariantEditorSortKey = "sku" | "color" | "size" | "order" | "amount";
type VariantEditorSortDirection = "asc" | "desc";
type ImageFolderTabValue = "main" | "variants" | "ocr" | "others";

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  uploadCard: {
    padding: "18px",
    borderRadius: "16px",
    backgroundColor: "#fafafa",
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
  logCard: {
    padding: "16px",
    borderRadius: "16px",
    backgroundColor: "#fafafa",
  },
  explorerHeader: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
    justifyContent: "space-between",
  },
  explorerHeaderActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  },
  draftHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  draftSearch: {
    width: "560px",
    maxWidth: "100%",
  },
  explorerControls: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
  },
  explorerControlsLeft: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
    flex: 1,
    minWidth: "280px",
  },
  explorerControlsCenter: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
  },
  explorerControlsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: "10px",
  },
  explorerControlsRight: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
    justifyContent: "flex-end",
    marginLeft: "auto",
  },
  iconButton: {
    minWidth: "34px",
    width: "34px",
    height: "34px",
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  explorerWhiteButton: {
    backgroundColor: "#ffffff",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
    ":active": {
      backgroundColor: tokens.colorNeutralBackground3,
    },
    ":disabled": {
      backgroundColor: tokens.colorNeutralBackground3,
    },
  },
  iconWithZipLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
  iconSvg: {
    width: "18px",
    height: "18px",
    flexShrink: 0,
  },
  imageResizeIconSvg: {
    width: "19px",
    height: "19px",
    flexShrink: 0,
  },
  batchPickerTrigger: {
    minWidth: "432px",
    maxWidth: "605px",
    justifyContent: "space-between",
    paddingLeft: "12px",
    paddingRight: "10px",
  },
  batchPickerTriggerLabel: {
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    maxWidth: "100%",
    textAlign: "left",
  },
  batchPickerChevron: {
    width: "16px",
    height: "16px",
    flexShrink: 0,
    marginLeft: "8px",
    opacity: 0.8,
  },
  batchPickerSurface: {
    padding: "6px",
    borderRadius: "12px",
    minWidth: "560px",
    maxWidth: "720px",
    maxHeight: "520px",
    overflow: "auto",
  },
  batchPickerRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto auto",
    gap: "6px",
    alignItems: "center",
    padding: "4px 6px",
    borderRadius: "8px",
    cursor: "pointer",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  batchPickerRowActive: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  batchPickerRowName: {
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  batchPickerViewButton: {
    minWidth: "48px",
    height: "26px",
    padding: "0 9px",
  },
  whiteActionButton: {
    backgroundColor: "#ffffff",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
    ":active": {
      backgroundColor: tokens.colorNeutralBackground3,
    },
    ":disabled": {
      backgroundColor: tokens.colorNeutralBackground3,
    },
  },
  batchPickerActions: {
    display: "flex",
    gap: "6px",
    paddingTop: "6px",
    marginTop: "6px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    flexWrap: "wrap",
  },
  spuPickerTrigger: {
    minWidth: "120px",
    maxWidth: "175px",
    justifyContent: "space-between",
    paddingLeft: "12px",
    paddingRight: "10px",
  },
  spuPickerSurface: {
    padding: "6px",
    borderRadius: "12px",
    minWidth: "210px",
    maxWidth: "310px",
    maxHeight: "520px",
    overflow: "auto",
  },
  spuPickerRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 8px",
    borderRadius: "8px",
    cursor: "pointer",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  spuPickerRowActive: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  spuPickerRowCompleted: {
    backgroundColor: "#e7f5e8",
    ":hover": {
      backgroundColor: "#d9efdb",
    },
  },
  spuPickerRowName: {
    flex: "1 1 auto",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    minWidth: 0,
  },
  spuPickerRowCheck: {
    width: "16px",
    height: "16px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#107c10",
    flexShrink: 0,
  },
  runPreviewSurface: {
    width: "820px",
    maxWidth: "92vw",
  },
  runPreviewBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "16px 18px 14px",
  },
  runPreviewTableWrap: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "12px",
    overflow: "auto",
    maxHeight: "62vh",
  },
  runPreviewTable: {
    width: "100%",
    tableLayout: "fixed",
  },
  runPreviewHeaderRow: {
    backgroundColor: "#fafafa",
  },
  runPreviewImageHeaderCell: {
    width: "69px",
    paddingLeft: 0,
    paddingRight: 0,
    textAlign: "center",
  },
  runPreviewSpuHeaderCell: {
    width: "180px",
  },
  runPreviewImageCell: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  runPreviewCellCenter: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  runPreviewSelectHeaderCell: {
    width: "54px",
    textAlign: "center",
    paddingLeft: 0,
    paddingRight: 0,
  },
  // Backwards-compatible aliases (older code referenced these names).
  runPreviewActionHeaderCell: {
    width: "54px",
    textAlign: "center",
    paddingLeft: 0,
    paddingRight: 0,
  },
  runPreviewActionHeaderInner: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  runPreviewSelectCell: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  runPreviewDeleteHeaderCell: {
    width: "130px",
    textAlign: "center",
    paddingLeft: 0,
    paddingRight: 0,
  },
  runPreviewDeleteCell: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  runPreviewTitleCell: {
    whiteSpace: "normal",
    wordBreak: "break-word",
  },
  runPreviewTitleText: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase200,
  },
  runPreviewThumb: {
    width: "46px",
    height: "46px",
    borderRadius: "8px",
    objectFit: "cover",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  runPreviewDeleteButton: {
    minWidth: "70px",
    height: "30px",
  },
  runPreviewActions: {
    display: "flex",
    justifyContent: "space-between",
    gap: "8px",
    alignItems: "center",
  },
  runPreviewActionsRight: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
  },
  viewToggle: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
  },
  explorerLayout: {
    marginTop: "12px",
    display: "grid",
    gridTemplateColumns: "290px minmax(0, 1fr)",
    gap: "12px",
    alignItems: "start",
    "@media (max-width: 1100px)": {
      gridTemplateColumns: "1fr",
    },
  },
  explorerLayoutSingleColumn: {
    gridTemplateColumns: "minmax(0, 1fr)",
  },
  folderPane: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "12px",
    backgroundColor: "#ffffff",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    maxHeight: "780px",
    overflow: "auto",
  },
  folderPaneHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  folderPaneActions: {
    display: "flex",
    gap: "8px",
    marginTop: "6px",
    flexWrap: "wrap",
  },
  folderTreeRoot: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  folderTreeChildren: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  folderTreeRow: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    borderRadius: "8px",
    padding: "1px 2px",
    minHeight: "22px",
    cursor: "pointer",
    minWidth: 0,
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  folderTreeRowActive: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  folderTreeRowCompleted: {
    backgroundColor: "#e7f5e8",
    ":hover": {
      backgroundColor: "#d9efdb",
    },
  },
  folderTreeRowDrop: {
    outline: `1px solid ${tokens.colorBrandStroke1}`,
    boxShadow: `0 0 0 1px ${tokens.colorBrandStroke1} inset`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  folderTreeConnector: {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    marginRight: "1px",
  },
  folderTreeConnectorSegment: {
    position: "relative",
    width: "10px",
    height: "16px",
    flexShrink: 0,
  },
  folderTreeConnectorLine: {
    position: "absolute",
    left: "5px",
    top: 0,
    bottom: 0,
    borderLeft: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  folderTreeConnectorJoin: {
    position: "relative",
    width: "12px",
    height: "16px",
    flexShrink: 0,
  },
  folderTreeConnectorJoinVertical: {
    position: "absolute",
    left: "5px",
    borderLeft: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  folderTreeConnectorJoinHorizontal: {
    position: "absolute",
    left: "5px",
    top: "8px",
    width: "8px",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  folderTreeCaretButton: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: tokens.colorNeutralForeground2,
    width: "16px",
    height: "16px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
    fontSize: "14px",
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: "1",
  },
  folderTreeCaretSpacer: {
    width: "16px",
    height: "16px",
    flexShrink: 0,
  },
  folderTreeFolderIcon: {
    width: "14px",
    height: "14px",
    color: "#E7B325",
    flexShrink: 0,
    marginRight: "2px",
  },
  folderTreeName: {
    border: "none",
    background: "transparent",
    color: tokens.colorNeutralForeground1,
    textAlign: "left",
    padding: 0,
    cursor: "pointer",
    fontWeight: tokens.fontWeightSemibold,
    minWidth: 0,
    flex: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
  },
  folderTreeNameText: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  folderTreeCount: {
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightRegular,
    marginLeft: "4px",
    flexShrink: 0,
  },
  contentColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    minWidth: 0,
  },
  filePane: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "12px",
    backgroundColor: "#ffffff",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  entriesContentArea: {
    position: "relative",
    minHeight: "44px",
  },
  entriesContentAreaCompleted: {
    backgroundColor: "#e7f5e8",
    borderRadius: "10px",
    padding: "8px",
  },
  entriesContentOverlay: {
    position: "absolute",
    inset: 0,
    zIndex: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: "10px",
    pointerEvents: "all",
    cursor: "wait",
  },
  explorerPathLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    marginBottom: "2px",
  },
  dualGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(228px, 1fr))",
    gap: "12px",
  },
  dualGridTagging: {
    filter: "blur(1.9px)",
    opacity: 0.86,
    pointerEvents: "none",
    userSelect: "none",
  },
  mediaCard: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#ffffff",
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minWidth: 0,
  },
  mediaCardSelected: {
    border: `1px solid ${tokens.colorBrandStroke1}`,
    boxShadow: `0 0 0 1px ${tokens.colorBrandStroke1} inset`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  mediaCardDropTarget: {
    border: `1px dashed ${tokens.colorBrandStroke1}`,
    boxShadow: `0 0 0 2px ${tokens.colorBrandStroke1} inset`,
  },
  mediaSquare: {
    width: "100%",
    aspectRatio: "1 / 1",
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    cursor: "pointer",
    "&:hover .thumbDownloadButton": {
      opacity: 0.8,
      transform: "translateY(0)",
      pointerEvents: "auto",
    },
    "&:focus-within .thumbDownloadButton": {
      opacity: 0.8,
      transform: "translateY(0)",
      pointerEvents: "auto",
    },
  },
  mediaTagStack: {
    position: "absolute",
    top: "8px",
    left: "8px",
    zIndex: 2,
    display: "inline-flex",
    flexDirection: "row",
    gap: "4px",
    pointerEvents: "none",
    alignItems: "center",
  },
  mediaTagStackShifted: {
    left: "42px",
  },
  mediaTagBadge: {
    borderRadius: "6px",
    padding: "2px 6px",
    fontSize: "10px",
    fontWeight: tokens.fontWeightSemibold,
    color: "#ffffff",
    letterSpacing: "0.02em",
    lineHeight: 1.2,
    opacity: 1,
    textTransform: "uppercase",
  },
  mediaTagMain: {
    backgroundColor: "#0f6cbd",
  },
  mediaTagEnv: {
    backgroundColor: "#0f7b0f",
  },
  mediaTagVar: {
    backgroundColor: "#006c6f",
  },
  mediaTagInf: {
    backgroundColor: "#b65a00",
  },
  mediaTagDigi: {
    backgroundColor: "#6f42ff",
  },
  mediaImageBusy: {
    filter: "blur(2.4px)",
    transform: "scale(1.015)",
  },
  mediaBusyOverlay: {
    position: "absolute",
    inset: 0,
    zIndex: 3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    pointerEvents: "none",
  },
  mediaBusyContent: {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
  },
  aiPendingBadge: {
    position: "absolute",
    top: "8px",
    left: "8px",
    borderRadius: "8px",
    backgroundColor: "#854aff",
    color: "#ffffff",
    width: "28px",
    height: "28px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    border: "1px solid #6f35e6",
    boxShadow: tokens.shadow4,
    padding: 0,
    cursor: "pointer",
    transition: "background-color 120ms ease, border-color 120ms ease",
    ":hover": {
      backgroundColor: "#9660ff",
      border: "1px solid #7a3ff0",
    },
    ":focus-visible": {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: "1px",
    },
  },
  mediaFooter: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
  },
  mediaFooterColumn: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    flex: 1,
    gap: "2px",
  },
  mediaLabel: {
    border: "none",
    background: "transparent",
    textAlign: "left",
    color: tokens.colorNeutralForeground1,
    padding: 0,
    margin: 0,
    fontWeight: tokens.fontWeightSemibold,
    cursor: "text",
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  mediaMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  mediaMetaDimLow: {
    color: "#8B1D1D",
    fontWeight: tokens.fontWeightSemibold,
  },
  mediaMetaDivider: {
    color: tokens.colorNeutralForeground4,
    marginLeft: "4px",
    marginRight: "4px",
  },
  mediaMetaQuality: {
    fontWeight: tokens.fontWeightSemibold,
  },
  mediaMetaQualityUnknown: {
    color: tokens.colorNeutralForeground3,
  },
  mediaMetaQualityGood: {
    color: "#107C10",
  },
  mediaMetaQualityMedium: {
    color: "#B65A00",
  },
  mediaMetaQualityBad: {
    color: "#A4262C",
  },
  mediaMetaUpscaleIcon: {
    display: "inline-flex",
    alignItems: "center",
    color: "#0f6cbd",
    verticalAlign: "middle",
  },
  mediaMetaUpscaleIconSvg: {
    width: "14px",
    height: "14px",
    display: "block",
  },
  imageToolbar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  imageToolbarTabs: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    marginRight: "auto",
    flexWrap: "wrap",
  },
  imageTabLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
  imageTabMainBadgeSpacer: {
    display: "inline-block",
    width: "6px",
    flexShrink: 0,
  },
  imageTabBadge: {
    minWidth: "22px",
    height: "22px",
    borderRadius: "999px",
    padding: "0 7px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: 1,
    backgroundColor: "#0f6cbd",
    color: "#ffffff",
    boxSizing: "border-box",
  },
  imageTabBadgeDisabled: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
  },
  imageToolbarRight: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  imageToolbarActions: {
    marginRight: "2px",
  },
  dangerOutlineButton: {
    color: "#a4262c",
    border: "1px solid #d13438",
    ":hover": {
      color: "#a4262c",
      border: "1px solid #d13438",
      backgroundColor: "#fde7e9",
    },
    ":active": {
      color: "#a4262c",
      border: "1px solid #d13438",
      backgroundColor: "#f9d7da",
    },
    ":disabled": {
      color: tokens.colorNeutralForeground4,
      border: `1px solid ${tokens.colorNeutralStroke2}`,
      backgroundColor: tokens.colorNeutralBackground1,
    },
  },
  imageToolbarIconGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
  imageToggleIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorNeutralForeground3,
  },
  fileActions: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "nowrap",
    justifyContent: "flex-end",
    whiteSpace: "nowrap",
  },
  fileActionButton: {
    borderRadius: "8px",
    boxShadow: "none",
    minWidth: "auto",
    paddingLeft: "10px",
    paddingRight: "10px",
  },
  fileActionButtonNarrow: {
    paddingLeft: "8px",
    paddingRight: "8px",
  },
  textViewerSurface: {
    width: "min(1350px, 96vw)",
    maxHeight: "86vh",
    padding: "14px",
  },
  textViewerBody: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minHeight: "72vh",
  },
  textViewerArea: {
    flex: 1,
    minHeight: "60vh",
    fontFamily:
      '"Cascadia Mono", "Consolas", "SFMono-Regular", Menlo, Monaco, monospace',
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
    "& textarea": {
      minHeight: "60vh",
      height: "60vh",
      fontFamily:
        '"Cascadia Mono", "Consolas", "SFMono-Regular", Menlo, Monaco, monospace',
      fontSize: tokens.fontSizeBase200,
      lineHeight: tokens.lineHeightBase300,
    },
  },
  textViewerActions: {
    justifyContent: "flex-end",
  },
  photopeaSurface: {
    width: "min(1500px, 94vw)",
    height: "92vh",
    maxWidth: "94vw",
    maxHeight: "92vh",
    padding: "12px",
    overflow: "hidden",
  },
  photopeaBody: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    height: "100%",
    minHeight: 0,
  },
  photopeaFrameWrap: {
    position: "relative",
    flex: 1,
    minHeight: 0,
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  photopeaFrame: {
    width: "100%",
    height: "100%",
    border: "none",
    display: "block",
  },
  filesSection: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#ffffff",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minWidth: 0,
  },
  filesHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filesTable: {
    tableLayout: "fixed",
    width: "100%",
    "& [role='cell'], & [role='columnheader']": {
      paddingTop: "4px",
      paddingBottom: "4px",
    },
  },
  filesColSelect: {
    width: "42px",
  },
  filesColName: {
    width: "44%",
  },
  filesColSize: {
    width: "14%",
  },
  filesColDate: {
    width: "22%",
  },
  filesColAction: {
    width: "20%",
  },
  filesInfo: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  filesNameButton: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    background: "transparent",
    border: "none",
    padding: 0,
    textAlign: "left",
    cursor: "text",
    width: "100%",
    minWidth: 0,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    lineHeight: 1.2,
  },
  contextMenu: {
    position: "fixed",
    // Needs to sit above Fluent Dialog layers.
    zIndex: 2000000,
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    padding: "4px",
    minWidth: "212px",
    display: "flex",
    flexDirection: "column",
    gap: "1px",
  },
  contextMenuButton: {
    border: "none",
    background: "transparent",
    color: tokens.colorNeutralForeground1,
    textAlign: "left",
    padding: "6px 9px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: tokens.fontSizeBase200,
    lineHeight: 1.2,
    display: "flex",
    width: "100%",
    alignItems: "center",
    gap: "8px",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
    ":disabled": {
      color: tokens.colorNeutralForeground4,
      cursor: "not-allowed",
      backgroundColor: "transparent",
      opacity: 0.65,
    },
  },
  contextMenuButtonCaret: {
    marginLeft: "auto",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: 1,
  },
  contextMenuSubmenuWrap: {
    position: "relative",
    width: "100%",
  },
  contextMenuSubmenu: {
    position: "absolute",
    left: "calc(100% + 4px)",
    top: 0,
    zIndex: 2000001,
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    padding: "4px",
    minWidth: "158px",
    display: "flex",
    flexDirection: "column",
    gap: "1px",
  },
  contextMenuSubmenuLeft: {
    left: "auto",
    right: "calc(100% + 4px)",
  },
  contextMenuIcon: {
    width: "16px",
    height: "16px",
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
  contextMenuTagCheckbox: {
    marginLeft: "auto",
    width: "16px",
    height: "16px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "4px",
    backgroundColor: tokens.colorNeutralBackground1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxSizing: "border-box",
  },
  contextMenuTagCheckboxChecked: {
    border: "1px solid #0f6cbd",
    backgroundColor: "#0f6cbd",
    color: "#ffffff",
  },
  contextMenuTagCheckboxMixed: {
    border: "1px solid #0f6cbd",
    backgroundColor: "#deecff",
  },
  contextMenuTagCheckboxIcon: {
    width: "11px",
    height: "11px",
    display: "block",
  },
  contextMenuTagCheckboxBar: {
    width: "8px",
    height: "2px",
    borderRadius: "999px",
    backgroundColor: "#0f6cbd",
    display: "block",
  },
  contextMenuTagLabel: {
    flex: 1,
    lineHeight: 1,
  },
  compactMenuList: {
    paddingTop: "2px",
    paddingBottom: "2px",
    "& [role='menuitem']": {
      minHeight: "26px",
      paddingTop: "5px",
      paddingBottom: "5px",
      lineHeight: "1.2",
    },
  },
  explorerTable: {
    marginTop: "8px",
    tableLayout: "fixed",
    width: "100%",
  },
  explorerColName: {
    width: "50%",
  },
  explorerColSize: {
    width: "10%",
  },
  explorerColModified: {
    width: "20%",
  },
  explorerColActions: {
    width: "20%",
  },
  explorerRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
  },
  explorerIcon: {
    width: "16px",
    height: "16px",
    color: tokens.colorNeutralForeground3,
  },
  explorerName: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    background: "transparent",
    border: "none",
    padding: 0,
    textAlign: "left",
    cursor: "text",
    flex: 1,
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  renameInput: {
    flex: 1,
    minWidth: 0,
    maxWidth: "100%",
    width: "100%",
  },
  explorerMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  explorerPreview: {
    marginTop: "12px",
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "10px",
  },
  previewImage: {
    width: "100%",
    maxHeight: "360px",
    objectFit: "contain",
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  dropZone: {
    padding: "12px",
    borderRadius: "10px",
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#ffffff",
    textAlign: "left",
    color: tokens.colorNeutralForeground3,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minHeight: "126px",
    justifyContent: "space-between",
  },
  dropZoneActive: {
    border: `1px dashed ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorBrandForeground1,
  },
  filesUploadRow: {
    marginTop: "10px",
    display: "grid",
    gridTemplateColumns: "minmax(0, 50fr) minmax(0, 35fr) minmax(0, 15fr)",
    gap: "10px",
    alignItems: "stretch",
    "@media (max-width: 960px)": {
      gridTemplateColumns: "1fr",
    },
  },
  uploadDropHint: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase200,
  },
  uploadInputWrap: {
    display: "flex",
    justifyContent: "flex-start",
    "& input[type='file']": {
      fontSize: tokens.fontSizeBase100,
      lineHeight: tokens.lineHeightBase200,
      maxWidth: "100%",
    },
    "& input[type='file']::file-selector-button": {
      fontSize: tokens.fontSizeBase100,
      padding: "6px 10px",
      borderRadius: "8px",
      border: `1px solid ${tokens.colorNeutralStroke2}`,
      backgroundColor: tokens.colorNeutralBackground1,
      cursor: "pointer",
    },
  },
  uploadDropCenter: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  uploadDropIcon: {
    width: "48px",
    height: "48px",
    color: "#e9e9e9",
  },
  urlUploadPanel: {
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#ffffff",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minHeight: "126px",
  },
  urlUploadInput: {
    width: "100%",
    "& textarea": {
      minHeight: "74px",
      resize: "vertical",
      fontSize: tokens.fontSizeBase100,
      lineHeight: tokens.lineHeightBase200,
    },
  },
  urlUploadActions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "auto",
  },
  previewDialog: {
    width: "min(900px, 95vw)",
    maxWidth: "95vw",
    padding: "16px",
  },
  previewDialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  previewImageFrame: {
    position: "relative",
    width: "100%",
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
  },
  previewImageLarge: {
    width: "100%",
    maxHeight: "78vh",
    objectFit: "contain",
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  previewNavButton: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: "44px",
    height: "44px",
    borderRadius: "999px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#ffffff",
    color: tokens.colorBrandForeground1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    zIndex: 4,
    opacity: 0.7,
    boxShadow: tokens.shadow8,
    transition: "opacity 120ms ease, transform 120ms ease",
    ":hover": {
      opacity: 1,
    },
    ":disabled": {
      opacity: 0.35,
      cursor: "default",
    },
  },
  previewNavButtonLeft: {
    left: "12px",
  },
  previewNavButtonRight: {
    right: "12px",
  },
  previewNavIcon: {
    width: "22px",
    height: "22px",
    flexShrink: 0,
  },
  previewMetaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },
  previewMetaText: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  previewActions: {
    justifyContent: "flex-end",
    marginLeft: "auto",
  },
  thumbGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(208px, 1fr))",
    gap: "12px",
    marginTop: "12px",
  },
  thumbCard: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  thumbImageWrap: {
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "182px",
    overflow: "hidden",
    position: "relative",
    cursor: "pointer",
    "&:hover .thumbDownloadButton": {
      opacity: 0.5,
      transform: "translateY(0)",
      pointerEvents: "auto",
    },
    "&:focus-within .thumbDownloadButton": {
      opacity: 0.5,
      transform: "translateY(0)",
      pointerEvents: "auto",
    },
  },
  thumbImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  thumbIcon: {
    width: "46px",
    height: "46px",
    color: tokens.colorNeutralForeground3,
  },
  thumbDownloadButton: {
    position: "absolute",
    top: "8px",
    right: "8px",
    width: "30px",
    height: "30px",
    borderRadius: "999px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: "#b7b7b7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: "pointer",
    boxShadow: tokens.shadow4,
    opacity: 0,
    transform: "translateY(-2px)",
    transition:
      "opacity 120ms ease, transform 120ms ease, color 120ms ease, border-color 120ms ease, background-color 120ms ease",
    pointerEvents: "none",
    ":hover": {
      opacity: 1,
      color: tokens.colorBrandForeground1,
      border: `1px solid ${tokens.colorBrandStroke1}`,
      backgroundColor: "#ffffff",
    },
    ":focus-visible": {
      opacity: 1,
      color: tokens.colorBrandForeground1,
      border: `1px solid ${tokens.colorBrandStroke1}`,
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: "1px",
    },
  },
  thumbAiButton: {
    right: "42px",
  },
  aiPromptSurface: {
    width: "min(620px, 92vw)",
    padding: "14px",
  },
  aiPromptBody: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  aiPromptImageWrap: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "4px 0 8px",
  },
  aiPromptImagePreview: {
    width: "100%",
    maxWidth: "500px",
    maxHeight: "500px",
    objectFit: "contain",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  aiCompareSurface: {
    width: "70vw",
    maxWidth: "70vw",
    height: "85vh",
    maxHeight: "85vh",
    padding: "14px",
  },
  aiCompareBody: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  aiCompareGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "16px",
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    alignItems: "start",
    "@media (max-width: 960px)": {
      gridTemplateColumns: "1fr",
    },
  },
  aiComparePanel: {
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    alignItems: "center",
  },
  aiCompareImageFrame: {
    width: "min(100%, calc(85vh - 260px))",
    aspectRatio: "1 / 1",
    borderRadius: "8px",
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    "@media (max-width: 1200px)": {
      minHeight: "320px",
    },
  },
  aiCompareLabel: {
    fontWeight: tokens.fontWeightSemibold,
  },
  aiCompareImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  thumbName: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    wordBreak: "break-word",
    display: "block",
    background: "transparent",
    border: "none",
    padding: 0,
    textAlign: "left",
    cursor: "text",
    width: "100%",
    maxWidth: "100%",
  },
  thumbMeta: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    display: "block",
    marginTop: "4px",
  },
  thumbActions: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  tableCard: {
    padding: "16px",
    borderRadius: "16px",
    backgroundColor: "#fafafa",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  tableWrapper: {
    maxHeight: "420px",
    overflow: "auto",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#ffffff",
  },
  contentSizedTable: {
    width: "max-content",
    minWidth: "100%",
    tableLayout: "fixed",
  },
  stickyHeader: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  tableRow: {
    backgroundColor: tokens.colorNeutralBackground1,
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  tableRowAlt: {
    backgroundColor: tokens.colorNeutralBackground2,
  },
  tableRowCompleted: {
    backgroundColor: "#e7f5e8",
    ":hover": {
      backgroundColor: "#d9efdb",
    },
  },
  folderRow: {
    cursor: "pointer",
  },
  tableCell: {
    verticalAlign: "middle",
    overflow: "visible",
  },
  tableEditInputWrap: {
    position: "relative",
    width: "100%",
    overflow: "visible",
    minHeight: "28px",
  },
  tableEditInput: {
    minWidth: "100%",
    maxWidth: "none",
  },
  expandedInlineInput: {
    position: "relative",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 6,
    boxSizing: "border-box",
  },
  tableCellLinkButton: {
    border: "none",
    background: "transparent",
    color: tokens.colorBrandForeground1,
    padding: 0,
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
    width: "100%",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tableCellLinkRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
  },
  tableCellInlineEditable: {
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
  },
  tableCellLinkActionButton: {
    flexShrink: 0,
    width: "auto",
    minWidth: "76px",
    textAlign: "left",
  },
  tableActionButton: {
    backgroundColor: "#ffffff",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
    ":active": {
      backgroundColor: tokens.colorNeutralBackground3,
    },
    ":disabled": {
      backgroundColor: tokens.colorNeutralBackground3,
    },
  },
  tableActionButtonCompleted: {
    backgroundColor: "#e7f5e8",
    ":hover": {
      backgroundColor: "#d9efdb",
    },
    ":active": {
      backgroundColor: "#cbe6cf",
    },
    ":disabled": {
      backgroundColor: "#d9efdb",
    },
  },
  selectionCol: {
    width: "44px",
    maxWidth: "44px",
    paddingLeft: "6px",
    paddingRight: "6px",
  },
  spuCol: {
    width: "140px",
    maxWidth: "140px",
  },
  statusCol: {
    width: "90px",
    maxWidth: "90px",
  },
  sourceCol: {
    width: "90px",
    maxWidth: "90px",
  },
  supplierCol: {
    width: "150px",
    maxWidth: "150px",
  },
  imagesCol: {
    width: "92px",
    maxWidth: "92px",
  },
  videosCol: {
    width: "70px",
    maxWidth: "70px",
  },
  variantsCol: {
    width: "120px",
    maxWidth: "120px",
  },
  updatedCol: {
    width: "110px",
    maxWidth: "110px",
  },
  createdCol: {
    width: "110px",
    maxWidth: "110px",
  },
  detailsCol: {
    width: "90px",
    maxWidth: "90px",
  },
  numericCell: {
    textAlign: "right",
  },
  clampTwo: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  clampOne: {
    display: "-webkit-box",
    WebkitLineClamp: 1,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  resizableHeader: {
    resize: "horizontal",
    overflow: "hidden",
  },
  detailsRow: {
    backgroundColor: tokens.colorNeutralBackground1,
  },
  detailsBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
    padding: "8px 0",
  },
  detailsDialogSurface: {
    width: "60vw",
    maxWidth: "60vw",
    maxHeight: "calc(100vh - 140px)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  detailsDialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    height: "100%",
    minHeight: 0,
    overflow: "auto",
    paddingTop: "4px",
    paddingBottom: "28px",
    paddingRight: "16px",
  },
  detailsDialogContent: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    alignItems: "stretch",
  },
  detailsDialogColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "24px",
    "@media (max-width: 1100px)": {
      gridTemplateColumns: "1fr",
    },
  },
  detailsDialogColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  detailsGallery: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "12px",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  detailsGalleryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: "10px",
  },
  detailsGalleryImage: {
    width: "100%",
    height: "110px",
    objectFit: "cover",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  detailsInstruction: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  detailsActionsRow: {
    display: "flex",
    gap: "8px",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  variantsEditorSurface: {
    width: "70vw",
    maxWidth: "70vw",
    minWidth: "980px",
    maxHeight: "92vh",
    padding: "14px",
    overflow: "hidden",
    "@media (max-width: 1200px)": {
      width: "96vw",
      maxWidth: "96vw",
      minWidth: 0,
    },
  },
  variantsEditorBody: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minHeight: "68vh",
    position: "relative",
  },
  variantsEditorContent: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minHeight: 0,
    flex: 1,
  },
  variantsEditorBusy: {
    filter: "blur(2.2px)",
    opacity: 0.75,
    pointerEvents: "none",
    userSelect: "none",
  },
  variantsEditorOverlay: {
    position: "absolute",
    inset: 0,
    zIndex: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  variantsEditorToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "10px",
    flexWrap: "wrap",
  },
  variantsEditorToolbarLeft: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  variantsEditorPacksInput: {
    width: "160px",
  },
  variantsEditorTableWrap: {
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "auto",
    maxHeight: "48vh",
    minHeight: "260px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  variantsEditorTable: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
  },
  variantsEditorHeadCell: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    textAlign: "left",
    fontSize: tokens.fontSizeBase100,
    padding: "7px 6px",
    whiteSpace: "nowrap",
  },
  variantsEditorSortButton: {
    appearance: "none",
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    width: "100%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "6px",
    color: "inherit",
    font: "inherit",
    cursor: "pointer",
    textAlign: "left",
  },
  variantsEditorSortIndicator: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    lineHeight: 1,
    minWidth: "10px",
    textAlign: "center",
  },
  variantsEditorCell: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "6px",
    verticalAlign: "middle",
    overflow: "visible",
  },
  variantsEditorInputWrap: {
    position: "relative",
    width: "100%",
    overflow: "visible",
    minHeight: "28px",
  },
  variantsEditorInput: {
    minWidth: "100%",
    maxWidth: "none",
  },
  variantsEditorCheckCol: {
    width: "44px",
    minWidth: "44px",
    maxWidth: "44px",
    paddingLeft: "4px",
    paddingRight: "4px",
  },
  variantsEditorInstruction: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    justifyContent: "space-between",
  },
  variantsEditorInstructionActions: {
    display: "flex",
    justifyContent: "flex-end",
  },
  variantsEditorBottomSplit: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    minHeight: "170px",
    alignItems: "stretch",
    "@media (max-width: 1100px)": {
      gridTemplateColumns: "1fr",
    },
  },
  variantsEditorThumbPanel: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground2,
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minHeight: "170px",
    height: "100%",
  },
  variantsEditorThumbGrid: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: "8px",
    overflowX: "auto",
    overflowY: "hidden",
    paddingBottom: "6px",
    minHeight: "126px",
    flex: 1,
  },
  variantsEditorThumbCard: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    width: "108px",
    minWidth: "108px",
    flex: "0 0 108px",
  },
  variantsEditorThumbImage: {
    width: "100%",
    height: "108px",
    aspectRatio: "1 / 1",
    objectFit: "cover",
    borderRadius: "8px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  variantsEditorThumbLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: "2",
    WebkitBoxOrient: "vertical",
  },
  variantsEditorThumbButton: {
    width: "100%",
    border: "none",
    background: "transparent",
    padding: 0,
    textAlign: "left",
    cursor: "pointer",
  },
  variantsEditorThumbImageClickable: {
    cursor: "pointer",
  },
  variantsImagePreviewSurface: {
    width: "min(820px, 92vw)",
    height: "min(820px, 92vw)",
    maxWidth: "92vw",
    maxHeight: "92vw",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  variantsImagePreviewBody: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    height: "100%",
  },
  variantsImagePreviewTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  variantsImagePreviewImgWrap: {
    flex: 1,
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  variantsImagePreviewImg: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },
  variantsEditorActions: {
    justifyContent: "flex-end",
    marginTop: "auto",
  },
  link: {
    color: tokens.colorBrandForeground1,
    textDecoration: "none",
  },
});

const stripHtml = (value: string | null | undefined) => {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
};

const getRawValue = (raw: Record<string, unknown> | null | undefined, key: string) => {
  if (!raw || typeof raw !== "object") return "";
  const value = (raw as Record<string, unknown>)[key];
  return value == null ? "" : String(value);
};

const normalizeDraftRelativePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\.+/g, "");

const tryExtractDraftRelativePath = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let candidate = raw;
  if (/^https?:\/\//i.test(candidate)) {
    try {
      candidate = new URL(candidate).pathname || candidate;
    } catch {
      candidate = raw;
    }
  }
  candidate = candidate.replace(/\\/g, "/");
  const knownRoots = [
    "/srv/resources/media/images/draft_products/",
    "srv/resources/media/images/draft_products/",
    "/resources/media/images/draft_products/",
  ];
  for (const root of knownRoots) {
    const idx = candidate.indexOf(root);
    if (idx !== -1) {
      candidate = candidate.slice(idx + root.length);
      return normalizeDraftRelativePath(candidate);
    }
  }
  const marker = "images/draft_products/";
  const markerIndex = candidate.indexOf(marker);
  if (markerIndex !== -1) {
    candidate = candidate.slice(markerIndex + marker.length);
    return normalizeDraftRelativePath(candidate);
  }
  const genericMarker = "draft_products/";
  const genericIndex = candidate.indexOf(genericMarker);
  if (genericIndex !== -1) {
    candidate = candidate.slice(genericIndex + genericMarker.length);
    return normalizeDraftRelativePath(candidate);
  }
  const normalized = normalizeDraftRelativePath(candidate);
  if (!normalized || normalized.split("/").filter(Boolean).length < 1) return null;
  return normalized;
};

const parseDraftRawRow = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
};

const toText = (value: unknown) => (value == null ? "" : String(value));

const sanitizeFileNameSegment = (value: string) =>
  String(value || "")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "") || "item";

const formatClipboardDateTime = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const imageExtensionFromMime = (mimeType: string) => {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("bmp")) return "bmp";
  if (normalized.includes("avif")) return "avif";
  if (normalized.includes("tiff")) return "tiff";
  return "jpg";
};

const parseImageUrlsInput = (value: string) => {
  const tokens = value
    .split(/[\n,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  tokens.forEach((token) => {
    try {
      const parsed = new URL(token);
      if (!["http:", "https:"].includes(parsed.protocol)) return;
      const normalized = parsed.toString();
      if (seen.has(normalized)) return;
      seen.add(normalized);
      out.push(normalized);
    } catch {
      return;
    }
  });
  return out;
};

const splitFileNameAndExtension = (fileName: string) => {
  const name = String(fileName || "");
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) {
    return { baseName: name, extension: "" };
  }
  return {
    baseName: name.slice(0, dotIndex),
    extension: name.slice(dotIndex),
  };
};

const TAG_IMAGE_OPTIONS = ["MAIN", "ENV", "VAR", "INF", "DIGI"] as const;
type ImageTagOption = (typeof TAG_IMAGE_OPTIONS)[number];
const TAG_IMAGE_SUFFIXES_TO_STRIP = [...TAG_IMAGE_OPTIONS, "TAG IMAGE"] as const;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stripTrailingImageTagSuffixes = (baseName: string) => {
  let nextBase = baseName.trim();
  let changed = true;
  while (changed) {
    changed = false;
    TAG_IMAGE_SUFFIXES_TO_STRIP.forEach((tagValue) => {
      const pattern = new RegExp(
        `\\s*\\(${escapeRegExp(tagValue)}\\)\\s*$`,
        "i"
      );
      const replaced = nextBase.replace(pattern, "").trim();
      if (replaced !== nextBase) {
        nextBase = replaced;
        changed = true;
      }
    });
  }
  return nextBase;
};

const normalizeImageTags = (tags: ImageTagOption[]) =>
  TAG_IMAGE_OPTIONS.filter((option) => tags.includes(option));

const buildTaggedImageFileNameFromTags = (
  fileName: string,
  tags: ImageTagOption[]
) => {
  const { baseName, extension } = splitFileNameAndExtension(fileName);
  const cleanedBase = stripTrailingImageTagSuffixes(baseName);
  const orderedTags = normalizeImageTags(tags);
  const suffix = orderedTags.map((tag) => ` (${tag})`).join("");
  return `${cleanedBase}${suffix}${extension}`;
};

const buildTaggedImageFileName = (fileName: string, tag: ImageTagOption) => {
  return buildTaggedImageFileNameFromTags(fileName, [tag]);
};

const extractImageTagsFromFileName = (fileName: string): ImageTagOption[] => {
  const matches = String(fileName || "").match(/\((MAIN|ENV|VAR|INF|DIGI)\)/gi) ?? [];
  const ordered: ImageTagOption[] = [];
  matches.forEach((value) => {
    const normalized = value.replace(/[()]/g, "").trim().toUpperCase();
    if (
      (normalized === "MAIN" ||
        normalized === "ENV" ||
        normalized === "VAR" ||
        normalized === "INF" ||
        normalized === "DIGI") &&
      !ordered.includes(normalized as ImageTagOption)
    ) {
      ordered.push(normalized as ImageTagOption);
    }
  });
  return normalizeImageTags(ordered);
};

const getImageTagSortRank = (fileName: string) => {
  const tags = extractImageTagsFromFileName(fileName);
  if (tags.includes("MAIN")) return 0;
  if (tags.length === 0) return 1;
  if (tags.includes("DIGI")) return 5;
  if (tags.includes("ENV")) return 2;
  if (tags.includes("INF")) return 3;
  if (tags.includes("VAR")) return 4;
  return 4;
};

const buildTaggedImageOrderPaths = (imageEntries: DraftEntry[]) => {
  const originalOrder = new Map<string, number>();
  imageEntries.forEach((entry, index) => {
    originalOrder.set(entry.path, index);
  });

  return [...imageEntries]
    .sort((left, right) => {
      const rankDiff = getImageTagSortRank(left.name) - getImageTagSortRank(right.name);
      if (rankDiff !== 0) return rankDiff;

      const leftIndex = originalOrder.get(left.path) ?? 0;
      const rightIndex = originalOrder.get(right.path) ?? 0;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;

      return left.name.localeCompare(right.name);
    })
    .map((entry) => entry.path);
};

const isDigiTaggedImageName = (fileName: string) =>
  extractImageTagsFromFileName(fileName).includes("DIGI");

const toggleImageTagInFileName = (fileName: string, tag: ImageTagOption) => {
  const currentTags = extractImageTagsFromFileName(fileName);
  const nextTags = currentTags.includes(tag)
    ? currentTags.filter((value) => value !== tag)
    : [...currentTags, tag];
  return buildTaggedImageFileNameFromTags(fileName, nextTags);
};

const extractFileNameFromPath = (pathValue: string) => {
  const tail = String(pathValue || "").split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
};

const buildStableImageCardKey = (entry: DraftEntry) => {
  const fullPath = String(entry.path || "").trim();
  const parts = fullPath.split("/").filter(Boolean);
  const fileNameFromPath = parts.pop() || String(entry.name || "").trim();
  const directory = parts.join("/");
  const { baseName, extension } = splitFileNameAndExtension(fileNameFromPath);
  const stripped = stripTrailingImageTagSuffixes(baseName);
  return `${directory}/${stripped}${extension}`;
};

const stripSkuPackSuffix = (value: string) =>
  String(value || "")
    .trim()
    .replace(/(?:[-_ ]?\d+\s*(?:pack|p))$/i, "")
    .replace(/[-_ ]+$/, "");

const buildVariantCombinedZhValue = (row: {
  draft_option1?: string;
  draft_option2?: string;
  draft_option3?: string;
  draft_option4?: string;
  fallback?: string;
}) => {
  const combined = [
    String(row.draft_option1 || "").trim(),
    String(row.draft_option2 || "").trim(),
    String(row.draft_option3 || "").trim(),
    String(row.draft_option4 || "").trim(),
  ]
    .filter(Boolean)
    .join(" / ");
  return combined || String(row.fallback || "").trim();
};

const createVariantEditorKey = () =>
  `variant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const extractVariantLabelFromFilename = (fileName: string, spu: string) => {
  const base = String(fileName || "").replace(/\.[^.]+$/, "");
  if (!base) return "";
  let next = base;
  const normalizedSpu = String(spu || "").trim();
  if (
    normalizedSpu &&
    next.toLowerCase().startsWith(normalizedSpu.toLowerCase())
  ) {
    next = next.slice(normalizedSpu.length);
  }
  next = next.replace(/^-+/, "").replace(/-+$/, "");
  if (!next) return base;
  return next.replace(/[_-]+/g, " ").trim();
};

const RAW_ROW_FIELD_MAP: Record<string, string[]> = {
  draft_mf_product_short_title: ["SE_shorttitle"],
  draft_mf_product_long_title: ["SE_longtitle"],
  draft_mf_product_subtitle: ["SE_subtitle"],
  draft_mf_product_bullets_short: ["SE_bullets_short"],
  draft_mf_product_bullets: ["SE_bullets"],
  draft_mf_product_bullets_long: ["SE_bullets_long"],
  draft_product_description_main_html: ["SE_description_main"],
  draft_description_html: ["SE_description_short"],
  draft_mf_product_description_short_html: ["SE_description_short"],
  draft_mf_product_description_extended_html: ["SE_description_extended"],
  draft_mf_product_specs: ["SE_specifications"],
};

const USE_NEW_FILE_EXPLORER = true;
const COMPLETED_SPU_STORAGE_KEY = "draftExplorer.completedSpuFolders.v1";

const estimateExpandedInputWidthPx = (
  value: string,
  options?: { minPx?: number; maxPx?: number }
) => {
  const text = String(value ?? "");
  const wideCharCount = (text.match(/[^\u0000-\u00ff]/g) ?? []).length;
  const approximateCharCount = text.length + wideCharCount;
  const estimated = approximateCharCount * 8 + 56;
  const minPx = options?.minPx ?? 0;
  const maxPx = options?.maxPx ?? 1400;
  if (estimated < minPx) return minPx;
  if (estimated > maxPx) return maxPx;
  return estimated;
};

const normalizeColumnSampleText = (value: unknown, maxChars = 120) => {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
};

const estimateTableTextWidthPx = (value: unknown) => {
  const text = normalizeColumnSampleText(value, 160);
  if (!text) return 0;
  const wideCharCount = (text.match(/[^\u0000-\u00ff]/g) ?? []).length;
  const asciiCount = text.length - wideCharCount;
  return Math.ceil(asciiCount * 7.1 + wideCharCount * 12.4);
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const computeAdaptiveColumnWidthPx = (
  headerText: string,
  values: unknown[],
  options: {
    minPx: number;
    maxPx: number;
    headerAsMax?: boolean;
    headerPaddingPx?: number;
    contentPaddingPx?: number;
  }
) => {
  const headerPaddingPx = options.headerPaddingPx ?? 24;
  const contentPaddingPx = options.contentPaddingPx ?? 24;
  const headerWidth = estimateTableTextWidthPx(headerText) + headerPaddingPx;
  const contentWidth =
    values.length > 0
      ? Math.max(...values.map((value) => estimateTableTextWidthPx(value))) + contentPaddingPx
      : 0;

  let target = Math.max(headerWidth, contentWidth, options.minPx);
  if (options.headerAsMax) {
    target = Math.min(target, Math.max(headerWidth, options.minPx));
  }
  return Math.round(clampNumber(target, options.minPx, options.maxPx));
};

export default function DraftExplorerPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [folders, setFolders] = useState<DraftFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [currentPath, setCurrentPath] = useState<string>("");
  const [batchPickerOpen, setBatchPickerOpen] = useState(false);
  const [spuPickerOpen, setSpuPickerOpen] = useState(false);
  const [runSpuOptions, setRunSpuOptions] = useState<RunSpuOption[]>([]);
  const [selectedRunsForMerge, setSelectedRunsForMerge] = useState<Set<string>>(
    new Set()
  );
  const [mergeRunsPending, setMergeRunsPending] = useState(false);

  const [runPreviewOpen, setRunPreviewOpen] = useState(false);
  const [runPreviewRun, setRunPreviewRun] = useState<string>("");
  const [runPreviewLoading, setRunPreviewLoading] = useState(false);
	  const [runPreviewItems, setRunPreviewItems] = useState<DraftRunPreviewItem[]>(
	    []
	  );
	  const [runPreviewSelectedSpus, setRunPreviewSelectedSpus] = useState<
	    Set<string>
	  >(new Set());
	  const [runPreviewDeletedSpus, setRunPreviewDeletedSpus] = useState<Set<string>>(
	    new Set()
	  );
  const [runPreviewSaving, setRunPreviewSaving] = useState(false);
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [mainViewVariantImageEntries, setMainViewVariantImageEntries] = useState<
    DraftEntry[]
  >([]);
  const [imageTabImageCounts, setImageTabImageCounts] = useState<
    Record<ImageFolderTabValue, number>
  >({
    main: 0,
    variants: 0,
    ocr: 0,
    others: 0,
  });
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesRefreshing, setEntriesRefreshing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [completedSpuFolders, setCompletedSpuFolders] = useState<Set<string>>(
    new Set()
  );
  const [imageViewMode, setImageViewMode] = useState<"small" | "big">("small");
  const [imageResizeActionIcon, setImageResizeActionIcon] = useState<
    "grow" | "shrink"
  >("grow");
  const [imageDimensions, setImageDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [selectedTreeFolders, setSelectedTreeFolders] = useState<Set<string>>(
    new Set()
  );
  const [collapsedTreeFolders, setCollapsedTreeFolders] = useState<Set<string>>(
    new Set()
  );
  const [folderTree, setFolderTree] = useState<DraftFolderTreeNode | null>(null);
  const [folderTreeLoading, setFolderTreeLoading] = useState(false);
  const [folderTreeHidden, setFolderTreeHidden] = useState(false);
  const [movingEntry, setMovingEntry] = useState(false);
  const [draggingEntryPaths, setDraggingEntryPaths] = useState<string[]>([]);
  const [folderDropTargetPath, setFolderDropTargetPath] = useState<string | null>(
    null
  );
  const [imageReorderDropPath, setImageReorderDropPath] = useState<string | null>(
    null
  );
  const [imageOrderPersisting, setImageOrderPersisting] = useState(false);
  const [contextMenu, setContextMenu] = useState<ExplorerContextMenuState | null>(
    null
  );
  const [contextMenuSubmenu, setContextMenuSubmenu] = useState<
    "tag-image" | "edit-chatgpt" | "edit-gemini" | null
  >(null);
  const [contextMenuNestedSubmenu, setContextMenuNestedSubmenu] = useState<
    | "chatgpt-digideal"
    | "chatgpt-scene"
    | "gemini-digideal"
    | "gemini-scene"
    | null
  >(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenuSubmenuSide, setContextMenuSubmenuSide] = useState<
    "right" | "left"
  >("right");
  const nonImageFileSelectAllRef = useRef<HTMLInputElement | null>(null);
  const [pendingAiEditsByOriginal, setPendingAiEditsByOriginal] = useState<
    Record<string, PendingAiEditRecord>
  >({});
  const [aiEditTargets, setAiEditTargets] = useState<DraftEntry[]>([]);
  const [aiEditProvider, setAiEditProvider] = useState<AiEditProvider>("chatgpt");
  const [aiEditMode, setAiEditMode] = useState<AiPromptMode>("template");
  const [aiEditTemplatePreset, setAiEditTemplatePreset] =
    useState<AiTemplatePreset>("standard");
  const [aiEditOutputCount, setAiEditOutputCount] = useState(1);
  const [aiEditPrompt, setAiEditPrompt] = useState("");
  const [aiEditSubmitting, setAiEditSubmitting] = useState(false);
  const [aiEditError, setAiEditError] = useState<string | null>(null);
  const [aiEditJobsByPath, setAiEditJobsByPath] = useState<Record<string, AiEditRuntimeJob>>(
    {}
  );
  const [aiReviewOriginalPath, setAiReviewOriginalPath] = useState<string | null>(null);
  const [aiReviewSubmitting, setAiReviewSubmitting] = useState(false);
  const [confirmAiEditsPending, setConfirmAiEditsPending] = useState(false);
  const [confirmingAiEditPaths, setConfirmingAiEditPaths] = useState<Set<string>>(
    new Set()
  );
  const [fileViewerPath, setFileViewerPath] = useState<string | null>(null);
  const [fileViewerContent, setFileViewerContent] = useState("");
  const [fileViewerLoading, setFileViewerLoading] = useState(false);
  const [fileViewerSaving, setFileViewerSaving] = useState(false);
  const [fileViewerError, setFileViewerError] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [reloadingImagePaths, setReloadingImagePaths] = useState<Set<string>>(
    new Set()
  );
  const [previewDeletePending, setPreviewDeletePending] = useState(false);
  const [photopeaOpen, setPhotopeaOpen] = useState(false);
  const [photopeaEntry, setPhotopeaEntry] = useState<DraftEntry | null>(null);
  const [photopeaReady, setPhotopeaReady] = useState(false);
  const [photopeaLoading, setPhotopeaLoading] = useState(false);
  const [photopeaExporting, setPhotopeaExporting] = useState(false);
  const [photopeaPersisting, setPhotopeaPersisting] = useState(false);
  const [photopeaError, setPhotopeaError] = useState<string | null>(null);
  const [photopeaSessionKey, setPhotopeaSessionKey] = useState(0);
  const photopeaIframeRef = useRef<HTMLIFrameElement | null>(null);
  const photopeaFileBufferRef = useRef<ArrayBuffer | null>(null);
  const photopeaExportBufferRef = useRef<ArrayBuffer | null>(null);
  const photopeaPersistingRef = useRef(false);
  const photopeaReadyRef = useRef(false);
  const photopeaFileSentRef = useRef(false);
  const [variantsImagePreview, setVariantsImagePreview] = useState<{
    src: string;
    label: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [addingImageUrls, setAddingImageUrls] = useState(false);
  const [explorerView, setExplorerView] = useState<"list" | "grid">("list");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameExtension, setRenameExtension] = useState("");
  const [renamePending, setRenamePending] = useState(false);
  const [bulkImageActionPending, setBulkImageActionPending] = useState(false);
  const [tagImagesRunningPaths, setTagImagesRunningPaths] = useState<Set<string>>(
    new Set()
  );
  const [tagAllImagesRunning, setTagAllImagesRunning] = useState(false);
  const [deleteFolderPending, setDeleteFolderPending] = useState(false);
  const [deleteProductPending, setDeleteProductPending] = useState(false);
  const [deleteRunsPending, setDeleteRunsPending] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [excelStatus, setExcelStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [zipStatus, setZipStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [draftTab, setDraftTab] = useState<"spu" | "sku">("spu");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [spuRows, setSpuRows] = useState<DraftSpuRow[]>([]);
  const [skuRows, setSkuRows] = useState<DraftSkuRow[]>([]);
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [, setIsSaving] = useState(false);
  const [selectedSpus, setSelectedSpus] = useState<Set<string>>(new Set());
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [deleteRowsPending, setDeleteRowsPending] = useState(false);
  const [duplicateRolesPending, setDuplicateRolesPending] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DraftSpuRow | null>(null);
  const [detailDraft, setDetailDraft] = useState<Record<string, string | null>>({});
  const [detailRawRow, setDetailRawRow] = useState<Record<string, unknown> | null>(
    null
  );
  const [detailImages, setDetailImages] = useState<DraftEntry[]>([]);
  const [detailImagesLoading, setDetailImagesLoading] = useState(false);
  const [detailInstruction, setDetailInstruction] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailRegenerating, setDetailRegenerating] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [skuStatus, setSkuStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [skuMessage, setSkuMessage] = useState<string | null>(null);
  const [skuMissingCount, setSkuMissingCount] = useState<number | null>(null);
  const [skuTotalCount, setSkuTotalCount] = useState<number | null>(null);
  const [variantsEditorOpen, setVariantsEditorOpen] = useState(false);
  const [variantsEditorSpu, setVariantsEditorSpu] = useState("");
  const [variantsEditorRows, setVariantsEditorRows] = useState<DraftVariantEditorRow[]>(
    []
  );
  const [variantsEditorThumbs, setVariantsEditorThumbs] = useState<DraftEntry[]>([]);
  const [variantsEditorThumbsLoading, setVariantsEditorThumbsLoading] = useState(false);
  const [variantsEditorLoading, setVariantsEditorLoading] = useState(false);
  const [variantsEditorSaving, setVariantsEditorSaving] = useState(false);
  const [variantsEditorError, setVariantsEditorError] = useState<string | null>(
    null
  );
  const [variantsEditorSelectedRows, setVariantsEditorSelectedRows] = useState<
    Set<string>
  >(new Set());
  const [variantsEditorPacksText, setVariantsEditorPacksText] = useState("");
  const [variantsEditorAiPrompt, setVariantsEditorAiPrompt] = useState("");
  const [variantsEditorAiRunning, setVariantsEditorAiRunning] = useState(false);
  const [variantsEditorSort, setVariantsEditorSort] = useState<{
    key: VariantEditorSortKey | null;
    direction: VariantEditorSortDirection;
  }>({
    key: null,
    direction: "asc",
  });
  const [initialOpenSpu, setInitialOpenSpu] = useState("");
  const pendingFolderOpenPathRef = useRef<string | null>(null);
  const initialOpenSpuHandledRef = useRef(false);
  const selectionAnchorImagePathRef = useRef<string | null>(null);
  const currentPathRef = useRef("");

  const tagImagesRunning = tagImagesRunningPaths.size > 0;
  const tagImagesRunningInCurrentPath = useMemo(() => {
    const pathValue = String(currentPath || "").trim();
    return Boolean(pathValue && tagImagesRunningPaths.has(pathValue));
  }, [currentPath, tagImagesRunningPaths]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COMPLETED_SPU_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const paths = parsed
        .map((value) => String(value || "").trim())
        .filter((value) => Boolean(value));
      setCompletedSpuFolders(new Set(paths));
    } catch {
      // ignore bad local storage payloads
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        COMPLETED_SPU_STORAGE_KEY,
        JSON.stringify(Array.from(completedSpuFolders))
      );
    } catch {
      // ignore storage failures
    }
  }, [completedSpuFolders]);

  const imageExtensions = useMemo(
    () => [".png", ".jpg", ".jpeg", ".webp", ".gif"],
    []
  );
  const isImage = useCallback(
    (name: string) =>
      imageExtensions.some((ext) => name.toLowerCase().endsWith(ext)),
    [imageExtensions]
  );

  const entryByPath = useMemo(() => {
    const map = new Map<string, DraftEntry>();
    entries.forEach((entry) => {
      map.set(entry.path, entry);
    });
    return map;
  }, [entries]);
  const displayImageEntriesRef = useRef<DraftEntry[]>([]);
  const isImageEntryUpscaled = useCallback(
    (entry: DraftEntry | null | undefined) => {
      if (!entry || entry.type !== "file") return false;
      const latest = entryByPath.get(entry.path) ?? entry;
      return Boolean(latest.zimageUpscaled);
    },
    [entryByPath]
  );

  const buildDraftDownloadUrl = useCallback(
    (pathValue: string, cacheVersion?: string | number | null) => {
      const query = new URLSearchParams();
      query.set("path", pathValue);
      if (cacheVersion !== undefined && cacheVersion !== null && String(cacheVersion)) {
        query.set("v", String(cacheVersion));
      }
      return `/api/drafts/download?${query.toString()}`;
    },
    []
  );

  const buildPhotopeaUrl = useCallback(() => {
    const config = {
      environment: {
        // Make Photopea "File -> Save" return a JPG ArrayBuffer to the parent window.
        customIO: {
          save: "app.activeDocument.saveToOE('jpg:0.92');",
        },
      },
    };
    return `https://www.photopea.com/#${encodeURIComponent(JSON.stringify(config))}`;
  }, []);

  const buildDraggedPathsForEntry = useCallback(
    (entry: DraftEntry) => {
      if (entry.type !== "file") return [entry.path];
      const selectedSource = isImage(entry.name)
        ? displayImageEntriesRef.current
        : entries;
      const selected = selectedSource
        .filter((candidate) => candidate.type === "file" && selectedFiles.has(candidate.path))
        .map((candidate) => candidate.path);
      if (selected.length > 1 && selected.includes(entry.path)) {
        return Array.from(new Set(selected));
      }
      return [entry.path];
    },
    [entries, isImage, selectedFiles]
  );

  const readDraggedPaths = useCallback(
    (transfer: DataTransfer | null) => {
      if (!transfer) {
        return draggingEntryPaths;
      }
      const raw = transfer.getData("application/x-nordexo-paths");
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            return parsed
              .map((value) => String(value || "").trim())
              .filter((value) => Boolean(value));
          }
        } catch {
          // Fallback to text/plain
        }
      }
      const single = String(transfer.getData("text/plain") || "").trim();
      if (single) return [single];
      return draggingEntryPaths;
    },
    [draggingEntryPaths]
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const fetchSpuRows = useCallback(async () => {
    const runFilter = String(selectedFolder || "").trim();
    if (!runFilter) {
      setSpuRows([]);
      return;
    }
    setDraftLoading(true);
    setDraftError(null);
    try {
      const url = new URL("/api/drafts/products", window.location.origin);
      url.searchParams.set("run", runFilter);
      if (searchQuery) url.searchParams.set("q", searchQuery);
      const response = await fetch(url.toString());
      if (!response.ok) {
        const text = await response.text();
        let message = text;
        if (text) {
          try {
            const parsed = JSON.parse(text) as { error?: string; message?: string };
            message = parsed?.error || parsed?.message || text;
          } catch {
            // Keep raw text.
          }
        }
        if (!message) {
          message = `Unable to load drafts (HTTP ${response.status}).`;
        }
        throw new Error(message);
      }
      const payload = await response.json();
      setSpuRows(payload.items ?? []);
    } catch (err) {
      setDraftError((err as Error).message);
      // Keep existing rows on error so we don't look like we deleted data.
    } finally {
      setDraftLoading(false);
    }
  }, [searchQuery, selectedFolder]);

  const fetchSkuRows = useCallback(async () => {
    const runFilter = String(selectedFolder || "").trim();
    if (!runFilter) {
      setSkuRows([]);
      return;
    }
    setDraftLoading(true);
    setDraftError(null);
    try {
      const url = new URL("/api/drafts/variants", window.location.origin);
      url.searchParams.set("run", runFilter);
      if (searchQuery) url.searchParams.set("q", searchQuery);
      const response = await fetch(url.toString());
      if (!response.ok) {
        const text = await response.text();
        let message = text;
        if (text) {
          try {
            const parsed = JSON.parse(text) as { error?: string; message?: string };
            message = parsed?.error || parsed?.message || text;
          } catch {
            // Keep raw text.
          }
        }
        if (!message) {
          message = `Unable to load drafts (HTTP ${response.status}).`;
        }
        throw new Error(message);
      }
      const payload = await response.json();
      setSkuRows(payload.items ?? []);
    } catch (err) {
      setDraftError((err as Error).message);
      // Keep existing rows on error so we don't look like we deleted data.
    } finally {
      setDraftLoading(false);
    }
  }, [searchQuery, selectedFolder]);

  const fetchSkuStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/drafts/sku/status");
      if (!response.ok) {
        const text = await response.text();
        let message = text;
        if (text) {
          try {
            const parsed = JSON.parse(text) as { error?: string };
            if (parsed?.error) message = parsed.error;
          } catch {
            // Keep raw text as message.
          }
        }
        if (!message) {
          message = `Unable to read SKU status (HTTP ${response.status}).`;
        }
        throw new Error(message);
      }
      const payload = await response.json();
      const nextStatus = payload.status ?? "idle";
      const nextMissing =
        typeof payload.missingCount === "number" ? payload.missingCount : null;
      const nextTotal =
        typeof payload.totalCount === "number" ? payload.totalCount : null;
      let nextMessage = payload.message ?? null;
      if (nextStatus === "done" && (!nextTotal || nextTotal === 0)) {
        nextMessage = null;
      }
      setSkuStatus(nextStatus);
      setSkuMessage(nextMessage);
      setSkuMissingCount(nextMissing);
      setSkuTotalCount(nextTotal);
      return payload;
    } catch (err) {
      setSkuStatus("error");
      setSkuMessage((err as Error).message);
      throw err;
    }
  }, []);

  const runSkuPipelineForSpus = useCallback(
    async (spus: string[]) => {
      const response = await fetch("/api/drafts/sku/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spus: spus.length ? spus : undefined,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "SKU generation failed.");
      }
      let payload = await fetchSkuStatus();
      let attempts = 0;
      while (payload?.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        payload = await fetchSkuStatus();
        attempts += 1;
        if (attempts > 360) {
          throw new Error("SKU generation timed out.");
        }
      }
      if (payload?.status === "error") {
        throw new Error(payload?.message || "SKU generation failed.");
      }
    },
    [fetchSkuStatus]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedSpu =
      String(params.get("open_spu") || params.get("spu") || "").trim();
    if (!requestedSpu) return;
    setDraftTab("spu");
    setInitialOpenSpu(requestedSpu.toUpperCase());
  }, []);

  useEffect(() => {
    if (draftTab === "spu") {
      fetchSpuRows();
    } else {
      fetchSkuRows();
    }
  }, [draftTab, fetchSpuRows, fetchSkuRows]);

  useEffect(() => {
    setSelectedSpus(new Set());
    setSelectedSkus(new Set());
    setExpandedSkus(new Set());
  }, [selectedFolder]);

  useEffect(() => {
    fetchSkuStatus().catch(() => {
      // fetchSkuStatus already updates error state; avoid unhandled rejections.
    });
  }, [fetchSkuStatus]);

  useEffect(() => {
    if (skuStatus !== "running") return;
    const handle = setInterval(() => {
      fetchSkuStatus().catch(() => {
        // Avoid unhandled rejections in the polling timer.
      });
    }, 5000);
    return () => clearInterval(handle);
  }, [skuStatus, fetchSkuStatus]);

  useEffect(() => {
    if (skuStatus === "done") {
      if (draftTab === "sku") {
        fetchSkuRows();
      } else {
        fetchSpuRows();
      }
    }
  }, [skuStatus, draftTab, fetchSkuRows, fetchSpuRows]);

  useEffect(() => {
    if (skuStatus !== "done" || !skuMessage) return;
    const handle = setTimeout(() => {
      setSkuMessage(null);
    }, 6000);
    return () => clearTimeout(handle);
  }, [skuStatus, skuMessage]);

  const allSpuSelected = useMemo(
    () => spuRows.length > 0 && spuRows.every((row) => selectedSpus.has(row.id)),
    [spuRows, selectedSpus]
  );

  const someSpuSelected = useMemo(
    () => spuRows.some((row) => selectedSpus.has(row.id)),
    [spuRows, selectedSpus]
  );

  const allSkuSelected = useMemo(
    () => skuRows.length > 0 && skuRows.every((row) => selectedSkus.has(row.id)),
    [skuRows, selectedSkus]
  );

  const someSkuSelected = useMemo(
    () => skuRows.some((row) => selectedSkus.has(row.id)),
    [skuRows, selectedSkus]
  );

  const spuColumnStyles = useMemo(() => {
    const sample = spuRows;
    const makeStyle = (
      headerText: string,
      values: unknown[],
      options: {
        minPx: number;
        maxPx: number;
        headerAsMax?: boolean;
        headerPaddingPx?: number;
        contentPaddingPx?: number;
      }
    ) => {
      const width = computeAdaptiveColumnWidthPx(headerText, values, options);
      return {
        width: `${width}px`,
        minWidth: `${options.minPx}px`,
        maxWidth: `${options.maxPx}px`,
      };
    };

    const detailsLabel = t("draftExplorer.detailsButton");
    const viewLabel = "View";

    return {
      selection: {
        width: "44px",
        minWidth: "44px",
        maxWidth: "44px",
      },
      spu: makeStyle(
        t("draftExplorer.columns.spu"),
        sample.map((row) => row.draft_spu),
        { minPx: 110, maxPx: 220 }
      ),
      title: makeStyle(
        t("draftExplorer.columns.title"),
        sample.map((row) => row.draft_title ?? ""),
        { minPx: 180, maxPx: 560, contentPaddingPx: 12 }
      ),
      status: makeStyle(
        t("draftExplorer.columns.status"),
        sample.map((row) => row.draft_status ?? ""),
        { minPx: 90, maxPx: 150 }
      ),
      source: makeStyle(
        t("draftExplorer.columns.source"),
        sample.map((row) => row.draft_source ?? ""),
        { minPx: 90, maxPx: 150 }
      ),
      supplier: makeStyle(
        t("draftExplorer.columns.supplierUrl"),
        sample.map((row) => row.draft_supplier_1688_url ?? ""),
        { minPx: 130, maxPx: 360, contentPaddingPx: 8 }
      ),
      images: makeStyle(
        t("draftExplorer.columns.images"),
        sample.map(() => viewLabel),
        { minPx: 86, maxPx: 124, headerAsMax: true }
      ),
      videos: makeStyle(
        t("draftExplorer.columns.videos"),
        sample.map((row) => String(row.video_count ?? "")),
        { minPx: 68, maxPx: 110, headerAsMax: true }
      ),
      variants: makeStyle(
        t("draftExplorer.columns.variants"),
        sample.map((row) => `Edit (${row.variant_count ?? 0})`),
        { minPx: 116, maxPx: 180 }
      ),
      updated: makeStyle(
        t("draftExplorer.columns.updated"),
        sample.map((row) => formatDate(row.draft_updated_at)),
        { minPx: 92, maxPx: 124, headerAsMax: true, contentPaddingPx: 12 }
      ),
      created: makeStyle(
        t("draftExplorer.columns.created"),
        sample.map((row) => formatDate(row.draft_created_at)),
        { minPx: 92, maxPx: 124, headerAsMax: true, contentPaddingPx: 12 }
      ),
      details: makeStyle(
        t("draftExplorer.columns.details"),
        sample.map(() => detailsLabel),
        { minPx: 92, maxPx: 130, headerAsMax: true }
      ),
    };
  }, [spuRows, t]);

  const skuColumnStyles = useMemo(() => {
    const sample = skuRows;
    const makeStyle = (
      headerText: string,
      values: unknown[],
      options: {
        minPx: number;
        maxPx: number;
        headerAsMax?: boolean;
        headerPaddingPx?: number;
        contentPaddingPx?: number;
      }
    ) => {
      const width = computeAdaptiveColumnWidthPx(headerText, values, options);
      return {
        width: `${width}px`,
        minWidth: `${options.minPx}px`,
        maxWidth: `${options.maxPx}px`,
      };
    };

    const detailsExpandLabel = t("draftExplorer.expand");
    const detailsCollapseLabel = t("draftExplorer.collapse");

    return {
      selection: {
        width: "44px",
        minWidth: "44px",
        maxWidth: "44px",
      },
      sku: makeStyle(
        t("draftExplorer.columns.sku"),
        sample.map((row) => row.draft_sku ?? ""),
        { minPx: 170, maxPx: 340 }
      ),
      colorSe: makeStyle(
        t("draftExplorer.columns.colorSe"),
        sample.map((row) => getRawValue(row.draft_raw_row, "variation_color_se")),
        { minPx: 110, maxPx: 260 }
      ),
      sizeSe: makeStyle(
        t("draftExplorer.columns.sizeSe"),
        sample.map((row) => getRawValue(row.draft_raw_row, "variation_size_se")),
        { minPx: 96, maxPx: 210 }
      ),
      otherSe: makeStyle(
        t("draftExplorer.columns.otherSe"),
        sample.map((row) => getRawValue(row.draft_raw_row, "variation_other_se")),
        { minPx: 126, maxPx: 340 }
      ),
      amountSe: makeStyle(
        t("draftExplorer.columns.amountSe"),
        sample.map((row) => getRawValue(row.draft_raw_row, "variation_amount_se")),
        { minPx: 112, maxPx: 260 }
      ),
      optionCombined: makeStyle(
        t("draftExplorer.columns.optionCombined"),
        sample.map((row) => row.draft_option_combined_zh ?? ""),
        { minPx: 190, maxPx: 520 }
      ),
      price: makeStyle(
        t("draftExplorer.columns.price"),
        sample.map((row) => row.draft_price ?? ""),
        { minPx: 90, maxPx: 150 }
      ),
      weight: makeStyle(
        t("draftExplorer.columns.weight"),
        sample.map((row) =>
          `${row.draft_weight ?? ""}${row.draft_weight_unit ? ` ${row.draft_weight_unit}` : ""}`
        ),
        { minPx: 100, maxPx: 170 }
      ),
      variantImage: makeStyle(
        t("draftExplorer.columns.variantImage"),
        sample.map((row) => row.draft_variant_image_url ?? ""),
        { minPx: 170, maxPx: 430 }
      ),
      status: makeStyle(
        t("draftExplorer.columns.status"),
        sample.map((row) => row.draft_status ?? ""),
        { minPx: 90, maxPx: 150 }
      ),
      updated: makeStyle(
        t("draftExplorer.columns.updated"),
        sample.map((row) => formatDate(row.draft_updated_at)),
        { minPx: 92, maxPx: 124, headerAsMax: true, contentPaddingPx: 12 }
      ),
      details: makeStyle(
        t("draftExplorer.columns.details"),
        sample.map(() => `${detailsExpandLabel} ${detailsCollapseLabel}`),
        { minPx: 106, maxPx: 170 }
      ),
    };
  }, [skuRows, t]);

  const skuHeaderColumns = useMemo(
    () => [
      {
        key: "sku",
        label: t("draftExplorer.columns.sku"),
        style: skuColumnStyles.sku,
      },
      {
        key: "colorSe",
        label: t("draftExplorer.columns.colorSe"),
        style: skuColumnStyles.colorSe,
      },
      {
        key: "sizeSe",
        label: t("draftExplorer.columns.sizeSe"),
        style: skuColumnStyles.sizeSe,
      },
      {
        key: "otherSe",
        label: t("draftExplorer.columns.otherSe"),
        style: skuColumnStyles.otherSe,
      },
      {
        key: "amountSe",
        label: t("draftExplorer.columns.amountSe"),
        style: skuColumnStyles.amountSe,
      },
      {
        key: "optionCombined",
        label: t("draftExplorer.columns.optionCombined"),
        style: skuColumnStyles.optionCombined,
      },
      {
        key: "price",
        label: t("draftExplorer.columns.price"),
        style: skuColumnStyles.price,
      },
      {
        key: "weight",
        label: t("draftExplorer.columns.weight"),
        style: skuColumnStyles.weight,
      },
      {
        key: "variantImage",
        label: t("draftExplorer.columns.variantImage"),
        style: skuColumnStyles.variantImage,
      },
      {
        key: "status",
        label: t("draftExplorer.columns.status"),
        style: skuColumnStyles.status,
      },
      {
        key: "updated",
        label: t("draftExplorer.columns.updated"),
        style: skuColumnStyles.updated,
      },
      {
        key: "details",
        label: t("draftExplorer.columns.details"),
        style: skuColumnStyles.details,
      },
    ],
    [skuColumnStyles, t]
  );

  const toggleSelectAllSpus = () => {
    if (allSpuSelected) {
      setSelectedSpus(new Set());
      return;
    }
    setSelectedSpus(new Set(spuRows.map((row) => row.id)));
  };

  const toggleSelectSpu = (id: string) => {
    setSelectedSpus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllSkus = () => {
    if (allSkuSelected) {
      setSelectedSkus(new Set());
      return;
    }
    setSelectedSkus(new Set(skuRows.map((row) => row.id)));
  };

  const toggleSelectSku = (id: string) => {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const buildDetailDraft = (row: DraftSpuRow) => ({
    draft_mf_product_short_title: row.draft_mf_product_short_title ?? "",
    draft_mf_product_long_title: row.draft_mf_product_long_title ?? "",
    draft_mf_product_subtitle: row.draft_mf_product_subtitle ?? "",
    draft_mf_product_bullets_short: row.draft_mf_product_bullets_short ?? "",
    draft_mf_product_bullets: row.draft_mf_product_bullets ?? "",
    draft_mf_product_bullets_long: row.draft_mf_product_bullets_long ?? "",
    draft_product_description_main_html:
      row.draft_product_description_main_html ?? "",
    draft_mf_product_description_short_html:
      row.draft_mf_product_description_short_html ?? row.draft_description_html ?? "",
    draft_mf_product_description_extended_html:
      row.draft_mf_product_description_extended_html ?? "",
    draft_description_html:
      row.draft_description_html ??
      row.draft_mf_product_description_short_html ??
      "",
    draft_mf_product_specs: row.draft_mf_product_specs ?? "",
    draft_title: row.draft_title ?? "",
    draft_subtitle: row.draft_subtitle ?? "",
  });

  const updateDetailField = (field: string, value: string) => {
    setDetailDraft((prev) => ({ ...prev, [field]: value }));
    const rawKeys = RAW_ROW_FIELD_MAP[field];
    if (rawKeys && detailRawRow) {
      setDetailRawRow((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        rawKeys.forEach((key) => {
          next[key] = value;
        });
        return next;
      });
    }
  };

  const openDetails = (row: DraftSpuRow) => {
    setDetailTarget(row);
    setDetailDraft(buildDetailDraft(row));
    setDetailRawRow(row.draft_raw_row ?? null);
    setDetailInstruction("");
    setDetailError(null);
    setDetailOpen(true);
  };

  const resolveDetailFolder = (row: DraftSpuRow) => {
    const rawFolder = row.draft_image_folder ?? "";
    if (!rawFolder) return null;
    const normalized = rawFolder.replace(/^\/+/, "");
    const marker = "images/draft_products/";
    const idx = normalized.indexOf(marker);
    const relative = idx >= 0 ? normalized.slice(idx + marker.length) : normalized;
    return relative || null;
  };

  const fetchDetailImages = useCallback(async (row: DraftSpuRow) => {
    const relative = resolveDetailFolder(row);
    if (!relative) {
      setDetailImages([]);
      return;
    }
    const parts = relative.split("/").filter(Boolean);
    if (parts.length === 0) {
      setDetailImages([]);
      return;
    }
    const [run, ...rest] = parts;
    const subPath = rest.join("/");
    setDetailImagesLoading(true);
    try {
      const url = new URL(
        `/api/drafts/folders/${encodeURIComponent(run)}/list`,
        window.location.origin
      );
      if (subPath) url.searchParams.set("path", subPath);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error();
      const payload = await response.json();
      const items = (payload.items ?? []) as DraftEntry[];
      const images = items
        .filter(
          (entry) =>
            entry.type === "file" &&
            /\.jpe?g$/i.test(entry.name)
        )
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
        .slice(0, 6);
      setDetailImages(images);
    } catch {
      setDetailImages([]);
    } finally {
      setDetailImagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!detailOpen || !detailTarget) return;
    fetchDetailImages(detailTarget);
  }, [detailOpen, detailTarget, fetchDetailImages]);

  const skuReady =
    skuMissingCount !== null &&
    skuMissingCount === 0 &&
    (skuTotalCount ?? 0) > 0;

  const handlePublishDrafts = async () => {
    if (draftTab !== "spu") return;
    setPublishMessage(null);
    if (skuStatus === "running") {
      setPublishStatus("error");
      setPublishMessage(t("draftExplorer.publishBlockedSkuRunning"));
      return;
    }
    if (!skuReady) {
      setPublishStatus("error");
      setPublishMessage(t("draftExplorer.publishBlockedSkusMissing"));
      return;
    }
    setPublishStatus("running");
    const selectedRows = spuRows.filter((row) => selectedSpus.has(row.id));
    const selectedSpuValues = selectedRows
      .map((row) => row.draft_spu)
      .filter(Boolean);
    if (selectedSpuValues.length === 0) {
      const confirmAll = window.confirm(
        t("draftExplorer.publishConfirmAll")
      );
      if (!confirmAll) {
        setPublishStatus("idle");
        return;
      }
    } else {
      const confirmSelected = window.confirm(
        t("draftExplorer.publishConfirmSelected", {
          count: selectedSpuValues.length,
        })
      );
      if (!confirmSelected) {
        setPublishStatus("idle");
        return;
      }
    }
    try {
      const response = await fetch("/api/drafts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spus: selectedSpuValues.length ? selectedSpuValues : undefined,
          publishAll: selectedSpuValues.length === 0,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Publish failed.");
      }
      const payload = await response.json();
      const count = Array.isArray(payload?.spus) ? payload.spus.length : 0;
      setPublishMessage(t("draftExplorer.publishSuccess", { count }));
      setPublishStatus("done");
      setSelectedSpus(new Set());
      fetchSpuRows();
    } catch (err) {
      setPublishStatus("error");
      setPublishMessage((err as Error).message);
    }
  };

  const handleGenerateSkus = async () => {
    setSkuMessage(null);
    setSkuStatus("running");
    const selectedRows = spuRows.filter((row) => selectedSpus.has(row.id));
    const selectedSpuValues = selectedRows
      .map((row) => row.draft_spu)
      .filter(Boolean);
    const isRegenerate = skuReady;
    if (selectedSpuValues.length === 0) {
      const confirmAll = window.confirm(
        isRegenerate
          ? t("draftExplorer.regenerateSkuConfirmAll")
          : t("draftExplorer.generateSkuConfirmAll")
      );
      if (!confirmAll) {
        setSkuStatus("idle");
        return;
      }
    } else {
      const confirmSelected = window.confirm(
        isRegenerate
          ? t("draftExplorer.regenerateSkuConfirmSelected", {
              count: selectedSpuValues.length,
            })
          : t("draftExplorer.generateSkuConfirmSelected", {
              count: selectedSpuValues.length,
            })
      );
      if (!confirmSelected) {
        setSkuStatus("idle");
        return;
      }
    }
    try {
      const response = await fetch("/api/drafts/sku/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spus: selectedSpuValues.length ? selectedSpuValues : undefined,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "SKU generation failed.");
      }
      await fetchSkuStatus();
    } catch (err) {
      setSkuStatus("error");
      setSkuMessage((err as Error).message);
    }
  };

  const handleDeleteRows = async () => {
    if (deleteRowsPending) return;
    const selectedRows =
      draftTab === "spu"
        ? spuRows.filter((row) => selectedSpus.has(row.id))
        : skuRows.filter((row) => selectedSkus.has(row.id));
    if (selectedRows.length === 0) return;
    const confirmDelete = window.confirm(
      t("draftExplorer.deleteRowsConfirm", { count: selectedRows.length })
    );
    if (!confirmDelete) return;
    setDeleteRowsPending(true);
    setDraftError(null);
    try {
      if (draftTab === "spu") {
        const selectedSpuValues = selectedRows
          .map((row) => (row as DraftSpuRow).draft_spu)
          .filter(Boolean);
        if (selectedSpuValues.length === 0) {
          setDeleteRowsPending(false);
          return;
        }
        const response = await fetch("/api/drafts/products/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spus: selectedSpuValues }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload?.error || t("draftExplorer.deleteRowsError")
          );
        }
        setSelectedSpus(new Set());
      } else {
        const selectedSkuIds = selectedRows.map((row) => row.id);
        const response = await fetch("/api/drafts/variants/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedSkuIds }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload?.error || t("draftExplorer.deleteRowsError")
          );
        }
        setSelectedSkus(new Set());
      }
      fetchSpuRows();
      fetchSkuRows();
    } catch (err) {
      setDraftError(
        err instanceof Error
          ? err.message
          : t("draftExplorer.deleteRowsError")
      );
    } finally {
      setDeleteRowsPending(false);
    }
  };

  const handleDuplicateSkuRoles = useCallback(async () => {
    if (duplicateRolesPending) return;
    const ids = skuRows
      .filter((row) => selectedSkus.has(row.id))
      .map((row) => row.id);
    if (ids.length === 0) return;
    setDuplicateRolesPending(true);
    setDraftError(null);
    try {
      const response = await fetch("/api/drafts/variants/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to duplicate selected SKU rows.");
      }
      setSelectedSkus(new Set());
      await fetchSkuRows();
      await fetchSpuRows();
    } catch (err) {
      setDraftError(
        err instanceof Error
          ? err.message
          : "Unable to duplicate selected SKU rows."
      );
    } finally {
      setDuplicateRolesPending(false);
    }
  }, [
    duplicateRolesPending,
    fetchSkuRows,
    fetchSpuRows,
    selectedSkus,
    skuRows,
  ]);

  const handleDetailSave = async () => {
    if (!detailTarget || detailSaving) return;
    setDetailSaving(true);
    setDetailError(null);
    try {
      const updates: Record<string, unknown> = {
        draft_title:
          detailDraft.draft_mf_product_long_title ||
          detailDraft.draft_mf_product_short_title ||
          detailDraft.draft_title,
        draft_subtitle:
          detailDraft.draft_mf_product_subtitle || detailDraft.draft_subtitle,
        draft_description_html:
          detailDraft.draft_mf_product_description_short_html ||
          detailDraft.draft_description_html,
        draft_product_description_main_html:
          detailDraft.draft_product_description_main_html,
        draft_mf_product_description_short_html:
          detailDraft.draft_mf_product_description_short_html,
        draft_mf_product_description_extended_html:
          detailDraft.draft_mf_product_description_extended_html,
        draft_mf_product_short_title: detailDraft.draft_mf_product_short_title,
        draft_mf_product_long_title: detailDraft.draft_mf_product_long_title,
        draft_mf_product_subtitle: detailDraft.draft_mf_product_subtitle,
        draft_mf_product_bullets_short: detailDraft.draft_mf_product_bullets_short,
        draft_mf_product_bullets: detailDraft.draft_mf_product_bullets,
        draft_mf_product_bullets_long: detailDraft.draft_mf_product_bullets_long,
        draft_mf_product_specs: detailDraft.draft_mf_product_specs,
      };
      if (detailRawRow) {
        updates.draft_raw_row = detailRawRow;
      }
      const response = await fetch("/api/drafts/products/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detailTarget.id, updates }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Save failed.");
      }
      setDetailOpen(false);
      setDetailTarget(null);
      fetchSpuRows();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setDetailSaving(false);
    }
  };

  const handleDetailRegenerate = async (mode: "stay" | "close") => {
    if (!detailTarget || detailRegenerating) return;
    const instruction = detailInstruction.trim();
    if (!instruction) {
      setDetailError(t("draftExplorer.detailsDialog.instructionRequired"));
      return;
    }
    const targetId = detailTarget.id;
    setDetailRegenerating(true);
    setDetailError(null);
    if (mode === "close") {
      setDetailOpen(false);
    }
    try {
      const response = await fetch("/api/drafts/products/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetId,
          instruction,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Rewrite failed.");
      }
      const updates = payload?.updates ?? {};
      const rawRow = payload?.raw_row ?? null;

      if (mode === "close") {
        const saveUpdates: Record<string, unknown> = { ...updates };
        if (rawRow) {
          saveUpdates.draft_raw_row = rawRow;
        }
        const saveResponse = await fetch("/api/drafts/products/bulk-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: targetId, updates: saveUpdates }),
        });
        const savePayload = await saveResponse.json().catch(() => ({}));
        if (!saveResponse.ok) {
          throw new Error(savePayload?.error || "Save failed.");
        }
        fetchSpuRows();
      } else {
        setDetailDraft((prev) => ({ ...prev, ...updates }));
        if (rawRow) {
          setDetailRawRow(rawRow);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Rewrite failed.";
      if (mode === "close") {
        setDraftError(message);
      } else {
        setDetailError(message);
      }
    } finally {
      setDetailRegenerating(false);
    }
  };

  const closeDetails = () => {
    setDetailOpen(false);
    setDetailTarget(null);
    setDetailDraft({});
    setDetailRawRow(null);
    setDetailInstruction("");
    setDetailImages([]);
    setDetailError(null);
  };

  const handleRerunSkuImages = async () => {
    setSkuMessage(null);
    setSkuStatus("running");
    const selectedRows = spuRows.filter((row) => selectedSpus.has(row.id));
    const selectedSpuValues = selectedRows
      .map((row) => row.draft_spu)
      .filter(Boolean);
    if (selectedSpuValues.length === 0) {
      const confirmAll = window.confirm(
        t("draftExplorer.rerunSkuConfirmAll")
      );
      if (!confirmAll) {
        setSkuStatus("idle");
        return;
      }
    } else {
      const confirmSelected = window.confirm(
        t("draftExplorer.rerunSkuConfirmSelected", {
          count: selectedSpuValues.length,
        })
      );
      if (!confirmSelected) {
        setSkuStatus("idle");
        return;
      }
    }
    try {
      await runSkuPipelineForSpus(selectedSpuValues);
    } catch (err) {
      setSkuStatus("error");
      setSkuMessage((err as Error).message);
    }
  };

  const handleImport = async (type: "excel" | "zip") => {
    setError(null);
    const file = type === "excel" ? excelFile : zipFile;
    if (!file) return;
    type === "excel" ? setExcelStatus("uploading") : setZipStatus("uploading");
    try {
      type ImportCollisionStrategy =
        | "ask"
        | "skip"
        | "replace"
        | "create_revision";
      let strategy: ImportCollisionStrategy = "ask";
      let replaceConfirmed = false;
      let payload: Record<string, unknown> | null = null;

      // Collision-aware import loop. We retry with user-selected strategy when
      // the API reports SPU collisions.
      while (true) {
        const formData = new FormData();
        if (type === "excel") {
          formData.append("workbook", file);
        } else {
          formData.append("images_zip", file);
        }
        formData.append("purgeMissing", "false");
        formData.append("collisionStrategy", strategy);
        if (replaceConfirmed) {
          formData.append("replaceConfirmed", "true");
        }

        const response = await fetch("/api/drafts/import", {
          method: "POST",
          body: formData,
        });
        const parsed = (await response.json().catch(() => null)) as
          | Record<string, unknown>
          | null;

        if (response.status === 409 && parsed?.code === "draft_spu_collision") {
          const collisions = Array.isArray(parsed?.collisionSpus)
            ? (parsed.collisionSpus as string[])
            : [];
          const collisionPreview =
            collisions.length > 6
              ? `${collisions.slice(0, 6).join(", ")} +${collisions.length - 6} more`
              : collisions.join(", ");
          const choice = window.prompt(
            [
              `SPU collision detected (${collisions.length}).`,
              collisionPreview ? `SPUs: ${collisionPreview}` : "",
              "Type one option:",
              "- skip (recommended)",
              "- create_revision (backup + replace)",
              "- replace (overwrite existing)",
              "- cancel",
            ]
              .filter(Boolean)
              .join("\n"),
            "skip"
          );
          const normalizedChoice = String(choice || "")
            .trim()
            .toLowerCase();
          if (!normalizedChoice || normalizedChoice === "cancel") {
            throw new Error("Import cancelled.");
          }
          if (
            normalizedChoice !== "skip" &&
            normalizedChoice !== "replace" &&
            normalizedChoice !== "create_revision"
          ) {
            throw new Error(
              "Invalid collision choice. Use skip, create_revision, or replace."
            );
          }
          strategy = normalizedChoice as ImportCollisionStrategy;
          if (strategy === "replace") {
            replaceConfirmed = window.confirm(
              `Replace ${collisions.length} existing draft SPU(s)? This will overwrite current SPU/SKU draft data for those SPUs.`
            );
            if (!replaceConfirmed) {
              throw new Error("Import cancelled.");
            }
          } else {
            replaceConfirmed = false;
          }
          continue;
        }

        if (!response.ok) {
          const apiError =
            (parsed && typeof parsed.error === "string" && parsed.error) || "";
          const message = apiError || `Import failed (HTTP ${response.status}).`;
          throw new Error(message);
        }

        payload = parsed;
        break;
      }

      if (!payload) {
        throw new Error("Import failed: empty response payload.");
      }
      const errors = Array.isArray(payload?.errors)
        ? payload.errors.filter((entry: unknown) => Boolean(entry))
        : [];
      const skippedCollisionSpus = Array.isArray(payload?.skippedCollisionSpus)
        ? (payload.skippedCollisionSpus as string[])
        : [];
      if (errors.length > 0) {
        setError(`Import completed with errors: ${errors.join(" | ")}`);
        type === "excel" ? setExcelStatus("error") : setZipStatus("error");
      } else {
        type === "excel" ? setExcelStatus("done") : setZipStatus("done");
        if (skippedCollisionSpus.length > 0) {
          setError(
            `Import completed. Skipped ${skippedCollisionSpus.length} existing draft SPU(s): ${skippedCollisionSpus.join(
              ", "
            )}`
          );
        }
      }
      if (draftTab === "spu") {
        fetchSpuRows();
      } else {
        fetchSkuRows();
      }
    } catch (err) {
      type === "excel" ? setExcelStatus("error") : setZipStatus("error");
      setError((err as Error).message);
    }
  };

  const listPathEntries = useCallback(async (pathValue: string) => {
    if (!pathValue) return [] as DraftEntry[];
    const [run, ...rest] = pathValue.split("/");
    const subPath = rest.join("/");
    const url = new URL(
      `/api/drafts/folders/${encodeURIComponent(run)}/list`,
      window.location.origin
    );
    if (subPath) {
      url.searchParams.set("path", subPath);
    }
    const response = await fetch(url.toString());
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Unable to load folder (HTTP ${response.status})`);
    }
    const payload = await response.json();
    return (payload.items ?? []) as DraftEntry[];
  }, []);

  const fetchFolderTree = useCallback(async (pathValue: string) => {
    if (!pathValue) {
      setFolderTree(null);
      return;
    }
    setFolderTreeLoading(true);
    try {
      const [run, ...rest] = pathValue.split("/");
      const subPath = rest.join("/");
      const url = new URL(
        `/api/drafts/folders/${encodeURIComponent(run)}/tree`,
        window.location.origin
      );
      if (subPath) {
        url.searchParams.set("path", subPath);
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error();
      }
      const payload = await response.json();
      setFolderTree((payload.root ?? null) as DraftFolderTreeNode | null);
    } catch {
      setFolderTree(null);
    } finally {
      setFolderTreeLoading(false);
    }
  }, []);

  const isArchiveFolder = useCallback((value: string) => {
    const normalized = value.toLowerCase().replace(/[_-]+/g, " ");
    return normalized.includes("archive");
  }, []);

  const isChunksDirectory = useCallback((value: string) => {
    const normalized = value.toLowerCase().replace(/[\s_-]+/g, "");
    return normalized === "chunks";
  }, []);

  const pickPreferredRunFolder = useCallback(
    (items: DraftFolder[]) => {
      if (items.length === 0) return null;
      const nonArchive = items.filter(
        (item) => !isArchiveFolder(`${item.name} ${item.path}`)
      );
      const pool = nonArchive.length > 0 ? nonArchive : items;
      const draftedProducts = pool.filter((item) =>
        /drafted[-_\s]*products/i.test(`${item.name} ${item.path}`)
      );
      return draftedProducts[0] ?? pool[0] ?? null;
    },
    [isArchiveFolder]
  );

  const resolveInitialExplorerPath = useCallback(
    async (runPath: string) => {
      if (!runPath) return "";
      try {
        const rootEntries = await listPathEntries(runPath);
        const preferredDir = rootEntries.find(
          (entry) => entry.type === "dir" && !isChunksDirectory(entry.name)
        );
        return preferredDir?.path ?? runPath;
      } catch {
        return runPath;
      }
    },
    [isChunksDirectory, listPathEntries]
  );

  const fetchFolders = useCallback(async () => {
    try {
      const response = await fetch("/api/drafts/folders");
      if (!response.ok) return;
      const payload = await response.json();
      const items = (payload.items ?? []) as DraftFolder[];
      setFolders(items);
      if (items.length === 0) {
        setSelectedFolder("");
        setCurrentPath("");
        setFolderTree(null);
        return;
      }
      const selectedStillExists = items.some((item) => item.path === selectedFolder);
      if (selectedFolder && selectedStillExists) {
        return;
      }

      const preferredRun = pickPreferredRunFolder(items);
      const nextRunPath = preferredRun?.path ?? items[0]?.path ?? "";
      if (!nextRunPath) return;
      const nextPath = await resolveInitialExplorerPath(nextRunPath);
      pendingFolderOpenPathRef.current = nextPath;
      setSelectedFolder(nextRunPath);
      setCurrentPath(nextPath);
    } catch {
      return;
    }
  }, [pickPreferredRunFolder, resolveInitialExplorerPath, selectedFolder]);

  const fetchEntries = useCallback(
    async (pathValue: string) => {
      if (!pathValue) {
        setEntries([]);
        return;
      }
      setEntriesLoading(true);
      try {
        const items = await listPathEntries(pathValue);
        setEntries(items);
        setSelectedFiles(new Set());
        setPreviewPath(null);
      } catch {
        setEntries([]);
      } finally {
        setEntriesLoading(false);
      }
    },
    [listPathEntries]
  );

  const refreshEntries = useCallback(
    async (pathValue: string) => {
      if (!pathValue || entriesRefreshing) return;
      setEntriesRefreshing(true);
      try {
        const items = await listPathEntries(pathValue);
        const available = new Set(items.map((entry) => entry.path));
        setEntries(items);
        setSelectedFiles((prev) => {
          if (prev.size === 0) return prev;
          const next = new Set<string>();
          prev.forEach((value) => {
            if (available.has(value)) next.add(value);
          });
          return next;
        });
        setPreviewPath((prev) => (prev && available.has(prev) ? prev : null));
        setImageDimensions((prev) => {
          const next: Record<string, { width: number; height: number }> = {};
          Object.entries(prev).forEach(([pathValue, dims]) => {
            if (available.has(pathValue)) {
              next[pathValue] = dims;
            }
          });
          return next;
        });
      } catch {
        // Keep previous entries on refresh failure to avoid flicker.
      } finally {
        setEntriesRefreshing(false);
      }
    },
    [entriesRefreshing, listPathEntries]
  );

  const fetchPendingAiEdits = useCallback(async (pathValue: string) => {
    if (!pathValue) {
      setPendingAiEditsByOriginal({});
      return;
    }
    try {
      const response = await fetch(
        `/api/drafts/ai-edits?folder=${encodeURIComponent(pathValue)}`
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load AI edit state.");
      }
      const items = Array.isArray(payload?.items)
        ? (payload.items as PendingAiEditRecord[])
        : [];
      const next: Record<string, PendingAiEditRecord> = {};
      for (const item of items) {
        if (!item?.originalPath) continue;
        next[item.originalPath] = item;
      }
      setPendingAiEditsByOriginal(next);
    } catch {
      setPendingAiEditsByOriginal({});
    }
  }, []);

  const handleSelectFolder = useCallback(
    async (nextFolderValue: string) => {
      const nextFolder = String(nextFolderValue || "");
      if (!nextFolder) {
        setSelectedFolder("");
        setCurrentPath("");
        setEntries([]);
        setFolderTree(null);
        return;
      }
      const nextPath = await resolveInitialExplorerPath(nextFolder);
      pendingFolderOpenPathRef.current = nextPath;
      setSelectedFolder(nextFolder);
      setSpuPickerOpen(false);
      setCurrentPath(nextPath);
    },
    [resolveInitialExplorerPath]
  );

  useEffect(() => {
    const run = String(selectedFolder || "").trim();
    if (!run) {
      setRunSpuOptions([]);
      return;
    }

    let cancelled = false;
    const loadRunSpuOptions = async () => {
      try {
        const items = await listPathEntries(run);
        if (cancelled) return;
        const options = items
          .filter(
            (entry) => entry.type === "dir" && !isChunksDirectory(entry.name)
          )
          .map((entry) => ({
            name: entry.name,
            path: entry.path,
          }))
          .sort((left, right) =>
            left.name.localeCompare(right.name, undefined, {
              numeric: true,
              sensitivity: "base",
            })
          );
        setRunSpuOptions(options);
      } catch {
        if (!cancelled) {
          setRunSpuOptions([]);
        }
      }
    };

    void loadRunSpuOptions();
    return () => {
      cancelled = true;
    };
  }, [folderTree, isChunksDirectory, listPathEntries, selectedFolder]);

  const selectedSpuPathInRun = useMemo(() => {
    const run = String(selectedFolder || "").trim();
    const pathValue = String(currentPath || "").trim();
    if (!run || !pathValue) return "";
    const parts = pathValue.split("/").filter(Boolean);
    if (parts.length < 2) return "";
    if (parts[0] !== run) return "";
    return `${parts[0]}/${parts[1]}`;
  }, [currentPath, selectedFolder]);

  const selectedRunSpuIndex = useMemo(
    () => runSpuOptions.findIndex((option) => option.path === selectedSpuPathInRun),
    [runSpuOptions, selectedSpuPathInRun]
  );

  const selectedRunSpuLabel = useMemo(() => {
    if (selectedRunSpuIndex >= 0) {
      return runSpuOptions[selectedRunSpuIndex]?.name ?? "Select SPU";
    }
    return "Select SPU";
  }, [runSpuOptions, selectedRunSpuIndex]);

  const handleSelectRunSpu = useCallback((spuPath: string) => {
    const normalizedPath = String(spuPath || "").trim();
    if (!normalizedPath) return;
    setSpuPickerOpen(false);
    setCurrentPath(normalizedPath);
  }, []);

  const canNavigatePrevSpu =
    selectedRunSpuIndex > 0 && runSpuOptions.length > 0;
  const canNavigateNextSpu =
    selectedRunSpuIndex >= 0 &&
    selectedRunSpuIndex < runSpuOptions.length - 1;

  const handleNavigateRunSpu = useCallback(
    (direction: -1 | 1) => {
      if (runSpuOptions.length === 0 || selectedRunSpuIndex < 0) return;
      const nextIndex = selectedRunSpuIndex + direction;
      if (nextIndex < 0 || nextIndex >= runSpuOptions.length) return;
      const target = runSpuOptions[nextIndex];
      if (!target?.path) return;
      setCurrentPath(target.path);
    },
    [runSpuOptions, selectedRunSpuIndex]
  );

  const handleExplorerRefresh = useCallback(() => {
    fetchFolders();
    if (currentPath) {
      refreshEntries(currentPath);
      fetchPendingAiEdits(currentPath);
    }
    if (selectedFolder) {
      fetchFolderTree(selectedFolder);
    }
  }, [
    fetchFolders,
    currentPath,
    refreshEntries,
    fetchPendingAiEdits,
    fetchFolderTree,
    selectedFolder,
  ]);

  const handleDeleteFolder = useCallback(async () => {
    if (!selectedFolder) return;
    if (selectedFolder.includes("/") || selectedFolder.includes("\\")) {
      setError(t("bulkProcessing.explorer.deleteFolderError"));
      return;
    }
    const confirmed = window.confirm(
      t("bulkProcessing.explorer.deleteFolderConfirm", {
        folder: selectedFolder,
      })
    );
    if (!confirmed) return;
    setDeleteFolderPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/drafts/folders/${encodeURIComponent(selectedFolder)}`,
        { method: "DELETE" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error || t("bulkProcessing.explorer.deleteFolderError")
        );
      }
      setSelectedFolder("");
      setCurrentPath("");
      setEntries([]);
      setSelectedFiles(new Set());
      setSelectedTreeFolders(new Set());
      setFolderTree(null);
      setPreviewPath(null);
      fetchFolders();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("bulkProcessing.explorer.deleteFolderError")
      );
    } finally {
      setDeleteFolderPending(false);
    }
  }, [selectedFolder, fetchFolders, t]);

  const handleSelectAllRunsForMerge = useCallback(() => {
    setSelectedRunsForMerge(new Set(folders.map((folder) => folder.path)));
  }, [folders]);

  const handleUnselectRunsForMerge = useCallback(() => {
    setSelectedRunsForMerge(new Set());
  }, []);

  const toggleRunForMerge = useCallback((run: string) => {
    setSelectedRunsForMerge((prev) => {
      const next = new Set(prev);
      if (next.has(run)) next.delete(run);
      else next.add(run);
      return next;
    });
  }, []);

  const handleDeleteRuns = useCallback(async () => {
    const runs = Array.from(selectedRunsForMerge);
    if (runs.length === 0 || deleteRunsPending) return;
    const confirmed = window.confirm(
      `Delete ${runs.length} selected batch folder${
        runs.length === 1 ? "" : "s"
      }? This will also delete linked SPU and SKU draft data.`
    );
    if (!confirmed) return;

    setDeleteRunsPending(true);
    setError(null);

    const failedRuns: string[] = [];
    const failureMessages: string[] = [];
    let deletedRuns = 0;

    for (const run of runs) {
      try {
        const response = await fetch(
          `/api/drafts/folders/${encodeURIComponent(run)}`,
          { method: "DELETE" }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload?.error || `Delete failed (HTTP ${response.status}).`
          );
        }
        deletedRuns += 1;
      } catch (err) {
        failedRuns.push(run);
        failureMessages.push(
          `${run}: ${err instanceof Error ? err.message : "Delete failed."}`
        );
      }
    }

    setSelectedRunsForMerge(new Set(failedRuns));
    if (failedRuns.length === 0) {
      setBatchPickerOpen(false);
    }

    await fetchFolders();
    if (draftTab === "spu") {
      await fetchSpuRows();
    } else {
      await fetchSkuRows();
    }

    if (failureMessages.length > 0) {
      setError(
        `Deleted ${deletedRuns}/${runs.length} batch folder${
          runs.length === 1 ? "" : "s"
        }. Errors: ${failureMessages.join(" | ")}`
      );
    }

    setDeleteRunsPending(false);
  }, [
    selectedRunsForMerge,
    deleteRunsPending,
    fetchFolders,
    draftTab,
    fetchSpuRows,
    fetchSkuRows,
  ]);

	  const openRunPreview = useCallback(async (run: string) => {
	    setRunPreviewRun(run);
	    setRunPreviewSelectedSpus(new Set());
	    setRunPreviewDeletedSpus(new Set());
	    setRunPreviewItems([]);
	    setRunPreviewOpen(true);
	    setRunPreviewLoading(true);
    try {
      const response = await fetch(
        `/api/drafts/folders/${encodeURIComponent(run)}/preview`
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load batch preview.");
      }
      const items = Array.isArray(payload?.items)
        ? (payload.items as DraftRunPreviewItem[])
        : [];
      setRunPreviewItems(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load batch preview.");
      setRunPreviewOpen(false);
    } finally {
      setRunPreviewLoading(false);
    }
  }, []);

	  const handleRunPreviewDelete = useCallback((spu: string) => {
	    setRunPreviewDeletedSpus((prev) => {
	      const next = new Set(prev);
	      next.add(spu);
	      return next;
	    });
	    setRunPreviewSelectedSpus((prev) => {
	      if (!prev.has(spu)) return prev;
	      const next = new Set(prev);
	      next.delete(spu);
	      return next;
	    });
	  }, []);

	  const visibleRunPreviewItems = useMemo(
	    () => runPreviewItems.filter((item) => !runPreviewDeletedSpus.has(item.draft_spu)),
	    [runPreviewItems, runPreviewDeletedSpus]
	  );

	  const allRunPreviewSelected = useMemo(
	    () =>
	      visibleRunPreviewItems.length > 0 &&
	      visibleRunPreviewItems.every((item) => runPreviewSelectedSpus.has(item.draft_spu)),
	    [visibleRunPreviewItems, runPreviewSelectedSpus]
	  );

	  const someRunPreviewSelected = useMemo(
	    () => visibleRunPreviewItems.some((item) => runPreviewSelectedSpus.has(item.draft_spu)),
	    [visibleRunPreviewItems, runPreviewSelectedSpus]
	  );

	  const toggleSelectAllRunPreview = useCallback(() => {
	    if (allRunPreviewSelected) {
	      setRunPreviewSelectedSpus(new Set());
	      return;
	    }
	    setRunPreviewSelectedSpus(new Set(visibleRunPreviewItems.map((item) => item.draft_spu)));
	  }, [allRunPreviewSelected, visibleRunPreviewItems]);

	  const toggleSelectRunPreviewSpu = useCallback((spu: string) => {
	    setRunPreviewSelectedSpus((prev) => {
	      const next = new Set(prev);
	      if (next.has(spu)) next.delete(spu);
	      else next.add(spu);
	      return next;
	    });
	  }, []);

	  const handleRunPreviewDeleteSelected = useCallback(() => {
	    if (runPreviewSelectedSpus.size === 0) return;
	    setRunPreviewDeletedSpus((prev) => {
	      const next = new Set(prev);
	      runPreviewSelectedSpus.forEach((spu) => next.add(spu));
	      return next;
	    });
	    setRunPreviewSelectedSpus(new Set());
	  }, [runPreviewSelectedSpus]);

  const handleRunPreviewSave = useCallback(async () => {
    if (!runPreviewRun || runPreviewDeletedSpus.size === 0) {
      setRunPreviewOpen(false);
      return;
    }
    const confirmed = window.confirm(
      `Delete ${runPreviewDeletedSpus.size} item(s) from ${runPreviewRun}?`
    );
    if (!confirmed) return;
    setRunPreviewSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/drafts/folders/${encodeURIComponent(runPreviewRun)}/cleanup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spus: Array.from(runPreviewDeletedSpus) }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Cleanup failed.");
      }
      setRunPreviewOpen(false);
      if (draftTab === "spu") fetchSpuRows();
      if (draftTab === "sku") fetchSkuRows();
      if (selectedFolder === runPreviewRun) {
        handleExplorerRefresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed.");
    } finally {
      setRunPreviewSaving(false);
    }
  }, [
    runPreviewRun,
    runPreviewDeletedSpus,
    draftTab,
    fetchSpuRows,
    fetchSkuRows,
    selectedFolder,
    handleExplorerRefresh,
  ]);

  const handleMergeRuns = useCallback(async () => {
    const runs = Array.from(selectedRunsForMerge);
    if (runs.length < 2 || mergeRunsPending) return;
    const confirmed = window.confirm(
      `Merge ${runs.length} batches into one? This will copy folders and update draft pointers.`
    );
    if (!confirmed) return;
    setMergeRunsPending(true);
    setError(null);
    try {
      const response = await fetch("/api/drafts/folders/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runs }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const collisions = Array.isArray(payload?.collisions)
          ? ` Collisions: ${payload.collisions.join(", ")}`
          : "";
        throw new Error((payload?.error || "Merge failed.") + collisions);
      }
      const mergedRun = String(payload?.merged_run || "");
      if (!mergedRun) throw new Error("Merge completed but missing merged folder.");
      setSelectedRunsForMerge(new Set());
      setBatchPickerOpen(false);
      await fetchFolders();
      await handleSelectFolder(mergedRun);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge failed.");
    } finally {
      setMergeRunsPending(false);
    }
  }, [selectedRunsForMerge, mergeRunsPending, fetchFolders, handleSelectFolder]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  useEffect(() => {
    if (!selectedFolder) return;
    const pendingPath = pendingFolderOpenPathRef.current;
    const nextPath =
      pendingPath &&
      (pendingPath === selectedFolder ||
        pendingPath.startsWith(`${selectedFolder}/`))
        ? pendingPath
        : selectedFolder;
    pendingFolderOpenPathRef.current = null;
    setCurrentPath(nextPath);
    setSelectedTreeFolders(new Set());
    setCollapsedTreeFolders(new Set());
    setContextMenu(null);
    fetchFolderTree(selectedFolder);
  }, [selectedFolder, fetchFolderTree]);

  useEffect(() => {
    currentPathRef.current = String(currentPath || "");
  }, [currentPath]);

  useEffect(() => {
    if (!currentPath) {
      setPendingAiEditsByOriginal({});
      return;
    }
    fetchEntries(currentPath);
    fetchPendingAiEdits(currentPath);
    setImageDimensions({});
    setAiReviewOriginalPath(null);
  }, [currentPath, fetchEntries, fetchPendingAiEdits]);

  useEffect(() => {
    if (!currentPath) return;
    const segments = currentPath.split("/").filter(Boolean);
    const ancestors: string[] = [];
    let accumulated = "";
    segments.forEach((segment) => {
      accumulated = accumulated ? `${accumulated}/${segment}` : segment;
      ancestors.push(accumulated);
    });
    setCollapsedTreeFolders((prev) => {
      const next = new Set(prev);
      ancestors.forEach((folderPath) => {
        next.delete(folderPath);
      });
      return next;
    });
  }, [currentPath]);

  useLayoutEffect(() => {
    if (!contextMenu) return;
    const menu = contextMenuRef.current;
    if (!menu) return;

    const clampToViewport = () => {
      const padding = 8;
      const rect = menu.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - padding;
      const maxY = window.innerHeight - rect.height - padding;
      const nextX = Math.min(Math.max(padding, contextMenu.x), Math.max(padding, maxX));
      const nextY = Math.min(Math.max(padding, contextMenu.y), Math.max(padding, maxY));

      if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
        setContextMenu((prev) => (prev ? { ...prev, x: nextX, y: nextY } : prev));
        return;
      }

      const submenuWidthEstimate = 180;
      const gap = 8;
      const finalRect = menu.getBoundingClientRect();
      const needed = submenuWidthEstimate + gap;
      const availableRight = window.innerWidth - padding - finalRect.right;
      const availableLeft = finalRect.left - padding;
      const nextSide: "right" | "left" =
        availableRight >= needed
          ? "right"
          : availableLeft >= needed
            ? "left"
            : availableRight >= availableLeft
              ? "right"
              : "left";
      setContextMenuSubmenuSide(nextSide);
    };

    clampToViewport();
    const handleResize = () => {
      window.requestAnimationFrame(() => clampToViewport());
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => {
      setContextMenu(null);
      setContextMenuSubmenu(null);
      setContextMenuNestedSubmenu(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        setContextMenuSubmenu(null);
        setContextMenuNestedSubmenu(null);
      }
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    setContextMenuNestedSubmenu(null);
  }, [contextMenuSubmenu]);

  const handleToggleFile = useCallback(
    (
      pathValue: string,
      options?: { shiftKey?: boolean; imageRange?: boolean }
    ) => {
      const shiftRangeRequested = Boolean(options?.shiftKey && options?.imageRange);
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        if (shiftRangeRequested) {
          const anchorPath = selectionAnchorImagePathRef.current;
          const imagePaths = displayImageEntriesRef.current
            .filter(
              (entry) => entry.type === "file" && isImage(entry.name)
            )
            .map((entry) => entry.path);
          const anchorIndex = anchorPath ? imagePaths.indexOf(anchorPath) : -1;
          const targetIndex = imagePaths.indexOf(pathValue);
          if (anchorIndex >= 0 && targetIndex >= 0) {
            const [start, end] =
              anchorIndex <= targetIndex
                ? [anchorIndex, targetIndex]
                : [targetIndex, anchorIndex];
            for (let index = start; index <= end; index += 1) {
              next.add(imagePaths[index]);
            }
            selectionAnchorImagePathRef.current = pathValue;
            return next;
          }
        }

        if (next.has(pathValue)) {
          next.delete(pathValue);
        } else {
          next.add(pathValue);
        }
        selectionAnchorImagePathRef.current = pathValue;
        return next;
      });
    },
    [isImage]
  );

  const handleToggleAllNonImageFiles = useCallback(() => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      const nonImageFilePaths = entries
        .filter((entry) => entry.type === "file" && !isImage(entry.name))
        .map((entry) => entry.path);
      const allSelected =
        nonImageFilePaths.length > 0 && nonImageFilePaths.every((p) => next.has(p));
      nonImageFilePaths.forEach((p) => {
        if (allSelected) next.delete(p);
        else next.add(p);
      });
      return next;
    });
  }, [entries, isImage]);

  const clearSelectedFilesForImageActions = useCallback(() => {
    selectionAnchorImagePathRef.current = null;
    setSelectedFiles(new Set());
  }, []);

  const isTextFileEditable = useCallback((entry: DraftEntry) => {
    if (entry.type !== "file") return false;
    const name = entry.name.toLowerCase();
    return name.endsWith(".txt") || name.endsWith(".json");
  }, []);

  const formatSizeKb = useCallback((bytes: number) => {
    const kb = bytes / 1024;
    if (kb >= 100) {
      return `${Math.round(kb)} KB`;
    }
    return `${Math.round(kb * 10) / 10} KB`;
  }, []);

  const resolveSpuImageExplorerPath = useCallback((row: DraftSpuRow) => {
    const candidates: string[] = [];
    if (row.draft_image_folder) candidates.push(row.draft_image_folder);
    if (row.draft_main_image_url) candidates.push(row.draft_main_image_url);
    if (Array.isArray(row.draft_image_urls)) {
      row.draft_image_urls.forEach((value) => {
        if (value) candidates.push(String(value));
      });
    }
    for (const candidate of candidates) {
      const relative = tryExtractDraftRelativePath(candidate);
      if (!relative) continue;
      const parts = relative.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return parts.join("/");
      }
    }
    if (row.draft_spu) {
      const currentRun =
        selectedFolder ||
        folders.find((folder) => folder.path)?.path ||
        "";
      if (currentRun) {
        return `${currentRun}/${row.draft_spu}`;
      }
    }
    return null;
  }, [folders, selectedFolder]);

  const resolveSpuMainFolderPath = useCallback(
    (row: DraftSpuRow) => {
      const targetPath = resolveSpuImageExplorerPath(row);
      const targetParts = targetPath?.split("/").filter(Boolean) ?? [];
      if (targetParts.length >= 2) {
        return `${targetParts[0]}/${targetParts[1]}`;
      }

      const run = String(selectedFolder || "").trim();
      const spu = String(row.draft_spu || "").trim();
      if (run && spu) {
        return `${run}/${spu}`;
      }
      return null;
    },
    [resolveSpuImageExplorerPath, selectedFolder]
  );
  const completedSpuByCode = useMemo(() => {
    const next: Record<string, boolean> = {};
    spuRows.forEach((row) => {
      const spu = String(row.draft_spu || "").trim();
      if (!spu) return;
      const spuMainFolderPath = resolveSpuMainFolderPath(row);
      next[spu.toUpperCase()] = Boolean(
        spuMainFolderPath && completedSpuFolders.has(spuMainFolderPath)
      );
    });
    return next;
  }, [completedSpuFolders, resolveSpuMainFolderPath, spuRows]);
  const isSpuImagesMarkedCompleted = useCallback(
    (spuValue: string | null | undefined) => {
      const spu = String(spuValue || "").trim();
      if (!spu) return false;
      const normalizedSpu = spu.toUpperCase();
      if (Object.prototype.hasOwnProperty.call(completedSpuByCode, normalizedSpu)) {
        return Boolean(completedSpuByCode[normalizedSpu]);
      }
      const run = String(selectedFolder || "").trim();
      return Boolean(run && completedSpuFolders.has(`${run}/${spu}`));
    },
    [completedSpuByCode, completedSpuFolders, selectedFolder]
  );

  const openSpuImagesInExplorer = useCallback(
    (row: DraftSpuRow) => {
      const targetPath = resolveSpuImageExplorerPath(row);
      if (!targetPath) {
        setError(`Unable to resolve image folder for ${row.draft_spu}.`);
        return;
      }
      const parts = targetPath.split("/").filter(Boolean);
      if (parts.length === 0) {
        setError(`Unable to resolve image folder for ${row.draft_spu}.`);
        return;
      }
      const run = parts[0];
      pendingFolderOpenPathRef.current = targetPath;
      setSelectedFolder(run);
      setCurrentPath(targetPath);
    },
    [resolveSpuImageExplorerPath]
  );

  useEffect(() => {
    if (initialOpenSpuHandledRef.current) return;
    const requestedSpu = String(initialOpenSpu || "").trim().toUpperCase();
    if (!requestedSpu) return;
    if (draftLoading) return;

    const targetRow = spuRows.find(
      (row) => String(row.draft_spu || "").trim().toUpperCase() === requestedSpu
    );

    if (!targetRow) {
      initialOpenSpuHandledRef.current = true;
      setError(`SPU ${requestedSpu} was not found in Draft Explorer.`);
      return;
    }

    openSpuImagesInExplorer(targetRow);
    initialOpenSpuHandledRef.current = true;
  }, [draftLoading, initialOpenSpu, openSpuImagesInExplorer, spuRows]);

  const fetchVariantEditorThumbs = useCallback(
    async (spu: string) => {
      const targetSpu = String(spu || "").trim();
      if (!targetSpu) {
        setVariantsEditorThumbs([]);
        return;
      }
      const spuRow = spuRows.find((row) => row.draft_spu === targetSpu) ?? null;
      let rootPath = spuRow ? resolveSpuImageExplorerPath(spuRow) : null;
      if (!rootPath && selectedFolder) {
        rootPath = `${selectedFolder}/${targetSpu}`;
      }
      if (!rootPath) {
        setVariantsEditorThumbs([]);
        return;
      }
      setVariantsEditorThumbsLoading(true);
      try {
        const rootEntries = await listPathEntries(rootPath);
        const normalizeToken = (value: string) =>
          value.toLowerCase().replace(/[\s_-]+/g, "");
        const variantDirs = rootEntries
          .filter((entry) => entry.type === "dir")
          .map((entry) => {
            const normalized = normalizeToken(entry.name);
            if (!normalized.includes("variant")) {
              return { entry, score: -1 };
            }
            if (normalized.includes("reject") || normalized.includes("mismatch")) {
              return { entry, score: -1 };
            }
            if (normalized === "variantimages" || normalized === "variantimage") {
              return { entry, score: 4 };
            }
            if (normalized.includes("variant") && normalized.includes("image")) {
              return { entry, score: 3 };
            }
            return { entry, score: 1 };
          })
          .filter((row) => row.score > 0)
          .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            return left.entry.name.localeCompare(right.entry.name);
          });
        if (variantDirs.length === 0) {
          setVariantsEditorThumbs([]);
          return;
        }
        const primaryVariantDir = variantDirs[0].entry;
        const variantEntries = await listPathEntries(primaryVariantDir.path);
        const directVariantImages = variantEntries
          .filter((entry) => entry.type === "file" && isImage(entry.name))
          .sort((left, right) => left.name.localeCompare(right.name));
        setVariantsEditorThumbs(directVariantImages);
      } catch {
        setVariantsEditorThumbs([]);
      } finally {
        setVariantsEditorThumbsLoading(false);
      }
    },
    [
      isImage,
      listPathEntries,
      resolveSpuImageExplorerPath,
      selectedFolder,
      spuRows,
    ]
  );

  const mapDraftSkuToVariantEditorRow = useCallback(
    (row: DraftSkuRow): DraftVariantEditorRow => {
      const raw = parseDraftRawRow(row.draft_raw_row);
      const variationColor = toText(raw.variation_color_se).trim();
      const variationSize = toText(raw.variation_size_se).trim();
      const variationOther = toText(raw.variation_other_se).trim();
      const variationAmount = toText(raw.variation_amount_se).trim();
      const optionColorZh = toText(row.draft_option1).trim();
      const optionSizeZh = toText(row.draft_option2).trim();
      const optionOtherZh = toText(row.draft_option3).trim();
      const optionAmountZh = toText(row.draft_option4).trim();
      const combined =
        buildVariantCombinedZhValue({
          draft_option1: optionColorZh,
          draft_option2: optionSizeZh,
          draft_option3: optionOtherZh,
          draft_option4: optionAmountZh,
          fallback: toText(row.draft_option_combined_zh).trim(),
        });
      return {
        key: createVariantEditorKey(),
        id: String(row.id || "").trim() || null,
        draft_spu: row.draft_spu ?? "",
        draft_sku: row.draft_sku ?? "",
        draft_option1: optionColorZh,
        draft_option2: optionSizeZh,
        draft_option3: optionOtherZh,
        draft_option4: optionAmountZh,
        draft_option_combined_zh: combined,
        draft_price: row.draft_price == null ? "" : String(row.draft_price),
        draft_weight: row.draft_weight == null ? "" : String(row.draft_weight),
        draft_weight_unit: row.draft_weight_unit ?? "",
        draft_variant_image_url: row.draft_variant_image_url ?? "",
        variation_color_se: variationColor,
        variation_size_se: variationSize,
        variation_other_se: variationOther,
        variation_amount_se: variationAmount,
        draft_raw_row: raw,
      };
    },
    []
  );

  const buildVariantRowsPayload = useCallback((rows: DraftVariantEditorRow[]) => {
    const parseOptionalNumber = (value: string) => {
      const text = String(value || "").trim();
      if (!text) return null;
      const normalized = text.replace(/\s+/g, "").replace(",", ".");
      const numeric = Number(normalized);
      return Number.isFinite(numeric) ? numeric : null;
    };
    return rows.map((row) => {
      const raw = {
        ...(row.draft_raw_row ?? {}),
        draft_option1: row.draft_option1.trim(),
        draft_option2: row.draft_option2.trim(),
        draft_option3: row.draft_option3.trim(),
        draft_option4: row.draft_option4.trim(),
        variation_color_se: row.variation_color_se.trim(),
        variation_size_se: row.variation_size_se.trim(),
        variation_other_se: row.variation_other_se.trim(),
        variation_amount_se: row.variation_amount_se.trim(),
      };
      const combined =
        buildVariantCombinedZhValue({
          draft_option1: row.draft_option1,
          draft_option2: row.draft_option2,
          draft_option3: row.draft_option3,
          draft_option4: row.draft_option4,
          fallback: row.draft_option_combined_zh,
        });
      return {
        id: row.id,
        draft_sku: row.draft_sku.trim() || null,
        draft_option1: row.draft_option1.trim() || null,
        draft_option2: row.draft_option2.trim() || null,
        draft_option3: row.draft_option3.trim() || null,
        draft_option4: row.draft_option4.trim() || null,
        draft_option_combined_zh: combined || null,
        draft_price: parseOptionalNumber(row.draft_price),
        draft_weight: parseOptionalNumber(row.draft_weight),
        draft_weight_unit: row.draft_weight_unit.trim() || null,
        draft_variant_image_url: row.draft_variant_image_url.trim() || null,
        variation_color_se: row.variation_color_se.trim(),
        variation_size_se: row.variation_size_se.trim(),
        variation_other_se: row.variation_other_se.trim(),
        variation_amount_se: row.variation_amount_se.trim(),
        draft_raw_row: raw,
      };
    });
  }, []);

  const closeVariantsEditor = useCallback((force = false) => {
    if (!force && (variantsEditorSaving || variantsEditorAiRunning)) return;
    setVariantsEditorOpen(false);
    setVariantsEditorSpu("");
    setVariantsEditorRows([]);
    setVariantsEditorThumbs([]);
    setVariantsEditorError(null);
    setVariantsEditorSelectedRows(new Set());
    setVariantsEditorPacksText("");
    setVariantsEditorAiPrompt("");
    setVariantsEditorSort({ key: null, direction: "asc" });
  }, [variantsEditorAiRunning, variantsEditorSaving]);

  const openVariantsEditor = useCallback(
    async (spu: string | null | undefined) => {
      const targetSpu = String(spu || "").trim();
      if (!targetSpu) return;
      setVariantsEditorOpen(true);
      setVariantsEditorSpu(targetSpu);
      setVariantsEditorRows([]);
      setVariantsEditorThumbs([]);
      setVariantsEditorSelectedRows(new Set());
      setVariantsEditorSort({ key: null, direction: "asc" });
      setVariantsEditorError(null);
      setVariantsEditorLoading(true);
      void fetchVariantEditorThumbs(targetSpu);
      try {
        const url = new URL("/api/drafts/variants", window.location.origin);
        url.searchParams.set("spu", targetSpu);
        const response = await fetch(url.toString());
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load variants.");
        }
        const rows = Array.isArray(payload?.items)
          ? (payload.items as DraftSkuRow[]).map(mapDraftSkuToVariantEditorRow)
          : [];
        setVariantsEditorRows(rows);
      } catch (err) {
        setVariantsEditorError((err as Error).message);
      } finally {
        setVariantsEditorLoading(false);
      }
    },
    [fetchVariantEditorThumbs, mapDraftSkuToVariantEditorRow]
  );

  const handleVariantEditorCellChange = useCallback(
    (rowKey: string, field: keyof DraftVariantEditorRow, value: string) => {
      setVariantsEditorRows((prev) =>
        prev.map((row) => {
          if (row.key !== rowKey) return row;
          const nextRow = { ...row, [field]: value } as DraftVariantEditorRow;
          return nextRow;
        })
      );
    },
    []
  );

  const handleVariantEditorToggleRow = useCallback((rowKey: string) => {
    setVariantsEditorSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  }, []);

  const handleVariantEditorToggleAll = useCallback(() => {
    setVariantsEditorSelectedRows((prev) => {
      if (variantsEditorRows.length > 0 && prev.size === variantsEditorRows.length) {
        return new Set();
      }
      return new Set(variantsEditorRows.map((row) => row.key));
    });
  }, [variantsEditorRows]);

  const handleVariantEditorSort = useCallback((key: VariantEditorSortKey) => {
    setVariantsEditorSort((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return {
        key,
        direction: "asc",
      };
    });
  }, []);

  const variantsEditorSortedRows = useMemo(() => {
    const sortKey = variantsEditorSort.key;
    if (!sortKey) {
      return variantsEditorRows;
    }
    const getValue = (row: DraftVariantEditorRow, key: VariantEditorSortKey) => {
      if (key === "sku") return row.draft_sku;
      if (key === "color") return row.variation_color_se || row.draft_option1;
      if (key === "size") return row.variation_size_se || row.draft_option2;
      if (key === "order") return row.variation_other_se || row.draft_option3;
      return row.variation_amount_se || row.draft_option4;
    };
    const parseNumericAmount = (value: string) => {
      const normalized = String(value || "")
        .trim()
        .replace(",", ".")
        .match(/-?\d+(?:\.\d+)?/);
      if (!normalized) return null;
      const numeric = Number(normalized[0]);
      return Number.isFinite(numeric) ? numeric : null;
    };
    const directionFactor = variantsEditorSort.direction === "asc" ? 1 : -1;
    return [...variantsEditorRows].sort((left, right) => {
      const leftValue = String(getValue(left, sortKey) || "").trim();
      const rightValue = String(getValue(right, sortKey) || "").trim();
      if (sortKey === "amount") {
        const leftNumeric = parseNumericAmount(leftValue);
        const rightNumeric = parseNumericAmount(rightValue);
        if (leftNumeric != null && rightNumeric != null && leftNumeric !== rightNumeric) {
          return (leftNumeric - rightNumeric) * directionFactor;
        }
      }
      return (
        leftValue.localeCompare(rightValue, undefined, {
          numeric: true,
          sensitivity: "base",
        }) * directionFactor
      );
    });
  }, [variantsEditorRows, variantsEditorSort]);

  const variantsEditorColumnStyles = useMemo(() => {
    const sample = variantsEditorRows.slice(0, 420);
    const makeStyle = (
      headerText: string,
      values: unknown[],
      options: { minPx: number; maxPx: number; headerAsMax?: boolean }
    ) => {
      const width = computeAdaptiveColumnWidthPx(headerText, values, options);
      return {
        width: `${width}px`,
        minWidth: `${options.minPx}px`,
        maxWidth: `${options.maxPx}px`,
      };
    };

    return {
      selection: {
        width: "44px",
        minWidth: "44px",
        maxWidth: "44px",
      },
      sku: makeStyle(
        "SKU",
        sample.map((row) => row.draft_sku),
        { minPx: 170, maxPx: 360 }
      ),
      colorSe: makeStyle(
        "Color (SE)",
        sample.map((row) => row.variation_color_se || row.draft_option1),
        { minPx: 110, maxPx: 260 }
      ),
      sizeSe: makeStyle(
        "Size (SE)",
        sample.map((row) => row.variation_size_se || row.draft_option2),
        { minPx: 96, maxPx: 210 }
      ),
      otherSe: makeStyle(
        "Other (SE)",
        sample.map((row) => row.variation_other_se || row.draft_option3),
        { minPx: 126, maxPx: 340 }
      ),
      amountSe: makeStyle(
        "Amount (SE)",
        sample.map((row) => row.variation_amount_se || row.draft_option4),
        { minPx: 112, maxPx: 260 }
      ),
      optionCombinedZh: makeStyle(
        "Option Combined (ZH)",
        sample.map((row) => row.draft_option_combined_zh),
        { minPx: 210, maxPx: 540 }
      ),
      colorZh: makeStyle(
        "Color (ZH)",
        sample.map((row) => row.draft_option1),
        { minPx: 110, maxPx: 260 }
      ),
      sizeZh: makeStyle(
        "Size (ZH)",
        sample.map((row) => row.draft_option2),
        { minPx: 96, maxPx: 210 }
      ),
      otherZh: makeStyle(
        "Other (ZH)",
        sample.map((row) => row.draft_option3),
        { minPx: 126, maxPx: 340 }
      ),
      amountZh: makeStyle(
        "Amount (ZH)",
        sample.map((row) => row.draft_option4),
        { minPx: 112, maxPx: 260 }
      ),
      price: makeStyle(
        "Price",
        sample.map((row) => row.draft_price),
        { minPx: 90, maxPx: 150, headerAsMax: true }
      ),
      weight: makeStyle(
        "Weight",
        sample.map((row) => row.draft_weight),
        { minPx: 100, maxPx: 170, headerAsMax: true }
      ),
    };
  }, [variantsEditorRows]);

  const handleVariantEditorAddRow = useCallback(() => {
    const fallbackSkuBase = variantsEditorSpu || "SKU";
    setVariantsEditorRows((prev) => {
      const template = prev[prev.length - 1];
      return [
        ...prev,
        {
          key: createVariantEditorKey(),
          id: null,
          draft_spu: variantsEditorSpu,
          draft_sku: template?.draft_sku
            ? `${template.draft_sku}-copy`
            : `${fallbackSkuBase}-copy`,
          draft_option1: template?.draft_option1 ?? "",
          draft_option2: template?.draft_option2 ?? "",
          draft_option3: template?.draft_option3 ?? "",
          draft_option4: template?.draft_option4 ?? "",
          draft_option_combined_zh: "",
          draft_price: template?.draft_price ?? "",
          draft_weight: template?.draft_weight ?? "",
          draft_weight_unit: template?.draft_weight_unit ?? "",
          draft_variant_image_url: "",
          variation_color_se: template?.variation_color_se ?? "",
          variation_size_se: template?.variation_size_se ?? "",
          variation_other_se: template?.variation_other_se ?? "",
          variation_amount_se: template?.variation_amount_se ?? "",
          draft_raw_row: { ...(template?.draft_raw_row ?? {}) },
        },
      ];
    });
  }, [variantsEditorSpu]);

  const handleVariantEditorDeleteSelected = useCallback(() => {
    if (variantsEditorSelectedRows.size === 0) return;
    setVariantsEditorRows((prev) =>
      prev.filter((row) => !variantsEditorSelectedRows.has(row.key))
    );
    setVariantsEditorSelectedRows(new Set());
  }, [variantsEditorSelectedRows]);

  const handleVariantEditorAddPacks = useCallback(() => {
    const tokens = variantsEditorPacksText.match(/\d+/g) ?? [];
    const seenPacks = new Set<number>();
    const packValues: number[] = [];
    tokens.forEach((token) => {
      const numeric = Number(token);
      if (!Number.isFinite(numeric) || numeric <= 0 || seenPacks.has(numeric)) return;
      seenPacks.add(numeric);
      packValues.push(numeric);
    });
    if (packValues.length === 0) {
      setVariantsEditorError("Enter pack numbers, for example: 1, 2, 4, 10.");
      return;
    }
    setVariantsEditorError(null);
    setVariantsEditorRows((prev) => {
      const originalRows: DraftVariantEditorRow[] = prev.map((row): DraftVariantEditorRow => {
        const skuBaseRaw = stripSkuPackSuffix(row.draft_sku);
        const skuBase = skuBaseRaw || String(variantsEditorSpu || "SKU").trim();
        const onePackLabel = "1";
        return {
          ...row,
          draft_sku: `${skuBase}-1P`,
          draft_option4: onePackLabel,
          variation_amount_se: onePackLabel,
          draft_option_combined_zh: buildVariantCombinedZhValue({
            draft_option1: row.draft_option1,
            draft_option2: row.draft_option2,
            draft_option3: row.draft_option3,
            draft_option4: onePackLabel,
            fallback: row.draft_option_combined_zh,
          }),
          draft_raw_row: {
            ...(row.draft_raw_row ?? {}),
            draft_option4: onePackLabel,
            variation_amount_se: onePackLabel,
          } as Record<string, unknown>,
        };
      });
      const packsToClone = packValues.slice(1).filter((packValue) => packValue > 1);
      if (packsToClone.length === 0) {
        return originalRows;
      }
      const next: DraftVariantEditorRow[] = [...originalRows];
      const usedSkus = new Set(
        originalRows.map((row) => row.draft_sku.trim().toLowerCase()).filter(Boolean)
      );
      const createUniqueSku = (baseSku: string) => {
        const base = baseSku.trim() || `${variantsEditorSpu || "sku"}-copy`;
        let candidate = base;
        let index = 2;
        while (usedSkus.has(candidate.toLowerCase())) {
          candidate = `${base}-${index}`;
          index += 1;
        }
        usedSkus.add(candidate.toLowerCase());
        return candidate;
      };
      originalRows.forEach((row) => {
        const skuBaseRaw = stripSkuPackSuffix(row.draft_sku);
        const skuBase = skuBaseRaw || String(variantsEditorSpu || "SKU").trim();
        packsToClone.forEach((packValue) => {
          const label = String(packValue);
          const nextSku = createUniqueSku(`${skuBase}-${packValue}P`);
          const cloned: DraftVariantEditorRow = {
            ...row,
            key: createVariantEditorKey(),
            id: null,
            draft_sku: nextSku,
            draft_option4: label,
            variation_amount_se: label,
            draft_option_combined_zh: buildVariantCombinedZhValue({
              draft_option1: row.draft_option1,
              draft_option2: row.draft_option2,
              draft_option3: row.draft_option3,
              draft_option4: label,
              fallback: row.draft_option_combined_zh,
            }),
            draft_raw_row: {
              ...(row.draft_raw_row ?? {}),
              draft_option4: label,
              variation_amount_se: label,
            } as Record<string, unknown>,
          };
          next.push(cloned);
        });
      });
      return next;
    });
  }, [variantsEditorPacksText, variantsEditorSpu]);

  const handleVariantEditorRunAi = useCallback(async () => {
    if (variantsEditorAiRunning || variantsEditorSaving) return;
    const prompt = variantsEditorAiPrompt.trim();
    if (!variantsEditorSpu) return;
    if (!prompt) {
      setVariantsEditorError("Add instructions before running AI.");
      return;
    }
    setVariantsEditorAiRunning(true);
    setVariantsEditorError(null);
    try {
      const response = await fetch("/api/drafts/variants/ai-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spu: variantsEditorSpu,
          instruction: prompt,
          variants: buildVariantRowsPayload(variantsEditorRows),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "AI update failed.");
      }
      const nextRows = Array.isArray(payload?.variants)
        ? (payload.variants as Array<Record<string, unknown>>).map((row) =>
            mapDraftSkuToVariantEditorRow({
              id: String(row.id ?? ""),
              draft_sku: String(row.draft_sku ?? ""),
              draft_spu: String(row.draft_spu ?? variantsEditorSpu),
              draft_option1:
                row.draft_option1 == null ? null : String(row.draft_option1),
              draft_option2:
                row.draft_option2 == null ? null : String(row.draft_option2),
              draft_option3:
                row.draft_option3 == null ? null : String(row.draft_option3),
              draft_option4:
                row.draft_option4 == null ? null : String(row.draft_option4),
              draft_option_combined_zh: String(row.draft_option_combined_zh ?? ""),
              draft_price:
                row.draft_price == null ? null : (row.draft_price as number | string),
              draft_weight:
                row.draft_weight == null ? null : (row.draft_weight as number | string),
              draft_weight_unit: row.draft_weight_unit == null ? null : String(row.draft_weight_unit),
              draft_variant_image_url:
                row.draft_variant_image_url == null
                  ? null
                  : String(row.draft_variant_image_url),
              draft_status: "draft",
              draft_updated_at: null,
              draft_raw_row:
                row.draft_raw_row && typeof row.draft_raw_row === "object"
                  ? (row.draft_raw_row as Record<string, unknown>)
                  : ({
                      variation_color_se: row.variation_color_se,
                      variation_size_se: row.variation_size_se,
                      variation_other_se: row.variation_other_se,
                      variation_amount_se: row.variation_amount_se,
                    } as Record<string, unknown>),
            })
          )
        : [];
      setVariantsEditorRows(nextRows);
      setVariantsEditorSelectedRows(new Set());
    } catch (err) {
      setVariantsEditorError((err as Error).message);
    } finally {
      setVariantsEditorAiRunning(false);
    }
  }, [
    buildVariantRowsPayload,
    mapDraftSkuToVariantEditorRow,
    variantsEditorAiPrompt,
    variantsEditorAiRunning,
    variantsEditorRows,
    variantsEditorSaving,
    variantsEditorSpu,
  ]);

  const handleVariantEditorSave = useCallback(async () => {
    if (!variantsEditorSpu || variantsEditorSaving || variantsEditorAiRunning) return;
    setVariantsEditorSaving(true);
    setVariantsEditorError(null);
    try {
      const response = await fetch("/api/drafts/variants/replace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spu: variantsEditorSpu,
          variants: buildVariantRowsPayload(variantsEditorRows),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to save variants.");
      }
      await fetchSpuRows();
      await fetchSkuRows();
      closeVariantsEditor(true);
    } catch (err) {
      setVariantsEditorError((err as Error).message);
    } finally {
      setVariantsEditorSaving(false);
    }
  }, [
    buildVariantRowsPayload,
    closeVariantsEditor,
    fetchSkuRows,
    fetchSpuRows,
    variantsEditorAiRunning,
    variantsEditorRows,
    variantsEditorSaving,
    variantsEditorSpu,
  ]);

  const handleOpenFileViewer = useCallback(async (entry: DraftEntry) => {
    if (!isTextFileEditable(entry)) return;
    setFileViewerPath(entry.path);
    setFileViewerContent("");
    setFileViewerError(null);
    setFileViewerLoading(true);
    try {
      const response = await fetch(
        `/api/drafts/files/content?path=${encodeURIComponent(entry.path)}`
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to open file.");
      }
      setFileViewerContent(String(payload?.content ?? ""));
    } catch (err) {
      setFileViewerError((err as Error).message);
    } finally {
      setFileViewerLoading(false);
    }
  }, [isTextFileEditable]);

  const handleSaveFileViewer = useCallback(async () => {
    if (!fileViewerPath || fileViewerSaving) return;
    setFileViewerSaving(true);
    setFileViewerError(null);
    try {
      const response = await fetch("/api/drafts/files/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: fileViewerPath,
          content: fileViewerContent,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to save file.");
      }
      if (currentPath) {
        refreshEntries(currentPath);
      }
      if (selectedFolder) {
        fetchFolderTree(selectedFolder);
      }
    } catch (err) {
      setFileViewerError((err as Error).message);
    } finally {
      setFileViewerSaving(false);
    }
  }, [
    currentPath,
    fetchFolderTree,
    fileViewerContent,
    fileViewerPath,
    fileViewerSaving,
    refreshEntries,
    selectedFolder,
  ]);

  const trySendPhotopeaFile = useCallback(() => {
    const targetWindow = photopeaIframeRef.current?.contentWindow;
    if (!targetWindow) return;
    if (!photopeaReadyRef.current) return;
    if (photopeaFileSentRef.current) return;
    const buffer = photopeaFileBufferRef.current;
    if (!buffer) return;
    photopeaFileSentRef.current = true;
    photopeaFileBufferRef.current = null;
    targetWindow.postMessage(buffer, "https://www.photopea.com", [buffer]);
  }, []);

  const closePhotopea = useCallback(() => {
    setPhotopeaOpen(false);
    setPhotopeaEntry(null);
    setPhotopeaReady(false);
    setPhotopeaLoading(false);
    setPhotopeaExporting(false);
    setPhotopeaPersisting(false);
    photopeaPersistingRef.current = false;
    setPhotopeaError(null);
    photopeaReadyRef.current = false;
    photopeaFileSentRef.current = false;
    photopeaFileBufferRef.current = null;
    photopeaExportBufferRef.current = null;
  }, []);

  const openPhotopeaEditor = useCallback(
    async (entry: DraftEntry) => {
      if (entry.type !== "file" || !isImage(entry.name)) return;
      setPhotopeaOpen(true);
      setPhotopeaEntry(entry);
      setPhotopeaReady(false);
      setPhotopeaError(null);
      setPhotopeaLoading(true);
      setPhotopeaExporting(false);
      setPhotopeaPersisting(false);
      photopeaPersistingRef.current = false;
      setPhotopeaSessionKey((prev) => prev + 1);
      photopeaReadyRef.current = false;
      photopeaFileSentRef.current = false;
      photopeaExportBufferRef.current = null;
      photopeaFileBufferRef.current = null;
      try {
        const response = await fetch(buildDraftDownloadUrl(entry.path, entry.modifiedAt));
        if (!response.ok) {
          const message = await response.text().catch(() => "");
          throw new Error(message || "Unable to load image.");
        }
        const buffer = await response.arrayBuffer();
        photopeaFileBufferRef.current = buffer;
        trySendPhotopeaFile();
      } catch (err) {
        setPhotopeaError((err as Error).message);
      } finally {
        setPhotopeaLoading(false);
      }
    },
    [buildDraftDownloadUrl, isImage, trySendPhotopeaFile]
  );

  const requestPhotopeaExport = useCallback(() => {
    const win = photopeaIframeRef.current?.contentWindow;
    if (!win) return;
    setPhotopeaError(null);
    setPhotopeaExporting(true);
    photopeaExportBufferRef.current = null;
    win.postMessage("app.activeDocument.saveToOE('jpg:0.92');", "https://www.photopea.com");
  }, []);

  const savePhotopeaResult = useCallback(async () => {
    const buffer = photopeaExportBufferRef.current;
    const activeEntry = photopeaEntry;
    if (!buffer || !activeEntry || photopeaPersistingRef.current) return;
    photopeaExportBufferRef.current = null;
    setPhotopeaExporting(false);
    setPhotopeaPersisting(true);
    photopeaPersistingRef.current = true;
    setPhotopeaError(null);

    const oldPath = activeEntry.path;
    setReloadingImagePaths((prev) => new Set(prev).add(oldPath));
    try {
      const formData = new FormData();
      formData.append("path", oldPath);
      formData.append(
        "file",
        new Blob([buffer], { type: "image/jpeg" }),
        "photopea.jpg"
      );
      const response = await fetch("/api/drafts/images/replace", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Save failed.");
      }

      const newPath = String(payload?.path || oldPath);
      const newName = String(payload?.name || activeEntry.name);
      const newModifiedAt = String(payload?.modifiedAt || new Date().toISOString());
      const newSize = Number(payload?.size ?? activeEntry.size ?? 0);
      const newPixelQualityScore =
        typeof payload?.pixelQualityScore === "number" &&
        Number.isFinite(payload.pixelQualityScore)
          ? Math.round(payload.pixelQualityScore)
          : null;
      const newZimageUpscaled =
        typeof payload?.zimageUpscaled === "boolean"
          ? payload.zimageUpscaled
          : false;

      setEntries((prev) => {
        let hadNew = false;
        let hadOld = false;
        const next = prev
          .map((item) => {
            if (item.path === newPath) {
              hadNew = true;
              return {
                ...item,
                name: newName,
                path: newPath,
                modifiedAt: newModifiedAt,
                size: newSize,
                pixelQualityScore: newPixelQualityScore,
                zimageUpscaled: newZimageUpscaled,
              };
            }
            if (item.path === oldPath) {
              hadOld = true;
              // If we changed extension, drop the old entry and keep/patch the newPath entry above.
              return null;
            }
            return item;
          })
          .filter(Boolean) as DraftEntry[];

        if (!hadNew) {
          if (hadOld) {
            next.push({
              ...activeEntry,
              name: newName,
              path: newPath,
              modifiedAt: newModifiedAt,
              size: newSize,
              pixelQualityScore: newPixelQualityScore,
              zimageUpscaled: newZimageUpscaled,
            });
          }
        }
        return next;
      });
      setSelectedFiles((prev) => {
        if (!prev.has(oldPath)) return prev;
        const next = new Set(prev);
        next.delete(oldPath);
        next.add(newPath);
        return next;
      });
      setPreviewPath((prev) => (prev === oldPath ? newPath : prev));
      setImageDimensions((prev) => {
        const next: Record<string, { width: number; height: number }> = { ...prev };
        if (oldPath !== newPath) {
          delete next[oldPath];
        }
        return next;
      });
      setReloadingImagePaths((prev) => {
        const next = new Set(prev);
        if (oldPath !== newPath) {
          next.delete(oldPath);
        }
        next.add(newPath);
        return next;
      });
      setPhotopeaEntry((prev) =>
        prev
          ? {
              ...prev,
              path: newPath,
              name: newName,
              modifiedAt: newModifiedAt,
              size: newSize,
              pixelQualityScore: newPixelQualityScore,
              zimageUpscaled: newZimageUpscaled,
            }
          : prev
      );
      if (selectedFolder) {
        fetchFolderTree(selectedFolder);
      }
    } catch (err) {
      setPhotopeaError((err as Error).message);
    } finally {
      setPhotopeaPersisting(false);
      photopeaPersistingRef.current = false;
    }
  }, [fetchFolderTree, photopeaEntry, selectedFolder]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== "https://www.photopea.com") return;
      const data = event.data as unknown;
      if (typeof data === "string") {
        if (data === "__hub_photopea_ready__") {
          photopeaReadyRef.current = true;
          setPhotopeaReady(true);
          trySendPhotopeaFile();
          return;
        }
        if (data === "done") {
          // Photopea sends "done" after each script finishes. If we just received an
          // exported buffer (via saveToOE), finalize by writing it to the draft path.
          return;
        }
        return;
      }
      if (data instanceof ArrayBuffer) {
        photopeaExportBufferRef.current = data;
        void savePhotopeaResult();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [savePhotopeaResult, trySendPhotopeaFile]);

  const handleToggleTreeFolder = (pathValue: string) => {
    setSelectedTreeFolders((prev) => {
      const next = new Set(prev);
      if (next.has(pathValue)) {
        next.delete(pathValue);
      } else {
        next.add(pathValue);
      }
      return next;
    });
  };

  const toggleTreeFolder = (pathValue: string) => {
    setCollapsedTreeFolders((prev) => {
      const next = new Set(prev);
      if (next.has(pathValue)) {
        next.delete(pathValue);
      } else {
        next.add(pathValue);
      }
      return next;
    });
  };

  const handleMoveEntriesToFolder = async (sourcePaths: string[], targetPath: string) => {
    if (!targetPath || movingEntry) {
      return;
    }
    const uniqueSources = Array.from(
      new Set(
        sourcePaths
          .map((value) => String(value || "").trim())
          .filter((value) => Boolean(value))
      )
    );
    if (uniqueSources.length === 0) {
      return;
    }

    const validSources = uniqueSources.filter(
      (sourcePath) =>
        sourcePath !== targetPath && !targetPath.startsWith(`${sourcePath}/`)
    );
    const visibleImageSourcePaths = new Set(
      displayImageEntriesRef.current.map((entry) => entry.path)
    );
    const existingSources = validSources.filter(
      (sourcePath) =>
        entryByPath.has(sourcePath) || visibleImageSourcePaths.has(sourcePath)
    );
    if (existingSources.length === 0) {
      setFolderDropTargetPath(null);
      setDraggingEntryPaths([]);
      return;
    }

    const locked = existingSources.filter(
      (sourcePath) =>
        Boolean(pendingAiEditsByOriginal[sourcePath]) ||
        Boolean(aiEditJobsByPath[sourcePath])
    );
    if (locked.length > 0) {
      setError("Resolve pending/running AI edits before moving those files.");
      return;
    }

    setMovingEntry(true);
    setError(null);
    const failures: string[] = [];
    const moved = new Set<string>();
    try {
      for (const sourcePath of existingSources) {
        try {
          const response = await fetch("/api/drafts/move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourcePath, targetPath }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.error || "Move failed.");
          }
          moved.add(sourcePath);
        } catch (err) {
          failures.push(`${sourcePath}: ${(err as Error).message}`);
        }
      }

      if (moved.size > 0) {
        setEntries((prev) => prev.filter((entry) => !moved.has(entry.path)));
        setMainViewVariantImageEntries((prev) =>
          prev.filter((entry) => !moved.has(entry.path))
        );
        setSelectedFiles((prev) => {
          const next = new Set(prev);
          moved.forEach((sourcePath) => next.delete(sourcePath));
          return next;
        });
        setPendingAiEditsByOriginal((prev) => {
          const next: Record<string, PendingAiEditRecord> = {};
          Object.entries(prev).forEach(([pathValue, row]) => {
            if (moved.has(pathValue) || moved.has(row.pendingPath)) return;
            next[pathValue] = row;
          });
          return next;
        });
        setAiEditJobsByPath((prev) => {
          const next: Record<string, AiEditRuntimeJob> = {};
          Object.entries(prev).forEach(([pathValue, job]) => {
            if (moved.has(pathValue)) return;
            next[pathValue] = job;
          });
          return next;
        });
        setImageDimensions((prev) => {
          const next: Record<string, { width: number; height: number }> = {};
          Object.entries(prev).forEach(([pathValue, dims]) => {
            if (moved.has(pathValue)) return;
            next[pathValue] = dims;
          });
          return next;
        });
        setPreviewPath((prev) => (prev && moved.has(prev) ? null : prev));
      }

      if (selectedFolder) {
        await fetchFolderTree(selectedFolder);
      }
      if (failures.length > 0) {
        setError(
          `Moved ${moved.size}/${existingSources.length}. Errors: ${failures
            .slice(0, 2)
            .join("; ")}${failures.length > 2 ? "..." : ""}`
        );
      }
    } finally {
      setMovingEntry(false);
      setDraggingEntryPaths([]);
      setFolderDropTargetPath(null);
      setImageReorderDropPath(null);
    }
  };

  const handleCreateCopy = useCallback(
    async (entry: DraftEntry) => {
      if (entry.type !== "file") return;
      setError(null);
      try {
        const response = await fetch("/api/drafts/files/copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: entry.path }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to create copy.");
        }
        const copy = payload?.item as {
          name?: string;
          path?: string;
          zimageUpscaled?: boolean;
        } | undefined;
        const copyName = String(copy?.name || "").trim();
        const copyPath = String(copy?.path || "").trim();
        const copyZimageUpscaled =
          typeof copy?.zimageUpscaled === "boolean"
            ? copy.zimageUpscaled
            : false;
        if (copyName && copyPath) {
          const now = new Date().toISOString();
          setEntries((prev) => {
            if (prev.some((row) => row.path === copyPath)) return prev;
            const copyEntry: DraftEntry = {
              type: "file",
              name: copyName,
              path: copyPath,
              size: entry.size,
              modifiedAt: now,
              zimageUpscaled: copyZimageUpscaled,
            };
            const sourceIndex = prev.findIndex((row) => row.path === entry.path);
            if (sourceIndex < 0) return [...prev, copyEntry];
            const next = [...prev];
            next.splice(sourceIndex + 1, 0, copyEntry);
            return next;
          });
        } else if (currentPath) {
          await refreshEntries(currentPath);
        }
        if (selectedFolder) {
          fetchFolderTree(selectedFolder);
        }
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [currentPath, fetchFolderTree, refreshEntries, selectedFolder]
  );

  const handleCopyImageToClipboard = useCallback(
    async (entry: DraftEntry) => {
      if (entry.type !== "file" || !isImage(entry.name)) return;
      if (!navigator?.clipboard || typeof ClipboardItem === "undefined") {
        setError("Clipboard image copy is not supported in this browser.");
        return;
      }
      try {
        setError(null);
        const response = await fetch(buildDraftDownloadUrl(entry.path, entry.modifiedAt), {
          cache: "no-store",
        });
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
        const clipboardItem = new ClipboardItem({
          "image/png": pngBlob,
        });
        await navigator.clipboard.write([clipboardItem]);
      } catch (err) {
        setError((err as Error).message || "Unable to copy image to clipboard.");
      }
    },
    [buildDraftDownloadUrl, isImage]
  );

  const handleCreateCopiesForEntries = useCallback(
    async (sourceEntries: DraftEntry[]) => {
      clearSelectedFilesForImageActions();
      if (bulkImageActionPending) return;
      const targets = sourceEntries.filter((entry) => entry.type === "file");
      if (targets.length === 0) return;
      setBulkImageActionPending(true);
      setError(null);
      const failures: string[] = [];
      const created: Array<{
        sourcePath: string;
        name: string;
        path: string;
        size: number;
        pixelQualityScore: number | null;
        zimageUpscaled: boolean;
      }> = [];
      try {
        for (const entry of targets) {
          try {
            const response = await fetch("/api/drafts/files/copy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: entry.path }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(payload?.error || "Unable to create copy.");
            }
            const copy = payload?.item as {
              name?: string;
              path?: string;
              pixelQualityScore?: number | null;
              zimageUpscaled?: boolean;
            } | undefined;
            const copyName = String(copy?.name || "").trim();
            const copyPath = String(copy?.path || "").trim();
            const copyPixelQualityScore =
              typeof copy?.pixelQualityScore === "number" &&
              Number.isFinite(copy.pixelQualityScore)
                ? Math.round(copy.pixelQualityScore)
                : null;
            const copyZimageUpscaled =
              typeof copy?.zimageUpscaled === "boolean"
                ? copy.zimageUpscaled
                : false;
            if (copyName && copyPath) {
              created.push({
                sourcePath: entry.path,
                name: copyName,
                path: copyPath,
                size: entry.size,
                pixelQualityScore: copyPixelQualityScore,
                zimageUpscaled: copyZimageUpscaled,
              });
            }
          } catch (err) {
            failures.push(`${entry.name}: ${(err as Error).message}`);
          }
        }
        if (created.length > 0) {
          const now = new Date().toISOString();
          setEntries((prev) => {
            const existing = new Set(prev.map((row) => row.path));
            const next = [...prev];
            for (const item of created) {
              if (existing.has(item.path)) continue;
              existing.add(item.path);
              const copyEntry: DraftEntry = {
                type: "file",
                name: item.name,
                path: item.path,
                size: item.size,
                modifiedAt: now,
                pixelQualityScore: item.pixelQualityScore,
                zimageUpscaled: item.zimageUpscaled,
              };
              const sourceIndex = next.findIndex((row) => row.path === item.sourcePath);
              if (sourceIndex < 0) {
                next.push(copyEntry);
              } else {
                next.splice(sourceIndex + 1, 0, copyEntry);
              }
            }
            return next;
          });
        } else if (currentPath) {
          await refreshEntries(currentPath);
        }
        if (selectedFolder) {
          await fetchFolderTree(selectedFolder);
        }
      } finally {
        setBulkImageActionPending(false);
        clearSelectedFilesForImageActions();
      }
      if (failures.length > 0) {
        setError(
          `Failed to copy ${failures.length} image(s): ${failures
            .slice(0, 3)
            .join("; ")}${failures.length > 3 ? "..." : ""}`
        );
      }
    },
    [
      bulkImageActionPending,
      clearSelectedFilesForImageActions,
      currentPath,
      fetchFolderTree,
      refreshEntries,
      selectedFolder,
    ]
  );

  const handleUndoLastChangeForEntries = useCallback(
    async (sourceEntries: DraftEntry[]) => {
      clearSelectedFilesForImageActions();
      if (bulkImageActionPending) return;
      const targets = sourceEntries.filter(
        (entry) => entry.type === "file" && isImage(entry.name)
      );
      if (targets.length === 0) return;
      const locked = targets.filter(
        (entry) =>
          Boolean(pendingAiEditsByOriginal[entry.path]) ||
          Boolean(aiEditJobsByPath[entry.path])
      );
      if (locked.length > 0) {
        setError("Resolve pending/running AI edits before undo.");
        return;
      }

      setBulkImageActionPending(true);
      setError(null);
      const failures: string[] = [];
      const updates: Record<
        string,
        {
          path: string;
          name: string;
          size: number;
          modifiedAt: string;
          pixelQualityScore: number | null;
          zimageUpscaled: boolean;
        }
      > = {};

      try {
        for (const entry of targets) {
          try {
            const response = await fetch("/api/drafts/images/undo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: entry.path }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(payload?.error || "Undo failed.");
            }
            const nextPath = String(payload?.path || entry.path).trim() || entry.path;
            const nextName = String(payload?.name || entry.name).trim() || entry.name;
            const nextSize =
              typeof payload?.size === "number" && Number.isFinite(payload.size)
                ? payload.size
                : entry.size;
            const nextModifiedAt =
              String(payload?.modifiedAt || "").trim() || new Date().toISOString();
            const nextPixelQualityScore =
              typeof payload?.pixelQualityScore === "number" &&
              Number.isFinite(payload.pixelQualityScore)
                ? Math.round(payload.pixelQualityScore)
                : null;
            const nextZimageUpscaled =
              typeof payload?.zimageUpscaled === "boolean"
                ? payload.zimageUpscaled
                : false;
            updates[entry.path] = {
              path: nextPath,
              name: nextName,
              size: nextSize,
              modifiedAt: nextModifiedAt,
              pixelQualityScore: nextPixelQualityScore,
              zimageUpscaled: nextZimageUpscaled,
            };
          } catch (err) {
            failures.push(`${entry.name}: ${(err as Error).message}`);
          }
        }

        if (Object.keys(updates).length > 0) {
          setEntries((prev) =>
            prev.map((item) => {
              const update = updates[item.path];
              if (!update) return item;
              return {
                ...item,
                path: update.path,
                name: update.name,
                size: update.size,
                modifiedAt: update.modifiedAt,
                pixelQualityScore: update.pixelQualityScore,
                zimageUpscaled: update.zimageUpscaled,
              };
            })
          );
          setSelectedFiles((prev) => {
            if (prev.size === 0) return prev;
            const next = new Set(prev);
            Object.entries(updates).forEach(([oldPath, update]) => {
              if (!next.has(oldPath)) return;
              next.delete(oldPath);
              next.add(update.path);
            });
            return next;
          });
          setPreviewPath((prev) => {
            if (!prev) return prev;
            const update = updates[prev];
            return update ? update.path : prev;
          });
          setImageDimensions((prev) => {
            const next: Record<string, { width: number; height: number }> = {
              ...prev,
            };
            Object.entries(updates).forEach(([oldPath, update]) => {
              delete next[oldPath];
              delete next[update.path];
            });
            return next;
          });
        }

        if (selectedFolder) {
          await fetchFolderTree(selectedFolder);
        }
      } finally {
        setBulkImageActionPending(false);
        clearSelectedFilesForImageActions();
      }

      if (failures.length > 0) {
        setError(
          `Failed to undo ${failures.length} image(s): ${failures
            .slice(0, 3)
            .join("; ")}${failures.length > 3 ? "..." : ""}`
        );
      }
    },
    [
      aiEditJobsByPath,
      bulkImageActionPending,
      clearSelectedFilesForImageActions,
      fetchFolderTree,
      isImage,
      pendingAiEditsByOriginal,
      selectedFolder,
    ]
  );

  const runAiEditsForEntries = useCallback(
    async (
      sourceEntries: DraftEntry[],
      provider: AiEditProvider,
      mode: AiPromptMode,
      promptText: string,
      options?: { templatePreset?: AiTemplatePreset; outputCount?: number }
    ) => {
      clearSelectedFilesForImageActions();
      const pathAtStart = String(currentPathRef.current || "");
      const deduped = sourceEntries.filter(
        (entry, index, arr) =>
          entry.type === "file" &&
          isImage(entry.name) &&
          arr.findIndex((candidate) => candidate.path === entry.path) === index
      );
      if (deduped.length === 0) return;
      if (deduped.length > 1) {
        const providerLabel =
          provider === "chatgpt" ? "ChatGPT" : provider === "gemini" ? "Gemini" : "Z-Image";
        const modeLabel =
          options?.templatePreset === "digideal_main"
            ? "Digideal Main"
            : options?.templatePreset === "product_scene"
              ? "Product Scene"
              : mode === "template"
                ? "Standard Template"
                : mode === "direct"
                  ? "Direct"
                  : mode === "white_background"
                    ? "White BG"
                    : mode === "auto_center_white"
                      ? "Auto Center Wide"
                      : mode === "eraser"
                        ? "Eraser"
                        : "Upscale";
        const outputCount = Number(options?.outputCount ?? 1);
        const outputSuffix =
          Number.isFinite(outputCount) && outputCount > 1
            ? ` (${outputCount} outputs per image)`
            : "";
        const confirmed = window.confirm(
          `Run ${providerLabel} ${modeLabel} on ${deduped.length} selected images${outputSuffix}?`
        );
        if (!confirmed) return;
      }

      const skippedPendingOrRunning: string[] = [];
      const skippedAlreadyUpscaled: string[] = [];
      const runnable = deduped.filter((entry) => {
        if (pendingAiEditsByOriginal[entry.path] || aiEditJobsByPath[entry.path]) {
          skippedPendingOrRunning.push(entry.name);
          return false;
        }
        if (provider === "zimage" && mode === "upscale" && isImageEntryUpscaled(entry)) {
          skippedAlreadyUpscaled.push(entry.name);
          return false;
        }
        return true;
      });

      if (runnable.length === 0) {
        const reasons: string[] = [];
        if (skippedPendingOrRunning.length > 0) {
          reasons.push("all selected images already have pending/running AI edits");
        }
        if (skippedAlreadyUpscaled.length > 0) {
          reasons.push("all selected images already have Z-image upscale applied");
        }
        setError(
          reasons.length > 0
            ? `Cannot run action: ${reasons.join(" and ")}.`
            : "No images can be processed."
        );
        return;
      }

      setAiEditJobsByPath((prev) => {
        const next = { ...prev };
        for (const entry of runnable) {
          next[entry.path] = {
            provider,
            mode,
            status: "queued",
            startedAt: Date.now(),
          };
        }
        return next;
      });

      const failures: string[] = [];
      let nextIndex = 0;
      const maxWorkers = Math.min(3, runnable.length);
      const worker = async () => {
        while (true) {
          const index = nextIndex;
          if (index >= runnable.length) return;
          nextIndex += 1;
          const entry = runnable[index];
          setAiEditJobsByPath((prev) => ({
            ...prev,
            [entry.path]: {
              provider,
              mode,
              status: "running",
              startedAt: Date.now(),
            },
          }));
	          try {
	            const response = await fetch("/api/drafts/ai-edits", {
	              method: "POST",
	              headers: { "Content-Type": "application/json" },
	              body: JSON.stringify({
	                path: entry.path,
	                provider,
	                mode,
	                prompt: promptText,
	                templatePreset: options?.templatePreset,
                  outputCount: options?.outputCount,
	              }),
	            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(payload?.error || "AI image edit failed.");
            }
            if (
              payload?.applied === true &&
              typeof payload?.originalPath === "string" &&
              payload.originalPath.trim()
            ) {
              const originalPath = String(payload.originalPath).trim();
              const now = new Date().toISOString();
              const nextPixelQualityScore =
                typeof payload?.pixelQualityScore === "number" &&
                Number.isFinite(payload.pixelQualityScore)
                  ? Math.round(payload.pixelQualityScore)
                  : null;
              setReloadingImagePaths((prev) => {
                const next = new Set(prev);
                next.add(originalPath);
                return next;
              });
              setEntries((prev) =>
                prev.map((item) =>
                      item.path === originalPath
                    ? {
                        ...item,
                        modifiedAt: now,
                        pixelQualityScore:
                          nextPixelQualityScore !== null
                            ? nextPixelQualityScore
                            : item.pixelQualityScore ?? null,
                        zimageUpscaled:
                          provider === "zimage" && mode === "upscale"
                            ? true
                            : item.zimageUpscaled,
                      }
                    : item
                )
              );
              // Safety timeout to avoid stuck spinners if the browser never fires onLoad.
              setTimeout(() => {
                setReloadingImagePaths((prev) => {
                  if (!prev.has(originalPath)) return prev;
                  const next = new Set(prev);
                  next.delete(originalPath);
                  return next;
                });
              }, 45000);
            }
            const item = payload?.item as PendingAiEditRecord | undefined;
            if (item?.originalPath) {
              setPendingAiEditsByOriginal((prev) => ({
                ...prev,
                [item.originalPath]: item,
              }));
            }
          } catch (err) {
            failures.push(`${entry.name}: ${(err as Error).message}`);
          } finally {
            setAiEditJobsByPath((prev) => {
              const next = { ...prev };
              delete next[entry.path];
              return next;
            });
          }
        }
      };
      try {
        await Promise.all(Array.from({ length: maxWorkers }, () => worker()));

        const latestPath = String(currentPathRef.current || "");
        if (pathAtStart && latestPath === pathAtStart) {
          await refreshEntries(pathAtStart);
          await fetchPendingAiEdits(pathAtStart);
        }

        const messages: string[] = [];
        if (skippedPendingOrRunning.length > 0) {
          messages.push(
            `Skipped ${skippedPendingOrRunning.length} image(s) with existing pending/running edits.`
          );
        }
        if (skippedAlreadyUpscaled.length > 0) {
          messages.push(
            `Skipped ${skippedAlreadyUpscaled.length} image(s) already upscaled with Z-image.`
          );
        }
        if (failures.length > 0) {
          messages.push(
            `Failed ${failures.length} image(s): ${failures
              .slice(0, 3)
              .join("; ")}${failures.length > 3 ? "..." : ""}`
          );
        }
        if (messages.length > 0) {
          setError(messages.join(" "));
        }
      } finally {
        clearSelectedFilesForImageActions();
      }
    },
    [
      aiEditJobsByPath,
      clearSelectedFilesForImageActions,
      fetchPendingAiEdits,
      refreshEntries,
      isImage,
      isImageEntryUpscaled,
      pendingAiEditsByOriginal,
    ]
  );

  const startAiEditForEntries = useCallback(
    (sourceEntries: DraftEntry[], provider: AiEditProvider, mode: AiPromptMode) => {
      clearSelectedFilesForImageActions();
      const targets = sourceEntries.filter(
        (entry, index, arr) =>
          entry.type === "file" &&
          isImage(entry.name) &&
          arr.findIndex((candidate) => candidate.path === entry.path) === index
      );
      if (targets.length === 0) return;
      if (
        provider === "zimage" &&
        (mode === "upscale" || mode === "white_background" || mode === "auto_center_white")
      ) {
        setAiEditTargets([]);
        setAiEditProvider(provider);
        setAiEditMode(mode);
        setAiEditTemplatePreset("standard");
        setAiEditOutputCount(1);
        setAiEditPrompt("");
        setAiEditError(null);
        setError(null);
        void runAiEditsForEntries(targets, provider, mode, "");
        return;
      }
      setAiEditTargets(targets);
      setAiEditProvider(provider);
      setAiEditMode(mode);
      setAiEditTemplatePreset("standard");
      setAiEditOutputCount(1);
      setAiEditPrompt("");
      setAiEditError(null);
    },
    [clearSelectedFilesForImageActions, isImage, runAiEditsForEntries]
  );

  const startAiTemplatePresetForEntries = useCallback(
    (
      sourceEntries: DraftEntry[],
      provider: Exclude<AiEditProvider, "zimage">,
      templatePreset: Exclude<AiTemplatePreset, "standard">,
      outputCount: number
    ) => {
      clearSelectedFilesForImageActions();
      const targets = sourceEntries.filter(
        (entry, index, arr) =>
          entry.type === "file" &&
          isImage(entry.name) &&
          arr.findIndex((candidate) => candidate.path === entry.path) === index
      );
      if (targets.length === 0) return;
      setAiEditTargets(targets);
      setAiEditProvider(provider);
      setAiEditMode("template");
      setAiEditTemplatePreset(templatePreset);
      setAiEditOutputCount(
        Number.isFinite(outputCount)
          ? Math.max(1, Math.min(3, Math.floor(outputCount)))
          : 1
      );
      setAiEditPrompt("");
      setAiEditError(null);
      setError(null);
    },
    [clearSelectedFilesForImageActions, isImage]
  );

  const startAiEdit = useCallback(
    (entry: DraftEntry, provider: AiEditProvider, mode: AiPromptMode) => {
      startAiEditForEntries([entry], provider, mode);
    },
    [startAiEditForEntries]
  );

  const cancelAiEdit = useCallback(() => {
    if (aiEditSubmitting) return;
    setAiEditTargets([]);
    setAiEditTemplatePreset("standard");
    setAiEditOutputCount(1);
    setAiEditPrompt("");
    setAiEditError(null);
  }, [aiEditSubmitting]);

  const submitAiEdit = useCallback(async () => {
    if (aiEditTargets.length === 0 || aiEditSubmitting) return;
    const promptText = aiEditPrompt.trim();
    if ((aiEditMode === "direct" || aiEditMode === "eraser") && !promptText) {
      setAiEditError(
        aiEditMode === "eraser"
          ? "Prompt is required for Z-image eraser."
          : "Prompt is required in direct mode."
      );
      return;
    }
    const targets = [...aiEditTargets];
    const provider = aiEditProvider;
    const mode = aiEditMode;
    const templatePreset = mode === "template" ? aiEditTemplatePreset : undefined;
    const outputCount =
      mode === "template" && aiEditTemplatePreset !== "standard"
        ? aiEditOutputCount
        : undefined;
    setAiEditSubmitting(true);
    setAiEditTargets([]);
    setAiEditTemplatePreset("standard");
    setAiEditOutputCount(1);
    setAiEditPrompt("");
    setAiEditError(null);
    setError(null);
    setAiEditSubmitting(false);
    void runAiEditsForEntries(targets, provider, mode, promptText, {
      templatePreset,
      outputCount,
    });
  }, [
    aiEditOutputCount,
    aiEditTemplatePreset,
    aiEditTargets,
    aiEditMode,
    aiEditPrompt,
    aiEditProvider,
    aiEditSubmitting,
    runAiEditsForEntries,
  ]);

  const resolveAiEdit = useCallback(
    async (originalPath: string, decision: AiResolveDecision) => {
      if (aiReviewSubmitting) return;
      const pathAtStart = String(currentPathRef.current || "");
      setAiReviewSubmitting(true);
      setError(null);
      try {
        const response = await fetch("/api/drafts/ai-edits/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ originalPath, decision }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to resolve AI edit.");
        }
        setPendingAiEditsByOriginal((prev) => {
          const next = { ...prev };
          delete next[originalPath];
          return next;
        });
        const refreshedScoresRaw = Array.isArray(payload?.refreshedScores)
          ? (payload.refreshedScores as Array<{ path?: unknown; pixelQualityScore?: unknown }>)
          : [];
        const refreshedScoreByPath = new Map<string, number | null>();
        refreshedScoresRaw.forEach((row) => {
          const pathValue = String(row?.path || "").trim();
          if (!pathValue) return;
          const scoreValue =
            typeof row?.pixelQualityScore === "number" &&
            Number.isFinite(row.pixelQualityScore)
              ? Math.round(row.pixelQualityScore)
              : null;
          refreshedScoreByPath.set(pathValue, scoreValue);
        });
        if (refreshedScoreByPath.size > 0) {
          const now = new Date().toISOString();
          setEntries((prev) =>
            prev.map((item) => {
              if (!refreshedScoreByPath.has(item.path)) return item;
              return {
                ...item,
                modifiedAt: now,
                pixelQualityScore: refreshedScoreByPath.get(item.path) ?? null,
              };
            })
          );
        }
        const latestPath = String(currentPathRef.current || "");
        const canRefreshActiveFolder = Boolean(pathAtStart && latestPath === pathAtStart);
        if (decision === "replace_with_ai") {
          if (canRefreshActiveFolder) {
            await refreshEntries(pathAtStart);
            await fetchPendingAiEdits(pathAtStart);
          } else {
            const now = new Date().toISOString();
            setEntries((prev) =>
              prev.map((item) =>
                item.path === originalPath ? { ...item, modifiedAt: now } : item
              )
            );
          }
        } else if (decision === "keep_both" && canRefreshActiveFolder) {
          await refreshEntries(pathAtStart);
          await fetchPendingAiEdits(pathAtStart);
        }
        setAiReviewOriginalPath(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setAiReviewSubmitting(false);
      }
    },
    [aiReviewSubmitting, fetchPendingAiEdits, refreshEntries]
  );

  const startRename = (entry: DraftEntry) => {
    if (entry.type !== "file") return;
    if (pendingAiEditsByOriginal[entry.path]) {
      setError("Resolve the pending AI edit before renaming this file.");
      return;
    }
    if (aiEditJobsByPath[entry.path]) {
      setError("Wait for the running AI edit before renaming this file.");
      return;
    }
    setRenamingPath(entry.path);
    const { baseName, extension } = splitFileNameAndExtension(entry.name);
    setRenameValue(baseName);
    setRenameExtension(extension);
  };

  const cancelRename = () => {
    setRenamingPath(null);
    setRenameValue("");
    setRenameExtension("");
  };

  const commitRename = async (entry: DraftEntry) => {
    if (renamePending) return;
    let nextBaseName = renameValue.trim();
    const fallbackExtension = splitFileNameAndExtension(entry.name).extension;
    const extension = renameExtension || fallbackExtension;
    if (
      extension &&
      nextBaseName.toLowerCase().endsWith(extension.toLowerCase())
    ) {
      nextBaseName = nextBaseName.slice(0, -extension.length).trim();
    }
    const nextName = `${nextBaseName}${extension}`;
    if (!nextBaseName || nextName === entry.name) {
      cancelRename();
      return;
    }
    setRenamePending(true);
    setError(null);
    try {
      const response = await fetch("/api/drafts/images/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: entry.path, name: nextName }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Rename failed.");
      }
      const payload = await response.json();
      const newName = String(payload.name || nextName);
      const newPath = String(payload.path || entry.path);
      const now = new Date().toISOString();

      setEntries((prev) => {
        return prev.map((item) =>
          item.path === entry.path
            ? { ...item, name: newName, path: newPath, modifiedAt: now }
            : item
        );
      });
      setSelectedFiles((prev) => {
        if (!prev.has(entry.path)) return prev;
        const next = new Set(prev);
        next.delete(entry.path);
        next.add(newPath);
        return next;
      });
      setPreviewPath((prev) => (prev === entry.path ? newPath : prev));
      setImageDimensions((prev) => {
        const dims = prev[entry.path];
        if (!dims) return prev;
        const next: Record<string, { width: number; height: number }> = { ...prev };
        delete next[entry.path];
        next[newPath] = dims;
        return next;
      });
      if (currentPath) {
        fetchPendingAiEdits(currentPath);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRenamePending(false);
      cancelRename();
    }
  };

  const formatFileSize = (bytes: number | null | undefined) => {
    if (bytes == null) return "-";
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    const rounded =
      value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
    return `${rounded} ${units[unitIndex]}`;
  };

  const triggerBrowserDownload = (href: string) => {
    const link = document.createElement("a");
    link.href = href;
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDownloadEntries = async (sourceEntries: DraftEntry[]) => {
    clearSelectedFilesForImageActions();
    for (const entry of sourceEntries) {
      if (entry.type === "dir") {
        triggerBrowserDownload(`/api/drafts/zip?path=${encodeURIComponent(entry.path)}`);
      } else {
        triggerBrowserDownload(`/api/drafts/download?path=${encodeURIComponent(entry.path)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  const handleDownloadAllFolders = async () => {
    if (!selectedFolder) return;
    triggerBrowserDownload(
      `/api/drafts/zip?path=${encodeURIComponent(selectedFolder)}`
    );
  };

  const handleDownloadSelectedIndividually = async () => {
    if (selectedFiles.size === 0) return;
    const selected = Array.from(selectedFiles);
    const selectedEntries = selected
      .map((relativePath) => entries.find((candidate) => candidate.path === relativePath))
      .filter((entry): entry is DraftEntry => Boolean(entry));
    await handleDownloadEntries(selectedEntries);
  };

  const handleDownloadSelectedZip = async () => {
    if (selectedTreeFolders.size === 0) return;
    const selected = Array.from(selectedTreeFolders);
    for (const relativePath of selected) {
      triggerBrowserDownload(`/api/drafts/zip?path=${encodeURIComponent(relativePath)}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  const handleDeleteSelectedFolders = async () => {
    const paths = Array.from(selectedTreeFolders);
    if (paths.length === 0) return;
    const locked = Object.values(pendingAiEditsByOriginal).some((row) =>
      paths.some(
        (folderPath) =>
          row.originalPath.startsWith(`${folderPath}/`) ||
          row.pendingPath.startsWith(`${folderPath}/`)
      )
    );
    if (locked) {
      setError("Resolve pending/running AI edits before deleting those folders.");
      return;
    }
    const confirmed = window.confirm(t("bulkProcessing.explorer.deleteConfirm"));
    if (!confirmed) return;
    try {
      const response = await fetch("/api/drafts/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Delete failed.");
      }
      const isDeletedPath = (candidatePath: string) =>
        paths.some(
          (deletedPath) =>
            candidatePath === deletedPath || candidatePath.startsWith(`${deletedPath}/`)
        );
      setEntries((prev) => prev.filter((entry) => !isDeletedPath(entry.path)));
      setSelectedTreeFolders(new Set());
      setPendingAiEditsByOriginal((prev) => {
        const next: Record<string, PendingAiEditRecord> = {};
        Object.entries(prev).forEach(([pathValue, row]) => {
          if (isDeletedPath(pathValue) || isDeletedPath(row.pendingPath)) return;
          next[pathValue] = row;
        });
        return next;
      });
      setAiEditJobsByPath((prev) => {
        const next: Record<string, AiEditRuntimeJob> = {};
        Object.entries(prev).forEach(([pathValue, row]) => {
          if (isDeletedPath(pathValue)) return;
          next[pathValue] = row;
        });
        return next;
      });
      setImageDimensions((prev) => {
        const next: Record<string, { width: number; height: number }> = {};
        Object.entries(prev).forEach(([pathValue, dims]) => {
          if (isDeletedPath(pathValue)) return;
          next[pathValue] = dims;
        });
        return next;
      });
      if (
        currentPath &&
        paths.some(
          (deletedPath) =>
            currentPath === deletedPath || currentPath.startsWith(`${deletedPath}/`)
        )
      ) {
        setCurrentPath(selectedFolder || "");
      }
      if (selectedFolder) {
        fetchFolderTree(selectedFolder);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteSelected = async () => {
    const paths = Array.from(new Set([...selectedFiles, ...selectedTreeFolders]));
    if (paths.length === 0) return;
    const locked = paths.filter(
      (item) => Boolean(pendingAiEditsByOriginal[item]) || Boolean(aiEditJobsByPath[item])
    );
    if (locked.length > 0) {
      setError("Resolve pending/running AI edits before deleting those files.");
      return;
    }
    const confirmed = window.confirm(t("bulkProcessing.explorer.deleteConfirm"));
    if (!confirmed) return;
    try {
      const response = await fetch("/api/drafts/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Delete failed.");
      }
      const isDeletedPath = (candidatePath: string) =>
        paths.some(
          (deletedPath) =>
            candidatePath === deletedPath || candidatePath.startsWith(`${deletedPath}/`)
        );
      setEntries((prev) => prev.filter((entry) => !isDeletedPath(entry.path)));
      setSelectedFiles(new Set());
      setSelectedTreeFolders(new Set());
      setPendingAiEditsByOriginal((prev) => {
        const next: Record<string, PendingAiEditRecord> = {};
        Object.entries(prev).forEach(([pathValue, row]) => {
          if (isDeletedPath(pathValue) || isDeletedPath(row.pendingPath)) return;
          next[pathValue] = row;
        });
        return next;
      });
      setAiEditJobsByPath((prev) => {
        const next: Record<string, AiEditRuntimeJob> = {};
        Object.entries(prev).forEach(([pathValue, row]) => {
          if (isDeletedPath(pathValue)) return;
          next[pathValue] = row;
        });
        return next;
      });
      setImageDimensions((prev) => {
        const next: Record<string, { width: number; height: number }> = {};
        Object.entries(prev).forEach(([pathValue, dims]) => {
          if (isDeletedPath(pathValue)) return;
          next[pathValue] = dims;
        });
        return next;
      });
      setPreviewPath((prev) => (prev && isDeletedPath(prev) ? null : prev));
      if (selectedFolder) {
        fetchFolderTree(selectedFolder);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    const handleDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete") return;
      const target = event.target as HTMLElement | null;
      const tagName = String(target?.tagName || "").toLowerCase();
      if (
        target?.isContentEditable ||
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select"
      ) {
        return;
      }
      if (
        !currentPath ||
        movingEntry ||
        renamePending ||
        Boolean(renamingPath) ||
        Boolean(fileViewerPath) ||
        Boolean(previewPath) ||
        Boolean(aiReviewOriginalPath) ||
        aiEditTargets.length > 0 ||
        variantsEditorOpen ||
        detailOpen
      ) {
        return;
      }

      const selectedFilePaths = Array.from(selectedFiles).filter(
        (pathValue) => entryByPath.get(pathValue)?.type === "file"
      );
      if (selectedFilePaths.length === 0) return;
      event.preventDefault();
      const deletedImagesPath = `${currentPath}/deleted images`.replace(
        /\/{2,}/g,
        "/"
      );
      void handleMoveEntriesToFolder(selectedFilePaths, deletedImagesPath);
    };

    window.addEventListener("keydown", handleDeleteKey);
    return () => {
      window.removeEventListener("keydown", handleDeleteKey);
    };
  }, [
    aiEditTargets.length,
    aiReviewOriginalPath,
    currentPath,
    detailOpen,
    entryByPath,
    fileViewerPath,
    handleMoveEntriesToFolder,
    movingEntry,
    previewPath,
    renamePending,
    renamingPath,
    selectedFiles,
    variantsEditorOpen,
  ]);

  const uploadFilesToCurrentPath = useCallback(
    async (files: File[]) => {
      if (!currentPath || files.length === 0) return;
      try {
        const formData = new FormData();
        formData.append("targetPath", currentPath);
        files.forEach((file) => formData.append("files", file));
        const response = await fetch("/api/drafts/upload", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Upload failed.");
        }
        refreshEntries(currentPath);
        fetchPendingAiEdits(currentPath);
        if (selectedFolder) {
          fetchFolderTree(selectedFolder);
        }
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [
      currentPath,
      fetchPendingAiEdits,
      fetchFolderTree,
      refreshEntries,
      selectedFolder,
    ]
  );

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      await uploadFilesToCurrentPath(files);
    },
    [uploadFilesToCurrentPath]
  );

  const handleAddImageUrls = useCallback(async () => {
    if (!currentPath) return;
    const urls = parseImageUrlsInput(imageUrlInput);
    if (urls.length === 0) {
      setError("Add at least one valid image URL.");
      return;
    }
    setAddingImageUrls(true);
    setError(null);
    try {
      const response = await fetch("/api/drafts/upload-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPath: currentPath,
          urls,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to add images from URL.");
      }
      setImageUrlInput("");
      refreshEntries(currentPath);
      fetchPendingAiEdits(currentPath);
      if (selectedFolder) {
        fetchFolderTree(selectedFolder);
      }
      const failed = Number(payload?.failed || 0);
      if (failed > 0) {
        setError(`Added ${payload?.uploaded || 0} image(s), ${failed} failed.`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAddingImageUrls(false);
    }
  }, [
    currentPath,
    imageUrlInput,
    selectedFolder,
    fetchPendingAiEdits,
    fetchFolderTree,
    refreshEntries,
  ]);

  useEffect(() => {
    if (!currentPath) return;
    const handlePaste = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;
      const itemFiles = Array.from(clipboardData.items || [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      const fallbackFiles =
        itemFiles.length > 0
          ? []
          : Array.from(clipboardData.files || []).filter((file) =>
              file.type.startsWith("image/")
            );
      const sourceFiles = itemFiles.length > 0 ? itemFiles : fallbackFiles;
      if (sourceFiles.length === 0) return;

      event.preventDefault();
      const segments = currentPath.split("/").filter(Boolean);
      const currentFolderName = sanitizeFileNameSegment(
        segments[segments.length - 1] || "folder"
      );
      const stamp = formatClipboardDateTime();
      const renamedFiles = sourceFiles.map((file, index) => {
        const ext = imageExtensionFromMime(file.type);
        const suffix = sourceFiles.length > 1 ? `-${index + 1}` : "";
        const fileName = `${currentFolderName}-clipboard-${stamp}${suffix}.${ext}`;
        return new File([file], fileName, {
          type: file.type || `image/${ext}`,
        });
      });

      void uploadFilesToCurrentPath(renamedFiles);
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [currentPath, uploadFilesToCurrentPath]);

  const buildExpandedInputStyle = useCallback(
    (value: string, options?: { minPx?: number; maxPx?: number }) => {
      const maxPx = options?.maxPx ?? 1400;
      const expandedWidth = estimateExpandedInputWidthPx(value, options);
      return {
        width: `${expandedWidth}px`,
        minWidth: "100%",
        maxWidth: `min(92vw, ${maxPx}px)`,
      };
    },
    []
  );

  const renderVariantEditorInput = useCallback(
    (
      row: DraftVariantEditorRow,
      field: DraftVariantEditorEditableField,
      options?: { numeric?: boolean }
    ) => {
      const value = String(row[field] ?? "");
      return (
        <div className={styles.variantsEditorInputWrap}>
          <Input
            size="small"
            className={styles.variantsEditorInput}
            value={value}
            type={options?.numeric ? "number" : "text"}
            onChange={(_, data) =>
              handleVariantEditorCellChange(row.key, field, data.value)
            }
          />
        </div>
      );
    },
    [
      handleVariantEditorCellChange,
      styles.variantsEditorInput,
      styles.variantsEditorInputWrap,
    ]
  );

  const toggleExpanded = (id: string) => {
    setExpandedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const startEdit = (table: "spu" | "sku", id: string, field: string, value: string | number | null) => {
    setEditingCell({ table, id, field });
    setEditingValue(value == null ? "" : String(value));
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditingValue("");
  };

  const commitEdit = async () => {
    if (!editingCell) return;
    setIsSaving(true);
    setDraftError(null);
    const endpoint =
      editingCell.table === "spu"
        ? "/api/drafts/products/update"
        : "/api/drafts/variants/update";
    const field = editingCell.field;
    const rawValue = editingValue.trim();
    const payloadValue = rawValue === "" ? null : rawValue;
    const isRawField = field.startsWith("raw_");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingCell.id,
          field,
          value:
            editingCell.table === "sku" &&
            (field === "draft_price" || field === "draft_weight")
              ? payloadValue === null
                ? null
                : Number(payloadValue)
              : payloadValue,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Update failed.");
      }
      if (editingCell.table === "spu") {
        setSpuRows((prev) =>
          prev.map((row) =>
            row.id === editingCell.id ? { ...row, [field]: payloadValue } : row
          )
        );
      } else {
        setSkuRows((prev) =>
          prev.map((row) =>
            row.id === editingCell.id
              ? isRawField
                ? {
                    ...row,
                    draft_raw_row: {
                      ...(row.draft_raw_row ?? {}),
                      [field.replace(/^raw_/, "")]: payloadValue ?? "",
                    },
                  }
                : { ...row, [field]: payloadValue }
              : row
          )
        );
      }
      cancelEdit();
    } catch (err) {
      setDraftError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderEditableCell = (
    table: "spu" | "sku",
    rowId: string,
    field: string,
    value: string | number | null,
    options?: { numeric?: boolean; clamp?: boolean }
  ) => {
    const isEditing =
      editingCell?.table === table &&
      editingCell?.id === rowId &&
      editingCell?.field === field;
    const display = value == null ? "" : String(value);

    if (isEditing) {
      const editStyle = buildExpandedInputStyle(editingValue, {
        minPx: options?.numeric ? 140 : 220,
        maxPx: 1800,
      });
      return (
        <div className={styles.tableEditInputWrap}>
          <Input
            value={editingValue}
            onChange={(_, data) => setEditingValue(data.value)}
            onBlur={() => commitEdit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitEdit();
              }
              if (event.key === "Escape") {
                cancelEdit();
              }
            }}
            type={options?.numeric ? "number" : "text"}
            size="small"
            className={mergeClasses(styles.tableEditInput, styles.expandedInlineInput)}
            style={editStyle}
            autoFocus
          />
        </div>
      );
    }

    return (
      <Text
        size={200}
        className={mergeClasses(options?.clamp ? styles.clampTwo : undefined)}
        title={display}
        onClick={() => startEdit(table, rowId, field, value)}
        style={{ cursor: "text" }}
      >
        {display || "-"}
      </Text>
    );
  };

  const openEntry = (entry: DraftEntry) => {
    if (entry.type === "dir") {
      setCurrentPath(entry.path);
      return;
    }
    if (isImage(entry.name)) {
      setPreviewPath(entry.path);
      return;
    }
    triggerBrowserDownload(`/api/drafts/download?path=${encodeURIComponent(entry.path)}`);
  };

  const downloadEntry = (entry: DraftEntry) => {
    if (entry.type === "dir") {
      triggerBrowserDownload(`/api/drafts/zip?path=${encodeURIComponent(entry.path)}`);
      return;
    }
    triggerBrowserDownload(`/api/drafts/download?path=${encodeURIComponent(entry.path)}`);
  };

  const resolveContextActionTargets = useCallback(
    (entry: DraftEntry, options?: { imageOnly?: boolean }) => {
      const selectedSource = options?.imageOnly
        ? displayImageEntriesRef.current
        : entries;
      const selected = selectedSource.filter(
        (candidate) => candidate.type === "file" && selectedFiles.has(candidate.path)
      );
      if (entry.type === "file" && selected.length > 1) {
        const filtered = options?.imageOnly
          ? selected.filter((candidate) => isImage(candidate.name))
          : selected;
        if (filtered.length > 0) {
          return filtered;
        }
      }
      if (options?.imageOnly) {
        return entry.type === "file" && isImage(entry.name) ? [entry] : [];
      }
      return [entry];
    },
    [entries, isImage, selectedFiles]
  );

  const restoreSelectionAfterContextAction = useCallback(
    (_targets: DraftEntry[]) => {
      void _targets;
      clearSelectedFilesForImageActions();
    },
    [clearSelectedFilesForImageActions]
  );

  const handleApplyImageTag = useCallback(
    async (sourceEntries: DraftEntry[], tag: ImageTagOption) => {
      clearSelectedFilesForImageActions();
      const targets = sourceEntries.filter(
        (entry, index, arr) =>
          entry.type === "file" &&
          isImage(entry.name) &&
          arr.findIndex((candidate) => candidate.path === entry.path) === index
      );
      if (targets.length === 0 || bulkImageActionPending) return;

      setBulkImageActionPending(true);
      setError(null);
      const failures: string[] = [];
      const renames: Record<string, { name: string; path: string }> = {};

      try {
        for (const entry of targets) {
          if (pendingAiEditsByOriginal[entry.path] || aiEditJobsByPath[entry.path]) {
            failures.push(`${entry.name}: resolve AI status first.`);
            continue;
          }
          const requestedName = buildTaggedImageFileName(entry.name, tag);
          if (!requestedName || requestedName === entry.name) continue;
          try {
            const response = await fetch("/api/drafts/images/rename", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: entry.path, name: requestedName }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(payload?.error || "Rename failed.");
            }
            const renamedPath = String(payload?.path || entry.path);
            const renamedName = String(payload?.name || requestedName);
            renames[entry.path] = { path: renamedPath, name: renamedName };
          } catch (err) {
            failures.push(`${entry.name}: ${(err as Error).message}`);
          }
        }

        if (Object.keys(renames).length > 0) {
          setEntries((prev) =>
            prev.map((item) => {
              const renamed = renames[item.path];
              if (!renamed) return item;
              return { ...item, name: renamed.name, path: renamed.path };
            })
          );
          setSelectedFiles((prev) => {
            if (prev.size === 0) return prev;
            const next = new Set(prev);
            Object.entries(renames).forEach(([oldPath, renamed]) => {
              if (!next.has(oldPath)) return;
              next.delete(oldPath);
              next.add(renamed.path);
            });
            return next;
          });
          setPreviewPath((prev) => {
            if (!prev) return prev;
            const renamed = renames[prev];
            return renamed ? renamed.path : prev;
          });
          setImageDimensions((prev) => {
            const next: Record<string, { width: number; height: number }> = { ...prev };
            Object.entries(renames).forEach(([oldPath, renamed]) => {
              const dims = next[oldPath];
              if (!dims) return;
              delete next[oldPath];
              next[renamed.path] = dims;
            });
            return next;
          });
          setContextMenu((prev) => {
            if (!prev) return prev;
            const renamed = renames[prev.entry.path];
            if (!renamed) return prev;
            return {
              ...prev,
              entry: {
                ...prev.entry,
                path: renamed.path,
                name: renamed.name,
              },
            };
          });
        }
      } finally {
        setBulkImageActionPending(false);
        clearSelectedFilesForImageActions();
      }

      if (failures.length > 0) {
        setError(
          `Failed to tag ${failures.length} image(s): ${failures
            .slice(0, 3)
            .join("; ")}${failures.length > 3 ? "..." : ""}`
        );
      }
    },
    [
      aiEditJobsByPath,
      bulkImageActionPending,
      clearSelectedFilesForImageActions,
      isImage,
      pendingAiEditsByOriginal,
    ]
  );

  const handleToggleImageTag = useCallback(
    async (sourceEntries: DraftEntry[], tag: ImageTagOption) => {
      clearSelectedFilesForImageActions();
      const targets = sourceEntries.filter(
        (entry, index, arr) =>
          entry.type === "file" &&
          isImage(entry.name) &&
          arr.findIndex((candidate) => candidate.path === entry.path) === index
      );
      if (targets.length === 0 || bulkImageActionPending) return;

      setBulkImageActionPending(true);
      setError(null);
      const failures: string[] = [];
      const renames: Record<string, { name: string; path: string }> = {};

      try {
        for (const sourceEntry of targets) {
          const entry = entryByPath.get(sourceEntry.path) ?? sourceEntry;
          if (pendingAiEditsByOriginal[entry.path] || aiEditJobsByPath[entry.path]) {
            failures.push(`${entry.name}: resolve AI status first.`);
            continue;
          }
          const requestedName = toggleImageTagInFileName(entry.name, tag);
          if (!requestedName || requestedName === entry.name) continue;
          try {
            const response = await fetch("/api/drafts/images/rename", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: entry.path, name: requestedName }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(payload?.error || "Rename failed.");
            }
            const renamedPath = String(payload?.path || entry.path);
            const renamedName = String(payload?.name || requestedName);
            renames[entry.path] = { path: renamedPath, name: renamedName };
          } catch (err) {
            failures.push(`${entry.name}: ${(err as Error).message}`);
          }
        }

        if (Object.keys(renames).length > 0) {
          setEntries((prev) =>
            prev.map((item) => {
              const renamed = renames[item.path];
              if (!renamed) return item;
              return { ...item, name: renamed.name, path: renamed.path };
            })
          );
          setSelectedFiles((prev) => {
            if (prev.size === 0) return prev;
            const next = new Set(prev);
            Object.entries(renames).forEach(([oldPath, renamed]) => {
              if (!next.has(oldPath)) return;
              next.delete(oldPath);
              next.add(renamed.path);
            });
            return next;
          });
          setPreviewPath((prev) => {
            if (!prev) return prev;
            const renamed = renames[prev];
            return renamed ? renamed.path : prev;
          });
          setImageDimensions((prev) => {
            const next: Record<string, { width: number; height: number }> = { ...prev };
            Object.entries(renames).forEach(([oldPath, renamed]) => {
              const dims = next[oldPath];
              if (!dims) return;
              delete next[oldPath];
              next[renamed.path] = dims;
            });
            return next;
          });
          setContextMenu((prev) => {
            if (!prev) return prev;
            const renamed = renames[prev.entry.path];
            if (!renamed) return prev;
            return {
              ...prev,
              entry: {
                ...prev.entry,
                path: renamed.path,
                name: renamed.name,
              },
            };
          });
        }
      } finally {
        setBulkImageActionPending(false);
        clearSelectedFilesForImageActions();
      }

      if (failures.length > 0) {
        setError(
          `Failed to update tags for ${failures.length} image(s): ${failures
            .slice(0, 3)
            .join("; ")}${failures.length > 3 ? "..." : ""}`
        );
      }
    },
    [
      aiEditJobsByPath,
      bulkImageActionPending,
      clearSelectedFilesForImageActions,
      entryByPath,
      isImage,
      pendingAiEditsByOriginal,
    ]
  );

  const collectVariantHintsForSpu = useCallback(
    async (spu: string) => {
      const normalizedSpu = String(spu || "").trim();
      if (!normalizedSpu) return [] as string[];

      const collectFromRows = (rows: Array<Record<string, unknown>>) => {
        const out: string[] = [];
        const seen = new Set<string>();
        rows.forEach((row) => {
          const combined = buildVariantCombinedZhValue({
            draft_option1: String(row.draft_option1 ?? ""),
            draft_option2: String(row.draft_option2 ?? ""),
            draft_option3: String(row.draft_option3 ?? ""),
            draft_option4: String(row.draft_option4 ?? ""),
            fallback: String(row.draft_option_combined_zh ?? ""),
          }).trim();
          if (!combined) return;
          const key = combined.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          out.push(combined);
        });
        return out;
      };

      const localRows = skuRows
        .filter(
          (row) => String(row.draft_spu || "").trim().toUpperCase() === normalizedSpu.toUpperCase()
        )
        .map((row) => row as unknown as Record<string, unknown>);
      const localHints = collectFromRows(localRows);
      if (localHints.length > 0) {
        return localHints.slice(0, 24);
      }

      try {
        const url = new URL("/api/drafts/variants", window.location.origin);
        url.searchParams.set("spu", normalizedSpu);
        const response = await fetch(url.toString());
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load variant hints.");
        }
        const items = Array.isArray(payload?.items) ? (payload.items as unknown[]) : [];
        const hints = collectFromRows(
          items.filter((value) => value && typeof value === "object") as Array<
            Record<string, unknown>
          >
        );
        return hints.slice(0, 24);
      } catch {
        return [];
      }
    },
    [skuRows]
  );

  const applyTagAssignments = useCallback(
    async (assignments: Array<{ path: string; tag: ImageTagOption }>) => {
      const normalizedAssignments = assignments
        .map((assignment) => ({
          path: String(assignment.path || "").trim(),
          tag: String(assignment.tag || "").trim().toUpperCase(),
        }))
        .filter(
          (assignment): assignment is { path: string; tag: ImageTagOption } =>
            Boolean(assignment.path) &&
            (assignment.tag === "MAIN" ||
              assignment.tag === "ENV" ||
              assignment.tag === "VAR" ||
              assignment.tag === "INF" ||
              assignment.tag === "DIGI")
        );

      if (normalizedAssignments.length === 0) {
        return { applied: 0, failures: [] as string[] };
      }

      setBulkImageActionPending(true);
      const failures: string[] = [];
      const renames: Record<string, { name: string; path: string }> = {};
      const workingEntries = new Map(
        entries
          .filter((entry) => entry.type === "file" && isImage(entry.name))
          .map((entry) => [entry.path, { path: entry.path, name: entry.name }])
      );

      let applied = 0;

      try {
        for (const assignment of normalizedAssignments) {
          const target =
            workingEntries.get(assignment.path) ?? {
              path: assignment.path,
              name: extractFileNameFromPath(assignment.path),
            };
          if (!target.path || !target.name) {
            failures.push(`${assignment.path}: file not found`);
            continue;
          }
          if (
            pendingAiEditsByOriginal[target.path] ||
            aiEditJobsByPath[target.path]
          ) {
            failures.push(`${target.name}: resolve AI status first.`);
            continue;
          }

          const requestedName = buildTaggedImageFileName(target.name, assignment.tag);
          if (!requestedName || requestedName === target.name) {
            continue;
          }

          try {
            const response = await fetch("/api/drafts/images/rename", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: target.path, name: requestedName }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(payload?.error || "Rename failed.");
            }
            const renamedPath = String(payload?.path || target.path);
            const renamedName = String(payload?.name || requestedName);
            renames[target.path] = { path: renamedPath, name: renamedName };
            if (workingEntries.has(target.path)) {
              workingEntries.delete(target.path);
              workingEntries.set(renamedPath, { path: renamedPath, name: renamedName });
            }
            applied += 1;
          } catch (err) {
            failures.push(`${target.name}: ${(err as Error).message}`);
          }
        }

        if (Object.keys(renames).length > 0) {
          setEntries((prev) =>
            prev.map((item) => {
              const renamed = renames[item.path];
              if (!renamed) return item;
              return { ...item, name: renamed.name, path: renamed.path };
            })
          );
          setSelectedFiles((prev) => {
            if (prev.size === 0) return prev;
            const next = new Set(prev);
            Object.entries(renames).forEach(([oldPath, renamed]) => {
              if (!next.has(oldPath)) return;
              next.delete(oldPath);
              next.add(renamed.path);
            });
            return next;
          });
          setPreviewPath((prev) => {
            if (!prev) return prev;
            const renamed = renames[prev];
            return renamed ? renamed.path : prev;
          });
          setImageDimensions((prev) => {
            const next: Record<string, { width: number; height: number }> = { ...prev };
            Object.entries(renames).forEach(([oldPath, renamed]) => {
              const dims = next[oldPath];
              if (!dims) return;
              delete next[oldPath];
              next[renamed.path] = dims;
            });
            return next;
          });
        }
      } finally {
        setBulkImageActionPending(false);
        clearSelectedFilesForImageActions();
      }

      return { applied, failures };
    },
    [
      aiEditJobsByPath,
      clearSelectedFilesForImageActions,
      entries,
      isImage,
      pendingAiEditsByOriginal,
    ]
  );

  const persistImageOrderForFolder = useCallback(
    async (folderPath: string, orderedPaths: string[]) => {
      const normalizedFolderPath = String(folderPath || "").trim();
      if (!normalizedFolderPath) return;
      setImageOrderPersisting(true);
      try {
        const response = await fetch("/api/drafts/images/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folderPath: normalizedFolderPath,
            orderedPaths,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to save image order.");
        }
      } catch (err) {
        setError((err as Error).message);
        if (currentPathRef.current === normalizedFolderPath) {
          refreshEntries(normalizedFolderPath);
        }
        throw err;
      } finally {
        setImageOrderPersisting(false);
      }
    },
    [refreshEntries]
  );

  const persistImageOrder = useCallback(
    async (orderedPaths: string[]) => {
      const normalizedCurrentPath = String(currentPath || "").trim();
      if (!normalizedCurrentPath) return;
      try {
        await persistImageOrderForFolder(normalizedCurrentPath, orderedPaths);
      } catch {
        // Error state is already handled in persistImageOrderForFolder.
      }
    },
    [currentPath, persistImageOrderForFolder]
  );

  const completedSpuPathsInSelectedRun = useMemo(() => {
    const run = String(selectedFolder || "").trim();
    if (!run) return [] as string[];
    return Array.from(completedSpuFolders)
      .map((pathValue) => String(pathValue || "").trim())
      .filter((pathValue) => pathValue.startsWith(`${run}/`))
      .filter((pathValue) => pathValue.split("/").filter(Boolean).length === 2)
      .sort((left, right) => left.localeCompare(right));
  }, [completedSpuFolders, selectedFolder]);

  const runImageClassifierTaggingForFolder = useCallback(
    async ({
      folderPath,
      imagePaths,
      spu,
      variantHints,
    }: {
      folderPath: string;
      imagePaths: string[];
      spu?: string;
      variantHints?: string[];
    }) => {
      const normalizedImages = imagePaths
        .map((pathValue) => String(pathValue || "").trim())
        .filter(Boolean)
        .filter((pathValue) => !/\(\s*DIGI\s*\)/i.test(extractFileNameFromPath(pathValue)));
      if (normalizedImages.length === 0) {
        return { failures: [] as string[], applied: 0 };
      }

      const response = await fetch("/api/drafts/images/tag-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderPath,
          imagePaths: normalizedImages,
          spu: String(spu || "").trim(),
          variantHints: Array.isArray(variantHints) ? variantHints : [],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to classify images.");
      }

      const decisions = Array.isArray(payload?.decisions)
        ? (payload.decisions as Array<Record<string, unknown>>)
        : [];

      const decisionRows = decisions
        .map((row) => {
          const confidenceRaw = Number(row.confidence);
          return {
            path: String(row.path || "").trim(),
            tag: String(row.primary_tag || "").trim().toUpperCase(),
            confidence:
              Number.isFinite(confidenceRaw) && confidenceRaw >= 0
                ? confidenceRaw
                : null,
          };
        })
        .filter(
          (
            row
          ): row is {
            path: string;
            tag: ImageTagOption;
            confidence: number | null;
          } =>
            Boolean(row.path) &&
            (row.tag === "MAIN" ||
              row.tag === "ENV" ||
              row.tag === "VAR" ||
              row.tag === "INF" ||
              row.tag === "DIGI")
        );

      const mainCandidates = decisionRows
        .filter((row) => row.tag === "MAIN")
        .sort((left, right) => {
          const leftConfidence = left.confidence ?? -1;
          const rightConfidence = right.confidence ?? -1;
          return rightConfidence - leftConfidence;
        });
      const primaryMainPath = mainCandidates[0]?.path ?? "";

      const assignments = decisionRows
        .filter((row) => row.tag !== "MAIN" || row.path === primaryMainPath)
        .map((row) => ({
          path: row.path,
          tag: row.tag,
        }));

      const { failures, applied } = await applyTagAssignments(assignments);

      try {
        const folderEntries = await listPathEntries(folderPath);
        const folderImageEntries = folderEntries.filter(
          (entry) => entry.type === "file" && isImage(entry.name)
        );
        if (folderImageEntries.length > 1) {
          const currentOrder = folderImageEntries.map((entry) => entry.path);
          const prioritizedOrder = buildTaggedImageOrderPaths(folderImageEntries);
          const orderChanged =
            prioritizedOrder.length === currentOrder.length &&
            prioritizedOrder.some((pathValue, index) => pathValue !== currentOrder[index]);
          if (orderChanged) {
            await persistImageOrderForFolder(folderPath, prioritizedOrder);
          }
        }
      } catch (err) {
        failures.push(
          `Unable to reorder tagged images: ${
            err instanceof Error ? err.message : "unknown error"
          }`
        );
      }
      return { failures, applied };
    },
    [applyTagAssignments, isImage, listPathEntries, persistImageOrderForFolder]
  );

  const handleRunImageClassifierTagging = useCallback(async () => {
    if (!currentPath || tagImagesRunning || bulkImageActionPending || tagAllImagesRunning) {
      return;
    }
    const pathAtStart = String(currentPath || "");

    const targets = entries
      .filter(
        (entry) =>
          entry.type === "file" &&
          isImage(entry.name) &&
          !isDigiTaggedImageName(entry.name)
      )
      .map((entry) => entry.path);
    if (targets.length === 0) return;

    clearSelectedFilesForImageActions();
    setError(null);
    setTagImagesRunningPaths((prev) => {
      const next = new Set(prev);
      next.add(pathAtStart);
      return next;
    });

    try {
      const pathParts = pathAtStart.split("/").filter(Boolean);
      const currentSpu = pathParts.length >= 2 ? pathParts[1] : "";
      const variantHints = currentSpu
        ? await collectVariantHintsForSpu(currentSpu)
        : [];

      const { failures } = await runImageClassifierTaggingForFolder({
        folderPath: pathAtStart,
        imagePaths: targets,
        spu: currentSpu,
        variantHints,
      });

      if (currentPathRef.current === pathAtStart) {
        await refreshEntries(pathAtStart);
      }

      if (failures.length > 0) {
        setError(
          `Classifier tagged images with ${failures.length} rename issue(s): ${failures
            .slice(0, 2)
            .join("; ")}${failures.length > 2 ? "..." : ""}`
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTagImagesRunningPaths((prev) => {
        if (!prev.has(pathAtStart)) return prev;
        const next = new Set(prev);
        next.delete(pathAtStart);
        return next;
      });
      clearSelectedFilesForImageActions();
    }
  }, [
    bulkImageActionPending,
    clearSelectedFilesForImageActions,
    collectVariantHintsForSpu,
    currentPath,
    entries,
    isImage,
    refreshEntries,
    runImageClassifierTaggingForFolder,
    setTagImagesRunningPaths,
    tagAllImagesRunning,
    tagImagesRunning,
  ]);

  const handleTagAllImagesForCompletedSpuFolders = useCallback(async () => {
    if (
      !selectedFolder ||
      tagAllImagesRunning ||
      tagImagesRunning ||
      bulkImageActionPending
    ) {
      return;
    }

    const targets = completedSpuPathsInSelectedRun;
    if (targets.length === 0) {
      setError("No completed SPU folders were found for this run.");
      return;
    }

    clearSelectedFilesForImageActions();
    setError(null);
    setTagAllImagesRunning(true);

    try {
      let processedFolders = 0;
      let totalFailures = 0;
      const failureMessages: string[] = [];

      for (const spuPath of targets) {
        const pathParts = spuPath.split("/").filter(Boolean);
        const spu = pathParts.length >= 2 ? pathParts[1] : "";
        try {
          const folderEntries = await listPathEntries(spuPath);
          const imagePaths = folderEntries
            .filter(
              (entry) =>
                entry.type === "file" &&
                isImage(entry.name) &&
                !isDigiTaggedImageName(entry.name)
            )
            .map((entry) => entry.path);
          if (imagePaths.length === 0) continue;

          processedFolders += 1;
          const variantHints = spu ? await collectVariantHintsForSpu(spu) : [];
          const { failures } = await runImageClassifierTaggingForFolder({
            folderPath: spuPath,
            imagePaths,
            spu,
            variantHints,
          });
          if (failures.length > 0) {
            totalFailures += failures.length;
            failureMessages.push(
              `${spu || spuPath}: ${failures[0]}${failures.length > 1 ? "..." : ""}`
            );
          }
        } catch (err) {
          totalFailures += 1;
          failureMessages.push(
            `${spu || spuPath}: ${
              err instanceof Error ? err.message : "Unable to tag images."
            }`
          );
        }
      }

      if (
        currentPath &&
        currentPath.startsWith(`${selectedFolder}/`)
      ) {
        await refreshEntries(currentPath);
      }

      if (processedFolders === 0) {
        setError("No direct images were found in completed SPU folders.");
      } else if (totalFailures > 0) {
        setError(
          `Tag All Images finished with ${totalFailures} issue(s): ${failureMessages
            .slice(0, 3)
            .join("; ")}${failureMessages.length > 3 ? "..." : ""}`
        );
      }
    } finally {
      setTagAllImagesRunning(false);
      clearSelectedFilesForImageActions();
    }
  }, [
    bulkImageActionPending,
    clearSelectedFilesForImageActions,
    collectVariantHintsForSpu,
    completedSpuPathsInSelectedRun,
    currentPath,
    isImage,
    listPathEntries,
    refreshEntries,
    runImageClassifierTaggingForFolder,
    selectedFolder,
    tagAllImagesRunning,
    tagImagesRunning,
  ]);

  const getContextMenuImageTagState = useCallback(
    (tag: ImageTagOption): "none" | "some" | "all" => {
      if (!contextMenu?.image) return "none";
      const targets = resolveContextActionTargets(contextMenu.entry, {
        imageOnly: true,
      });
      if (targets.length === 0) return "none";
      const taggedCount = targets.reduce((count, sourceEntry) => {
        const entry = entryByPath.get(sourceEntry.path) ?? sourceEntry;
        const tags = extractImageTagsFromFileName(entry.name);
        return tags.includes(tag) ? count + 1 : count;
      }, 0);
      if (taggedCount === 0) return "none";
      if (taggedCount === targets.length) return "all";
      return "some";
    },
    [contextMenu, entryByPath, resolveContextActionTargets]
  );
  const contextMenuLiveEntry = contextMenu
    ? entryByPath.get(contextMenu.entry.path) ?? contextMenu.entry
    : null;
  const contextMenuUpscaleDisabled =
    contextMenuLiveEntry &&
    contextMenuLiveEntry.type === "file" &&
    isImage(contextMenuLiveEntry.name)
      ? isImageEntryUpscaled(contextMenuLiveEntry)
      : false;
  const contextMenuMoveToMainPath = useMemo(() => {
    if (!contextMenu?.image) return "";
    const targets = resolveContextActionTargets(contextMenu.entry, {
      imageOnly: true,
    });
    const anchorPath = String(targets[0]?.path || contextMenu.entry.path || "").trim();
    const parts = anchorPath.split("/").filter(Boolean);
    if (parts.length < 2) return "";
    return `${parts[0]}/${parts[1]}`;
  }, [contextMenu, resolveContextActionTargets]);
  const contextMenuMoveToMainSourcePaths = useMemo(() => {
    if (!contextMenu?.image || !contextMenuMoveToMainPath) {
      return [] as string[];
    }
    const targets = resolveContextActionTargets(contextMenu.entry, {
      imageOnly: true,
    });
    if (targets.length === 0) return [] as string[];
    return Array.from(
      new Set(
        targets
          .map((sourceEntry) => String(sourceEntry.path || "").trim())
          .filter((pathValue) => Boolean(pathValue))
          .filter((pathValue) => {
            const slashIndex = pathValue.lastIndexOf("/");
            if (slashIndex <= 0) return false;
            const parentPath = pathValue.slice(0, slashIndex);
            return parentPath !== contextMenuMoveToMainPath;
          })
      )
    );
  }, [contextMenu, contextMenuMoveToMainPath, resolveContextActionTargets]);
  const contextMenuMoveToMainDisabled =
    movingEntry || contextMenuMoveToMainSourcePaths.length === 0;

  const handleContextMenuAction = (action: string) => {
    if (!contextMenu) return;
    const { entry } = contextMenu;
    if (action.startsWith("tag-image-toggle:")) {
      const tag = action.slice("tag-image-toggle:".length).trim().toUpperCase();
      if (
        tag === "MAIN" ||
        tag === "ENV" ||
        tag === "VAR" ||
        tag === "INF" ||
        tag === "DIGI"
      ) {
        const targets = resolveContextActionTargets(entry, { imageOnly: true });
        restoreSelectionAfterContextAction(targets);
        void handleToggleImageTag(targets, tag);
      }
      return;
    }
    setContextMenu(null);
    setContextMenuSubmenu(null);
    setContextMenuNestedSubmenu(null);
    if (action.startsWith("tag-image:")) {
      const tag = action.slice("tag-image:".length).trim().toUpperCase();
      if (
        tag === "MAIN" ||
        tag === "ENV" ||
        tag === "VAR" ||
        tag === "INF" ||
        tag === "DIGI"
      ) {
        const targets = resolveContextActionTargets(entry, { imageOnly: true });
        restoreSelectionAfterContextAction(targets);
        void handleApplyImageTag(targets, tag);
        return;
      }
    }
    if (action === "open") {
      clearSelectedFilesForImageActions();
      openEntry(entry);
      return;
    }
    if (action === "move-to-main") {
      if (!contextMenuMoveToMainPath) {
        setError("Main folder could not be resolved for this product.");
        return;
      }
      if (contextMenuMoveToMainSourcePaths.length === 0) {
        setError("Selected image(s) are already in Main.");
        return;
      }
      const targets = resolveContextActionTargets(entry, { imageOnly: true });
      restoreSelectionAfterContextAction(targets);
      void handleMoveEntriesToFolder(
        contextMenuMoveToMainSourcePaths,
        contextMenuMoveToMainPath
      );
      return;
    }
    if (action === "download") {
      clearSelectedFilesForImageActions();
      downloadEntry(entry);
      return;
    }
    if (action === "view") {
      clearSelectedFilesForImageActions();
      handleOpenFileViewer(entry);
      return;
    }
    if (action === "create-copy") {
      const targets = resolveContextActionTargets(entry);
      restoreSelectionAfterContextAction(targets);
      void handleCreateCopiesForEntries(targets);
      return;
    }
    if (action === "copy-to-clipboard") {
      if (entry.type === "file" && isImage(entry.name)) {
        clearSelectedFilesForImageActions();
        void handleCopyImageToClipboard(entry);
      }
      return;
    }
    if (action === "undo-last-change") {
      const targets = resolveContextActionTargets(entry, { imageOnly: true });
      if (targets.length > 0) {
        restoreSelectionAfterContextAction(targets);
        void handleUndoLastChangeForEntries(targets);
      }
      return;
    }
    if (action === "photopea") {
      clearSelectedFilesForImageActions();
      void openPhotopeaEditor(entry);
      return;
    }
    if (action === "ai-auto-center-white") {
      const targets = resolveContextActionTargets(entry, { imageOnly: true });
      if (targets.length > 0) {
        restoreSelectionAfterContextAction(targets);
        startAiEditForEntries(targets, "zimage", "auto_center_white");
      }
      return;
    }
    if (action === "ai-chatgpt-template") {
      const targets = resolveContextActionTargets(entry, { imageOnly: true });
      if (targets.length > 0) {
        restoreSelectionAfterContextAction(targets);
        startAiEditForEntries(targets, "chatgpt", "template");
      }
      return;
    }
	    if (action.startsWith("ai-chatgpt-digideal-main")) {
	      const targets = resolveContextActionTargets(entry, { imageOnly: true });
	      if (targets.length > 0) {
          restoreSelectionAfterContextAction(targets);
          const countRaw = action.includes(":") ? action.split(":").pop() : undefined;
          const outputCount = countRaw ? Number(countRaw) : 1;
          startAiTemplatePresetForEntries(
            targets,
            "chatgpt",
            "digideal_main",
            Number.isFinite(outputCount)
              ? Math.max(1, Math.min(3, Math.floor(outputCount)))
              : 1
          );
	      }
	      return;
	    }
	    if (action.startsWith("ai-chatgpt-product-scene")) {
	      const targets = resolveContextActionTargets(entry, { imageOnly: true });
	      if (targets.length > 0) {
          restoreSelectionAfterContextAction(targets);
	        setError(null);
          const countRaw = action.includes(":") ? action.split(":").pop() : undefined;
          const outputCount = countRaw ? Number(countRaw) : 1;
	        void runAiEditsForEntries(targets, "chatgpt", "template", "", {
	          templatePreset: "product_scene",
            outputCount: Number.isFinite(outputCount) ? Math.max(1, Math.min(3, Math.floor(outputCount))) : 1,
	        });
	      }
	      return;
	    }
    if (action === "ai-chatgpt-direct") {
      const targets = resolveContextActionTargets(entry, { imageOnly: true });
      if (targets.length > 0) {
        restoreSelectionAfterContextAction(targets);
        startAiEditForEntries(targets, "chatgpt", "direct");
      }
      return;
    }
    if (action === "ai-gemini-template") {
      const targets = resolveContextActionTargets(entry, { imageOnly: true });
      if (targets.length > 0) {
        restoreSelectionAfterContextAction(targets);
        startAiEditForEntries(targets, "gemini", "template");
      }
      return;
    }
	    if (action.startsWith("ai-gemini-digideal-main")) {
	      const targets = resolveContextActionTargets(entry, { imageOnly: true });
	      if (targets.length > 0) {
          restoreSelectionAfterContextAction(targets);
          const countRaw = action.includes(":") ? action.split(":").pop() : undefined;
          const outputCount = countRaw ? Number(countRaw) : 1;
          startAiTemplatePresetForEntries(
            targets,
            "gemini",
            "digideal_main",
            Number.isFinite(outputCount)
              ? Math.max(1, Math.min(3, Math.floor(outputCount)))
              : 1
          );
	      }
	      return;
	    }
	    if (action.startsWith("ai-gemini-product-scene")) {
	      const targets = resolveContextActionTargets(entry, { imageOnly: true });
	      if (targets.length > 0) {
          restoreSelectionAfterContextAction(targets);
	        setError(null);
          const countRaw = action.includes(":") ? action.split(":").pop() : undefined;
          const outputCount = countRaw ? Number(countRaw) : 1;
	        void runAiEditsForEntries(targets, "gemini", "template", "", {
	          templatePreset: "product_scene",
            outputCount: Number.isFinite(outputCount) ? Math.max(1, Math.min(3, Math.floor(outputCount))) : 1,
	        });
	      }
	      return;
	    }
    if (action === "ai-gemini-direct") {
      const targets = resolveContextActionTargets(entry, { imageOnly: true });
      if (targets.length > 0) {
        restoreSelectionAfterContextAction(targets);
        startAiEditForEntries(targets, "gemini", "direct");
      }
      return;
    }
    if (action === "ai-zimage-white") {
      const targets = resolveContextActionTargets(entry, { imageOnly: true });
      if (targets.length > 0) {
        restoreSelectionAfterContextAction(targets);
        startAiEditForEntries(targets, "zimage", "white_background");
      }
      return;
    }
    if (action === "ai-zimage-eraser") {
      const targets = resolveContextActionTargets(entry, { imageOnly: true });
      if (targets.length > 0) {
        restoreSelectionAfterContextAction(targets);
        startAiEditForEntries(targets, "zimage", "eraser");
      }
      return;
    }
    if (action === "ai-zimage-direct") {
      const targets = resolveContextActionTargets(entry, { imageOnly: true });
      if (targets.length > 0) {
        restoreSelectionAfterContextAction(targets);
        startAiEditForEntries(targets, "zimage", "direct");
      }
      return;
    }
    if (action === "ai-zimage-upscale") {
      if (contextMenuUpscaleDisabled) {
        setError("Z-image upscale has already been applied to this image.");
        return;
      }
      const targets = resolveContextActionTargets(entry, { imageOnly: true });
      if (targets.length > 0) {
        restoreSelectionAfterContextAction(targets);
        startAiEditForEntries(targets, "zimage", "upscale");
      }
      return;
    }
    if (action === "ai-review" && pendingAiEditsByOriginal[entry.path]) {
      clearSelectedFilesForImageActions();
      setAiReviewOriginalPath(entry.path);
      return;
    }
    setError(`Unknown action "${action}".`);
  };

  const renderFolderTreeNode = (
    node: DraftFolderTreeNode,
    ancestorHasNext: boolean[],
    isLast: boolean
  ) => {
    const isCurrent = currentPath === node.path;
    const isCompleted = completedSpuFolders.has(node.path);
    const isCollapsed = collapsedTreeFolders.has(node.path);
    const isSelected = selectedTreeFolders.has(node.path);
    const isDropTarget = folderDropTargetPath === node.path;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.path}>
        <div
          className={mergeClasses(
            styles.folderTreeRow,
            isCurrent ? styles.folderTreeRowActive : undefined,
            isCompleted ? styles.folderTreeRowCompleted : undefined,
            isDropTarget ? styles.folderTreeRowDrop : undefined
          )}
          onClick={() => setCurrentPath(node.path)}
          onDragOver={(event) => {
            if (draggingEntryPaths.length === 0) return;
            event.stopPropagation();
            event.preventDefault();
            setFolderDropTargetPath(node.path);
          }}
          onDragLeave={(event) => {
            event.stopPropagation();
            if (folderDropTargetPath === node.path) {
              setFolderDropTargetPath(null);
            }
          }}
          onDrop={(event) => {
            event.stopPropagation();
            event.preventDefault();
            const draggedPaths = readDraggedPaths(event.dataTransfer);
            if (draggedPaths.length === 0) return;
            if (
              draggedPaths.every(
                (draggedPath) =>
                  draggedPath === node.path || node.path.startsWith(`${draggedPath}/`)
              )
            ) {
              setFolderDropTargetPath(null);
              setDraggingEntryPaths([]);
              return;
            }
            handleMoveEntriesToFolder(draggedPaths, node.path);
          }}
        >
          <span className={styles.folderTreeConnector} aria-hidden="true">
            {ancestorHasNext.map((hasNext, index) => (
              <span
                key={`${node.path}-segment-${index}`}
                className={styles.folderTreeConnectorSegment}
              >
                {hasNext ? <span className={styles.folderTreeConnectorLine} /> : null}
              </span>
            ))}
            <span className={styles.folderTreeConnectorJoin}>
              <span
                className={styles.folderTreeConnectorJoinVertical}
                style={isLast ? { top: 0, bottom: "8px" } : { top: 0, bottom: 0 }}
              />
              <span className={styles.folderTreeConnectorJoinHorizontal} />
            </span>
          </span>
          {hasChildren ? (
            <button
              type="button"
              className={styles.folderTreeCaretButton}
              onClick={(event) => {
                event.stopPropagation();
                toggleTreeFolder(node.path);
              }}
              aria-label={isCollapsed ? "Expand folder" : "Collapse folder"}
            >
              {isCollapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span className={styles.folderTreeCaretSpacer} aria-hidden="true" />
          )}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(event) => {
              event.stopPropagation();
              handleToggleTreeFolder(node.path);
            }}
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            className={styles.folderTreeName}
            onClick={(event) => {
              event.stopPropagation();
              setCurrentPath(node.path);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className={styles.folderTreeFolderIcon}
            >
              <path
                fill="currentColor"
                d="M9.5 4h-5A2.5 2.5 0 0 0 2 6.5v11A2.5 2.5 0 0 0 4.5 20h15A2.5 2.5 0 0 0 22 17.5v-9A2.5 2.5 0 0 0 19.5 6H12l-2-2.5A2.5 2.5 0 0 0 9.5 4Z"
              />
            </svg>
            <span className={styles.folderTreeNameText}>{node.name}</span>
            {node.fileCount > 0 ? (
              <span className={styles.folderTreeCount}>({node.fileCount})</span>
            ) : null}
          </button>
        </div>
        {!isCollapsed && hasChildren ? (
          <div className={styles.folderTreeChildren}>
            {node.children.map((child, index) =>
              renderFolderTreeNode(
                child,
                [...ancestorHasNext, !isLast],
                index === node.children.length - 1
              )
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const imageEntries = entries.filter(
    (entry) => entry.type === "file" && isImage(entry.name)
  );

  const normalizeFolderToken = useCallback(
    (value: string) => String(value || "").toLowerCase().replace(/[\s_-]+/g, ""),
    []
  );

  const isVariantImagesFolderName = useCallback(
    (name: string) => {
      const normalized = normalizeFolderToken(name);
      if (!normalized) return false;
      if (normalized === "variants" || normalized === "variant") return true;
      if (normalized === "variantimages" || normalized === "variantimage") return true;
      return normalized.includes("variant") && normalized.includes("image");
    },
    [normalizeFolderToken]
  );

  const isOcrImagesFolderName = useCallback(
    (name: string) => {
      const normalized = normalizeFolderToken(name);
      if (!normalized) return false;
      if (normalized === "ocrchinese" || normalized === "ocr") return true;
      return normalized.includes("ocr") && normalized.includes("chinese");
    },
    [normalizeFolderToken]
  );

  const isOtherImagesFolderName = useCallback(
    (name: string) => {
      const normalized = normalizeFolderToken(name);
      if (!normalized) return false;
      if (
        normalized === "other" ||
        normalized === "others" ||
        normalized === "otherimage" ||
        normalized === "otherimages" ||
        normalized === "nonsquare"
      ) {
        return true;
      }
      return normalized.includes("otherimages");
    },
    [normalizeFolderToken]
  );

  const isRejectVariantMismatchFolderName = useCallback(
    (name: string) => {
      const normalized = normalizeFolderToken(name);
      if (!normalized) return false;
      if (normalized.includes("variantmismatch")) return true;
      return (
        normalized.includes("rejectvariant") && normalized.includes("mismatch")
      );
    },
    [normalizeFolderToken]
  );

  const isLegacyOthersFolderName = useCallback(
    (name: string) => {
      const normalized = normalizeFolderToken(name);
      if (!normalized) return false;

      const rejectBadComposite =
        normalized === "rejectbadcomposite" ||
        (normalized.includes("reject") &&
          normalized.includes("bad") &&
          normalized.includes("composite"));

      const rejectNotSuitable =
        normalized === "rejectnotsuitable" ||
        (normalized.includes("reject") && normalized.includes("notsuitable")) ||
        (normalized.includes("reject") &&
          normalized.includes("not") &&
          normalized.includes("suitable"));

      const rejectVariant =
        (normalized === "rejectvariant" ||
          (normalized.includes("reject") && normalized.includes("variant"))) &&
        !isRejectVariantMismatchFolderName(name);

      return rejectBadComposite || rejectNotSuitable || rejectVariant;
    },
    [isRejectVariantMismatchFolderName, normalizeFolderToken]
  );

  const imageTabTargets = useMemo(() => {
    if (!currentPath) {
      return {
        mainPath: null as string | null,
        variantsPath: null as string | null,
        ocrPath: null as string | null,
        othersPath: null as string | null,
        othersPaths: [] as string[],
        active: null as ImageFolderTabValue | null,
      };
    }

    const parts = currentPath.split("/").filter(Boolean);
    if (parts.length < 2) {
      return {
        mainPath: null,
        variantsPath: null,
        ocrPath: null,
        othersPath: null,
        othersPaths: [] as string[],
        active: null,
      };
    }

    const run = parts[0];
    const top = parts[1];
    if (!run || !top || isChunksDirectory(top)) {
      return {
        mainPath: null,
        variantsPath: null,
        ocrPath: null,
        othersPath: null,
        othersPaths: [] as string[],
        active: null,
      };
    }

    const mainPath = `${run}/${top}`;
    let variantsPath: string | null = null;
    let ocrPath: string | null = null;
    let othersPath: string | null = null;
    let othersPaths: string[] = [];

    const findNodeByPath = (
      node: DraftFolderTreeNode,
      targetPath: string
    ): DraftFolderTreeNode | null => {
      if (node.path === targetPath) return node;
      for (const child of node.children) {
        const hit = findNodeByPath(child, targetPath);
        if (hit) return hit;
      }
      return null;
    };

    const findVariantNode = (
      node: DraftFolderTreeNode
    ): DraftFolderTreeNode | null => {
      const findFirstMatchingNode = (
        predicate: (child: DraftFolderTreeNode) => boolean
      ) => {
        const directMatch = node.children.find((child) => predicate(child));
        if (directMatch) return directMatch;
        const queue = [...node.children];
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) break;
          if (predicate(next)) return next;
          queue.push(...next.children);
        }
        return null;
      };

      const direct = findFirstMatchingNode((child) =>
        isVariantImagesFolderName(child.name)
      );
      if (direct) return direct;
      const fallback = findFirstMatchingNode((child) =>
        normalizeFolderToken(child.name).includes("variant")
      );
      if (fallback) return fallback;
      return null;
    };

    const findOcrNode = (node: DraftFolderTreeNode): DraftFolderTreeNode | null => {
      const queue = [...node.children];
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) break;
        if (isOcrImagesFolderName(next.name)) return next;
        queue.push(...next.children);
      }
      return null;
    };

    const findOtherNodes = (
      node: DraftFolderTreeNode
    ): DraftFolderTreeNode[] => {
      const hits: DraftFolderTreeNode[] = [];
      const queue = [...node.children];
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) break;
        if (
          !isRejectVariantMismatchFolderName(next.name) &&
          (isOtherImagesFolderName(next.name) ||
            isLegacyOthersFolderName(next.name))
        ) {
          hits.push(next);
        }
        queue.push(...next.children);
      }
      return hits;
    };

    if (folderTree) {
      const mainNode = findNodeByPath(folderTree, mainPath);
      if (mainNode) {
        const variantNode = findVariantNode(mainNode);
        variantsPath = variantNode?.path ?? null;
        const ocrNode = findOcrNode(mainNode);
        ocrPath = ocrNode?.path ?? null;
        const otherNodes = findOtherNodes(mainNode);
        othersPaths = Array.from(
          new Set(
            otherNodes
              .map((node) => String(node.path || "").trim())
              .filter((value) => Boolean(value))
          )
        );
        othersPath = othersPaths[0] ?? null;
      }
    }

    let active: ImageFolderTabValue | null = null;
    if (
      variantsPath &&
      (currentPath === variantsPath || currentPath.startsWith(`${variantsPath}/`))
    ) {
      active = "variants";
    } else if (
      ocrPath &&
      (currentPath === ocrPath || currentPath.startsWith(`${ocrPath}/`))
    ) {
      active = "ocr";
    } else if (
      othersPaths.some(
        (pathValue) =>
          currentPath === pathValue || currentPath.startsWith(`${pathValue}/`)
      )
    ) {
      active = "others";
    } else if (currentPath === mainPath || currentPath.startsWith(`${mainPath}/`)) {
      active = "main";
    }

    return { mainPath, variantsPath, ocrPath, othersPath, othersPaths, active };
  }, [
    currentPath,
    folderTree,
    isLegacyOthersFolderName,
    isOcrImagesFolderName,
    isOtherImagesFolderName,
    isRejectVariantMismatchFolderName,
    isChunksDirectory,
    isVariantImagesFolderName,
    normalizeFolderToken,
  ]);

  const countImagesInEntryList = useCallback(
    (items: DraftEntry[]) =>
      items.reduce(
        (count, item) =>
          item.type === "file" && isImage(item.name) ? count + 1 : count,
        0
      ),
    [isImage]
  );

  const countImagesForPath = useCallback(
    async (pathValue: string | null) => {
      const normalizedPath = String(pathValue || "").trim();
      if (!normalizedPath) return 0;
      if (normalizedPath === currentPath) {
        return countImagesInEntryList(entries);
      }
      try {
        const items = await listPathEntries(normalizedPath);
        return countImagesInEntryList(items);
      } catch {
        return 0;
      }
    },
    [countImagesInEntryList, currentPath, entries, listPathEntries]
  );

  useEffect(() => {
    let cancelled = false;

    const loadImageTabCounts = async () => {
      const uniqueOthersPaths = Array.from(
        new Set(
          imageTabTargets.othersPaths
            .map((pathValue) => String(pathValue || "").trim())
            .filter(Boolean)
        )
      );

      const [mainDirectCount, variantsCount, ocrCount, othersCounts] =
        await Promise.all([
          countImagesForPath(imageTabTargets.mainPath),
          countImagesForPath(imageTabTargets.variantsPath),
          countImagesForPath(imageTabTargets.ocrPath),
          Promise.all(uniqueOthersPaths.map((pathValue) => countImagesForPath(pathValue))),
        ]);

      if (cancelled) return;

      const othersCount = othersCounts.reduce((total, value) => total + value, 0);
      setImageTabImageCounts({
        // Main view intentionally includes merged variant images.
        main: mainDirectCount + variantsCount,
        variants: variantsCount,
        ocr: ocrCount,
        others: othersCount,
      });
    };

    void loadImageTabCounts();
    return () => {
      cancelled = true;
    };
  }, [
    countImagesForPath,
    imageTabTargets.mainPath,
    imageTabTargets.ocrPath,
    imageTabTargets.othersPaths,
    imageTabTargets.variantsPath,
  ]);

  const mainViewShowsMergedImages =
    imageTabTargets.active === "main" && currentPath === imageTabTargets.mainPath;

  useEffect(() => {
    let cancelled = false;
    const variantsPath = mainViewShowsMergedImages
      ? imageTabTargets.variantsPath
      : null;
    if (!variantsPath) {
      setMainViewVariantImageEntries([]);
      return () => {
        cancelled = true;
      };
    }

    const loadVariantEntries = async () => {
      try {
        const items = await listPathEntries(variantsPath);
        if (cancelled) return;
        const variantImages = items.filter(
          (entry) => entry.type === "file" && isImage(entry.name)
        );
        setMainViewVariantImageEntries(variantImages);
      } catch {
        if (!cancelled) {
          setMainViewVariantImageEntries([]);
        }
      }
    };

    void loadVariantEntries();
    return () => {
      cancelled = true;
    };
  }, [
    entries,
    imageTabTargets.variantsPath,
    isImage,
    listPathEntries,
    mainViewShowsMergedImages,
  ]);

  const displayImageEntries = useMemo(() => {
    const combined: DraftEntry[] = [];
    const seenPaths = new Set<string>();

    const pushUnique = (entry: DraftEntry) => {
      if (seenPaths.has(entry.path)) return;
      seenPaths.add(entry.path);
      combined.push(entry);
    };

    imageEntries.forEach(pushUnique);
    if (mainViewShowsMergedImages) {
      mainViewVariantImageEntries.forEach(pushUnique);
    }

    if (combined.length <= 1) return combined;

    const variantPath = String(imageTabTargets.variantsPath || "").trim();
    const variantPathPrefix = variantPath ? `${variantPath}/` : "";
    const regular: DraftEntry[] = [];
    const variantTail: DraftEntry[] = [];

    combined.forEach((entry) => {
      const tags = extractImageTagsFromFileName(entry.name);
      const taggedVariant = tags.includes("VAR");
      const fromVariantFolder =
        variantPath &&
        (entry.path === variantPath || entry.path.startsWith(variantPathPrefix));
      if (taggedVariant || fromVariantFolder) {
        variantTail.push(entry);
      } else {
        regular.push(entry);
      }
    });

    return [...regular, ...variantTail];
  }, [
    imageEntries,
    imageTabTargets.variantsPath,
    mainViewShowsMergedImages,
    mainViewVariantImageEntries,
  ]);

  useEffect(() => {
    displayImageEntriesRef.current = displayImageEntries;
  }, [displayImageEntries]);

  const currentSpuMainPath = imageTabTargets.mainPath;
  const currentMainProductContext = useMemo(() => {
    const parts = String(currentSpuMainPath || "").split("/").filter(Boolean);
    if (parts.length < 2) {
      return { run: "", spu: "" };
    }
    return { run: parts[0], spu: parts[1] };
  }, [currentSpuMainPath]);
  const currentSpuMarkedCompleted = currentSpuMainPath
    ? completedSpuFolders.has(currentSpuMainPath)
    : false;
  const confirmablePendingAiPaths = useMemo(() => {
    if (!mainViewShowsMergedImages) return [] as string[];
    const unique = new Set<string>();
    displayImageEntries.forEach((entry) => {
      if (pendingAiEditsByOriginal[entry.path]) {
        unique.add(entry.path);
      }
    });
    return Array.from(unique);
  }, [displayImageEntries, mainViewShowsMergedImages, pendingAiEditsByOriginal]);

  const handleToggleCurrentSpuCompleted = useCallback(() => {
    if (!currentSpuMainPath) return;
    setCompletedSpuFolders((prev) => {
      const next = new Set(prev);
      if (next.has(currentSpuMainPath)) {
        next.delete(currentSpuMainPath);
      } else {
        next.add(currentSpuMainPath);
      }
      return next;
    });
  }, [currentSpuMainPath]);

  const handleDeleteCurrentProduct = useCallback(async () => {
    if (deleteProductPending) return;
    if (!mainViewShowsMergedImages) return;

    const run = String(currentMainProductContext.run || "").trim();
    const spu = String(currentMainProductContext.spu || "").trim();
    const spuMainPath = run && spu ? `${run}/${spu}` : "";
    if (!run || !spu || !spuMainPath) return;

    const confirmed = window.confirm(
      [
        `Delete product ${spu}?`,
        "",
        "This will permanently delete:",
        `- ${spuMainPath} and all subfolders`,
        "- related draft SPU and SKU rows",
        "",
        "This cannot be undone.",
      ].join("\n")
    );
    if (!confirmed) return;

    setDeleteProductPending(true);
    setError(null);
    setDraftError(null);
    try {
      const response = await fetch(
        `/api/drafts/folders/${encodeURIComponent(run)}/cleanup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spus: [spu] }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to delete this product.");
      }

      setCompletedSpuFolders((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        Array.from(next).forEach((pathValue) => {
          if (pathValue === spuMainPath || pathValue.startsWith(`${spuMainPath}/`)) {
            next.delete(pathValue);
          }
        });
        return next;
      });
      setSelectedTreeFolders((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        Array.from(next).forEach((pathValue) => {
          if (pathValue === spuMainPath || pathValue.startsWith(`${spuMainPath}/`)) {
            next.delete(pathValue);
          }
        });
        return next;
      });
      setCollapsedTreeFolders((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        Array.from(next).forEach((pathValue) => {
          if (pathValue === spuMainPath || pathValue.startsWith(`${spuMainPath}/`)) {
            next.delete(pathValue);
          }
        });
        return next;
      });
      setMainViewVariantImageEntries([]);
      setSelectedFiles(new Set());
      setSelectedSpus(new Set());
      setSelectedSkus(new Set());
      setPreviewPath(null);

      const nextPath = run;
      setCurrentPath(nextPath);
      await Promise.all([fetchSpuRows(), fetchSkuRows(), fetchFolderTree(run)]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to delete this product.";
      setError(message);
      setDraftError(message);
    } finally {
      setDeleteProductPending(false);
    }
  }, [
    currentMainProductContext.run,
    currentMainProductContext.spu,
    deleteProductPending,
    fetchFolderTree,
    fetchSkuRows,
    fetchSpuRows,
    mainViewShowsMergedImages,
  ]);

  const handleConfirmCurrentProductAiEdits = useCallback(async () => {
    if (confirmAiEditsPending) return;
    if (!mainViewShowsMergedImages) return;
    if (confirmablePendingAiPaths.length === 0) return;

    const confirmed = window.confirm(
      [
        `Confirm ${confirmablePendingAiPaths.length} pending AI edit${
          confirmablePendingAiPaths.length === 1 ? "" : "s"
        }?`,
        "",
        "This will replace the original images with the pending AI versions and discard the old pending files.",
      ].join("\n")
    );
    if (!confirmed) return;

    const pendingPaths = [...confirmablePendingAiPaths];
    const refreshedScoreByPath = new Map<string, number | null>();
    const failures: string[] = [];
    const pathAtStart = String(currentPathRef.current || "");

    setConfirmAiEditsPending(true);
    setConfirmingAiEditPaths(new Set(pendingPaths));
    setAiReviewOriginalPath(null);
    setError(null);

    try {
      for (const originalPath of pendingPaths) {
        try {
          const response = await fetch("/api/drafts/ai-edits/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              originalPath,
              decision: "replace_with_ai",
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.error || "Unable to confirm AI edit.");
          }
          setPendingAiEditsByOriginal((prev) => {
            const next = { ...prev };
            delete next[originalPath];
            return next;
          });
          const refreshedScoresRaw = Array.isArray(payload?.refreshedScores)
            ? (payload.refreshedScores as Array<{ path?: unknown; pixelQualityScore?: unknown }>)
            : [];
          refreshedScoresRaw.forEach((row) => {
            const pathValue = String(row?.path || "").trim();
            if (!pathValue) return;
            const scoreValue =
              typeof row?.pixelQualityScore === "number" &&
              Number.isFinite(row.pixelQualityScore)
                ? Math.round(row.pixelQualityScore)
                : null;
            refreshedScoreByPath.set(pathValue, scoreValue);
          });
        } catch (err) {
          failures.push(
            `${originalPath.split("/").filter(Boolean).pop() || originalPath}: ${
              (err as Error).message
            }`
          );
        }
      }

      if (refreshedScoreByPath.size > 0) {
        const now = new Date().toISOString();
        setEntries((prev) =>
          prev.map((item) => {
            if (!refreshedScoreByPath.has(item.path)) return item;
            return {
              ...item,
              modifiedAt: now,
              pixelQualityScore: refreshedScoreByPath.get(item.path) ?? null,
            };
          })
        );
      }

      const latestPath = String(currentPathRef.current || "");
      if (pathAtStart && latestPath === pathAtStart) {
        await refreshEntries(pathAtStart);
        await fetchPendingAiEdits(pathAtStart);
      }

      if (failures.length > 0) {
        setError(
          `Confirmed ${
            pendingPaths.length - failures.length
          }/${pendingPaths.length} pending AI edits. Failed: ${failures
            .slice(0, 3)
            .join("; ")}${failures.length > 3 ? "..." : ""}`
        );
      }
    } finally {
      setConfirmingAiEditPaths(new Set());
      setConfirmAiEditsPending(false);
    }
  }, [
    confirmAiEditsPending,
    confirmablePendingAiPaths,
    fetchPendingAiEdits,
    mainViewShowsMergedImages,
    refreshEntries,
  ]);

  const reorderImagesInGrid = useCallback(
    (draggedPaths: string[], dropTargetPath: string | null) => {
      const currentImagePaths = imageEntries.map((entry) => entry.path);
      if (currentImagePaths.length <= 1) return;
      const movingPaths = draggedPaths.filter((pathValue) =>
        currentImagePaths.includes(pathValue)
      );
      if (movingPaths.length === 0) return;
      const uniqueMoving = Array.from(new Set(movingPaths));
      if (dropTargetPath && uniqueMoving.includes(dropTargetPath)) {
        return;
      }
      const remaining = currentImagePaths.filter(
        (pathValue) => !uniqueMoving.includes(pathValue)
      );
      let insertAt = remaining.length;
      if (dropTargetPath) {
        const targetIndex = remaining.indexOf(dropTargetPath);
        if (targetIndex >= 0) {
          insertAt = targetIndex;
        }
      }
      const nextImagePaths = [
        ...remaining.slice(0, insertAt),
        ...uniqueMoving,
        ...remaining.slice(insertAt),
      ];
      if (
        nextImagePaths.length !== currentImagePaths.length ||
        nextImagePaths.every((pathValue, index) => pathValue === currentImagePaths[index])
      ) {
        return;
      }

      const nextImageOrder = new Map<string, number>();
      nextImagePaths.forEach((pathValue, index) => {
        nextImageOrder.set(pathValue, index);
      });
      setEntries((prev) => {
        const dirs = prev.filter((entry) => entry.type === "dir");
        const files = prev.filter((entry) => entry.type === "file");
        const sortedFiles = [...files].sort((left, right) => {
          const leftOrder = nextImageOrder.get(left.path);
          const rightOrder = nextImageOrder.get(right.path);
          if (leftOrder !== undefined && rightOrder !== undefined) {
            return leftOrder - rightOrder;
          }
          if (leftOrder !== undefined) return -1;
          if (rightOrder !== undefined) return 1;
          return left.name.localeCompare(right.name);
        });
        return [...dirs, ...sortedFiles];
      });
      void persistImageOrder(nextImagePaths);
    },
    [imageEntries, persistImageOrder]
  );

  const selectedImageEntries = displayImageEntries.filter((entry) =>
    selectedFiles.has(entry.path)
  );
  const selectedImageUpscaleEligibleCount = selectedImageEntries.reduce(
    (count, entry) => count + (isImageEntryUpscaled(entry) ? 0 : 1),
    0
  );
  const nonImageFileEntries = entries.filter(
    (entry) => entry.type === "file" && !isImage(entry.name)
  );
  const nonImageFilesSelectedCount = nonImageFileEntries.reduce(
    (count, entry) => count + (selectedFiles.has(entry.path) ? 1 : 0),
    0
  );
  const nonImageFilesAllSelected =
    nonImageFileEntries.length > 0 &&
    nonImageFilesSelectedCount === nonImageFileEntries.length;
  const nonImageFilesSomeSelected =
    nonImageFilesSelectedCount > 0 && !nonImageFilesAllSelected;
  const mainTabDisabled =
    !imageTabTargets.mainPath || movingEntry || imageTabImageCounts.main === 0;
  const variantsTabDisabled =
    !imageTabTargets.variantsPath ||
    movingEntry ||
    imageTabImageCounts.variants === 0;
  const ocrTabDisabled =
    !imageTabTargets.ocrPath || movingEntry || imageTabImageCounts.ocr === 0;
  const othersTabDisabled =
    imageTabTargets.othersPaths.length === 0 ||
    movingEntry ||
    imageTabImageCounts.others === 0;

  useEffect(() => {
    const el = nonImageFileSelectAllRef.current;
    if (!el) return;
    el.indeterminate = nonImageFilesSomeSelected;
  }, [nonImageFilesSomeSelected]);
  const aiReviewRecord = aiReviewOriginalPath
    ? pendingAiEditsByOriginal[aiReviewOriginalPath] ?? null
    : null;
  const aiReviewOriginalScoreRaw = aiReviewRecord
    ? entryByPath.get(aiReviewRecord.originalPath)?.pixelQualityScore
    : null;
  const aiReviewOriginalScore =
    typeof aiReviewOriginalScoreRaw === "number" && Number.isFinite(aiReviewOriginalScoreRaw)
      ? Math.round(aiReviewOriginalScoreRaw)
      : null;
  const aiReviewPendingScore =
    aiReviewRecord &&
    typeof aiReviewRecord.pendingPixelQualityScore === "number" &&
    Number.isFinite(aiReviewRecord.pendingPixelQualityScore)
      ? Math.round(aiReviewRecord.pendingPixelQualityScore)
      : null;
  const aiReviewScoreDelta =
    aiReviewPendingScore !== null && aiReviewOriginalScore !== null
      ? aiReviewPendingScore - aiReviewOriginalScore
      : null;
  const displayEntryByPath = useMemo(() => {
    const next = new Map(entryByPath);
    displayImageEntries.forEach((entry) => {
      if (!next.has(entry.path)) {
        next.set(entry.path, entry);
      }
    });
    return next;
  }, [displayImageEntries, entryByPath]);
  const previewEntry = previewPath ? displayEntryByPath.get(previewPath) ?? null : null;
  const previewDimensions = previewPath ? imageDimensions[previewPath] ?? null : null;
  const previewFileName =
    previewEntry?.name ??
    (previewPath ? previewPath.split("/").filter(Boolean).pop() ?? previewPath : "");
  const previewFileSizeText =
    previewEntry && previewEntry.type === "file" ? formatSizeKb(previewEntry.size) : "-";
  const previewPendingAi = previewPath
    ? pendingAiEditsByOriginal[previewPath] ?? null
    : null;
  const previewDisplayPath = previewPendingAi?.pendingPath ?? previewPath;
  const previewDisplayModifiedAt =
    previewPendingAi?.updatedAt ??
    (previewPath ? displayEntryByPath.get(previewPath)?.modifiedAt ?? null : null);
  const previewRuntimeJob = previewPath ? aiEditJobsByPath[previewPath] ?? null : null;
  const previewNav = useMemo(() => {
    if (!previewPath) {
      return {
        index: -1,
        prevPath: null as string | null,
        nextPath: null as string | null,
        next2Path: null as string | null,
      };
    }
    const paths = displayImageEntries.map((entry) => entry.path);
    const index = paths.indexOf(previewPath);
    const prevPath = index > 0 ? paths[index - 1] ?? null : null;
    const nextPath =
      index >= 0 && index < paths.length - 1 ? paths[index + 1] ?? null : null;
    const next2Path =
      index >= 0 && index < paths.length - 2 ? paths[index + 2] ?? null : null;
    return { index, prevPath, nextPath, next2Path };
  }, [displayImageEntries, previewPath]);
  const previewBusy =
    Boolean(previewRuntimeJob) ||
    Boolean(
      previewPath &&
        (reloadingImagePaths.has(previewPath) || confirmingAiEditPaths.has(previewPath))
    );

  useEffect(() => {
    if (!previewPath) return;
    const candidates = [previewNav.nextPath, previewNav.next2Path].filter(Boolean) as string[];
    candidates.forEach((pathValue) => {
      const entry = displayEntryByPath.get(pathValue);
      const pendingAi = pendingAiEditsByOriginal[pathValue] ?? null;
      const displayPath = pendingAi?.pendingPath ?? pathValue;
      const displayModifiedAt = pendingAi?.updatedAt ?? entry?.modifiedAt;
      const img = new Image();
      img.decoding = "async";
      img.src = buildDraftDownloadUrl(displayPath, displayModifiedAt);
      // Best-effort decode to make next/next+1 swaps feel instantaneous.
      if (typeof img.decode === "function") {
        void img.decode().catch(() => undefined);
      }
    });
  }, [
    buildDraftDownloadUrl,
    displayEntryByPath,
    pendingAiEditsByOriginal,
    previewNav.next2Path,
    previewNav.nextPath,
    previewPath,
  ]);

  const handlePreviewNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (!previewPath) return;
      const target =
        direction === "prev" ? previewNav.prevPath : previewNav.nextPath;
      if (!target) return;
      setPreviewPath(target);
    },
    [previewNav.nextPath, previewNav.prevPath, previewPath]
  );

  const handlePreviewDelete = useCallback(async () => {
    if (!previewPath || !currentPath || previewDeletePending) return;
    if (pendingAiEditsByOriginal[previewPath] || aiEditJobsByPath[previewPath]) {
      setError("Resolve pending/running AI edits before deleting this image.");
      return;
    }
    const nextPreviewPath = previewNav.nextPath ?? previewNav.prevPath ?? null;
    setPreviewDeletePending(true);
    setError(null);
    try {
      const deletedImagesPath = `${currentPath}/deleted images`.replace(/\/{2,}/g, "/");
      const response = await fetch("/api/drafts/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePath: previewPath,
          targetPath: deletedImagesPath,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Delete failed.");
      }

      setEntries((prev) => prev.filter((entry) => entry.path !== previewPath));
      setMainViewVariantImageEntries((prev) =>
        prev.filter((entry) => entry.path !== previewPath)
      );
      setSelectedFiles((prev) => {
        if (!prev.has(previewPath)) return prev;
        const next = new Set(prev);
        next.delete(previewPath);
        return next;
      });
      setPendingAiEditsByOriginal((prev) => {
        if (!prev[previewPath]) return prev;
        const next: Record<string, PendingAiEditRecord> = { ...prev };
        delete next[previewPath];
        return next;
      });
      setAiEditJobsByPath((prev) => {
        if (!prev[previewPath]) return prev;
        const next: Record<string, AiEditRuntimeJob> = { ...prev };
        delete next[previewPath];
        return next;
      });
      setImageDimensions((prev) => {
        if (!prev[previewPath]) return prev;
        const next: Record<string, { width: number; height: number }> = { ...prev };
        delete next[previewPath];
        return next;
      });
      setReloadingImagePaths((prev) => {
        if (!prev.has(previewPath)) return prev;
        const next = new Set(prev);
        next.delete(previewPath);
        return next;
      });

      setPreviewPath(nextPreviewPath);
      if (selectedFolder) {
        fetchFolderTree(selectedFolder);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPreviewDeletePending(false);
    }
  }, [
    aiEditJobsByPath,
    currentPath,
    fetchFolderTree,
    pendingAiEditsByOriginal,
    previewDeletePending,
    previewNav.nextPath,
    previewNav.prevPath,
    previewPath,
    selectedFolder,
  ]);
  const aiEditHasPromptInput =
    aiEditMode === "template" || aiEditMode === "direct" || aiEditMode === "eraser";
  const aiEditProviderLabel =
    aiEditProvider === "chatgpt"
      ? "ChatGPT"
      : aiEditProvider === "gemini"
        ? "Gemini"
        : "ZImage";
  const aiEditModeLabel =
    aiEditMode === "template"
      ? aiEditTemplatePreset === "digideal_main"
        ? "DigiDL Main"
        : aiEditTemplatePreset === "product_scene"
          ? "Product Scene"
          : "Standard Template"
      : aiEditMode === "direct"
        ? "Direct"
        : aiEditMode === "white_background"
          ? "White Background"
          : aiEditMode === "auto_center_white"
            ? "Auto Center Wide"
            : aiEditMode === "eraser"
              ? "Eraser"
              : "Upscale";
  const variantsEditorAllSelected =
    variantsEditorRows.length > 0 &&
    variantsEditorRows.every((row) => variantsEditorSelectedRows.has(row.key));
  const variantsEditorSomeSelected =
    variantsEditorRows.some((row) => variantsEditorSelectedRows.has(row.key));
  const getVariantSortIndicator = (key: VariantEditorSortKey) => {
    if (variantsEditorSort.key !== key) return "";
    return variantsEditorSort.direction === "asc" ? "▲" : "▼";
  };
  const renderContextMenuIcon = (
    type:
      | "open"
      | "move-main"
      | "download"
      | "duplicate"
      | "clipboard"
      | "undo"
      | "tag"
      | "ai"
      | "photopea"
      | "focuscenter"
      | "background"
      | "eraser"
      | "upscale"
  ) => {
    if (type === "open") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.contextMenuIcon}
          aria-hidden="true"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M4 8v-2a2 2 0 0 1 2 -2h2" />
          <path d="M4 16v2a2 2 0 0 0 2 2h2" />
          <path d="M16 4h2a2 2 0 0 1 2 2v2" />
          <path d="M16 20h2a2 2 0 0 0 2 -2v-2" />
          <path d="M8 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
          <path d="M16 16l-2.5 -2.5" />
        </svg>
      );
    }
    if (type === "move-main") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.contextMenuIcon}
          aria-hidden="true"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M4 12v-6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v8" />
          <path d="M20 18h-17" />
          <path d="M6 15l-3 3l3 3" />
        </svg>
      );
    }
    if (type === "download") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.contextMenuIcon}
          aria-hidden="true"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M14 3v4a1 1 0 0 0 1 1h4" />
          <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
          <path d="M12 17v-6" />
          <path d="M9.5 14.5l2.5 2.5l2.5 -2.5" />
        </svg>
      );
    }
    if (type === "duplicate") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.contextMenuIcon}
          aria-hidden="true"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" />
          <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
        </svg>
      );
    }
    if (type === "clipboard") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.contextMenuIcon}
          aria-hidden="true"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h3m9 -9v-5a2 2 0 0 0 -2 -2h-2" />
          <path d="M13 17v-1a1 1 0 0 1 1 -1h1m3 0h1a1 1 0 0 1 1 1v1m0 3v1a1 1 0 0 1 -1 1h-1m-3 0h-1a1 1 0 0 1 -1 -1v-1" />
          <path d="M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2" />
        </svg>
      );
    }
    if (type === "undo") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.contextMenuIcon}
          aria-hidden="true"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M9 14l-4 -4l4 -4" />
          <path d="M5 10h10a4 4 0 1 1 0 8h-1" />
        </svg>
      );
    }
    if (type === "photopea") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.contextMenuIcon}
          aria-hidden="true"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3l-11 11l-4 1l1 -4l11 -11z" />
        </svg>
      );
    }
    if (type === "tag") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.contextMenuIcon}
          aria-hidden="true"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M7 7h.01" />
          <path d="M3 11l8.586 8.586a2 2 0 0 0 2.828 0l5.172 -5.172a2 2 0 0 0 0 -2.828l-8.586 -8.586h-6v6" />
        </svg>
      );
    }
    if (type === "focuscenter") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.contextMenuIcon}
          aria-hidden="true"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
          <path d="M4 8v-2a2 2 0 0 1 2 -2h2" />
          <path d="M4 16v2a2 2 0 0 0 2 2h2" />
          <path d="M16 4h2a2 2 0 0 1 2 2v2" />
          <path d="M16 20h2a2 2 0 0 0 2 -2v-2" />
        </svg>
      );
    }
    if (type === "background") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.contextMenuIcon}
          aria-hidden="true"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M4 8l4 -4" />
          <path d="M14 4l-10 10" />
          <path d="M4 20l16 -16" />
          <path d="M20 10l-10 10" />
          <path d="M20 16l-4 4" />
        </svg>
      );
    }
    if (type === "upscale") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.contextMenuIcon}
          aria-hidden="true"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M16 4l4 0l0 4" />
          <path d="M14 10l6 -6" />
          <path d="M8 20l-4 0l0 -4" />
          <path d="M4 20l6 -6" />
          <path d="M16 20l4 0l0 -4" />
          <path d="M14 14l6 6" />
          <path d="M8 4l-4 0l0 4" />
          <path d="M4 4l6 6" />
        </svg>
      );
    }
    if (type === "eraser") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.contextMenuIcon}
          aria-hidden="true"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3" />
          <path d="M18 13.3l-6.3 -6.3" />
        </svg>
      );
    }
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.contextMenuIcon}
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
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text size={700} weight="semibold">
          {t("draftExplorer.title")}
        </Text>
      </div>

      <Card className={styles.tableCard}>
        <div className={styles.draftHeader}>
          <Text size={500} weight="semibold">
            {t("draftExplorer.tableTitle")}
          </Text>
        </div>
        <div className={styles.explorerControlsRow}>
          <Input
            aria-label={t("draftExplorer.searchLabel")}
            value={searchInput}
            onChange={(_, data) => setSearchInput(data.value)}
            placeholder={t("draftExplorer.searchPlaceholder")}
            className={styles.draftSearch}
          />
          <div className={styles.explorerControlsRight}>
            <Button
              appearance={skuReady ? "outline" : "primary"}
              onClick={handleGenerateSkus}
              disabled={skuStatus === "running"}
            >
              {skuStatus === "running" ? (
                <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                  <Spinner size="tiny" />
                  {skuReady
                    ? t("draftExplorer.regenerateSkuRunning")
                    : t("draftExplorer.generateSkuRunning")}
                </span>
              ) : (
                skuReady
                  ? t("draftExplorer.regenerateSkuButton")
                  : t("draftExplorer.generateSkuButton")
              )}
            </Button>
            <Button
              appearance={
                (draftTab === "spu" ? someSpuSelected : someSkuSelected)
                  ? "primary"
                  : "outline"
              }
              onClick={handleDeleteRows}
              disabled={
                !(draftTab === "spu" ? someSpuSelected : someSkuSelected) ||
                deleteRowsPending
              }
            >
              {deleteRowsPending ? (
                <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                  <Spinner size="tiny" />
                  {t("draftExplorer.deleteRowsRunning")}
                </span>
              ) : (
                t("draftExplorer.deleteRowsButton")
              )}
            </Button>
            <Button
              appearance={draftTab === "sku" && someSkuSelected ? "primary" : "outline"}
              onClick={handleDuplicateSkuRoles}
              disabled={draftTab !== "sku" || !someSkuSelected || duplicateRolesPending}
            >
              {duplicateRolesPending ? (
                <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                  <Spinner size="tiny" />
                  Duplicating...
                </span>
              ) : (
                "Duplicate Role"
              )}
            </Button>
            <Button
              appearance="primary"
              onClick={handlePublishDrafts}
              disabled={
                draftTab !== "spu" ||
                publishStatus === "running" ||
                !skuReady ||
                skuStatus === "running"
              }
            >
              {t("draftExplorer.publishButton")}
            </Button>
          </div>
        </div>

        <TabList
          selectedValue={draftTab}
          onTabSelect={(_, data) => setDraftTab(data.value as "spu" | "sku")}
        >
          <Tab value="spu">{t("draftExplorer.spuTab")}</Tab>
          <Tab value="sku">{t("draftExplorer.skuTab")}</Tab>
        </TabList>

        {draftError ? (
          <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
            {draftError}
          </Text>
        ) : null}
        {publishMessage ? (
          <Text
            size={200}
            style={{
              color:
                publishStatus === "error"
                  ? tokens.colorStatusDangerForeground1
                  : tokens.colorStatusSuccessForeground1,
            }}
          >
            {publishMessage}
          </Text>
        ) : null}
        {skuMessage ? (
          <Text
            size={200}
            style={{
              color:
                skuStatus === "error"
                  ? tokens.colorStatusDangerForeground1
                  : tokens.colorStatusSuccessForeground1,
            }}
          >
            {skuMessage}
          </Text>
        ) : null}
        <div className={styles.tableWrapper}>
          {draftLoading ? (
            <div style={{ padding: "12px" }}>
              <Spinner size="tiny" />
            </div>
          ) : draftTab === "spu" ? (
            <Table size="small" className={styles.contentSizedTable}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.resizableHeader,
                      styles.selectionCol
                    )}
                    style={spuColumnStyles.selection}
                  >
                    <Checkbox
                      checked={allSpuSelected ? true : someSpuSelected ? "mixed" : false}
                      onChange={toggleSelectAllSpus}
                      aria-label={t("common.selectAll")}
                    />
                  </TableHeaderCell>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.resizableHeader,
                      styles.spuCol
                    )}
                    style={spuColumnStyles.spu}
                  >
                    {t("draftExplorer.columns.spu")}
                  </TableHeaderCell>
                  <TableHeaderCell
                    className={mergeClasses(styles.stickyHeader, styles.resizableHeader)}
                    style={spuColumnStyles.title}
                  >
                    {t("draftExplorer.columns.title")}
                  </TableHeaderCell>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.resizableHeader,
                      styles.statusCol
                    )}
                    style={spuColumnStyles.status}
                  >
                    {t("draftExplorer.columns.status")}
                  </TableHeaderCell>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.resizableHeader,
                      styles.sourceCol
                    )}
                    style={spuColumnStyles.source}
                  >
                    {t("draftExplorer.columns.source")}
                  </TableHeaderCell>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.resizableHeader,
                      styles.supplierCol
                    )}
                    style={spuColumnStyles.supplier}
                  >
                    {t("draftExplorer.columns.supplierUrl")}
                  </TableHeaderCell>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.resizableHeader,
                      styles.imagesCol
                    )}
                    style={spuColumnStyles.images}
                  >
                    {t("draftExplorer.columns.images")}
                  </TableHeaderCell>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.resizableHeader,
                      styles.videosCol
                    )}
                    style={spuColumnStyles.videos}
                  >
                    {t("draftExplorer.columns.videos")}
                  </TableHeaderCell>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.resizableHeader,
                      styles.variantsCol
                    )}
                    style={spuColumnStyles.variants}
                  >
                    {t("draftExplorer.columns.variants")}
                  </TableHeaderCell>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.resizableHeader,
                      styles.updatedCol
                    )}
                    style={spuColumnStyles.updated}
                  >
                    {t("draftExplorer.columns.updated")}
                  </TableHeaderCell>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.resizableHeader,
                      styles.createdCol
                    )}
                    style={spuColumnStyles.created}
                  >
                    {t("draftExplorer.columns.created")}
                  </TableHeaderCell>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.resizableHeader,
                      styles.detailsCol
                    )}
                    style={spuColumnStyles.details}
                  >
                    {t("draftExplorer.columns.details")}
                  </TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spuRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12}>
                      {t("draftExplorer.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  spuRows.map((row, index) => {
                    const altClass = index % 2 === 1 ? styles.tableRowAlt : undefined;
                    const spuMainFolderPath = resolveSpuMainFolderPath(row);
                    const imagesMarkedCompleted = Boolean(
                      spuMainFolderPath && completedSpuFolders.has(spuMainFolderPath)
                    );
                    const rowClass = imagesMarkedCompleted
                      ? styles.tableRowCompleted
                      : altClass;
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          key={row.id}
                          className={mergeClasses(styles.tableRow, rowClass)}
                        >
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.selectionCol
                            )}
                            style={spuColumnStyles.selection}
                          >
                            <Checkbox
                              checked={selectedSpus.has(row.id)}
                              onChange={() => toggleSelectSpu(row.id)}
                              aria-label={t("common.selectItem", { item: row.draft_spu })}
                            />
                          </TableCell>
                          <TableCell
                            className={mergeClasses(styles.tableCell, styles.spuCol)}
                            style={spuColumnStyles.spu}
                          >
                            <button
                              type="button"
                              className={styles.tableCellLinkButton}
                              onClick={() => openSpuImagesInExplorer(row)}
                              title={row.draft_spu ?? ""}
                            >
                              {row.draft_spu}
                            </button>
                          </TableCell>
                          <TableCell className={styles.tableCell} style={spuColumnStyles.title}>
                            {renderEditableCell(
                              "spu",
                              row.id,
                              "draft_title",
                              row.draft_title,
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell
                            className={mergeClasses(styles.tableCell, styles.statusCol)}
                            style={spuColumnStyles.status}
                          >
                            <Text size={200}>{row.draft_status ?? ""}</Text>
                          </TableCell>
                          <TableCell
                            className={mergeClasses(styles.tableCell, styles.sourceCol)}
                            style={spuColumnStyles.source}
                          >
                            {renderEditableCell(
                              "spu",
                              row.id,
                              "draft_source",
                              row.draft_source
                            )}
                          </TableCell>
                          <TableCell
                            className={mergeClasses(styles.tableCell, styles.supplierCol)}
                            style={spuColumnStyles.supplier}
                          >
                            {renderEditableCell(
                              "spu",
                              row.id,
                              "draft_supplier_1688_url",
                              row.draft_supplier_1688_url,
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.imagesCol
                            )}
                            style={spuColumnStyles.images}
                          >
                            <Button
                              size="small"
                              appearance="outline"
                              className={styles.tableActionButton}
                              onClick={() => openSpuImagesInExplorer(row)}
                            >
                              View
                            </Button>
                          </TableCell>
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.numericCell,
                              styles.videosCol
                            )}
                            style={spuColumnStyles.videos}
                          >
                            {row.video_count}
                          </TableCell>
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.variantsCol
                            )}
                            style={spuColumnStyles.variants}
                          >
                            <Button
                              size="small"
                              appearance="outline"
                              className={styles.tableActionButton}
                              onClick={() => openVariantsEditor(row.draft_spu)}
                              disabled={!row.draft_spu}
                            >
                              {`Edit (${row.variant_count ?? 0})`}
                            </Button>
                          </TableCell>
                          <TableCell
                            className={mergeClasses(styles.tableCell, styles.updatedCol)}
                            style={spuColumnStyles.updated}
                          >
                            <Text size={100}>{formatDate(row.draft_updated_at)}</Text>
                          </TableCell>
                          <TableCell
                            className={mergeClasses(styles.tableCell, styles.createdCol)}
                            style={spuColumnStyles.created}
                          >
                            <Text size={100}>{formatDate(row.draft_created_at)}</Text>
                          </TableCell>
                          <TableCell
                            className={mergeClasses(styles.tableCell, styles.detailsCol)}
                            style={spuColumnStyles.details}
                          >
                            <Button
                              size="small"
                              appearance="outline"
                              className={styles.tableActionButton}
                              onClick={() => openDetails(row)}
                            >
                              {t("draftExplorer.detailsButton")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          ) : (
            <Table size="small" className={styles.contentSizedTable}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.resizableHeader,
                      styles.selectionCol
                    )}
                    style={skuColumnStyles.selection}
                  >
                    <Checkbox
                      checked={allSkuSelected ? true : someSkuSelected ? "mixed" : false}
                      onChange={toggleSelectAllSkus}
                      aria-label={t("common.selectAll")}
                    />
                  </TableHeaderCell>
                  {skuHeaderColumns.map((column) => (
                    <TableHeaderCell
                      key={column.key}
                      className={mergeClasses(
                        styles.stickyHeader,
                        styles.resizableHeader
                      )}
                      style={column.style}
                    >
                      {column.label}
                    </TableHeaderCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {skuRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13}>
                      {t("draftExplorer.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  skuRows.map((row, index) => {
                    const isExpanded = expandedSkus.has(row.id);
                    const altClass = index % 2 === 1 ? styles.tableRowAlt : undefined;
                    const imagesMarkedCompleted = isSpuImagesMarkedCompleted(row.draft_spu);
                    const rowClass = imagesMarkedCompleted
                      ? styles.tableRowCompleted
                      : altClass;
                    const rawRow = row.draft_raw_row ?? {};
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          key={row.id}
                          className={mergeClasses(styles.tableRow, rowClass)}
                        >
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.selectionCol
                            )}
                            style={skuColumnStyles.selection}
                          >
                            <Checkbox
                              checked={selectedSkus.has(row.id)}
                              onChange={() => toggleSelectSku(row.id)}
                              aria-label={t("common.selectItem", { item: row.draft_sku ?? "" })}
                            />
                          </TableCell>
                          <TableCell className={styles.tableCell} style={skuColumnStyles.sku}>
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "draft_sku",
                              row.draft_sku,
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell className={styles.tableCell} style={skuColumnStyles.colorSe}>
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "raw_variation_color_se",
                              getRawValue(rawRow, "variation_color_se"),
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell className={styles.tableCell} style={skuColumnStyles.sizeSe}>
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "raw_variation_size_se",
                              getRawValue(rawRow, "variation_size_se"),
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell className={styles.tableCell} style={skuColumnStyles.otherSe}>
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "raw_variation_other_se",
                              getRawValue(rawRow, "variation_other_se"),
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell className={styles.tableCell} style={skuColumnStyles.amountSe}>
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "raw_variation_amount_se",
                              getRawValue(rawRow, "variation_amount_se"),
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell
                            className={styles.tableCell}
                            style={skuColumnStyles.optionCombined}
                          >
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "draft_option_combined_zh",
                              row.draft_option_combined_zh,
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.numericCell
                            )}
                            style={skuColumnStyles.price}
                          >
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "draft_price",
                              row.draft_price,
                              { numeric: true }
                            )}
                          </TableCell>
                          <TableCell
                            className={mergeClasses(
                              styles.tableCell,
                              styles.numericCell
                            )}
                            style={skuColumnStyles.weight}
                          >
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "draft_weight",
                              row.draft_weight,
                              { numeric: true }
                            )}
                            {row.draft_weight_unit ? ` ${row.draft_weight_unit}` : ""}
                          </TableCell>
                          <TableCell
                            className={styles.tableCell}
                            style={skuColumnStyles.variantImage}
                          >
                            {renderEditableCell(
                              "sku",
                              row.id,
                              "draft_variant_image_url",
                              row.draft_variant_image_url,
                              { clamp: true }
                            )}
                          </TableCell>
                          <TableCell className={styles.tableCell} style={skuColumnStyles.status}>
                            <Text size={200}>{row.draft_status ?? ""}</Text>
                          </TableCell>
                          <TableCell className={styles.tableCell} style={skuColumnStyles.updated}>
                            <Text size={100}>{formatDate(row.draft_updated_at)}</Text>
                          </TableCell>
                          <TableCell className={styles.tableCell} style={skuColumnStyles.details}>
                            <Button
                              size="small"
                              appearance="outline"
                              className={styles.tableActionButton}
                              onClick={() => toggleExpanded(row.id)}
                            >
                              {isExpanded
                                ? t("draftExplorer.collapse")
                                : t("draftExplorer.expand")}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow className={styles.detailsRow}>
                            <TableCell colSpan={13}>
                              <div className={styles.detailsGrid}>
                                <div className={styles.detailsBlock}>
                                  <Text size={200} weight="semibold">
                                    {t("draftExplorer.details.raw")}
                                  </Text>
                                  <Text size={100}>
                                    {JSON.stringify(row.draft_raw_row ?? {}, null, 2)}
                                  </Text>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      <Dialog
        open={detailOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closeDetails();
          }
        }}
      >
        <DialogSurface className={styles.detailsDialogSurface}>
          <DialogBody className={styles.detailsDialogBody}>
            <DialogTitle>
              {t("draftExplorer.detailsDialog.title", {
                spu: detailTarget?.draft_spu ?? "",
              })}
            </DialogTitle>
            {detailError ? (
              <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
                {detailError}
              </Text>
            ) : null}
            <div className={styles.detailsDialogContent}>
              <div className={styles.detailsGallery}>
                <Text size={200} weight="semibold">
                  {t("draftExplorer.detailsDialog.images")}
                </Text>
                {detailImagesLoading ? (
                  <Spinner size="tiny" />
                ) : detailImages.length === 0 ? (
                  <Text size={100}>{t("draftExplorer.detailsDialog.imagesEmpty")}</Text>
                ) : (
                  <div className={styles.detailsGalleryGrid}>
                    {detailImages.map((entry) => (
                      <img
                        key={entry.path}
                        src={buildDraftDownloadUrl(entry.path, entry.modifiedAt)}
                        alt={entry.name}
                        className={styles.detailsGalleryImage}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.detailsDialogColumns}>
                <div className={styles.detailsDialogColumn}>
                  <Field label={t("draftExplorer.detailsDialog.shortTitle")}>
                    <Input
                      value={detailDraft.draft_mf_product_short_title ?? ""}
                      onChange={(_, data) =>
                        updateDetailField("draft_mf_product_short_title", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("draftExplorer.detailsDialog.subtitle")}>
                    <Input
                      value={detailDraft.draft_mf_product_subtitle ?? ""}
                      onChange={(_, data) =>
                        updateDetailField("draft_mf_product_subtitle", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("draftExplorer.detailsDialog.longTitle")}>
                    <Input
                      value={detailDraft.draft_mf_product_long_title ?? ""}
                      onChange={(_, data) =>
                        updateDetailField("draft_mf_product_long_title", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("draftExplorer.detailsDialog.bulletsShort")}>
                    <Textarea
                      value={detailDraft.draft_mf_product_bullets_short ?? ""}
                      onChange={(_, data) =>
                        updateDetailField("draft_mf_product_bullets_short", data.value)
                      }
                      resize="vertical"
                      rows={4}
                    />
                  </Field>
                  <Field label={t("draftExplorer.detailsDialog.bullets")}>
                    <Textarea
                      value={detailDraft.draft_mf_product_bullets ?? ""}
                      onChange={(_, data) =>
                        updateDetailField("draft_mf_product_bullets", data.value)
                      }
                      resize="vertical"
                      rows={5}
                    />
                  </Field>
                  <Field label={t("draftExplorer.detailsDialog.bulletsLong")}>
                    <Textarea
                      value={detailDraft.draft_mf_product_bullets_long ?? ""}
                      onChange={(_, data) =>
                        updateDetailField("draft_mf_product_bullets_long", data.value)
                      }
                      resize="vertical"
                      rows={6}
                    />
                  </Field>
                </div>
                <div className={styles.detailsDialogColumn}>
                  <Field label={t("draftExplorer.detailsDialog.descriptionMain")}>
                    <Textarea
                      value={detailDraft.draft_product_description_main_html ?? ""}
                      onChange={(_, data) =>
                        updateDetailField(
                          "draft_product_description_main_html",
                          data.value
                        )
                      }
                      resize="vertical"
                      rows={7}
                    />
                  </Field>
                  <Field label={t("draftExplorer.detailsDialog.descriptionExtended")}>
                    <Textarea
                      value={detailDraft.draft_mf_product_description_extended_html ?? ""}
                      onChange={(_, data) =>
                        updateDetailField(
                          "draft_mf_product_description_extended_html",
                          data.value
                        )
                      }
                      resize="vertical"
                      rows={6}
                    />
                  </Field>
                  <Field label={t("draftExplorer.detailsDialog.descriptionShort")}>
                    <Textarea
                      value={detailDraft.draft_mf_product_description_short_html ?? ""}
                      onChange={(_, data) =>
                        updateDetailField(
                          "draft_mf_product_description_short_html",
                          data.value
                        )
                      }
                      resize="vertical"
                      rows={5}
                    />
                  </Field>
                  <Field label={t("draftExplorer.detailsDialog.specs")}>
                    <Textarea
                      value={detailDraft.draft_mf_product_specs ?? ""}
                      onChange={(_, data) =>
                        updateDetailField("draft_mf_product_specs", data.value)
                      }
                      resize="vertical"
                      rows={7}
                    />
                  </Field>
                </div>
              </div>
            </div>
            <div className={styles.detailsInstruction}>
              <Field label={t("draftExplorer.detailsDialog.instructionLabel")}>
                <Textarea
                  value={detailInstruction}
                  onChange={(_, data) => setDetailInstruction(data.value)}
                  resize="vertical"
                  rows={3}
                />
              </Field>
            </div>
            <DialogActions className={styles.detailsActionsRow}>
              <Button appearance="outline" onClick={closeDetails}>
                {t("common.close")}
              </Button>
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button
                    appearance="outline"
                    disabled={detailRegenerating || detailSaving}
                  >
                    {detailRegenerating ? (
                      <span
                        style={{
                          display: "inline-flex",
                          gap: "6px",
                          alignItems: "center",
                        }}
                      >
                        <Spinner size="tiny" />
                        {t("draftExplorer.detailsDialog.regenerating")}
                      </span>
                    ) : (
                      t("draftExplorer.detailsDialog.regenerate")
                    )}
                  </Button>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem
                      disabled={detailRegenerating || detailSaving}
                      onClick={() => handleDetailRegenerate("stay")}
                    >
                      {t("draftExplorer.detailsDialog.regenerateStay")}
                    </MenuItem>
                    <MenuItem
                      disabled={detailRegenerating || detailSaving}
                      onClick={() => handleDetailRegenerate("close")}
                    >
                      {t("draftExplorer.detailsDialog.regenerateClose")}
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
              <Button
                appearance="primary"
                onClick={handleDetailSave}
                disabled={detailSaving}
              >
                {detailSaving ? (
                  <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                    <Spinner size="tiny" />
                    {t("draftExplorer.detailsDialog.saving")}
                  </span>
                ) : (
                  t("common.save")
                )}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={variantsEditorOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closeVariantsEditor();
          }
        }}
      >
        <DialogSurface className={styles.variantsEditorSurface}>
          <DialogBody className={styles.variantsEditorBody}>
            <DialogTitle>
              {variantsEditorSpu
                ? `Edit variants for ${variantsEditorSpu}`
                : "Edit variants"}
            </DialogTitle>
            {variantsEditorError ? (
              <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
                {variantsEditorError}
              </Text>
            ) : null}
            <div
              className={mergeClasses(
                styles.variantsEditorContent,
                variantsEditorAiRunning ? styles.variantsEditorBusy : undefined
              )}
            >
              <div className={styles.variantsEditorToolbar}>
                <div className={styles.variantsEditorToolbarLeft}>
                  <Button
                    appearance="outline"
                    onClick={handleVariantEditorAddRow}
                    disabled={variantsEditorLoading || variantsEditorSaving}
                  >
                    Add Variant
                  </Button>
                  <Button
                    appearance="outline"
                    onClick={handleVariantEditorDeleteSelected}
                    disabled={
                      variantsEditorLoading ||
                      variantsEditorSaving ||
                      variantsEditorSelectedRows.size === 0
                    }
                  >
                    Remove Selected
                  </Button>
                  <Input
                    className={styles.variantsEditorPacksInput}
                    value={variantsEditorPacksText}
                    onChange={(_, data) => setVariantsEditorPacksText(data.value)}
                    placeholder="1, 2, 4, 10"
                  />
                  <Button
                    appearance="outline"
                    onClick={handleVariantEditorAddPacks}
                    disabled={variantsEditorLoading || variantsEditorSaving}
                  >
                    Only Add Packs
                  </Button>
                </div>
              </div>

              {variantsEditorLoading ? (
                <Spinner size="small" />
              ) : (
                <div className={styles.variantsEditorTableWrap}>
                  <table
                    className={mergeClasses(
                      styles.variantsEditorTable,
                      styles.contentSizedTable
                    )}
                  >
                    <thead>
                      <tr>
                        <th
                          className={mergeClasses(
                            styles.variantsEditorHeadCell,
                            styles.resizableHeader,
                            styles.variantsEditorCheckCol
                          )}
                          style={variantsEditorColumnStyles.selection}
                        >
                          <Checkbox
                            checked={
                              variantsEditorAllSelected
                                ? true
                                : variantsEditorSomeSelected
                                  ? "mixed"
                                  : false
                            }
                            onChange={handleVariantEditorToggleAll}
                            aria-label="Select all variants"
                          />
                        </th>
                        <th
                          className={mergeClasses(
                            styles.variantsEditorHeadCell,
                            styles.resizableHeader
                          )}
                          style={variantsEditorColumnStyles.sku}
                        >
                          <button
                            type="button"
                            className={styles.variantsEditorSortButton}
                            onClick={() => handleVariantEditorSort("sku")}
                          >
                            <span>SKU</span>
                            <span className={styles.variantsEditorSortIndicator}>
                              {getVariantSortIndicator("sku")}
                            </span>
                          </button>
                        </th>
                        <th
                          className={mergeClasses(
                            styles.variantsEditorHeadCell,
                            styles.resizableHeader
                          )}
                          style={variantsEditorColumnStyles.colorSe}
                        >
                          <button
                            type="button"
                            className={styles.variantsEditorSortButton}
                            onClick={() => handleVariantEditorSort("color")}
                          >
                            <span>Color (SE)</span>
                            <span className={styles.variantsEditorSortIndicator}>
                              {getVariantSortIndicator("color")}
                            </span>
                          </button>
                        </th>
                        <th
                          className={mergeClasses(
                            styles.variantsEditorHeadCell,
                            styles.resizableHeader
                          )}
                          style={variantsEditorColumnStyles.sizeSe}
                        >
                          <button
                            type="button"
                            className={styles.variantsEditorSortButton}
                            onClick={() => handleVariantEditorSort("size")}
                          >
                            <span>Size (SE)</span>
                            <span className={styles.variantsEditorSortIndicator}>
                              {getVariantSortIndicator("size")}
                            </span>
                          </button>
                        </th>
                        <th
                          className={mergeClasses(
                            styles.variantsEditorHeadCell,
                            styles.resizableHeader
                          )}
                          style={variantsEditorColumnStyles.otherSe}
                        >
                          <button
                            type="button"
                            className={styles.variantsEditorSortButton}
                            onClick={() => handleVariantEditorSort("order")}
                          >
                            <span>Other (SE)</span>
                            <span className={styles.variantsEditorSortIndicator}>
                              {getVariantSortIndicator("order")}
                            </span>
                          </button>
                        </th>
                        <th
                          className={mergeClasses(
                            styles.variantsEditorHeadCell,
                            styles.resizableHeader
                          )}
                          style={variantsEditorColumnStyles.amountSe}
                        >
                          <button
                            type="button"
                            className={styles.variantsEditorSortButton}
                            onClick={() => handleVariantEditorSort("amount")}
                          >
                            <span>Amount (SE)</span>
                            <span className={styles.variantsEditorSortIndicator}>
                              {getVariantSortIndicator("amount")}
                            </span>
                          </button>
                        </th>
                        <th
                          className={mergeClasses(
                            styles.variantsEditorHeadCell,
                            styles.resizableHeader
                          )}
                          style={variantsEditorColumnStyles.optionCombinedZh}
                        >
                          Option Combined (ZH)
                        </th>
                        <th
                          className={mergeClasses(
                            styles.variantsEditorHeadCell,
                            styles.resizableHeader
                          )}
                          style={variantsEditorColumnStyles.colorZh}
                        >
                          Color (ZH)
                        </th>
                        <th
                          className={mergeClasses(
                            styles.variantsEditorHeadCell,
                            styles.resizableHeader
                          )}
                          style={variantsEditorColumnStyles.sizeZh}
                        >
                          Size (ZH)
                        </th>
                        <th
                          className={mergeClasses(
                            styles.variantsEditorHeadCell,
                            styles.resizableHeader
                          )}
                          style={variantsEditorColumnStyles.otherZh}
                        >
                          Other (ZH)
                        </th>
                        <th
                          className={mergeClasses(
                            styles.variantsEditorHeadCell,
                            styles.resizableHeader
                          )}
                          style={variantsEditorColumnStyles.amountZh}
                        >
                          Amount (ZH)
                        </th>
                        <th
                          className={mergeClasses(
                            styles.variantsEditorHeadCell,
                            styles.resizableHeader
                          )}
                          style={variantsEditorColumnStyles.price}
                        >
                          Price
                        </th>
                        <th
                          className={mergeClasses(
                            styles.variantsEditorHeadCell,
                            styles.resizableHeader
                          )}
                          style={variantsEditorColumnStyles.weight}
                        >
                          Weight
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {variantsEditorRows.length === 0 ? (
                        <tr>
                          <td className={styles.variantsEditorCell} colSpan={13}>
                            No variants yet. Add one or run AI update.
                          </td>
                        </tr>
                      ) : (
                        variantsEditorSortedRows.map((row) => (
                          <tr key={row.key}>
                            <td
                              className={mergeClasses(
                                styles.variantsEditorCell,
                                styles.variantsEditorCheckCol
                              )}
                              style={variantsEditorColumnStyles.selection}
                            >
                              <Checkbox
                                checked={variantsEditorSelectedRows.has(row.key)}
                                onChange={() => handleVariantEditorToggleRow(row.key)}
                                aria-label={`Select ${row.draft_sku || row.key}`}
                              />
                            </td>
                            <td
                              className={styles.variantsEditorCell}
                              style={variantsEditorColumnStyles.sku}
                            >
                              {renderVariantEditorInput(row, "draft_sku")}
                            </td>
                            <td
                              className={styles.variantsEditorCell}
                              style={variantsEditorColumnStyles.colorSe}
                            >
                              {renderVariantEditorInput(row, "variation_color_se")}
                            </td>
                            <td
                              className={styles.variantsEditorCell}
                              style={variantsEditorColumnStyles.sizeSe}
                            >
                              {renderVariantEditorInput(row, "variation_size_se")}
                            </td>
                            <td
                              className={styles.variantsEditorCell}
                              style={variantsEditorColumnStyles.otherSe}
                            >
                              {renderVariantEditorInput(row, "variation_other_se")}
                            </td>
                            <td
                              className={styles.variantsEditorCell}
                              style={variantsEditorColumnStyles.amountSe}
                            >
                              {renderVariantEditorInput(row, "variation_amount_se")}
                            </td>
                            <td
                              className={styles.variantsEditorCell}
                              style={variantsEditorColumnStyles.optionCombinedZh}
                            >
                              {renderVariantEditorInput(row, "draft_option_combined_zh")}
                            </td>
                            <td
                              className={styles.variantsEditorCell}
                              style={variantsEditorColumnStyles.colorZh}
                            >
                              {renderVariantEditorInput(row, "draft_option1")}
                            </td>
                            <td
                              className={styles.variantsEditorCell}
                              style={variantsEditorColumnStyles.sizeZh}
                            >
                              {renderVariantEditorInput(row, "draft_option2")}
                            </td>
                            <td
                              className={styles.variantsEditorCell}
                              style={variantsEditorColumnStyles.otherZh}
                            >
                              {renderVariantEditorInput(row, "draft_option3")}
                            </td>
                            <td
                              className={styles.variantsEditorCell}
                              style={variantsEditorColumnStyles.amountZh}
                            >
                              {renderVariantEditorInput(row, "draft_option4")}
                            </td>
                            <td
                              className={styles.variantsEditorCell}
                              style={variantsEditorColumnStyles.price}
                            >
                              {renderVariantEditorInput(row, "draft_price", {
                                numeric: true,
                              })}
                            </td>
                            <td
                              className={styles.variantsEditorCell}
                              style={variantsEditorColumnStyles.weight}
                            >
                              {renderVariantEditorInput(row, "draft_weight", {
                                numeric: true,
                              })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <div className={styles.variantsEditorBottomSplit}>
                <div className={styles.variantsEditorInstruction}>
                  <Field label="AI instructions (GPT-5.2)">
                    <Textarea
                      value={variantsEditorAiPrompt}
                      onChange={(_, data) => setVariantsEditorAiPrompt(data.value)}
                      resize="vertical"
                      rows={4}
                      placeholder="Describe how to restructure, add, or remove variants."
                    />
                  </Field>
                  <div className={styles.variantsEditorInstructionActions}>
                    <Button
                      appearance="primary"
                      onClick={handleVariantEditorRunAi}
                      disabled={
                        variantsEditorLoading ||
                        variantsEditorSaving ||
                        variantsEditorAiRunning ||
                        variantsEditorRows.length === 0
                      }
                    >
                      {variantsEditorAiRunning ? "Updating..." : "Update Variants with AI"}
                    </Button>
                  </div>
                </div>
                <div className={styles.variantsEditorThumbPanel}>
                  <Text size={200} weight="semibold">
                    Variant images
                  </Text>
                  {variantsEditorThumbsLoading ? (
                    <Spinner size="tiny" />
                  ) : variantsEditorThumbs.length === 0 ? (
                    <Text size={100}>No images found in the variant images folder.</Text>
                  ) : (
                    <div className={styles.variantsEditorThumbGrid}>
                      {variantsEditorThumbs.map((entry) => {
                        const label =
                          extractVariantLabelFromFilename(entry.name, variantsEditorSpu) ||
                          entry.name;
                        return (
                          <div key={entry.path} className={styles.variantsEditorThumbCard}>
                            <button
                              type="button"
                              className={styles.variantsEditorThumbButton}
                              onClick={() =>
                                setVariantsImagePreview({
                                  src: buildDraftDownloadUrl(entry.path, entry.modifiedAt),
                                  label,
                                })
                              }
                            >
                              <img
                                src={buildDraftDownloadUrl(entry.path, entry.modifiedAt)}
                                alt={label}
                                className={mergeClasses(
                                  styles.variantsEditorThumbImage,
                                  styles.variantsEditorThumbImageClickable
                                )}
                                loading="lazy"
                              />
                            </button>
                            <Text className={styles.variantsEditorThumbLabel} size={100}>
                              {label}
                            </Text>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {variantsEditorAiRunning ? (
              <div className={styles.variantsEditorOverlay}>
                <span style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                  <Spinner size="small" />
                  Updating variants with AI...
                </span>
              </div>
            ) : null}
            <DialogActions className={styles.variantsEditorActions}>
              <Button
                appearance="outline"
                onClick={() => closeVariantsEditor()}
                disabled={variantsEditorSaving || variantsEditorAiRunning}
              >
                {t("common.close")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleVariantEditorSave}
                disabled={variantsEditorLoading || variantsEditorSaving || variantsEditorAiRunning}
              >
                {variantsEditorSaving ? "Saving..." : t("common.save")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={Boolean(variantsImagePreview)}
        onOpenChange={(_, data) => {
          if (!data.open) setVariantsImagePreview(null);
        }}
      >
        <DialogSurface className={styles.variantsImagePreviewSurface}>
          <DialogBody className={styles.variantsImagePreviewBody}>
            <div className={styles.variantsImagePreviewTop}>
              <Button
                appearance="subtle"
                size="small"
                onClick={() => setVariantsImagePreview(null)}
              >
                Close
              </Button>
            </div>
            <div className={styles.variantsImagePreviewImgWrap}>
              {variantsImagePreview ? (
                <img
                  src={variantsImagePreview.src}
                  alt={variantsImagePreview.label}
                  className={styles.variantsImagePreviewImg}
                />
              ) : null}
            </div>
          </DialogBody>
        </DialogSurface>
      </Dialog>

	      <Dialog
	        open={runPreviewOpen}
	        onOpenChange={(_, data) => {
	          if (!data.open) {
	            setRunPreviewOpen(false);
	            setRunPreviewRun("");
	            setRunPreviewItems([]);
	            setRunPreviewSelectedSpus(new Set());
	            setRunPreviewDeletedSpus(new Set());
	          }
	        }}
	      >
	        <DialogSurface className={styles.runPreviewSurface}>
	          <DialogBody className={styles.runPreviewBody}>
            <DialogTitle>
              Batch Preview{runPreviewRun ? ` - ${runPreviewRun}` : ""}
            </DialogTitle>
            {runPreviewLoading ? <Spinner size="small" /> : null}
	            <div className={styles.runPreviewTableWrap}>
	              <Table
	                size="small"
	                aria-label="Batch preview"
	                className={styles.runPreviewTable}
	              >
		                <TableHeader>
		                  <TableRow className={styles.runPreviewHeaderRow}>
		                    <TableHeaderCell className={styles.runPreviewImageHeaderCell}>
		                      Image
		                    </TableHeaderCell>
		                    <TableHeaderCell className={styles.runPreviewSpuHeaderCell}>
		                      SPU
		                    </TableHeaderCell>
		                    <TableHeaderCell>Title</TableHeaderCell>
		                    <TableHeaderCell className={styles.runPreviewSelectHeaderCell}>
		                      <div className={styles.runPreviewCellCenter}>
		                        <Checkbox
		                          checked={
		                            allRunPreviewSelected
		                              ? true
		                              : someRunPreviewSelected
		                                ? "mixed"
		                                : false
		                          }
		                          onChange={toggleSelectAllRunPreview}
		                          aria-label={t("common.selectAll")}
		                        />
		                      </div>
		                    </TableHeaderCell>
		                    <TableHeaderCell className={styles.runPreviewDeleteHeaderCell} />
		                  </TableRow>
		                </TableHeader>
		                <TableBody>
		                  {visibleRunPreviewItems.map((item) => (
		                      <TableRow key={item.draft_spu}>
		                        <TableCell className={styles.runPreviewImageCell}>
		                          <div className={styles.runPreviewCellCenter}>
		                            {item.preview_image_path ? (
		                              <img
		                                src={buildDraftDownloadUrl(
		                                  item.preview_image_path,
		                                  item.preview_image_modified_at ?? undefined
		                                )}
		                                alt={item.draft_spu}
		                                className={styles.runPreviewThumb}
		                                loading="lazy"
		                              />
		                            ) : item.draft_main_image_url ? (
		                              <img
		                                src={item.draft_main_image_url}
		                                alt={item.draft_spu}
		                                className={styles.runPreviewThumb}
		                                loading="lazy"
		                              />
		                            ) : (
		                              <div
		                                className={styles.runPreviewThumb}
		                                style={{ display: "inline-block" }}
		                              />
		                            )}
		                          </div>
		                        </TableCell>
		                        <TableCell>{item.draft_spu}</TableCell>
		                        <TableCell className={styles.runPreviewTitleCell}>
		                          <span className={styles.runPreviewTitleText}>{item.title}</span>
		                        </TableCell>
		                        <TableCell className={styles.runPreviewSelectCell}>
		                          <div className={styles.runPreviewCellCenter}>
		                            <Checkbox
		                              checked={runPreviewSelectedSpus.has(item.draft_spu)}
		                              onChange={() => toggleSelectRunPreviewSpu(item.draft_spu)}
		                              aria-label={`Select ${item.draft_spu}`}
		                            />
		                          </div>
		                        </TableCell>
		                        <TableCell className={styles.runPreviewDeleteCell}>
		                          <div className={styles.runPreviewCellCenter}>
		                            <Button
		                              appearance="outline"
		                              size="small"
		                              className={mergeClasses(
		                                styles.runPreviewDeleteButton,
		                                styles.whiteActionButton
		                              )}
		                              onClick={() => handleRunPreviewDelete(item.draft_spu)}
		                            >
		                              Delete
		                            </Button>
		                          </div>
		                        </TableCell>
		                      </TableRow>
		                    ))}
		                </TableBody>
		              </Table>
	            </div>
	            <div className={styles.runPreviewActions}>
	              <Button
	                appearance="outline"
	                className={styles.whiteActionButton}
	                onClick={handleRunPreviewDeleteSelected}
	                disabled={runPreviewSelectedSpus.size === 0 || runPreviewSaving}
	              >
	                Delete selected
	              </Button>
	              <div className={styles.runPreviewActionsRight}>
	                <Button
	                  appearance="outline"
	                  onClick={() => setRunPreviewOpen(false)}
	                  disabled={runPreviewSaving}
	                >
	                  Cancel
	                </Button>
	                <Button
	                  appearance="primary"
	                  onClick={() => void handleRunPreviewSave()}
	                  disabled={runPreviewSaving}
	                >
	                  {runPreviewSaving ? "Saving..." : "Save"}
	                </Button>
	              </div>
	            </div>
	          </DialogBody>
	        </DialogSurface>
	      </Dialog>

      <Card className={styles.logCard}>
        <div className={styles.explorerHeader}>
          <div>
            <Text size={500} weight="semibold">
              {t("bulkProcessing.explorer.title")}
            </Text>
          </div>
        </div>

        {error ? (
          <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
            {error}
          </Text>
        ) : null}

        <div className={styles.explorerControlsRow}>
          <div className={styles.explorerControlsLeft}>
            <Popover
              open={batchPickerOpen}
              onOpenChange={(_, data) => setBatchPickerOpen(data.open)}
              positioning="below-start"
            >
              <PopoverTrigger disableButtonEnhancement>
                <Button
                  appearance="outline"
                  className={mergeClasses(
                    styles.batchPickerTrigger,
                    styles.explorerWhiteButton
                  )}
                  aria-label={t("bulkProcessing.explorer.selectFolder")}
                  title={t("bulkProcessing.explorer.selectFolder")}
                >
                  <span className={styles.batchPickerTriggerLabel}>
                    {selectedFolder ||
                      t("bulkProcessing.explorer.selectFolder")}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={styles.batchPickerChevron}
                    aria-hidden="true"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M6 9l6 6l6 -6" />
                  </svg>
                </Button>
              </PopoverTrigger>
              <PopoverSurface className={styles.batchPickerSurface}>
                {folders.map((folder) => {
                  const active = folder.path === selectedFolder;
                  const checked = selectedRunsForMerge.has(folder.path);
                  return (
                    <div
                      key={folder.path}
                      className={mergeClasses(
                        styles.batchPickerRow,
                        active ? styles.batchPickerRowActive : undefined
                      )}
                      onClick={() => {
                        setBatchPickerOpen(false);
                        void handleSelectFolder(folder.path);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setBatchPickerOpen(false);
                          void handleSelectFolder(folder.path);
                        }
                      }}
                    >
                      <span className={styles.batchPickerRowName}>
                        {folder.name}
                      </span>
                      <Button
                        size="small"
                        appearance="outline"
                        className={mergeClasses(
                          styles.batchPickerViewButton,
                          styles.whiteActionButton
                        )}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void openRunPreview(folder.path);
                        }}
                      >
                        Preview
                      </Button>
                      <span
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <Checkbox
                          checked={checked}
                          onChange={() => toggleRunForMerge(folder.path)}
                        />
                      </span>
                    </div>
                  );
                })}
                <div className={styles.batchPickerActions}>
                  <Button
                    appearance="outline"
                    onClick={handleSelectAllRunsForMerge}
                    disabled={mergeRunsPending || deleteRunsPending}
                  >
                    Select All
                  </Button>
                  <Button
                    appearance="outline"
                    onClick={handleUnselectRunsForMerge}
                    disabled={
                      selectedRunsForMerge.size === 0 ||
                      mergeRunsPending ||
                      deleteRunsPending
                    }
                  >
                    Unselect
                  </Button>
                  <Button
                    appearance="primary"
                    disabled={
                      selectedRunsForMerge.size < 2 ||
                      mergeRunsPending ||
                      deleteRunsPending
                    }
                    onClick={() => void handleMergeRuns()}
                  >
                    {mergeRunsPending ? "Merging..." : "Merge"}
                  </Button>
                  <Button
                    appearance="outline"
                    disabled={
                      selectedRunsForMerge.size === 0 ||
                      mergeRunsPending ||
                      deleteRunsPending
                    }
                    onClick={() => void handleDeleteRuns()}
                  >
                    {deleteRunsPending ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </PopoverSurface>
            </Popover>
            <Popover
              open={spuPickerOpen}
              onOpenChange={(_, data) => setSpuPickerOpen(data.open)}
              positioning="below-start"
            >
              <PopoverTrigger disableButtonEnhancement>
                <Button
                  appearance="outline"
                  disabled={!selectedFolder || runSpuOptions.length === 0}
                  className={mergeClasses(
                    styles.spuPickerTrigger,
                    styles.explorerWhiteButton
                  )}
                  aria-label="Select SPU folder"
                  title="Select SPU folder"
                >
                  <span className={styles.batchPickerTriggerLabel}>
                    {selectedRunSpuLabel}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={styles.batchPickerChevron}
                    aria-hidden="true"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M6 9l6 6l6 -6" />
                  </svg>
                </Button>
              </PopoverTrigger>
              <PopoverSurface className={styles.spuPickerSurface}>
                {runSpuOptions.length === 0 ? (
                  <Text size={100}>No SPU folders in this batch.</Text>
                ) : (
                  runSpuOptions.map((option) => {
                    const active = option.path === selectedSpuPathInRun;
                    const isCompleted = completedSpuFolders.has(option.path);
                    return (
                      <div
                        key={option.path}
                        className={mergeClasses(
                          styles.spuPickerRow,
                          active ? styles.spuPickerRowActive : undefined,
                          isCompleted ? styles.spuPickerRowCompleted : undefined
                        )}
                        onClick={() => handleSelectRunSpu(option.path)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleSelectRunSpu(option.path);
                          }
                        }}
                      >
                        <span className={styles.spuPickerRowName}>{option.name}</span>
                        {isCompleted ? (
                          <span className={styles.spuPickerRowCheck} aria-hidden="true">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={styles.iconSvg}
                              aria-hidden="true"
                            >
                              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                              <path d="M5 12l5 5l9 -9" />
                            </svg>
                          </span>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </PopoverSurface>
            </Popover>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button
                  appearance="outline"
                  disabled={
                    !selectedFolder ||
                    tagAllImagesRunning ||
                    tagImagesRunning ||
                    bulkImageActionPending
                  }
                  className={styles.explorerWhiteButton}
                >
                  {tagAllImagesRunning ? "Working..." : "Actions"}
                </Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList className={styles.compactMenuList}>
                  <MenuItem
                    disabled={
                      !selectedFolder ||
                      completedSpuPathsInSelectedRun.length === 0 ||
                      tagAllImagesRunning ||
                      tagImagesRunning ||
                      bulkImageActionPending
                    }
                    onClick={() => void handleTagAllImagesForCompletedSpuFolders()}
                  >
                    Tag All Images
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
            <Button
              appearance="outline"
              onClick={handleDeleteFolder}
              disabled={!selectedFolder || deleteFolderPending}
              className={mergeClasses(styles.iconButton, styles.explorerWhiteButton)}
              aria-label={t("bulkProcessing.explorer.deleteFolder")}
              title={t("bulkProcessing.explorer.deleteFolder")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.iconSvg}
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
            <Button
              appearance="outline"
              onClick={() => setFolderTreeHidden((prev) => !prev)}
              className={mergeClasses(styles.iconButton, styles.explorerWhiteButton)}
              disabled={!USE_NEW_FILE_EXPLORER}
              aria-label={folderTreeHidden ? "Show folders" : "Hide folders"}
              title={folderTreeHidden ? "Show folders" : "Hide folders"}
            >
              {folderTreeHidden ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className={styles.iconSvg}
                  aria-hidden="true"
                >
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M12 2a1 1 0 0 1 .707 .293l1.708 1.707h4.585a3 3 0 0 1 2.995 2.824l.005 .176v7a3 3 0 0 1 -3 3h-1v1a3 3 0 0 1 -3 3h-10a3 3 0 0 1 -3 -3v-9a3 3 0 0 1 3 -3h1v-1a3 3 0 0 1 3 -3zm-6 6h-1a1 1 0 0 0 -1 1v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1 -1v-1h-7a3 3 0 0 1 -3 -3z" />
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
                  className={styles.iconSvg}
                  aria-hidden="true"
                >
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M17 17h-8a2 2 0 0 1 -2 -2v-8m1.177 -2.823c.251 -.114 .53 -.177 .823 -.177h3l2 2h5a2 2 0 0 1 2 2v7c0 .55 -.223 1.05 -.583 1.411" />
                  <path d="M17 17v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h2" />
                  <path d="M3 3l18 18" />
                </svg>
              )}
            </Button>
          </div>
          <div className={styles.explorerControlsRight}>
            {USE_NEW_FILE_EXPLORER ? (
              <>
                <Button
                  appearance="outline"
                  onClick={() => handleNavigateRunSpu(-1)}
                  disabled={!canNavigatePrevSpu}
                  className={mergeClasses(styles.iconButton, styles.explorerWhiteButton)}
                  aria-label="Previous SPU folder"
                  title="Previous SPU folder"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={styles.iconSvg}
                    aria-hidden="true"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M5 12h14" />
                    <path d="M5 12l6 6" />
                    <path d="M5 12l6 -6" />
                  </svg>
                </Button>
                <Button
                  appearance="outline"
                  onClick={() => handleNavigateRunSpu(1)}
                  disabled={!canNavigateNextSpu}
                  className={mergeClasses(styles.iconButton, styles.explorerWhiteButton)}
                  aria-label="Next SPU folder"
                  title="Next SPU folder"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={styles.iconSvg}
                    aria-hidden="true"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M5 12h14" />
                    <path d="M13 6l6 6" />
                    <path d="M13 18l6 -6" />
                  </svg>
                </Button>
              </>
            ) : null}
            {!USE_NEW_FILE_EXPLORER ? (
              <div className={styles.viewToggle}>
                <Text size={100}>{t("bulkProcessing.explorer.viewSmall")}</Text>
                <Switch
                  checked={explorerView === "grid"}
                  onChange={(_, data) =>
                    setExplorerView(data.checked ? "grid" : "list")
                  }
                />
                <Text size={100}>{t("bulkProcessing.explorer.viewLarge")}</Text>
              </div>
            ) : null}
          </div>
        </div>

        {USE_NEW_FILE_EXPLORER ? (
          <div
            className={mergeClasses(
              styles.explorerLayout,
              folderTreeHidden ? styles.explorerLayoutSingleColumn : undefined
            )}
          >
            {!folderTreeHidden ? (
            <div
              className={styles.folderPane}
              onDragOver={(event) => {
                if (draggingEntryPaths.length === 0 || !selectedFolder) return;
                event.preventDefault();
                setFolderDropTargetPath(selectedFolder);
              }}
              onDragLeave={() => {
                if (folderDropTargetPath === selectedFolder) {
                  setFolderDropTargetPath(null);
                }
              }}
              onDrop={(event) => {
                if (!selectedFolder) return;
                event.preventDefault();
                const draggedPaths = readDraggedPaths(event.dataTransfer);
                if (
                  draggedPaths.length === 0 ||
                  draggedPaths.every((draggedPath) => draggedPath === selectedFolder)
                ) {
                  setFolderDropTargetPath(null);
                  setDraggingEntryPaths([]);
                  return;
                }
                handleMoveEntriesToFolder(draggedPaths, selectedFolder);
              }}
            >
              <div className={styles.folderPaneHeader}>
                <Text size={200} weight="semibold">
                  Folders
                </Text>
                {folderTreeLoading || movingEntry ? <Spinner size="tiny" /> : null}
              </div>
              {!selectedFolder ? (
                <Text size={100}>Select a folder to browse.</Text>
              ) : folderTreeLoading && !folderTree ? (
                <Spinner size="tiny" />
              ) : folderTree ? (
                <div className={styles.folderTreeRoot}>
                  {folderTree.children.length > 0 ? (
                    folderTree.children.map((child, index) =>
                      renderFolderTreeNode(
                        child,
                        [],
                        index === folderTree.children.length - 1
                      )
                    )
                  ) : (
                    <Text size={100}>No subfolders in this folder.</Text>
                  )}
                </div>
              ) : (
                <Text size={100}>Unable to load folder tree.</Text>
              )}
              <div className={styles.folderPaneActions}>
                <Button
                  appearance="outline"
                  onClick={handleDownloadAllFolders}
                  disabled={!selectedFolder}
                  className={styles.explorerWhiteButton}
                >
                  Download all
                </Button>
                <Button
                  appearance="outline"
                  onClick={handleDownloadSelectedZip}
                  disabled={selectedTreeFolders.size === 0}
                  className={styles.explorerWhiteButton}
                >
                  <span className={styles.iconWithZipLabel}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={styles.iconSvg}
                      aria-hidden="true"
                    >
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                      <path d="M7 11l5 5l5 -5" />
                      <path d="M12 4l0 12" />
                    </svg>
                    <span>(ZIP)</span>
                  </span>
                </Button>
                <Button
                  appearance="outline"
                  onClick={handleDeleteSelectedFolders}
                  disabled={selectedTreeFolders.size === 0}
                  className={mergeClasses(styles.iconButton, styles.explorerWhiteButton)}
                  aria-label={t("bulkProcessing.explorer.deleteSelected")}
                  title={t("bulkProcessing.explorer.deleteSelected")}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={styles.iconSvg}
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
            </div>
            ) : null}

            <div className={styles.contentColumn}>
            <div className={styles.filePane}>
              <div className={styles.imageToolbar}>
                <div className={styles.imageToolbarTabs}>
                  <TabList
                    size="small"
                    selectedValue={imageTabTargets.active ?? undefined}
                    onTabSelect={(_, data) => {
                      const value = data.value as ImageFolderTabValue;
                      const nextPath =
                        value === "main"
                          ? imageTabTargets.mainPath
                          : value === "variants"
                            ? imageTabTargets.variantsPath
                            : value === "ocr"
                              ? imageTabTargets.ocrPath
                              : value === "others"
                                ? imageTabTargets.othersPaths[0] ?? null
                                : null;
                      if (nextPath) setCurrentPath(nextPath);
                    }}
                  >
                    <Tab value="main" disabled={mainTabDisabled}>
                      <span className={styles.imageTabLabel}>
                        <span>Main</span>
                        <span
                          className={styles.imageTabMainBadgeSpacer}
                          aria-hidden="true"
                        >
                          {" "}
                        </span>
                        <span
                          className={mergeClasses(
                            styles.imageTabBadge,
                            mainTabDisabled ? styles.imageTabBadgeDisabled : undefined
                          )}
                        >
                          {imageTabImageCounts.main}
                        </span>
                      </span>
                    </Tab>
                    <Tab value="variants" disabled={variantsTabDisabled}>
                      <span className={styles.imageTabLabel}>
                        <span>Variants</span>
                        <span
                          className={mergeClasses(
                            styles.imageTabBadge,
                            variantsTabDisabled ? styles.imageTabBadgeDisabled : undefined
                          )}
                        >
                          {imageTabImageCounts.variants}
                        </span>
                      </span>
                    </Tab>
                    <Tab value="ocr" disabled={ocrTabDisabled}>
                      <span className={styles.imageTabLabel}>
                        <span>OCR</span>
                        <span
                          className={mergeClasses(
                            styles.imageTabBadge,
                            ocrTabDisabled ? styles.imageTabBadgeDisabled : undefined
                          )}
                        >
                          {imageTabImageCounts.ocr}
                        </span>
                      </span>
                    </Tab>
                    <Tab value="others" disabled={othersTabDisabled}>
                      <span className={styles.imageTabLabel}>
                        <span>Others</span>
                        <span
                          className={mergeClasses(
                            styles.imageTabBadge,
                            othersTabDisabled ? styles.imageTabBadgeDisabled : undefined
                          )}
                        >
                          {imageTabImageCounts.others}
                        </span>
                      </span>
                    </Tab>
                  </TabList>
                </div>

                <div className={styles.imageToolbarRight}>
                  {mainViewShowsMergedImages && currentMainProductContext.spu ? (
                    <>
                      <Button
                        appearance="outline"
                        disabled={
                          confirmAiEditsPending ||
                          deleteProductPending ||
                          aiReviewSubmitting ||
                          movingEntry ||
                          confirmablePendingAiPaths.length === 0
                        }
                        className={mergeClasses(
                          styles.imageToolbarActions,
                          styles.explorerWhiteButton
                        )}
                        onClick={() => void handleConfirmCurrentProductAiEdits()}
                      >
                        {confirmAiEditsPending ? "Confirming..." : "Confirm AI Edits"}
                      </Button>
                      <Button
                        appearance="outline"
                        disabled={confirmAiEditsPending || deleteProductPending || movingEntry}
                        className={mergeClasses(
                          styles.imageToolbarActions,
                          styles.explorerWhiteButton,
                          styles.dangerOutlineButton
                        )}
                        onClick={() => void handleDeleteCurrentProduct()}
                      >
                        {deleteProductPending ? "Deleting..." : "Delete product"}
                      </Button>
                    </>
                  ) : null}
                  <Menu>
                    <MenuTrigger disableButtonEnhancement>
                      <Button
                        appearance={selectedImageEntries.length > 1 ? "primary" : "outline"}
                        disabled={selectedImageEntries.length === 0 || bulkImageActionPending}
                        className={mergeClasses(
                          styles.imageToolbarActions,
                          selectedImageEntries.length > 1 ? undefined : styles.explorerWhiteButton
                        )}
                      >
                        {bulkImageActionPending ? "Working..." : "Actions"}
                      </Button>
                    </MenuTrigger>
                    <MenuPopover>
                      <MenuList className={styles.compactMenuList}>
                        <MenuItem
                          disabled={selectedImageEntries.length === 0 || bulkImageActionPending}
                          onClick={() => handleDownloadEntries(selectedImageEntries)}
                        >
                          Download Selected Images
                        </MenuItem>
                        <MenuItem
                          disabled={selectedImageEntries.length === 0 || bulkImageActionPending}
                          onClick={() => handleCreateCopiesForEntries(selectedImageEntries)}
                        >
                          Create Copy
                        </MenuItem>
	                      <MenuItem
	                        disabled={selectedImageEntries.length === 0 || bulkImageActionPending}
	                        onClick={() =>
	                          startAiEditForEntries(
	                            selectedImageEntries,
	                            "chatgpt",
	                            "template"
	                          )
	                        }
	                      >
	                        Edit ChatGPT: Standard Template
	                      </MenuItem>
	                      <MenuItem
	                        disabled={selectedImageEntries.length === 0 || bulkImageActionPending}
	                        onClick={() =>
	                          startAiEditForEntries(
	                            selectedImageEntries,
	                            "chatgpt",
	                            "direct"
	                          )
	                        }
	                      >
	                        Edit ChatGPT: Direct
	                      </MenuItem>
                        <Menu>
                          <MenuTrigger disableButtonEnhancement>
                            <MenuItem
                              disabled={selectedImageEntries.length === 0 || bulkImageActionPending}
                            >
                              Edit ChatGPT: Digideal Main
                            </MenuItem>
                          </MenuTrigger>
                          <MenuPopover>
                            <MenuList className={styles.compactMenuList}>
                              <MenuItem
                                onClick={() =>
                                  startAiTemplatePresetForEntries(
                                    selectedImageEntries,
                                    "chatgpt",
                                    "digideal_main",
                                    1
                                  )
                                }
                              >
                                1 image
                              </MenuItem>
                              <MenuItem
                                onClick={() =>
                                  startAiTemplatePresetForEntries(
                                    selectedImageEntries,
                                    "chatgpt",
                                    "digideal_main",
                                    2
                                  )
                                }
                              >
                                2 images
                              </MenuItem>
                              <MenuItem
                                onClick={() =>
                                  startAiTemplatePresetForEntries(
                                    selectedImageEntries,
                                    "chatgpt",
                                    "digideal_main",
                                    3
                                  )
                                }
                              >
                                3 images
                              </MenuItem>
                            </MenuList>
                          </MenuPopover>
                        </Menu>

                        <Menu>
                          <MenuTrigger disableButtonEnhancement>
                            <MenuItem
                              disabled={selectedImageEntries.length === 0 || bulkImageActionPending}
                            >
                              Edit ChatGPT: Product Scene
                            </MenuItem>
                          </MenuTrigger>
                          <MenuPopover>
                            <MenuList className={styles.compactMenuList}>
                              <MenuItem
                                onClick={() =>
                                  void runAiEditsForEntries(
                                    selectedImageEntries,
                                    "chatgpt",
                                    "template",
                                    "",
                                    { templatePreset: "product_scene", outputCount: 1 }
                                  )
                                }
                              >
                                1 image
                              </MenuItem>
                              <MenuItem
                                onClick={() =>
                                  void runAiEditsForEntries(
                                    selectedImageEntries,
                                    "chatgpt",
                                    "template",
                                    "",
                                    { templatePreset: "product_scene", outputCount: 2 }
                                  )
                                }
                              >
                                2 images
                              </MenuItem>
                              <MenuItem
                                onClick={() =>
                                  void runAiEditsForEntries(
                                    selectedImageEntries,
                                    "chatgpt",
                                    "template",
                                    "",
                                    { templatePreset: "product_scene", outputCount: 3 }
                                  )
                                }
                              >
                                3 images
                              </MenuItem>
                            </MenuList>
                          </MenuPopover>
                        </Menu>
	                      <MenuItem
	                        disabled={selectedImageEntries.length === 0 || bulkImageActionPending}
	                        onClick={() =>
	                          startAiEditForEntries(
	                            selectedImageEntries,
	                            "gemini",
	                            "template"
	                          )
	                        }
	                      >
	                        Edit Gemini: Standard Template
	                      </MenuItem>
	                      <MenuItem
	                        disabled={selectedImageEntries.length === 0 || bulkImageActionPending}
	                        onClick={() =>
	                          startAiEditForEntries(
	                            selectedImageEntries,
	                            "gemini",
	                            "direct"
	                          )
	                        }
	                      >
	                        Edit Gemini: Direct
	                      </MenuItem>
                        <Menu>
                          <MenuTrigger disableButtonEnhancement>
                            <MenuItem
                              disabled={selectedImageEntries.length === 0 || bulkImageActionPending}
                            >
                              Edit Gemini: Digideal Main
                            </MenuItem>
                          </MenuTrigger>
                          <MenuPopover>
                            <MenuList className={styles.compactMenuList}>
                              <MenuItem
                                onClick={() =>
                                  startAiTemplatePresetForEntries(
                                    selectedImageEntries,
                                    "gemini",
                                    "digideal_main",
                                    1
                                  )
                                }
                              >
                                1 image
                              </MenuItem>
                              <MenuItem
                                onClick={() =>
                                  startAiTemplatePresetForEntries(
                                    selectedImageEntries,
                                    "gemini",
                                    "digideal_main",
                                    2
                                  )
                                }
                              >
                                2 images
                              </MenuItem>
                              <MenuItem
                                onClick={() =>
                                  startAiTemplatePresetForEntries(
                                    selectedImageEntries,
                                    "gemini",
                                    "digideal_main",
                                    3
                                  )
                                }
                              >
                                3 images
                              </MenuItem>
                            </MenuList>
                          </MenuPopover>
                        </Menu>

                        <Menu>
                          <MenuTrigger disableButtonEnhancement>
                            <MenuItem
                              disabled={selectedImageEntries.length === 0 || bulkImageActionPending}
                            >
                              Edit Gemini: Product Scene
                            </MenuItem>
                          </MenuTrigger>
                          <MenuPopover>
                            <MenuList className={styles.compactMenuList}>
                              <MenuItem
                                onClick={() =>
                                  void runAiEditsForEntries(
                                    selectedImageEntries,
                                    "gemini",
                                    "template",
                                    "",
                                    { templatePreset: "product_scene", outputCount: 1 }
                                  )
                                }
                              >
                                1 image
                              </MenuItem>
                              <MenuItem
                                onClick={() =>
                                  void runAiEditsForEntries(
                                    selectedImageEntries,
                                    "gemini",
                                    "template",
                                    "",
                                    { templatePreset: "product_scene", outputCount: 2 }
                                  )
                                }
                              >
                                2 images
                              </MenuItem>
                              <MenuItem
                                onClick={() =>
                                  void runAiEditsForEntries(
                                    selectedImageEntries,
                                    "gemini",
                                    "template",
                                    "",
                                    { templatePreset: "product_scene", outputCount: 3 }
                                  )
                                }
                              >
                                3 images
                              </MenuItem>
                            </MenuList>
                          </MenuPopover>
                        </Menu>
                      <MenuItem
                        disabled={selectedImageEntries.length === 0 || bulkImageActionPending}
                        onClick={() =>
                          startAiEditForEntries(selectedImageEntries, "zimage", "direct")
                        }
                      >
                        Edit Z-Image: Direct
                      </MenuItem>
                      <MenuItem
                        disabled={selectedImageEntries.length === 0 || bulkImageActionPending}
                        onClick={() =>
                          startAiEditForEntries(
                            selectedImageEntries,
                            "zimage",
                            "white_background"
                          )
                        }
                      >
                        Edit Z-Image: White BG
                      </MenuItem>
                      <MenuItem
                        disabled={
                          selectedImageEntries.length === 0 ||
                          selectedImageUpscaleEligibleCount === 0 ||
                          bulkImageActionPending
                        }
                        onClick={() =>
                          startAiEditForEntries(selectedImageEntries, "zimage", "upscale")
                        }
                      >
                        Edit Z-Image: Upscale
                      </MenuItem>
                    </MenuList>
                  </MenuPopover>
                  </Menu>
                  <Button
                    appearance={tagImagesRunningInCurrentPath ? "primary" : "outline"}
                    disabled={
                      imageEntries.length === 0 ||
                      bulkImageActionPending ||
                      tagImagesRunning ||
                      tagAllImagesRunning ||
                      !currentPath
                    }
                    className={mergeClasses(
                      styles.imageToolbarActions,
                      tagImagesRunningInCurrentPath
                        ? undefined
                        : styles.explorerWhiteButton
                    )}
                    onClick={() => void handleRunImageClassifierTagging()}
                  >
                    {tagImagesRunningInCurrentPath ? "Tagging..." : "Tag Images"}
                  </Button>
                  <Button
                    appearance={currentSpuMarkedCompleted ? "primary" : "outline"}
                    disabled={!currentSpuMainPath}
                    className={mergeClasses(
                      styles.imageToolbarActions,
                      currentSpuMarkedCompleted ? undefined : styles.explorerWhiteButton
                    )}
                    onClick={handleToggleCurrentSpuCompleted}
                  >
                    {currentSpuMarkedCompleted ? "Uncomplete" : "Completed"}
                  </Button>
                  <div className={styles.imageToolbarIconGroup}>
                    {entriesRefreshing ? <Spinner size="tiny" /> : null}
                    <Button
                      appearance="outline"
                      onClick={handleExplorerRefresh}
                      disabled={entriesLoading || entriesRefreshing || movingEntry}
                      className={mergeClasses(styles.iconButton, styles.explorerWhiteButton)}
                      aria-label={t("bulkProcessing.explorer.refresh")}
                      title={t("bulkProcessing.explorer.refresh")}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={styles.iconSvg}
                        aria-hidden="true"
                      >
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
                        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
                      </svg>
                    </Button>
                    <Button
                      appearance="outline"
                      onClick={handleDownloadSelectedIndividually}
                      disabled={selectedFiles.size === 0}
                      className={mergeClasses(styles.iconButton, styles.explorerWhiteButton)}
                      aria-label={t("bulkProcessing.explorer.downloadSelected")}
                      title={t("bulkProcessing.explorer.downloadSelected")}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={styles.iconSvg}
                        aria-hidden="true"
                      >
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                        <path d="M7 11l5 5l5 -5" />
                        <path d="M12 4l0 12" />
                      </svg>
                    </Button>
                    <Button
                      appearance="outline"
                      onClick={handleDeleteSelected}
                      disabled={selectedFiles.size + selectedTreeFolders.size === 0}
                      className={mergeClasses(styles.iconButton, styles.explorerWhiteButton)}
                      aria-label={t("bulkProcessing.explorer.deleteSelected")}
                      title={t("bulkProcessing.explorer.deleteSelected")}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={styles.iconSvg}
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
                  <Button
                    appearance="outline"
                    className={mergeClasses(styles.iconButton, styles.explorerWhiteButton)}
                    disabled={displayImageEntries.length === 0}
                    aria-label={
                      imageResizeActionIcon === "grow"
                        ? "Make images bigger"
                        : "Make images smaller"
                    }
                    title={
                      imageResizeActionIcon === "grow"
                        ? "Make images bigger"
                        : "Make images smaller"
                    }
                    onClick={() => {
                      if (imageResizeActionIcon === "grow") {
                        setImageViewMode("big");
                      } else {
                        setImageViewMode("small");
                      }
                    }}
                    onMouseLeave={() => {
                      setImageResizeActionIcon(
                        imageViewMode === "big" ? "shrink" : "grow"
                      );
                    }}
                  >
                  {imageResizeActionIcon === "grow" ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={styles.imageResizeIconSvg}
                      aria-hidden="true"
                    >
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M3 17a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1l0 -3" />
                      <path d="M4 12v-6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-6" />
                      <path d="M12 8h4v4" />
                      <path d="M16 8l-5 5" />
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
                      className={styles.imageResizeIconSvg}
                      aria-hidden="true"
                    >
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M3 17a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1l0 -3" />
                      <path d="M4 12v-6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-6" />
                      <path d="M15 13h-4v-4" />
                      <path d="M11 13l5 -5" />
                    </svg>
                  )}
                </Button>
                </div>
              </div>
              <div
                className={mergeClasses(
                  styles.entriesContentArea,
                  currentSpuMarkedCompleted ? styles.entriesContentAreaCompleted : undefined
                )}
                aria-busy={entriesLoading}
              >
                  {displayImageEntries.length === 0 ? (
                    <Text size={200}>No images in this folder.</Text>
                  ) : (
                    <div
                      className={mergeClasses(
                        styles.dualGrid,
                        tagImagesRunningInCurrentPath
                          ? styles.dualGridTagging
                          : undefined
                      )}
                      aria-busy={imageOrderPersisting}
                      style={{
                        gridTemplateColumns:
                          imageViewMode === "big"
                            ? "repeat(auto-fill, minmax(320px, 1fr))"
                            : "repeat(auto-fill, minmax(180px, 1fr))",
                      }}
                      onDragOver={(event) => {
                        const draggedPaths = readDraggedPaths(event.dataTransfer);
                        const hasImageDrag = draggedPaths.some((pathValue) => {
                          const draggedEntry = entryByPath.get(pathValue);
                          return Boolean(
                            draggedEntry?.type === "file" && isImage(draggedEntry.name)
                          );
                        });
                        if (!hasImageDrag) return;
                        event.preventDefault();
                      }}
                      onDrop={(event) => {
                        const draggedPaths = readDraggedPaths(event.dataTransfer);
                        const hasImageDrag = draggedPaths.some((pathValue) => {
                          const draggedEntry = entryByPath.get(pathValue);
                          return Boolean(
                            draggedEntry?.type === "file" && isImage(draggedEntry.name)
                          );
                        });
                        if (!hasImageDrag) return;
                        event.preventDefault();
                        reorderImagesInGrid(draggedPaths, null);
                        setImageReorderDropPath(null);
                        setFolderDropTargetPath(null);
                        setDraggingEntryPaths([]);
                      }}
                      onDragLeave={() => {
                        setImageReorderDropPath(null);
                      }}
                    >
                      {displayImageEntries.map((entry) => {
                        const pendingAi = pendingAiEditsByOriginal[entry.path] ?? null;
                        const displayPath = pendingAi?.pendingPath ?? entry.path;
                        const displayModifiedAt = pendingAi?.updatedAt ?? entry.modifiedAt;
                        const runtimeJob = aiEditJobsByPath[entry.path] ?? null;
                        const reloadBusy = reloadingImagePaths.has(entry.path);
                        const confirmBusy = confirmingAiEditPaths.has(entry.path);
                        const busy = Boolean(runtimeJob) || reloadBusy || confirmBusy;
                        const imageTags = extractImageTagsFromFileName(entry.name);
                        const isDisplayOnlyMainVariant =
                          mainViewShowsMergedImages && !entryByPath.has(entry.path);
                        const originalPixelQualityScore =
                          typeof entry.pixelQualityScore === "number" &&
                          Number.isFinite(entry.pixelQualityScore)
                            ? Math.round(entry.pixelQualityScore)
                            : null;
                        const pendingPixelQualityScore =
                          typeof pendingAi?.pendingPixelQualityScore === "number" &&
                          Number.isFinite(pendingAi.pendingPixelQualityScore)
                            ? Math.round(pendingAi.pendingPixelQualityScore)
                            : null;
                        const pixelQualityScore =
                          pendingPixelQualityScore ?? originalPixelQualityScore;
                        const pixelQualityDelta =
                          pendingPixelQualityScore !== null &&
                          originalPixelQualityScore !== null
                            ? pendingPixelQualityScore - originalPixelQualityScore
                            : null;
                        const pixelQualityClass =
                          pixelQualityScore === null
                            ? styles.mediaMetaQualityUnknown
                            : pixelQualityScore > 60
                              ? styles.mediaMetaQualityGood
                              : pixelQualityScore >= 40
                                ? styles.mediaMetaQualityMedium
                                : styles.mediaMetaQualityBad;
                        const pixelQualityLabel =
                          pixelQualityDelta === null
                            ? `Q ${pixelQualityScore ?? "-"}`
                            : `Q ${pixelQualityScore ?? "-"} (${
                                pixelQualityDelta > 0
                                  ? `+${pixelQualityDelta}`
                                  : pixelQualityDelta
                              })`;
                        const hasZimageUpscaled = isImageEntryUpscaled(entry);
                        return (
                          <div
                            key={buildStableImageCardKey(entry)}
                            className={mergeClasses(
                              styles.mediaCard,
                              imageReorderDropPath === entry.path
                                ? styles.mediaCardDropTarget
                                : undefined,
                              selectedFiles.has(entry.path)
                                ? styles.mediaCardSelected
                                : undefined
                            )}
                            draggable={!isDisplayOnlyMainVariant}
                            onDragStart={(event) => {
                              if (isDisplayOnlyMainVariant) return;
                              const draggedPaths = buildDraggedPathsForEntry(entry);
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData(
                                "text/plain",
                                draggedPaths[0] ?? entry.path
                              );
                              event.dataTransfer.setData(
                                "application/x-nordexo-paths",
                                JSON.stringify(draggedPaths)
                              );
                              setDraggingEntryPaths(draggedPaths);
                              setImageReorderDropPath(null);
                            }}
                            onDragEnd={() => {
                              setDraggingEntryPaths([]);
                              setFolderDropTargetPath(null);
                              setImageReorderDropPath(null);
                            }}
                            onDragOver={(event) => {
                              if (isDisplayOnlyMainVariant) return;
                              const draggedPaths = readDraggedPaths(event.dataTransfer);
                              const hasImageDrag = draggedPaths.some((pathValue) => {
                                const draggedEntry = entryByPath.get(pathValue);
                                return Boolean(
                                  draggedEntry?.type === "file" &&
                                    isImage(draggedEntry.name)
                                );
                              });
                              if (!hasImageDrag) return;
                              event.preventDefault();
                              event.stopPropagation();
                              setImageReorderDropPath(entry.path);
                            }}
                            onDragLeave={(event) => {
                              event.stopPropagation();
                              if (imageReorderDropPath === entry.path) {
                                setImageReorderDropPath(null);
                              }
                            }}
                            onDrop={(event) => {
                              if (isDisplayOnlyMainVariant) return;
                              const draggedPaths = readDraggedPaths(event.dataTransfer);
                              const hasImageDrag = draggedPaths.some((pathValue) => {
                                const draggedEntry = entryByPath.get(pathValue);
                                return Boolean(
                                  draggedEntry?.type === "file" &&
                                    isImage(draggedEntry.name)
                                );
                              });
                              if (!hasImageDrag) return;
                              event.preventDefault();
                              event.stopPropagation();
                              reorderImagesInGrid(draggedPaths, entry.path);
                              setImageReorderDropPath(null);
                              setFolderDropTargetPath(null);
                              setDraggingEntryPaths([]);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              setContextMenuSubmenu(null);
                              setContextMenu({
                                entry,
                                image: true,
                                x: event.clientX,
                                y: event.clientY,
                              });
                            }}
                          >
                            <div
                              className={styles.mediaSquare}
                              onClick={(event) => {
                                handleToggleFile(entry.path, {
                                  shiftKey: event.shiftKey,
                                  imageRange: true,
                                });
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                handleToggleFile(entry.path, {
                                  shiftKey: event.shiftKey,
                                  imageRange: true,
                                });
                              }}
                            >
                              {imageTags.length > 0 ? (
                                <div
                                  className={mergeClasses(
                                    styles.mediaTagStack,
                                    pendingAi ? styles.mediaTagStackShifted : undefined
                                  )}
                                >
                                  {imageTags.map((tag) => (
                                    <span
                                      key={`${entry.path}-${tag}`}
                                      className={mergeClasses(
                                        styles.mediaTagBadge,
                                        tag === "MAIN"
                                          ? styles.mediaTagMain
                                          : tag === "ENV"
                                            ? styles.mediaTagEnv
                                            : tag === "VAR"
                                              ? styles.mediaTagVar
                                              : tag === "DIGI"
                                                ? styles.mediaTagDigi
                                              : styles.mediaTagInf
                                      )}
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              {pendingAi ? (
                                <button
                                  type="button"
                                  className={styles.aiPendingBadge}
                                  title={`Review AI edit for ${entry.name}`}
                                  aria-label={`Review AI edit for ${entry.name}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setAiReviewOriginalPath(entry.path);
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
                                    width="16"
                                    height="16"
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
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={mergeClasses(
                                  styles.thumbDownloadButton,
                                  "thumbDownloadButton"
                                )}
                                aria-label={`Preview ${entry.name}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setPreviewPath(entry.path);
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
                                  width="16"
                                  height="16"
                                  aria-hidden="true"
                                >
                                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                                  <path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
                                  <path d="M7 10l6 0" />
                                  <path d="M10 7l0 6" />
                                  <path d="M21 21l-6 -6" />
                                </svg>
                              </button>
                              <img
                                src={buildDraftDownloadUrl(
                                  displayPath,
                                  displayModifiedAt
                                )}
                                alt={entry.name}
                                className={mergeClasses(
                                  styles.thumbImage,
                                  busy ? styles.mediaImageBusy : undefined
                                )}
                                onLoad={(event) => {
                                  const img = event.currentTarget;
                                  const pathValue = entry.path;
                                  setImageDimensions((prev) => ({
                                    ...prev,
                                    [pathValue]: {
                                      width: img.naturalWidth,
                                      height: img.naturalHeight,
                                    },
                                  }));
                                  setReloadingImagePaths((prev) => {
                                    if (!prev.has(pathValue)) return prev;
                                    const next = new Set(prev);
                                    next.delete(pathValue);
                                    return next;
                                  });
                                }}
                              />
                              {busy ? (
                                <div className={styles.mediaBusyOverlay}>
                                  <div className={styles.mediaBusyContent}>
                                    <Spinner size="small" />
                                    <span>Updating</span>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          <div className={styles.mediaFooter}>
                            <div className={styles.mediaFooterColumn}>
                              {renamingPath === entry.path ? (
                                <Input
                                  size="small"
                                  value={renameValue}
                                  onChange={(_, data) => setRenameValue(data.value)}
                                  onBlur={() => commitRename(entry)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      commitRename(entry);
                                    }
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      cancelRename();
                                    }
                                  }}
                                  autoFocus
                                  className={styles.renameInput}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className={styles.mediaLabel}
                                  onClick={() => startRename(entry)}
                                >
                                  {entry.name}
                                </button>
                              )}
                              <Text size={100} className={styles.mediaMeta}>
                                {imageDimensions[entry.path] ? (
                                  <>
                                    <span
                                      className={mergeClasses(
                                        imageDimensions[entry.path].width < 800 ||
                                          imageDimensions[entry.path].height < 800
                                          ? styles.mediaMetaDimLow
                                          : undefined
                                      )}
                                    >
                                      {`${imageDimensions[entry.path].width} x ${
                                        imageDimensions[entry.path].height
                                      }`}
                                    </span>
                                    <span className={styles.mediaMetaDivider}>|</span>
                                    <span>{formatSizeKb(entry.size)}</span>
                                  </>
                                ) : (
                                  <>
                                    <span>-</span>
                                    <span className={styles.mediaMetaDivider}>|</span>
                                    <span>{formatSizeKb(entry.size)}</span>
                                  </>
                                )}
                                <span className={styles.mediaMetaDivider}>|</span>
                                <span
                                  className={mergeClasses(
                                    styles.mediaMetaQuality,
                                    pixelQualityClass
                                  )}
                                >
                                  {pixelQualityLabel}
                                </span>
                                {hasZimageUpscaled ? (
                                  <>
                                    <span className={styles.mediaMetaDivider}>|</span>
                                    <span
                                      className={styles.mediaMetaUpscaleIcon}
                                      title="Upscaled with Z-image"
                                      aria-label="Upscaled with Z-image"
                                    >
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className={styles.mediaMetaUpscaleIconSvg}
                                        aria-hidden="true"
                                      >
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                                        <path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10" />
                                        <path d="M7 9v2a1 1 0 0 0 1 1h1" />
                                        <path d="M10 9v6" />
                                        <path d="M14 9v6" />
                                        <path d="M17 9l-2 3l2 3" />
                                        <path d="M15 12h-1" />
                                      </svg>
                                    </span>
                                  </>
                                ) : null}
                              </Text>
                            </div>
                          </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                {entriesLoading || tagImagesRunningInCurrentPath ? (
                  <div className={styles.entriesContentOverlay}>
                    <div className={styles.mediaBusyContent}>
                      <Spinner size="tiny" />
                      <span>
                        {tagImagesRunningInCurrentPath
                          ? "Classifying images..."
                          : "Loading"}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
              <div className={styles.filesUploadRow}>
                <div className={styles.filesSection}>
                  <div className={styles.entriesContentArea} aria-busy={entriesLoading}>
                  {nonImageFileEntries.length === 0 ? (
                    <Text size={100}>No files in this folder.</Text>
		                  ) : (
		                    <Table size="small" className={styles.filesTable}>
	                      <TableHeader>
	                        <TableRow>
	                          <TableHeaderCell className={styles.filesColSelect}>
	                            <input
	                              ref={nonImageFileSelectAllRef}
	                              type="checkbox"
	                              checked={nonImageFilesAllSelected}
	                              onChange={handleToggleAllNonImageFiles}
	                              aria-label="Select all files"
	                            />
	                          </TableHeaderCell>
	                          <TableHeaderCell className={styles.filesColName}>
	                            File Name
	                          </TableHeaderCell>
	                          <TableHeaderCell className={styles.filesColSize}>
	                            File Size
	                          </TableHeaderCell>
	                          <TableHeaderCell className={styles.filesColDate}>
	                            Date
	                          </TableHeaderCell>
	                          <TableHeaderCell className={styles.filesColAction}>
	                            Actions
	                          </TableHeaderCell>
	                        </TableRow>
	                      </TableHeader>
	                      <TableBody>
	                        {nonImageFileEntries.map((entry) => (
                          <TableRow
                            key={`file-${entry.path}`}
                            draggable
                            onDragStart={(event) => {
                              const draggedPaths = buildDraggedPathsForEntry(entry);
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData(
                                "text/plain",
                                draggedPaths[0] ?? entry.path
                              );
                              event.dataTransfer.setData(
                                "application/x-nordexo-paths",
                                JSON.stringify(draggedPaths)
                              );
                              setDraggingEntryPaths(draggedPaths);
                            }}
                            onDragEnd={() => {
                              setDraggingEntryPaths([]);
                              setFolderDropTargetPath(null);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              setContextMenuSubmenu(null);
                              setContextMenu({
                                entry,
                                image: false,
                                x: event.clientX,
                                y: event.clientY,
                              });
	                            }}
	                          >
	                            <TableCell className={styles.filesColSelect}>
	                              <input
	                                type="checkbox"
	                                checked={selectedFiles.has(entry.path)}
	                                onChange={() => handleToggleFile(entry.path)}
	                              />
	                            </TableCell>
	                            <TableCell className={styles.filesColName}>
	                              {renamingPath === entry.path ? (
	                                <Input
	                                  size="small"
	                                  value={renameValue}
	                                  onChange={(_, data) => setRenameValue(data.value)}
	                                  onBlur={() => commitRename(entry)}
	                                  onKeyDown={(event) => {
	                                    if (event.key === "Enter") {
	                                      event.preventDefault();
	                                      commitRename(entry);
	                                    }
	                                    if (event.key === "Escape") {
	                                      event.preventDefault();
	                                      cancelRename();
	                                    }
	                                  }}
	                                  autoFocus
	                                  className={styles.renameInput}
	                                />
	                              ) : (
	                                <button
	                                  type="button"
	                                  className={styles.filesNameButton}
	                                  onClick={() => startRename(entry)}
	                                >
	                                  {entry.name}
	                                </button>
	                              )}
	                            </TableCell>
	                            <TableCell className={styles.filesColSize}>
	                              <Text size={100} className={styles.filesInfo}>
	                                {formatFileSize(entry.size)}
	                              </Text>
	                            </TableCell>
	                            <TableCell className={styles.filesColDate}>
	                              <Text size={100} className={styles.filesInfo}>
	                                {formatDateTime(entry.modifiedAt)}
	                              </Text>
	                            </TableCell>
	                            <TableCell className={styles.filesColAction}>
	                              <div className={styles.fileActions}>
	                                <Button
	                                  appearance="outline"
	                                  size="small"
	                                  onClick={() => downloadEntry(entry)}
	                                  className={styles.fileActionButton}
	                                >
	                                  {t("bulkProcessing.explorer.download")}
	                                </Button>
	                                <Button
	                                  appearance="outline"
	                                  size="small"
	                                  onClick={() => handleOpenFileViewer(entry)}
	                                  disabled={!isTextFileEditable(entry)}
	                                  className={mergeClasses(
	                                    styles.fileActionButton,
	                                    styles.fileActionButtonNarrow
	                                  )}
	                                >
	                                  View
	                                </Button>
	                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {entriesLoading ? (
                    <div className={styles.entriesContentOverlay}>
                      <Spinner size="tiny" />
                    </div>
                  ) : null}
                  </div>
                </div>

                <div className={styles.urlUploadPanel}>
                  <Text size={100} weight="semibold">
                    Image URL Input
                  </Text>
                  <Textarea
                    rows={3}
                    resize="vertical"
                    value={imageUrlInput}
                    onChange={(_, data) => setImageUrlInput(data.value)}
                    placeholder="Paste image URLs separated by commas"
                    className={styles.urlUploadInput}
                  />
                  <div className={styles.urlUploadActions}>
                    <Button
                      appearance="primary"
                      size="small"
                      onClick={handleAddImageUrls}
                      disabled={!currentPath || addingImageUrls}
                    >
                      {addingImageUrls ? "Adding..." : "Add Images"}
                    </Button>
                  </div>
                </div>

                <div
                  className={mergeClasses(
                    styles.dropZone,
                    isDragging ? styles.dropZoneActive : undefined
                  )}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    const files = Array.from(event.dataTransfer.files ?? []);
                    handleUploadFiles(files);
                  }}
                >
                  <Text size={100} className={styles.uploadDropHint}>
                    Drag and drop files, or choose from your computer.
                  </Text>
                  <div className={styles.uploadDropCenter}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={styles.uploadDropIcon}
                      aria-hidden="true"
                    >
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
                      <path d="M12 11v6" />
                      <path d="M9.5 13.5l2.5 -2.5l2.5 2.5" />
                    </svg>
                  </div>
                  <div className={styles.uploadInputWrap}>
                    <input
                      type="file"
                      multiple
                      onChange={(event) =>
                        handleUploadFiles(Array.from(event.target.files ?? []))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : explorerView === "list" ? (
          <Table size="small" className={styles.explorerTable}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.explorerColName}>
                  {t("bulkProcessing.explorer.name")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.explorerColSize}>
                  {t("bulkProcessing.explorer.size")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.explorerColModified}>
                  {t("bulkProcessing.explorer.modified")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.explorerColActions}>
                  {t("bulkProcessing.explorer.actions")}
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entriesLoading ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Spinner size="tiny" />
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    {t("bulkProcessing.explorer.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow
                    key={entry.path}
                    className={mergeClasses(
                      entry.type === "dir" ? styles.folderRow : undefined
                    )}
                    onClick={(event) => {
                      if (entry.type !== "dir") return;
                      const target = event.target as HTMLElement;
                      if (target.closest("button, input, a")) return;
                      setCurrentPath(entry.path);
                    }}
                  >
                    <TableCell className={styles.explorerColName}>
                      <div className={styles.explorerRow}>
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(entry.path)}
                          onChange={() => handleToggleFile(entry.path)}
                        />
                        {entry.type === "dir" ? (
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className={styles.explorerIcon}
                          >
                            <path
                              fill="currentColor"
                              d="M9.5 4h-5A2.5 2.5 0 0 0 2 6.5v11A2.5 2.5 0 0 0 4.5 20h15A2.5 2.5 0 0 0 22 17.5v-9A2.5 2.5 0 0 0 19.5 6H12l-2-2.5A2.5 2.5 0 0 0 9.5 4Z"
                            />
                          </svg>
                        ) : null}
                        {renamingPath === entry.path ? (
                          <Input
                            size="small"
                            value={renameValue}
                            onChange={(_, data) => setRenameValue(data.value)}
                            onBlur={() => commitRename(entry)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitRename(entry);
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelRename();
                              }
                            }}
                            autoFocus
                            onClick={(event) => event.stopPropagation()}
                            className={styles.renameInput}
                          />
                        ) : entry.type === "dir" ? (
                          <button
                            type="button"
                            className={styles.explorerName}
                            onClick={(event) => {
                              event.stopPropagation();
                              setCurrentPath(entry.path);
                            }}
                            style={{ cursor: "pointer" }}
                          >
                            {entry.name}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.explorerName}
                            onClick={(event) => {
                              event.stopPropagation();
                              startRename(entry);
                            }}
                          >
                            {entry.name}
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={styles.explorerColSize}>
                      <Text size={100} className={styles.explorerMeta}>
                        {entry.type === "file" ? formatFileSize(entry.size) : "-"}
                      </Text>
                    </TableCell>
                    <TableCell className={styles.explorerColModified}>
                      <Text size={100} className={styles.explorerMeta}>
                        {formatDateTime(entry.modifiedAt)}
                      </Text>
                    </TableCell>
                    <TableCell className={styles.explorerColActions}>
                      {entry.type === "dir" ? (
                        <Button
                          appearance="outline"
                          size="small"
                          onClick={() => setCurrentPath(entry.path)}
                        >
                          {t("bulkProcessing.explorer.open")}
                        </Button>
                      ) : (
                        <div className={styles.explorerRow}>
                          <Button
                            appearance="outline"
                            size="small"
                            onClick={() =>
                              window.open(
                                `/api/drafts/download?path=${encodeURIComponent(
                                  entry.path
                                )}`,
                                "_blank"
                              )
                            }
                          >
                            {t("bulkProcessing.explorer.download")}
                          </Button>
                          {isImage(entry.name) ? (
                            <Button
                              appearance="subtle"
                              size="small"
                              onClick={() => setPreviewPath(entry.path)}
                            >
                              {t("bulkProcessing.explorer.preview")}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ) : entriesLoading ? (
          <div style={{ padding: "12px" }}>
            <Spinner size="tiny" />
          </div>
        ) : entries.length === 0 ? (
          <Text size={200}>{t("bulkProcessing.explorer.empty")}</Text>
        ) : (
          <div className={styles.thumbGrid}>
            {entries.map((entry) => (
              <div key={entry.path} className={styles.thumbCard}>
                <div className={styles.explorerRow}>
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(entry.path)}
                    onChange={() => handleToggleFile(entry.path)}
                  />
                  <Text size={100} className={styles.explorerMeta}>
                    {entry.type === "dir"
                      ? t("bulkProcessing.explorer.folder")
                      : t("bulkProcessing.explorer.file")}
                  </Text>
                </div>
                <div
                  className={styles.thumbImageWrap}
                  onClick={() => {
                    if (entry.type === "dir") {
                      setCurrentPath(entry.path);
                      return;
                    }
                    if (isImage(entry.name)) {
                      setPreviewPath(entry.path);
                      return;
                    }
                    triggerBrowserDownload(
                      `/api/drafts/download?path=${encodeURIComponent(entry.path)}`
                    );
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    if (entry.type === "dir") {
                      setCurrentPath(entry.path);
                      return;
                    }
                    if (isImage(entry.name)) {
                      setPreviewPath(entry.path);
                      return;
                    }
                    triggerBrowserDownload(
                      `/api/drafts/download?path=${encodeURIComponent(entry.path)}`
                    );
                  }}
                >
                  <button
                    type="button"
                    className={mergeClasses(
                      styles.thumbDownloadButton,
                      "thumbDownloadButton"
                    )}
                    aria-label={
                      entry.type === "dir"
                        ? `Download ${entry.name} as ZIP`
                        : `Download ${entry.name}`
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      if (entry.type === "dir") {
                        triggerBrowserDownload(
                          `/api/drafts/zip?path=${encodeURIComponent(entry.path)}`
                        );
                        return;
                      }
                      triggerBrowserDownload(
                        `/api/drafts/download?path=${encodeURIComponent(entry.path)}`
                      );
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 3v10m0 0l4-4m-4 4l-4-4M4 17v3h16v-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {entry.type === "dir" ? (
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className={styles.thumbIcon}
                    >
                      <path
                        fill="currentColor"
                        d="M9.5 4h-5A2.5 2.5 0 0 0 2 6.5v11A2.5 2.5 0 0 0 4.5 20h15A2.5 2.5 0 0 0 22 17.5v-9A2.5 2.5 0 0 0 19.5 6H12l-2-2.5A2.5 2.5 0 0 0 9.5 4Z"
                      />
                    </svg>
                  ) : isImage(entry.name) ? (
                    <img
                      src={buildDraftDownloadUrl(entry.path, entry.modifiedAt)}
                      alt={entry.name}
                      className={styles.thumbImage}
                    />
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className={styles.thumbIcon}
                    >
                      <path
                        fill="currentColor"
                        d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
                      />
                    </svg>
                  )}
                </div>
                <div>
                  {renamingPath === entry.path ? (
                    <Input
                      size="small"
                      value={renameValue}
                      onChange={(_, data) => setRenameValue(data.value)}
                      onBlur={() => commitRename(entry)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename(entry);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                      autoFocus
                      className={styles.renameInput}
                    />
                  ) : entry.type === "dir" ? (
                    <button
                      type="button"
                      className={styles.thumbName}
                      onClick={() => setCurrentPath(entry.path)}
                      style={{ cursor: "pointer" }}
                    >
                      {entry.name}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.thumbName}
                      onClick={() => startRename(entry)}
                    >
                      {entry.name}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

	        {contextMenu ? (
	          <div
	            className={styles.contextMenu}
	            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
	            ref={contextMenuRef}
	            onContextMenu={(event) => event.preventDefault()}
              onClick={(event) => event.stopPropagation()}
	          >
	            {contextMenu.image ? (
	              <div
	                className={styles.contextMenuSubmenuWrap}
	                onMouseEnter={() => setContextMenuSubmenu("tag-image")}
	              >
                <button
                  type="button"
                  className={styles.contextMenuButton}
                  onMouseEnter={() => setContextMenuSubmenu("tag-image")}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setContextMenuSubmenu("tag-image");
                  }}
                >
	                  {renderContextMenuIcon("tag")}
	                  <span>Tag Image</span>
	                  <span className={styles.contextMenuButtonCaret}>
	                    {contextMenuSubmenuSide === "left" ? "‹" : "›"}
	                  </span>
	                </button>
	                {contextMenuSubmenu === "tag-image" ? (
	                  <div
	                    className={mergeClasses(
	                      styles.contextMenuSubmenu,
	                      contextMenuSubmenuSide === "left"
	                        ? styles.contextMenuSubmenuLeft
	                        : undefined
	                    )}
	                  >
	                    {TAG_IMAGE_OPTIONS.map((tag) => {
	                      const state = getContextMenuImageTagState(tag);
	                      return (
	                        <button
	                          type="button"
	                          className={styles.contextMenuButton}
	                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleContextMenuAction(`tag-image-toggle:${tag}`);
                          }}
	                          key={`tag-toggle-${tag}`}
	                        >
                          <span className={styles.contextMenuTagLabel}>{tag}</span>
                          <span
                            className={mergeClasses(
                              styles.contextMenuTagCheckbox,
                              state === "all"
                                ? styles.contextMenuTagCheckboxChecked
                                : undefined,
                              state === "some"
                                ? styles.contextMenuTagCheckboxMixed
                                : undefined
                            )}
                            aria-hidden="true"
                          >
                            {state === "all" ? (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 12 12"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={styles.contextMenuTagCheckboxIcon}
                              >
                                <path d="M2.4 6.4l2.2 2.2l5 -5" />
                              </svg>
                            ) : state === "some" ? (
                              <span className={styles.contextMenuTagCheckboxBar} />
                            ) : null}
                          </span>
	                        </button>
	                      );
	                    })}
	                  </div>
                ) : null}
              </div>
            ) : null}
	            <button
	              type="button"
	              className={styles.contextMenuButton}
	              onMouseEnter={() => setContextMenuSubmenu(null)}
	              onClick={() => handleContextMenuAction("open")}
	            >
              {renderContextMenuIcon("open")}
              <span>Open</span>
            </button>
            {contextMenu.image ? (
              <button
                type="button"
                className={styles.contextMenuButton}
                disabled={contextMenuMoveToMainDisabled}
                onMouseEnter={() => setContextMenuSubmenu(null)}
                onClick={() => handleContextMenuAction("move-to-main")}
              >
                {renderContextMenuIcon("move-main")}
                <span>Move to Main</span>
              </button>
            ) : null}
	            <button
	              type="button"
	              className={styles.contextMenuButton}
	              onMouseEnter={() => setContextMenuSubmenu(null)}
	              onClick={() => handleContextMenuAction("download")}
	            >
              {renderContextMenuIcon("download")}
              <span>Download</span>
            </button>
	            {isTextFileEditable(contextMenu.entry) ? (
	              <button
	                type="button"
	                className={styles.contextMenuButton}
	                onMouseEnter={() => setContextMenuSubmenu(null)}
	                onClick={() => handleContextMenuAction("view")}
	              >
                {renderContextMenuIcon("open")}
                <span>View</span>
              </button>
            ) : null}
	            <button
		              type="button"
		              className={styles.contextMenuButton}
		              onMouseEnter={() => setContextMenuSubmenu(null)}
		              onClick={() => handleContextMenuAction("create-copy")}
		            >
	              {renderContextMenuIcon("duplicate")}
	              <span>Duplicate</span>
	            </button>
	            {contextMenu.image ? (
	              <button
	                type="button"
	                className={styles.contextMenuButton}
	                onMouseEnter={() => setContextMenuSubmenu(null)}
	                onClick={() => handleContextMenuAction("copy-to-clipboard")}
	              >
	                {renderContextMenuIcon("clipboard")}
	                <span>Copy to Clipboard</span>
	              </button>
	            ) : null}
	            {contextMenu.image ? (
	              <button
	                type="button"
	                className={styles.contextMenuButton}
	                onMouseEnter={() => setContextMenuSubmenu(null)}
	                onClick={() => handleContextMenuAction("undo-last-change")}
	              >
	                {renderContextMenuIcon("undo")}
	                <span>Undo last change</span>
	              </button>
	            ) : null}
	            {contextMenu.image ? (
	              <button
	                type="button"
	                className={styles.contextMenuButton}
	                onMouseEnter={() => setContextMenuSubmenu(null)}
	                onClick={() => handleContextMenuAction("photopea")}
	              >
	                {renderContextMenuIcon("photopea")}
	                <span>Edit with Photopea</span>
	              </button>
	            ) : null}
	            {contextMenu.image ? (
	              <>
			                <button
			                  type="button"
			                  className={styles.contextMenuButton}
		                  onMouseEnter={() => setContextMenuSubmenu(null)}
		                  onClick={() => handleContextMenuAction("ai-auto-center-white")}
		                >
	                  {renderContextMenuIcon("focuscenter")}
	                  <span>Edit Auto Center Wide</span>
	                </button>
	                <div
	                  className={styles.contextMenuSubmenuWrap}
	                  onMouseEnter={() => setContextMenuSubmenu("edit-chatgpt")}
	                >
                  <button
                    type="button"
                    className={styles.contextMenuButton}
                    onMouseEnter={() => setContextMenuSubmenu("edit-chatgpt")}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setContextMenuSubmenu("edit-chatgpt");
                    }}
                  >
	                    {renderContextMenuIcon("ai")}
	                    <span>Edit ChatGPT</span>
	                    <span className={styles.contextMenuButtonCaret}>
	                      {contextMenuSubmenuSide === "left" ? "‹" : "›"}
	                    </span>
	                  </button>
		                  {contextMenuSubmenu === "edit-chatgpt" ? (
		                    <div
		                      className={mergeClasses(
		                        styles.contextMenuSubmenu,
		                        contextMenuSubmenuSide === "left"
		                          ? styles.contextMenuSubmenuLeft
		                          : undefined
		                      )}
		                    >
	                      <button
	                        type="button"
	                        className={styles.contextMenuButton}
	                        onClick={() => handleContextMenuAction("ai-chatgpt-template")}
	                      >
	                        <span>Standard Template</span>
	                      </button>
	                      <button
	                        type="button"
	                        className={styles.contextMenuButton}
	                        onClick={() => handleContextMenuAction("ai-chatgpt-direct")}
	                      >
	                        <span>Direct</span>
	                      </button>
                        <div
                          className={styles.contextMenuSubmenuWrap}
                          onMouseEnter={() => setContextMenuNestedSubmenu("chatgpt-digideal")}
                        >
                          <button
                            type="button"
                            className={styles.contextMenuButton}
                            onMouseEnter={() => setContextMenuNestedSubmenu("chatgpt-digideal")}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setContextMenuNestedSubmenu("chatgpt-digideal");
                            }}
                          >
                            <span>Digideal Main</span>
                            <span className={styles.contextMenuButtonCaret}>
                              {contextMenuSubmenuSide === "left" ? "‹" : "›"}
                            </span>
                          </button>
                          {contextMenuNestedSubmenu === "chatgpt-digideal" ? (
                            <div
                              className={mergeClasses(
                                styles.contextMenuSubmenu,
                                contextMenuSubmenuSide === "left"
                                  ? styles.contextMenuSubmenuLeft
                                  : undefined
                              )}
                            >
                              <button
                                type="button"
                                className={styles.contextMenuButton}
                                onClick={() =>
                                  handleContextMenuAction("ai-chatgpt-digideal-main:1")
                                }
                              >
                                <span>1 image</span>
                              </button>
                              <button
                                type="button"
                                className={styles.contextMenuButton}
                                onClick={() =>
                                  handleContextMenuAction("ai-chatgpt-digideal-main:2")
                                }
                              >
                                <span>2 images</span>
                              </button>
                              <button
                                type="button"
                                className={styles.contextMenuButton}
                                onClick={() =>
                                  handleContextMenuAction("ai-chatgpt-digideal-main:3")
                                }
                              >
                                <span>3 images</span>
                              </button>
                            </div>
                          ) : null}
                        </div>

                        <div
                          className={styles.contextMenuSubmenuWrap}
                          onMouseEnter={() => setContextMenuNestedSubmenu("chatgpt-scene")}
                        >
                          <button
                            type="button"
                            className={styles.contextMenuButton}
                            onMouseEnter={() => setContextMenuNestedSubmenu("chatgpt-scene")}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setContextMenuNestedSubmenu("chatgpt-scene");
                            }}
                          >
                            <span>Product Scene</span>
                            <span className={styles.contextMenuButtonCaret}>
                              {contextMenuSubmenuSide === "left" ? "‹" : "›"}
                            </span>
                          </button>
                          {contextMenuNestedSubmenu === "chatgpt-scene" ? (
                            <div
                              className={mergeClasses(
                                styles.contextMenuSubmenu,
                                contextMenuSubmenuSide === "left"
                                  ? styles.contextMenuSubmenuLeft
                                  : undefined
                              )}
                            >
                              <button
                                type="button"
                                className={styles.contextMenuButton}
                                onClick={() =>
                                  handleContextMenuAction("ai-chatgpt-product-scene:1")
                                }
                              >
                                <span>1 image</span>
                              </button>
                              <button
                                type="button"
                                className={styles.contextMenuButton}
                                onClick={() =>
                                  handleContextMenuAction("ai-chatgpt-product-scene:2")
                                }
                              >
                                <span>2 images</span>
                              </button>
                              <button
                                type="button"
                                className={styles.contextMenuButton}
                                onClick={() =>
                                  handleContextMenuAction("ai-chatgpt-product-scene:3")
                                }
                              >
                                <span>3 images</span>
                              </button>
                            </div>
                          ) : null}
                        </div>
	                    </div>
	                  ) : null}
	                </div>

	                <div
	                  className={styles.contextMenuSubmenuWrap}
	                  onMouseEnter={() => setContextMenuSubmenu("edit-gemini")}
	                >
                  <button
                    type="button"
                    className={styles.contextMenuButton}
                    onMouseEnter={() => setContextMenuSubmenu("edit-gemini")}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setContextMenuSubmenu("edit-gemini");
                    }}
                  >
	                    {renderContextMenuIcon("ai")}
	                    <span>Edit Gemini</span>
	                    <span className={styles.contextMenuButtonCaret}>
	                      {contextMenuSubmenuSide === "left" ? "‹" : "›"}
	                    </span>
	                  </button>
		                  {contextMenuSubmenu === "edit-gemini" ? (
		                    <div
		                      className={mergeClasses(
		                        styles.contextMenuSubmenu,
		                        contextMenuSubmenuSide === "left"
		                          ? styles.contextMenuSubmenuLeft
		                          : undefined
		                      )}
		                    >
	                      <button
	                        type="button"
	                        className={styles.contextMenuButton}
	                        onClick={() => handleContextMenuAction("ai-gemini-template")}
	                      >
	                        <span>Standard Template</span>
	                      </button>
	                      <button
	                        type="button"
	                        className={styles.contextMenuButton}
	                        onClick={() => handleContextMenuAction("ai-gemini-direct")}
	                      >
	                        <span>Direct</span>
	                      </button>
                        <div
                          className={styles.contextMenuSubmenuWrap}
                          onMouseEnter={() => setContextMenuNestedSubmenu("gemini-digideal")}
                        >
                          <button
                            type="button"
                            className={styles.contextMenuButton}
                            onMouseEnter={() => setContextMenuNestedSubmenu("gemini-digideal")}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setContextMenuNestedSubmenu("gemini-digideal");
                            }}
                          >
                            <span>Digideal Main</span>
                            <span className={styles.contextMenuButtonCaret}>
                              {contextMenuSubmenuSide === "left" ? "‹" : "›"}
                            </span>
                          </button>
                          {contextMenuNestedSubmenu === "gemini-digideal" ? (
                            <div
                              className={mergeClasses(
                                styles.contextMenuSubmenu,
                                contextMenuSubmenuSide === "left"
                                  ? styles.contextMenuSubmenuLeft
                                  : undefined
                              )}
                            >
                              <button
                                type="button"
                                className={styles.contextMenuButton}
                                onClick={() =>
                                  handleContextMenuAction("ai-gemini-digideal-main:1")
                                }
                              >
                                <span>1 image</span>
                              </button>
                              <button
                                type="button"
                                className={styles.contextMenuButton}
                                onClick={() =>
                                  handleContextMenuAction("ai-gemini-digideal-main:2")
                                }
                              >
                                <span>2 images</span>
                              </button>
                              <button
                                type="button"
                                className={styles.contextMenuButton}
                                onClick={() =>
                                  handleContextMenuAction("ai-gemini-digideal-main:3")
                                }
                              >
                                <span>3 images</span>
                              </button>
                            </div>
                          ) : null}
                        </div>

                        <div
                          className={styles.contextMenuSubmenuWrap}
                          onMouseEnter={() => setContextMenuNestedSubmenu("gemini-scene")}
                        >
                          <button
                            type="button"
                            className={styles.contextMenuButton}
                            onMouseEnter={() => setContextMenuNestedSubmenu("gemini-scene")}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setContextMenuNestedSubmenu("gemini-scene");
                            }}
                          >
                            <span>Product Scene</span>
                            <span className={styles.contextMenuButtonCaret}>
                              {contextMenuSubmenuSide === "left" ? "‹" : "›"}
                            </span>
                          </button>
                          {contextMenuNestedSubmenu === "gemini-scene" ? (
                            <div
                              className={mergeClasses(
                                styles.contextMenuSubmenu,
                                contextMenuSubmenuSide === "left"
                                  ? styles.contextMenuSubmenuLeft
                                  : undefined
                              )}
                            >
                              <button
                                type="button"
                                className={styles.contextMenuButton}
                                onClick={() =>
                                  handleContextMenuAction("ai-gemini-product-scene:1")
                                }
                              >
                                <span>1 image</span>
                              </button>
                              <button
                                type="button"
                                className={styles.contextMenuButton}
                                onClick={() =>
                                  handleContextMenuAction("ai-gemini-product-scene:2")
                                }
                              >
                                <span>2 images</span>
                              </button>
                              <button
                                type="button"
                                className={styles.contextMenuButton}
                                onClick={() =>
                                  handleContextMenuAction("ai-gemini-product-scene:3")
                                }
                              >
                                <span>3 images</span>
                              </button>
                            </div>
                          ) : null}
                        </div>
	                    </div>
	                  ) : null}
	                </div>
	                <button
	                  type="button"
	                  className={styles.contextMenuButton}
	                  onMouseEnter={() => setContextMenuSubmenu(null)}
	                  onClick={() => handleContextMenuAction("ai-zimage-direct")}
	                >
                  {renderContextMenuIcon("ai")}
                  <span>Edit Z-Image: Direct</span>
                </button>
	                <button
	                  type="button"
	                  className={styles.contextMenuButton}
	                  onMouseEnter={() => setContextMenuSubmenu(null)}
	                  onClick={() => handleContextMenuAction("ai-zimage-white")}
	                >
                  {renderContextMenuIcon("background")}
                  <span>Edit Z-Image: White BG</span>
                </button>
	                <button
	                  type="button"
	                  className={styles.contextMenuButton}
	                  onMouseEnter={() => setContextMenuSubmenu(null)}
	                  onClick={() => handleContextMenuAction("ai-zimage-eraser")}
	                >
                  {renderContextMenuIcon("eraser")}
                  <span>Edit Z-image: Eraser</span>
                </button>
	                <button
	                  type="button"
	                  className={styles.contextMenuButton}
                    disabled={contextMenuUpscaleDisabled}
	                  onMouseEnter={() => setContextMenuSubmenu(null)}
	                  onClick={() => handleContextMenuAction("ai-zimage-upscale")}
	                >
                  {renderContextMenuIcon("upscale")}
                  <span>Edit Z-Image: Upscale</span>
                </button>
              </>
            ) : null}
	          </div>
	        ) : null}

	        <Dialog
	          open={photopeaOpen}
	          onOpenChange={(_, data) => {
	            if (!data.open) {
	              if (photopeaExporting || photopeaPersisting) return;
	              closePhotopea();
	            }
	          }}
	        >
	          <DialogSurface className={styles.photopeaSurface}>
	            <DialogBody className={styles.photopeaBody}>
	              <DialogTitle>
	                {`Photopea - ${photopeaEntry?.name ?? ""}`}
	              </DialogTitle>
	              {photopeaError ? (
	                <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
	                  {photopeaError}
	                </Text>
	              ) : (
	                <Text size={100} className={styles.filesInfo}>
	                  Click Save below to export a JPG from Photopea and replace the draft file.
	                </Text>
	              )}
	              <div className={styles.photopeaFrameWrap}>
	                <iframe
	                  key={`photopea-${photopeaSessionKey}`}
	                  ref={photopeaIframeRef}
	                  className={styles.photopeaFrame}
	                  src={buildPhotopeaUrl()}
	                  title="Photopea"
	                  allow="clipboard-read; clipboard-write"
	                  onLoad={() => {
	                    const win = photopeaIframeRef.current?.contentWindow;
	                    if (!win) return;
	                    // Ping Photopea so it echoes a ready marker back to us (and then "done").
	                    win.postMessage(
	                      'app.echoToOE("__hub_photopea_ready__");',
	                      "https://www.photopea.com"
	                    );
	                  }}
	                />
	                {photopeaLoading || photopeaExporting || photopeaPersisting ? (
	                  <div className={styles.entriesContentOverlay}>
	                    <Spinner size="tiny" />
	                  </div>
	                ) : null}
	              </div>
	              <DialogActions>
	                <Button
	                  appearance="outline"
	                  onClick={requestPhotopeaExport}
	                  disabled={!photopeaReady || photopeaLoading || photopeaExporting || photopeaPersisting}
	                >
	                  {photopeaExporting
	                    ? "Exporting..."
	                    : photopeaPersisting
	                      ? "Saving..."
	                      : "Save"}
	                </Button>
	                <Button
	                  appearance="primary"
	                  onClick={closePhotopea}
	                  disabled={photopeaExporting || photopeaPersisting}
	                >
	                  {t("common.close")}
	                </Button>
	              </DialogActions>
	            </DialogBody>
	          </DialogSurface>
	        </Dialog>

	        <Dialog
	          open={aiEditTargets.length > 0}
	          onOpenChange={(_, data) => {
	            if (!data.open) {
              cancelAiEdit();
            }
          }}
        >
          <DialogSurface className={styles.aiPromptSurface}>
            <DialogBody className={styles.aiPromptBody}>
              <DialogTitle>
                {aiEditTargets.length > 0
                  ? aiEditTargets.length === 1
                    ? `Edit one image with ${aiEditProviderLabel} (${aiEditModeLabel})`
                    : `Edit ${aiEditTargets.length} images with ${aiEditProviderLabel} (${aiEditModeLabel})`
                  : "AI Edit"}
              </DialogTitle>
              {aiEditError ? (
                <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
                  {aiEditError}
                </Text>
              ) : null}
              {aiEditTargets.length === 1 ? (
                <div className={styles.aiPromptImageWrap}>
                  <img
                    src={buildDraftDownloadUrl(
                      aiEditTargets[0].path,
                      entryByPath.get(aiEditTargets[0].path)?.modifiedAt
                    )}
                    alt={aiEditTargets[0].name}
                    className={styles.aiPromptImagePreview}
                  />
                </div>
              ) : null}
              {aiEditHasPromptInput ? (
	                <Field
	                  label={
	                    aiEditMode === "template"
	                      ? aiEditTemplatePreset === "digideal_main"
                          ? "Micro prompt (optional, added to DigiDL Main template)"
                          : "Prompt (inserted into standard template)"
	                      : "Prompt (sent directly)"
	                  }
	                >
                  <Textarea
                    value={aiEditPrompt}
                    onChange={(_, data) => setAiEditPrompt(data.value)}
                    resize="vertical"
                    rows={5}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submitAiEdit();
                      }
                    }}
                  />
                </Field>
              ) : (
                <Text size={200} className={styles.filesInfo}>
                  This action runs without a prompt.
                </Text>
              )}
              <DialogActions>
                <Button
                  appearance="outline"
                  onClick={cancelAiEdit}
                  disabled={aiEditSubmitting}
                >
                  {t("common.close")}
                </Button>
                <Button
                  appearance="primary"
                  onClick={submitAiEdit}
                  disabled={aiEditTargets.length === 0 || aiEditSubmitting}
                >
                  {aiEditSubmitting ? "Running..." : "Run AI Edit"}
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <Dialog
          open={Boolean(aiReviewOriginalPath && aiReviewRecord)}
          onOpenChange={(_, data) => {
            if (!data.open && !aiReviewSubmitting) {
              setAiReviewOriginalPath(null);
            }
          }}
        >
          <DialogSurface className={styles.aiCompareSurface}>
            <DialogBody className={styles.aiCompareBody}>
              <DialogTitle>AI Edit Review</DialogTitle>
              {aiReviewRecord ? (
                <div className={styles.aiCompareGrid}>
                  <div className={styles.aiComparePanel}>
                    <Text size={300} className={styles.aiCompareLabel}>
                      AI Generated (Primary)
                    </Text>
                    <Text size={200} className={styles.filesInfo}>
                      {`Q ${aiReviewPendingScore ?? "-"}${
                        aiReviewScoreDelta === null
                          ? ""
                          : aiReviewScoreDelta > 0
                            ? ` (+${aiReviewScoreDelta})`
                            : ` (${aiReviewScoreDelta})`
                      }`}
                    </Text>
                    <div className={styles.aiCompareImageFrame}>
                      <img
                        src={buildDraftDownloadUrl(
                          aiReviewRecord.pendingPath,
                          aiReviewRecord.updatedAt
                        )}
                        alt="AI generated"
                        className={styles.aiCompareImage}
                      />
                    </div>
                  </div>
                  <div className={styles.aiComparePanel}>
                    <Text size={300} className={styles.aiCompareLabel}>
                      Original (Secondary)
                    </Text>
                    <Text size={200} className={styles.filesInfo}>
                      {`Q ${aiReviewOriginalScore ?? "-"}`}
                    </Text>
                    <div className={styles.aiCompareImageFrame}>
                      <img
                        src={buildDraftDownloadUrl(
                          aiReviewRecord.originalPath,
                          entryByPath.get(aiReviewRecord.originalPath)?.modifiedAt ??
                            aiReviewRecord.updatedAt
                        )}
                        alt="Original"
                        className={styles.aiCompareImage}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <Text size={200}>No pending AI edit found.</Text>
              )}
              <DialogActions>
                <Button
                  appearance="outline"
                  onClick={() => setAiReviewOriginalPath(null)}
                  disabled={aiReviewSubmitting}
                >
                  {t("common.close")}
                </Button>
                <Button
                  appearance="outline"
                  onClick={() =>
                    aiReviewOriginalPath
                      ? resolveAiEdit(aiReviewOriginalPath, "keep_original")
                      : undefined
                  }
                  disabled={!aiReviewOriginalPath || aiReviewSubmitting}
                >
                  {aiReviewSubmitting ? "Saving..." : "Keep Original"}
                </Button>
                <Button
                  appearance="outline"
                  onClick={() =>
                    aiReviewOriginalPath
                      ? resolveAiEdit(aiReviewOriginalPath, "keep_both")
                      : undefined
                  }
                  disabled={!aiReviewOriginalPath || aiReviewSubmitting}
                >
                  {aiReviewSubmitting ? "Saving..." : "Keep Both"}
                </Button>
                <Button
                  appearance="primary"
                  onClick={() =>
                    aiReviewOriginalPath
                      ? resolveAiEdit(aiReviewOriginalPath, "replace_with_ai")
                      : undefined
                  }
                  disabled={!aiReviewOriginalPath || aiReviewSubmitting}
                >
                  {aiReviewSubmitting ? "Saving..." : "Replace with AI Image"}
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <Dialog
          open={Boolean(previewPath)}
          onOpenChange={(_, data) => {
            if (!data.open) {
              setPreviewPath(null);
            }
          }}
        >
          <DialogSurface className={styles.previewDialog}>
            <DialogBody className={styles.previewDialogBody}>
              <DialogTitle>{`Image - ${previewFileName || ""}`}</DialogTitle>
              <div
                className={styles.previewImageFrame}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (!previewEntry) return;
                  setContextMenuSubmenu(null);
                  setContextMenuNestedSubmenu(null);
                  setContextMenu({
                    entry: previewEntry,
                    image: true,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
              >
                {previewPendingAi && previewPath ? (
                  <button
                    type="button"
                    className={styles.aiPendingBadge}
                    title={`Review AI edit for ${previewFileName || "image"}`}
                    aria-label={`Review AI edit for ${previewFileName || "image"}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const pathValue = previewPath;
                      setPreviewPath(null);
                      setAiReviewOriginalPath(pathValue);
                    }}
                    disabled={previewBusy}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      width="16"
                      height="16"
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
                  </button>
                ) : null}

                {previewNav.prevPath ? (
                  <button
                    type="button"
                    className={mergeClasses(
                      styles.previewNavButton,
                      styles.previewNavButtonLeft
                    )}
                    onClick={() => handlePreviewNavigate("prev")}
                    aria-label="Previous image"
                    title="Previous image"
                    disabled={previewBusy || previewDeletePending}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className={styles.previewNavIcon}
                      aria-hidden="true"
                    >
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M13.883 5.007l.058 -.005h.118l.058 .005l.06 .009l.052 .01l.108 .032l.067 .027l.132 .07l.09 .065l.081 .073l.083 .094l.054 .077l.054 .096l.017 .036l.027 .067l.032 .108l.01 .053l.01 .06l.004 .057l.002 .059v12c0 .852 -.986 1.297 -1.623 .783l-.084 -.076l-6 -6a1 1 0 0 1 -.083 -1.32l.083 -.094l6 -6l.094 -.083l.077 -.054l.096 -.054l.036 -.017l.067 -.027l.108 -.032l.053 -.01l.06 -.01z" />
                    </svg>
                  </button>
                ) : null}

                {previewNav.nextPath ? (
                  <button
                    type="button"
                    className={mergeClasses(
                      styles.previewNavButton,
                      styles.previewNavButtonRight
                    )}
                    onClick={() => handlePreviewNavigate("next")}
                    aria-label="Next image"
                    title="Next image"
                    disabled={previewBusy || previewDeletePending}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className={styles.previewNavIcon}
                      aria-hidden="true"
                    >
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M9 6c0 -.852 .986 -1.297 1.623 -.783l.084 .076l6 6a1 1 0 0 1 .083 1.32l-.083 .094l-6 6l-.094 .083l-.077 .054l-.096 .054l-.036 .017l-.067 .027l-.108 .032l-.053 .01l-.06 .01l-.057 .004l-.059 .002l-.059 -.002l-.058 -.005l-.06 -.009l-.052 -.01l-.108 -.032l-.067 -.027l-.132 -.07l-.09 -.065l-.081 -.073l-.083 -.094l-.054 -.077l-.054 -.096l-.017 -.036l-.027 -.067l-.032 -.108l-.01 -.053l-.01 -.06l-.004 -.057l-.002 -12.059z" />
                    </svg>
                  </button>
                ) : null}

                {previewDisplayPath ? (
                  <img
                    src={buildDraftDownloadUrl(
                      previewDisplayPath,
                      previewDisplayModifiedAt
                    )}
                    alt={previewDisplayPath}
                    data-preview-path={previewPath}
                    className={mergeClasses(
                      styles.previewImageLarge,
                      previewBusy ? styles.mediaImageBusy : undefined
                    )}
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      const pathValue =
                        event.currentTarget.dataset.previewPath || previewPath;
                      if (!pathValue) return;
                      setImageDimensions((prev) => ({
                        ...prev,
                        [pathValue]: {
                          width: img.naturalWidth,
                          height: img.naturalHeight,
                        },
                      }));
                      setReloadingImagePaths((prev) => {
                        if (!prev.has(pathValue)) return prev;
                        const next = new Set(prev);
                        next.delete(pathValue);
                        return next;
                      });
                    }}
                  />
                ) : null}

                {previewBusy ? (
                  <div className={styles.mediaBusyOverlay}>
                    <div className={styles.mediaBusyContent}>
                      <Spinner size="small" />
                      <span>Updating</span>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className={styles.previewMetaRow}>
                <Text size={100} className={styles.previewMetaText}>
                  {previewDimensions ? (
                    <>
                      <span
                        className={mergeClasses(
                          previewDimensions.width < 800 || previewDimensions.height < 800
                            ? styles.mediaMetaDimLow
                            : undefined
                        )}
                      >
                        {`${previewDimensions.width} x ${previewDimensions.height}`}
                      </span>
                      {` | ${previewFileSizeText}`}
                    </>
                  ) : (
                    `- | ${previewFileSizeText}`
                  )}
                </Text>
                <DialogActions className={styles.previewActions}>
                  <Button
                    appearance="outline"
                    onClick={() => void handlePreviewDelete()}
                    disabled={!previewPath || previewBusy || previewDeletePending}
                  >
                    {previewDeletePending ? "Deleting..." : "Delete"}
                  </Button>
                  <Button appearance="primary" onClick={() => setPreviewPath(null)}>
                    {t("common.close")}
                  </Button>
                </DialogActions>
              </div>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <Dialog
          open={Boolean(fileViewerPath)}
          onOpenChange={(_, data) => {
            if (!data.open) {
              setFileViewerPath(null);
              setFileViewerContent("");
              setFileViewerError(null);
            }
          }}
        >
          <DialogSurface className={styles.textViewerSurface}>
            <DialogBody className={styles.textViewerBody}>
              <DialogTitle>{fileViewerPath ?? "File viewer"}</DialogTitle>
              {fileViewerError ? (
                <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
                  {fileViewerError}
                </Text>
              ) : null}
              {fileViewerLoading ? (
                <Spinner size="small" />
              ) : (
                <Textarea
                  value={fileViewerContent}
                  onChange={(_, data) => setFileViewerContent(data.value)}
                  resize="vertical"
                  rows={24}
                  className={styles.textViewerArea}
                />
              )}
              <DialogActions className={styles.textViewerActions}>
                <Button
                  appearance="outline"
                  onClick={() => {
                    setFileViewerPath(null);
                    setFileViewerContent("");
                    setFileViewerError(null);
                  }}
                  disabled={fileViewerSaving}
                >
                  {t("common.close")}
                </Button>
                <Button
                  appearance="primary"
                  onClick={handleSaveFileViewer}
                  disabled={!fileViewerPath || fileViewerLoading || fileViewerSaving}
                >
                  {fileViewerSaving ? "Saving..." : t("common.save")}
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </Card>

      <Card className={styles.uploadCard}>
        <div className={styles.header}>
          <Text size={500} weight="semibold">
            {t("bulkProcessing.import.title")}
          </Text>
        </div>
        <div className={styles.uploadRow}>
          <Field label={t("bulkProcessing.import.excel")}>
            <input
              type="file"
              accept=".xlsx"
              className={styles.fileInput}
              onChange={(event) =>
                setExcelFile(event.target.files?.[0] ?? null)
              }
            />
          </Field>
          <Button
            appearance="outline"
            onClick={() => handleImport("excel")}
            disabled={!excelFile || excelStatus === "uploading"}
          >
            {excelStatus === "uploading"
              ? t("bulkProcessing.import.uploading")
              : t("bulkProcessing.import.upload")}
          </Button>
          <Field label={t("bulkProcessing.import.zip")}>
            <input
              type="file"
              accept=".zip"
              className={styles.fileInput}
              onChange={(event) => setZipFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          <Button
            appearance="outline"
            onClick={() => handleImport("zip")}
            disabled={!zipFile || zipStatus === "uploading"}
          >
            {zipStatus === "uploading"
              ? t("bulkProcessing.import.uploading")
              : t("bulkProcessing.import.upload")}
          </Button>
          {excelStatus === "done" ? (
            <Text size={200}>{t("bulkProcessing.import.done")}</Text>
          ) : null}
          {zipStatus === "done" ? (
            <Text size={200}>{t("bulkProcessing.import.done")}</Text>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
