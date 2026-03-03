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
  Input,
  Dropdown,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Textarea,
  Spinner,
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
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { formatCurrency, formatDate } from "@/lib/format";
import { collectMacros } from "@/lib/email-templates";
import { formatOrderContentList } from "@/lib/orders/content-list";
import {
  buildOrderEmailMacroVariables,
  resolvePreferredOrderIdFromItems,
} from "@/lib/orders/email-macros";
import { normalizeOrderPlatformName } from "@/lib/orders/platform";

type OrderRow = {
  id: string;
  sales_channel_id: string | null;
  order_number: string | null;
  sales_channel_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_city: string | null;
  customer_zip: string | null;
  customer_country_code?: string | null;
  customer_country?: string | null;
  transaction_date: string | null;
  date_shipped: string | null;
  status: string | null;
  order_total_value?: number | null;
  is_delayed: boolean;
  delay_days: number | null;
  latest_notification_name?: string | null;
  latest_notification_sent_at?: string | null;
  partner_informed?: boolean | null;
};

type OrderItem = {
  id: string;
  item_image_url?: string | null;
  sku: string | null;
  quantity: number | null;
  sales_value_eur: number | null;
  marketplace_order_number: string | null;
  sales_channel_order_number: string | null;
  product_title: string | null;
  product_spu: string | null;
};

type TrackingNumberEntry = {
  tracking_number: string;
  sent_date: string | null;
};

type OrderEmailHistoryEntry = {
  id: string;
  created_at: string | null;
  send_date: string | null;
  sender_email: string | null;
  recipient_email: string | null;
  subject: string | null;
  status: string | null;
  notification_name: string | null;
};

type OrderDetails = {
  order?: {
    sales_channel_id: string | null;
    order_number: string | null;
    sales_channel_name: string | null;
    customer_name: string | null;
    customer_address: string | null;
    customer_zip: string | null;
    customer_city: string | null;
    customer_phone: string | null;
    customer_email: string | null;
    transaction_date: string | null;
    date_shipped: string | null;
    status: string | null;
    manual_email_history?: string | null;
    customer_note?: string | null;
  } | null;
  items: OrderItem[];
  tracking_numbers: TrackingNumberEntry[];
  email_history: OrderEmailHistoryEntry[];
  loading: boolean;
  error?: string;
};

type OrderDetailsEditDraft = {
  customer_name: string;
  customer_address: string;
  customer_zip: string;
  customer_city: string;
  customer_phone: string;
  customer_email: string;
  shipping: string;
  tracking_number: string;
  email_history: string;
  notes: string;
};

type ResendItemDraft = {
  id: string;
  sku: string;
  title: string;
  quantity: string;
  price: string;
  isPlaceholder?: boolean;
};

type ResendDraft = {
  orderId: string;
  salesChannelId: string;
  orderNumber: string;
  salesChannel: string;
  customerName: string;
  customerAddress: string;
  customerZip: string;
  customerCity: string;
  customerPhone: string;
  customerEmail: string;
  transactionDate: string;
  comment: string;
  items: ResendItemDraft[];
};

type EmailTemplateOption = {
  template_id: string;
  name: string;
  subject_template: string;
  body_template: string;
  macros?: string[];
};

type EmailSenderOption = {
  email: string;
  name?: string | null;
  status?: string | null;
  signature?: string | null;
  signatureUpdatedAt?: string | null;
};

type EmailTemplatePreview = {
  rendered_subject: string;
  rendered_body: string;
  macro_resolution?: {
    unknownMacros?: string[];
    deprecatedMacros?: string[];
    missingRequiredMacros?: string[];
  };
};

type OrdersEmailDialogMode = "partner_only" | "delivery_letsdeal";

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    flex: 1,
    minHeight: 0,
  },
  filtersCard: {
    padding: "16px",
    borderRadius: "16px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  filterRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "flex-end",
  },
  filterLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground4,
    fontWeight: tokens.fontWeightRegular,
    lineHeight: tokens.lineHeightBase100,
  },
  filterField: {
    minWidth: "190px",
  },
  searchInput: {
    width: "420px",
    maxWidth: "100%",
  },
  tableCard: {
    padding: "16px",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },
  tableWrapper: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  tableLoadingState: {
    minHeight: "96px",
    padding: "18px 12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
  tableLoadingLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  paginationBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "10px",
  },
  paginationMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  paginationControls: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  paginationPageSize: {
    minWidth: "118px",
  },
  stickyHeader: {
    position: "sticky",
    top: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    zIndex: 1,
  },
  tableRow: {
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  tableRowAlt: {
    backgroundColor: tokens.colorNeutralBackground2,
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
  },
  actionMenuButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
  actionButtonArrow: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    lineHeight: 1,
  },
  columnsPopover: {
    width: "280px",
    maxWidth: "90vw",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  columnsHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  columnsHeaderText: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  columnsOptionsList: {
    maxHeight: "260px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  columnsOptionRow: {
    minHeight: "32px",
    padding: "3px 6px",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  columnsActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    paddingTop: "8px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  columnsCounter: {
    display: "flex",
    justifyContent: "flex-end",
    paddingTop: "8px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  clickableRow: {
    cursor: "pointer",
  },
  detailsCell: {
    backgroundColor: tokens.colorNeutralBackground1,
  },
  selectCell: {
    width: "40px",
    minWidth: "40px",
    textAlign: "center",
    paddingLeft: "4px",
    paddingRight: "4px",
  },
  colSalesChannelId: {
    width: "132px",
    minWidth: "132px",
    whiteSpace: "nowrap",
  },
  colOrderNumber: {
    width: "170px",
    minWidth: "170px",
    whiteSpace: "nowrap",
  },
  colSalesChannel: {
    width: "160px",
    minWidth: "160px",
  },
  colCustomer: {
    width: "250px",
    minWidth: "250px",
  },
  colCountry: {
    width: "120px",
    minWidth: "120px",
    whiteSpace: "nowrap",
  },
  colOrderValue: {
    width: "120px",
    minWidth: "120px",
    whiteSpace: "nowrap",
  },
  colTransactionDate: {
    width: "126px",
    minWidth: "126px",
    whiteSpace: "nowrap",
  },
  colStatus: {
    width: "150px",
    minWidth: "150px",
    whiteSpace: "nowrap",
  },
  colWarnings: {
    width: "130px",
    minWidth: "130px",
    whiteSpace: "nowrap",
  },
  colNotifications: {
    width: "260px",
    minWidth: "260px",
  },
  colPartnerInformed: {
    width: "140px",
    minWidth: "140px",
    whiteSpace: "nowrap",
  },
  colDateShipped: {
    width: "126px",
    minWidth: "126px",
    whiteSpace: "nowrap",
  },
  detailsCard: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "12px 0",
  },
  detailsSection: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  detailsSplit: {
    display: "grid",
    gridTemplateColumns: "60% 40%",
    gap: "16px",
    alignItems: "start",
    "@media (max-width: 960px)": {
      gridTemplateColumns: "1fr",
    },
  },
  detailsPanel: {
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  detailsPanelGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "16px",
    "@media (max-width: 960px)": {
      gridTemplateColumns: "1fr",
    },
  },
  detailsInfoGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  detailsColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  detailsRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "6px",
  },
  detailsInfoKey: {
    width: "72px",
    flexShrink: 0,
  },
  detailLabel: {
    color: tokens.colorNeutralForeground3,
  },
  detailValue: {
    color: tokens.colorNeutralForeground1,
  },
  trackingList: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    alignItems: "flex-start",
  },
  trackingInline: {
    display: "inline-flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  trackingLink: {
    color: tokens.colorBrandForeground1,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    ":hover": {
      textDecoration: "underline",
    },
  },
  trackingItem: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: "6px",
  },
  trackingDate: {
    color: tokens.colorNeutralForeground4,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
  },
  detailsTableWrapper: {
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "auto",
  },
  detailsTable: {
    tableLayout: "fixed",
    width: "100%",
  },
  detailsTableHeader: {
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground3,
  },
  detailsColTitle: {
    width: "250px",
  },
  detailsColSelect: {
    width: "6%",
  },
  detailsColImage: {
    width: "72px",
  },
  detailsColSku: {
    width: "200px",
  },
  detailsColQty: {
    width: "40px",
  },
  detailsColSalesValue: {
    width: "90px",
  },
  detailsColMarketplace: {
    minWidth: "160px",
  },
  detailsColSalesChannel: {
    minWidth: "160px",
  },
  detailsTitleCell: {
    paddingRight: "8px",
  },
  detailsTitleText: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  itemImageWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "45px",
    height: "45px",
    marginTop: "2px",
    marginBottom: "2px",
    borderRadius: "8px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
    cursor: "zoom-in",
  },
  itemImageThumb: {
    width: "45px",
    height: "45px",
    borderRadius: "7px",
    objectFit: "cover",
    display: "block",
  },
  floatingImagePreview: {
    position: "fixed",
    width: "100px",
    height: "100px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: "0 12px 24px rgba(0,0,0,0.2)",
    padding: "4px",
    pointerEvents: "none",
    zIndex: 99999,
  },
  floatingImagePreviewImg: {
    width: "100%",
    height: "100%",
    borderRadius: "7px",
    objectFit: "cover",
    display: "block",
  },
  statusPill: {
    display: "inline-flex",
    alignSelf: "flex-start",
    alignItems: "center",
    padding: "2px 10px",
    borderRadius: "999px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: "nowrap",
  },
  statusPending: {
    color: tokens.colorStatusWarningForeground1,
    backgroundColor: tokens.colorStatusWarningBackground1,
    border: `1px solid ${tokens.colorStatusWarningBorder1}`,
  },
  statusPurchased: {
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  statusPacking: {
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
    border: `1px solid ${tokens.colorBrandStroke1}`,
  },
  statusShipped: {
    color: tokens.colorStatusSuccessForeground1,
    backgroundColor: tokens.colorStatusSuccessBackground1,
    border: `1px solid ${tokens.colorStatusSuccessBorder1}`,
  },
  warningPill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 10px",
    borderRadius: "999px",
    border: `1px solid ${tokens.colorStatusDangerBorder1}`,
    color: tokens.colorStatusDangerForeground1,
    backgroundColor: tokens.colorStatusDangerBackground1,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: "nowrap",
  },
  countryCell: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    whiteSpace: "nowrap",
  },
  countryFlag: {
    width: "19px",
    height: "19px",
    display: "block",
    marginTop: "2px",
    marginBottom: "2px",
    flexShrink: 0,
    opacity: 0.8,
  },
  notificationField: {
    display: "inline-flex",
    alignItems: "center",
    maxWidth: "220px",
    minHeight: "24px",
    padding: "2px 10px",
    borderRadius: "8px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  notificationFieldHas: {
    backgroundColor: tokens.colorStatusWarningBackground1,
    border: `1px solid ${tokens.colorStatusWarningBorder1}`,
  },
  statusDialog: {
    width: "420px",
    maxWidth: "95vw",
  },
  statusDialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  errorText: {
    color: tokens.colorStatusDangerForeground1,
  },
  resendDialog: {
    width: "720px",
    maxWidth: "96vw",
  },
  resendDialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  resendSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  resendMetaRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
    "@media (max-width: 720px)": {
      gridTemplateColumns: "1fr",
    },
  },
  resendAddressGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
    "@media (max-width: 720px)": {
      gridTemplateColumns: "1fr",
    },
  },
  resendItemsWrapper: {
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "auto",
    maxHeight: "280px",
  },
  resendRemoveCell: {
    width: "48px",
    textAlign: "center",
  },
  rowRemoveButton: {
    minWidth: "24px",
    height: "24px",
    padding: 0,
    borderRadius: "4px",
    border: "none",
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground2,
    "&:hover": {
      color: tokens.colorStatusDangerBorder1,
    },
  },
  resendTable: {
    tableLayout: "fixed",
    width: "100%",
  },
  resendInput: {
    width: "100%",
  },
  resendDialogActions: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resendActionGroup: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  emailDialog: {
    width: "980px",
    maxWidth: "96vw",
  },
  emailDialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  emailSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  emailTemplateEditor: {
    minHeight: "220px",
  },
  emailSelectionMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  emailPreviewCard: {
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  emailPreviewHeader: {
    padding: "10px 12px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  emailPreviewBody: {
    padding: "12px",
    maxHeight: "300px",
    overflowY: "auto",
  },
  emailMacroBadges: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  emailInfoText: {
    color: tokens.colorStatusSuccessForeground1,
  },
  emailHistoryList: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  emailHistoryItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  emailHistoryDate: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  detailsEditField: {
    width: "100%",
  },
  detailsEditTextarea: {
    width: "100%",
    minHeight: "64px",
  },
  detailsEditActions: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    marginTop: "8px",
  },
  emailDialogActions: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  emailActionGroup: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
});

const TrashIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    aria-hidden="true"
    focusable="false"
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

const createEmptyResendRow = (): ResendItemDraft => ({
  id: `draft-new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  sku: "",
  title: "",
  quantity: "",
  price: "",
  isPlaceholder: true,
});

const normalizeTrackingEntries = (value: unknown): TrackingNumberEntry[] => {
  if (!Array.isArray(value)) return [];
  const entries: TrackingNumberEntry[] = [];
  value.forEach((entry) => {
    if (typeof entry === "string") {
      const tracking = entry.trim();
      if (!tracking) return;
      entries.push({ tracking_number: tracking, sent_date: null });
      return;
    }
    if (typeof entry === "object" && entry !== null) {
      const tracking = String(
        (entry as { tracking_number?: unknown }).tracking_number ?? ""
      ).trim();
      if (!tracking) return;
      const sentDateRaw = (entry as { sent_date?: unknown }).sent_date;
      const sentDate = sentDateRaw ? String(sentDateRaw).trim() : null;
      entries.push({
        tracking_number: tracking,
        sent_date: sentDate || null,
      });
    }
  });
  return entries;
};

const resolvePrimaryTrackingNumber = (entries: TrackingNumberEntry[]) => {
  const candidates = entries
    .map((entry) => ({
      tracking: String(entry.tracking_number ?? "").trim(),
      sentDate: String(entry.sent_date ?? "").trim(),
    }))
    .filter((entry) => Boolean(entry.tracking));
  if (candidates.length === 0) return "";
  candidates.sort((left, right) => {
    if (left.sentDate && right.sentDate) {
      if (left.sentDate > right.sentDate) return -1;
      if (left.sentDate < right.sentDate) return 1;
      return left.tracking.localeCompare(right.tracking);
    }
    if (left.sentDate) return -1;
    if (right.sentDate) return 1;
    return left.tracking.localeCompare(right.tracking);
  });
  return candidates[0]?.tracking ?? "";
};

const normalizeEmailHistoryEntries = (
  value: unknown
): OrderEmailHistoryEntry[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = String(row.id ?? "").trim();
      if (!id) return null;
      const toText = (input: unknown) => {
        const token = String(input ?? "").trim();
        return token || null;
      };
      return {
        id,
        created_at: toText(row.created_at),
        send_date: toText(row.send_date),
        sender_email: toText(row.sender_email),
        recipient_email: toText(row.recipient_email),
        subject: toText(row.subject),
        status: toText(row.status),
        notification_name: toText(row.notification_name),
      };
    })
    .filter((entry): entry is OrderEmailHistoryEntry => Boolean(entry));
};

type DisplayOrderStatus =
  | "pending"
  | "purchased"
  | "being_packed_and_shipped"
  | "shipped";

type DateSortOption =
  | "transaction_asc"
  | "transaction_desc"
  | "shipped_asc"
  | "shipped_desc";
type NotificationFilterOption = "all" | "have" | "none";

type CountryCode = "NO" | "SE" | "FI";
type HoverImagePreview = {
  src: string;
  alt: string;
  x: number;
  y: number;
};

const ORDERS_PAGE_SIZE_OPTIONS = [100, 250, 500, 1000] as const;
const DATE_SORT_OPTIONS: DateSortOption[] = [
  "transaction_asc",
  "transaction_desc",
  "shipped_asc",
  "shipped_desc",
];
const STATUS_FILTER_OPTIONS = new Set<string>([
  "all",
  "pending",
  "purchased",
  "being_packed_and_shipped",
  "shipped",
]);
const WARNING_FILTER_OPTIONS = new Set<string>(["all", "delayed", "on_time"]);
const NOTIFICATION_FILTER_OPTIONS = new Set<NotificationFilterOption>([
  "all",
  "have",
  "none",
]);
const COUNTRY_FILTER_OPTIONS = new Set(["all", "NO", "SE", "FI"]);
const KNOWN_SALES_CHANNEL_OPTIONS = [
  "LetsDeal",
  "Offerilla",
  "Digideal",
  "Sparklar",
] as const;
const ORDERS_COLUMNS_STORAGE_KEY = "orders:view:visible-columns:v1";
const ORDER_COLUMN_KEYS = [
  "sales_channel_id",
  "order_number",
  "sales_channel",
  "customer",
  "country",
  "order_value",
  "transaction_date",
  "status",
  "warnings",
  "notifications",
  "partner_informed",
  "date_shipped",
] as const;

type OrdersColumnKey = (typeof ORDER_COLUMN_KEYS)[number];

const ORDER_COLUMN_KEY_SET = new Set<OrdersColumnKey>(ORDER_COLUMN_KEYS);
const ORDER_COLUMN_LABEL_KEY_BY_ID: Record<OrdersColumnKey, string> = {
  sales_channel_id: "orders.columns.salesChannelId",
  order_number: "orders.columns.orderNumber",
  sales_channel: "orders.columns.salesChannel",
  customer: "orders.columns.customer",
  country: "orders.columns.country",
  order_value: "orders.columns.orderValue",
  transaction_date: "orders.columns.transactionDate",
  status: "orders.columns.status",
  warnings: "orders.columns.warnings",
  notifications: "orders.columns.notifications",
  partner_informed: "orders.columns.partnerInformed",
  date_shipped: "orders.columns.dateShipped",
};

const normalizeVisibleOrderColumns = (value: unknown): OrdersColumnKey[] => {
  if (!Array.isArray(value)) return [...ORDER_COLUMN_KEYS];

  const unique = new Set<OrdersColumnKey>();
  value.forEach((entry) => {
    const token = String(entry ?? "").trim() as OrdersColumnKey;
    if (ORDER_COLUMN_KEY_SET.has(token)) {
      unique.add(token);
    }
  });

  const ordered = ORDER_COLUMN_KEYS.filter((key) => unique.has(key));
  if (ordered.length === 0) return [...ORDER_COLUMN_KEYS];
  return ordered;
};

type UrlSearchParamsLike = {
  get: (key: string) => string | null;
  getAll?: (key: string) => string[];
};

type OrdersViewUrlState = {
  searchQuery: string;
  transactionFrom: string;
  transactionTo: string;
  shippedFrom: string;
  shippedTo: string;
  countryFilter: string;
  salesChannelFilters: string[];
  statusFilter: string;
  warningFilter: string;
  notificationFilter: NotificationFilterOption;
  dateSortOption: DateSortOption;
  page: number;
  pageSize: number;
};

const parsePositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const normalizeSalesChannelFilters = (values: unknown[]) =>
  Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .filter((value) => value.toLowerCase() !== "all")
    )
  ).sort((left, right) => left.localeCompare(right));

const getSearchParamValues = (params: UrlSearchParamsLike, key: string) => {
  if (typeof params.getAll === "function") {
    return params.getAll(key);
  }
  const value = params.get(key);
  return value ? [value] : [];
};

const parseSalesChannelFiltersFromUrl = (params: UrlSearchParamsLike) =>
  normalizeSalesChannelFilters(
    getSearchParamValues(params, "sales_channel").flatMap((value) =>
      String(value ?? "").split(",")
    )
  );

const parseOrdersViewUrlState = (params: UrlSearchParamsLike): OrdersViewUrlState => {
  const searchQuery = String(params.get("q") ?? "").trim();
  const transactionFrom = String(params.get("transaction_from") ?? "").trim();
  const transactionTo = String(params.get("transaction_to") ?? "").trim();
  const shippedFrom = String(params.get("shipped_from") ?? "").trim();
  const shippedTo = String(params.get("shipped_to") ?? "").trim();

  const countryToken = String(params.get("country") ?? "all")
    .trim()
    .toUpperCase();
  const countryFilter = COUNTRY_FILTER_OPTIONS.has(countryToken)
    ? countryToken
    : "all";

  const salesChannelFilters = parseSalesChannelFiltersFromUrl(params);

  const statusToken = String(params.get("status") ?? "all")
    .trim()
    .toLowerCase();
  const statusFilter = STATUS_FILTER_OPTIONS.has(statusToken) ? statusToken : "all";

  const warningToken = String(params.get("warning") ?? "all")
    .trim()
    .toLowerCase();
  const warningFilter = WARNING_FILTER_OPTIONS.has(warningToken)
    ? warningToken
    : "all";

  const notificationToken = String(params.get("notification") ?? "all")
    .trim()
    .toLowerCase() as NotificationFilterOption;
  const notificationFilter = NOTIFICATION_FILTER_OPTIONS.has(notificationToken)
    ? notificationToken
    : "all";

  const dateSortToken = String(params.get("date_sort") ?? "transaction_desc")
    .trim()
    .toLowerCase() as DateSortOption;
  const dateSortOption = DATE_SORT_OPTIONS.includes(dateSortToken)
    ? dateSortToken
    : "transaction_desc";

  const page = parsePositiveInt(params.get("page"), 1);
  const pageSizeRaw = parsePositiveInt(
    params.get("page_size"),
    ORDERS_PAGE_SIZE_OPTIONS[0]
  );
  const pageSize = ORDERS_PAGE_SIZE_OPTIONS.includes(
    pageSizeRaw as (typeof ORDERS_PAGE_SIZE_OPTIONS)[number]
  )
    ? pageSizeRaw
    : ORDERS_PAGE_SIZE_OPTIONS[0];

  return {
    searchQuery,
    transactionFrom,
    transactionTo,
    shippedFrom,
    shippedTo,
    countryFilter,
    salesChannelFilters,
    statusFilter,
    warningFilter,
    notificationFilter,
    dateSortOption,
    page,
    pageSize,
  };
};

const DEFAULT_ORDERS_VIEW_URL_STATE: OrdersViewUrlState = parseOrdersViewUrlState(
  new URLSearchParams()
);

const getCurrentOrdersUrlQuery = () => {
  if (typeof window === "undefined") return "";
  return window.location.search.startsWith("?")
    ? window.location.search.slice(1)
    : window.location.search;
};

const flagByCountryCode: Record<CountryCode, string> = {
  NO: "/icons/flags/no.svg",
  SE: "/icons/flags/se.svg",
  FI: "/icons/flags/fi.svg",
};

const normalizeDisplayStatus = (status: unknown): DisplayOrderStatus => {
  const token = String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z]/g, "");
  if (token === "pending") return "pending";
  if (token === "purchased") return "purchased";
  if (token === "beingpackedandshipped" || token === "packingandshipping") {
    return "being_packed_and_shipped";
  }
  return "shipped";
};

const normalizeCountryCode = (value: unknown): string | null => {
  const token = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return token.length === 2 ? token : null;
};

const getCountryCodeFromSalesChannelId = (salesChannelId: unknown): string | null => {
  const value = String(salesChannelId ?? "").trim().toUpperCase();
  const suffix = value.slice(-2);
  return normalizeCountryCode(suffix);
};

const getCountryCodeForOrder = (row: Pick<OrderRow, "sales_channel_id" | "customer_country_code">): CountryCode | null => {
  const value =
    normalizeCountryCode(row.customer_country_code) ||
    getCountryCodeFromSalesChannelId(row.sales_channel_id);
  if (value === "NO" || value === "SE" || value === "FI") return value;
  return null;
};

const ORDER_EMAIL_BCC_OPTIONS = [
  "support@letsdeal.se",
  "support@letsdeal.no",
] as const;
const ORDER_EMAIL_DIALOG_MODE = {
  PARTNER_ONLY: "partner_only",
  DELIVERY_LETSDEAL: "delivery_letsdeal",
} as const;
const ORDER_EMAIL_PARTNER_RECEIVER_OPTIONS = [
  {
    key: "none",
    labelKey: "orders.email.partnerReceiver.none",
  },
  {
    key: "letsdeal_se",
    labelKey: "orders.email.partnerReceiver.letsdealSe",
  },
  {
    key: "letsdeal_no",
    labelKey: "orders.email.partnerReceiver.letsdealNo",
  },
] as const;

const eventHasShiftKey = (event: unknown) => {
  if (!event || typeof event !== "object") return false;
  const candidate = event as {
    shiftKey?: unknown;
    nativeEvent?: { shiftKey?: unknown };
  };
  if (typeof candidate.shiftKey === "boolean") {
    return candidate.shiftKey;
  }
  if (typeof candidate.nativeEvent?.shiftKey === "boolean") {
    return candidate.nativeEvent.shiftKey;
  }
  return false;
};

export default function OrdersPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(
    DEFAULT_ORDERS_VIEW_URL_STATE.searchQuery
  );
  const [searchQuery, setSearchQuery] = useState(
    DEFAULT_ORDERS_VIEW_URL_STATE.searchQuery
  );
  const [transactionFrom, setTransactionFrom] = useState(
    DEFAULT_ORDERS_VIEW_URL_STATE.transactionFrom
  );
  const [transactionTo, setTransactionTo] = useState(
    DEFAULT_ORDERS_VIEW_URL_STATE.transactionTo
  );
  const [shippedFrom, setShippedFrom] = useState(
    DEFAULT_ORDERS_VIEW_URL_STATE.shippedFrom
  );
  const [shippedTo, setShippedTo] = useState(
    DEFAULT_ORDERS_VIEW_URL_STATE.shippedTo
  );
  const [page, setPage] = useState(DEFAULT_ORDERS_VIEW_URL_STATE.page);
  const [pageSize, setPageSize] = useState<number>(
    DEFAULT_ORDERS_VIEW_URL_STATE.pageSize
  );
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loadedFrom, setLoadedFrom] = useState(0);
  const [loadedTo, setLoadedTo] = useState(0);
  const [countryFilter, setCountryFilter] = useState<string>(
    DEFAULT_ORDERS_VIEW_URL_STATE.countryFilter
  );
  const [salesChannelFilters, setSalesChannelFilters] = useState<string[]>(
    DEFAULT_ORDERS_VIEW_URL_STATE.salesChannelFilters
  );
  const [statusFilter, setStatusFilter] = useState<string>(
    DEFAULT_ORDERS_VIEW_URL_STATE.statusFilter
  );
  const [warningFilter, setWarningFilter] = useState<string>(
    DEFAULT_ORDERS_VIEW_URL_STATE.warningFilter
  );
  const [dateSortOption, setDateSortOption] =
    useState<DateSortOption>(DEFAULT_ORDERS_VIEW_URL_STATE.dateSortOption);
  const [notificationFilter, setNotificationFilter] =
    useState<NotificationFilterOption>(
      DEFAULT_ORDERS_VIEW_URL_STATE.notificationFilter
    );
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [visibleOrderColumns, setVisibleOrderColumns] = useState<OrdersColumnKey[]>(
    [...ORDER_COLUMN_KEYS]
  );
  const [orderColumnDraft, setOrderColumnDraft] = useState<OrdersColumnKey[]>(
    [...ORDER_COLUMN_KEYS]
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isAddingResend, setIsAddingResend] = useState(false);
  const [resendOrderId, setResendOrderId] = useState<string | null>(null);
  const [resendItemIds, setResendItemIds] = useState<Set<string>>(new Set());
  const [resendDialogOpen, setResendDialogOpen] = useState(false);
  const [resendDialogLoading, setResendDialogLoading] = useState(false);
  const [resendDialogError, setResendDialogError] = useState<string | null>(null);
  const [resendDraft, setResendDraft] = useState<ResendDraft | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDialogValue, setStatusDialogValue] =
    useState<DisplayOrderStatus>("pending");
  const [statusDialogSaving, setStatusDialogSaving] = useState(false);
  const [statusDialogError, setStatusDialogError] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    new Set()
  );
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [detailsById, setDetailsById] = useState<Record<string, OrderDetails>>(
    {}
  );
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDialogMode, setEmailDialogMode] = useState<OrdersEmailDialogMode>(
    ORDER_EMAIL_DIALOG_MODE.PARTNER_ONLY
  );
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateOption[]>([]);
  const [emailSenders, setEmailSenders] = useState<EmailSenderOption[]>([]);
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState("");
  const [selectedEmailSenderEmail, setSelectedEmailSenderEmail] = useState("");
  const [selectedEmailBcc, setSelectedEmailBcc] = useState<string[]>([]);
  const [selectedEmailPartnerReceiverKey, setSelectedEmailPartnerReceiverKey] =
    useState<string>(ORDER_EMAIL_PARTNER_RECEIVER_OPTIONS[0]?.key ?? "");
  const [emailSubjectTemplateDraft, setEmailSubjectTemplateDraft] = useState("");
  const [emailBodyTemplateDraft, setEmailBodyTemplateDraft] = useState("");
  const [emailDialogLoading, setEmailDialogLoading] = useState(false);
  const [emailDialogError, setEmailDialogError] = useState<string | null>(null);
  const [emailDialogInfo, setEmailDialogInfo] = useState<string | null>(null);
  const [emailPreview, setEmailPreview] = useState<EmailTemplatePreview | null>(null);
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [hoverImagePreview, setHoverImagePreview] =
    useState<HoverImagePreview | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [detailsEditDrafts, setDetailsEditDrafts] = useState<
    Record<string, OrderDetailsEditDraft>
  >({});
  const [detailsEditSavingOrderId, setDetailsEditSavingOrderId] = useState<
    string | null
  >(null);
  const [detailsEditErrorByOrderId, setDetailsEditErrorByOrderId] = useState<
    Record<string, string>
  >({});
  const [urlStateReady, setUrlStateReady] = useState(false);
  const lastSelectedOrderIndexRef = useRef<number | null>(null);
  const hasInitializedPageResetRef = useRef(false);
  const isApplyingUrlStateRef = useRef(false);

  useEffect(() => {
    const applyQueryToState = (query: string) => {
      const next = parseOrdersViewUrlState(new URLSearchParams(query));
      isApplyingUrlStateRef.current = true;
      setSearchInput(next.searchQuery);
      setSearchQuery(next.searchQuery);
      setTransactionFrom(next.transactionFrom);
      setTransactionTo(next.transactionTo);
      setShippedFrom(next.shippedFrom);
      setShippedTo(next.shippedTo);
      setCountryFilter(next.countryFilter);
      setSalesChannelFilters(next.salesChannelFilters);
      setStatusFilter(next.statusFilter);
      setWarningFilter(next.warningFilter);
      setNotificationFilter(next.notificationFilter);
      setDateSortOption(next.dateSortOption);
      setPage(next.page);
      setPageSize(next.pageSize);
    };
    applyQueryToState(getCurrentOrdersUrlQuery());
    setUrlStateReady(true);
    const handlePopState = () => {
      applyQueryToState(getCurrentOrdersUrlQuery());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(ORDERS_COLUMNS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      const normalized = normalizeVisibleOrderColumns(parsed);
      setVisibleOrderColumns(normalized);
      setOrderColumnDraft(normalized);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (!hasInitializedPageResetRef.current) {
      hasInitializedPageResetRef.current = true;
      return;
    }
    if (isApplyingUrlStateRef.current) {
      isApplyingUrlStateRef.current = false;
      return;
    }
    setPage((prev) => (prev === 1 ? prev : 1));
  }, [
    searchQuery,
    transactionFrom,
    transactionTo,
    shippedFrom,
    shippedTo,
    countryFilter,
    salesChannelFilters,
    statusFilter,
    warningFilter,
    notificationFilter,
    dateSortOption,
    pageSize,
  ]);

  const ordersQueryString = useMemo(() => {
    const searchParams = new URLSearchParams();
    if (searchQuery) searchParams.set("q", searchQuery);
    if (transactionFrom) searchParams.set("transaction_from", transactionFrom);
    if (transactionTo) searchParams.set("transaction_to", transactionTo);
    if (shippedFrom) searchParams.set("shipped_from", shippedFrom);
    if (shippedTo) searchParams.set("shipped_to", shippedTo);
    if (countryFilter !== "all") searchParams.set("country", countryFilter);
    salesChannelFilters.forEach((name) =>
      searchParams.append("sales_channel", name)
    );
    if (statusFilter !== "all") searchParams.set("status", statusFilter);
    if (warningFilter !== "all") searchParams.set("warning", warningFilter);
    if (notificationFilter !== "all") {
      searchParams.set("notification", notificationFilter);
    }
    searchParams.set("date_sort", dateSortOption);
    searchParams.set("page", String(page));
    searchParams.set("page_size", String(pageSize));
    return searchParams.toString();
  }, [
    searchQuery,
    transactionFrom,
    transactionTo,
    shippedFrom,
    shippedTo,
    countryFilter,
    salesChannelFilters,
    statusFilter,
    warningFilter,
    notificationFilter,
    dateSortOption,
    page,
    pageSize,
  ]);
  const params = ordersQueryString ? `/api/orders?${ordersQueryString}` : "/api/orders";

  useEffect(() => {
    if (!urlStateReady) return;
    const currentQuery = getCurrentOrdersUrlQuery();
    if (isApplyingUrlStateRef.current) {
      isApplyingUrlStateRef.current = false;
      if (currentQuery === ordersQueryString) return;
    }
    if (currentQuery === ordersQueryString) return;
    const nextUrl = ordersQueryString ? `${pathname}?${ordersQueryString}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [ordersQueryString, pathname, router, urlStateReady]);

  const getNormalizedSalesChannelName = (row: {
    sales_channel_name: string | null;
    sales_channel_id: string | null;
  }) =>
    normalizeOrderPlatformName({
      salesChannelName: row.sales_channel_name,
      salesChannelId: row.sales_channel_id,
    }).trim();

  const salesChannelOptions = useMemo(() => {
    const unique = new Set<string>(KNOWN_SALES_CHANNEL_OPTIONS);
    rows.forEach((row) => {
      const name = getNormalizedSalesChannelName(row);
      if (name) unique.add(name);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const selectedSalesChannelSet = new Set(salesChannelFilters);
    const next = rows.filter((row) => {
      const normalizedCountry = getCountryCodeForOrder(row);
      if (countryFilter !== "all" && normalizedCountry !== countryFilter) {
        return false;
      }
      if (
        selectedSalesChannelSet.size > 0 &&
        !selectedSalesChannelSet.has(getNormalizedSalesChannelName(row))
      ) {
        return false;
      }
      const normalizedStatus = normalizeDisplayStatus(row.status);
      if (statusFilter !== "all" && normalizedStatus !== statusFilter) {
        return false;
      }
      if (warningFilter === "delayed" && !row.is_delayed) {
        return false;
      }
      if (warningFilter === "on_time" && row.is_delayed) {
        return false;
      }
      const hasNotification = Boolean(
        String(row.latest_notification_name ?? "").trim() ||
          String(row.latest_notification_sent_at ?? "").trim()
      );
      if (notificationFilter === "have" && !hasNotification) {
        return false;
      }
      if (notificationFilter === "none" && hasNotification) {
        return false;
      }
      return true;
    });
    return next;
  }, [
    countryFilter,
    rows,
    salesChannelFilters,
    statusFilter,
    notificationFilter,
    warningFilter,
  ]);

  useEffect(() => {
    lastSelectedOrderIndexRef.current = null;
  }, [filteredRows]);

  const allSelected =
    filteredRows.length > 0 &&
    filteredRows.every((row) => selectedOrderIds.has(row.id));
  const someSelected = filteredRows.some((row) => selectedOrderIds.has(row.id));
  const selectAllState = allSelected ? true : someSelected ? "mixed" : false;
  const hasSelection = selectedOrderIds.size > 0;
  const hasResendSelection = resendItemIds.size > 0;
  const selectedRows = useMemo(
    () => filteredRows.filter((row) => selectedOrderIds.has(row.id)),
    [filteredRows, selectedOrderIds]
  );
  const visibleOrderColumnSet = useMemo(
    () => new Set<OrdersColumnKey>(visibleOrderColumns),
    [visibleOrderColumns]
  );
  const orderColumnDraftSet = useMemo(
    () => new Set<OrdersColumnKey>(orderColumnDraft),
    [orderColumnDraft]
  );
  const visibleTableColumnCount = visibleOrderColumns.length + 1;
  const toggleOrderColumnDraft = (column: OrdersColumnKey, checked: boolean) => {
    setOrderColumnDraft((prev) => {
      if (checked) {
        const next = new Set(prev);
        next.add(column);
        return ORDER_COLUMN_KEYS.filter((key) => next.has(key));
      }
      if (prev.length <= 1) return prev;
      const next = new Set(prev);
      next.delete(column);
      const ordered = ORDER_COLUMN_KEYS.filter((key) => next.has(key));
      return ordered.length > 0 ? ordered : prev;
    });
  };
  const saveOrderColumns = () => {
    const normalized = normalizeVisibleOrderColumns(orderColumnDraft);
    setVisibleOrderColumns(normalized);
    setOrderColumnDraft(normalized);
    setColumnPickerOpen(false);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        ORDERS_COLUMNS_STORAGE_KEY,
        JSON.stringify(normalized)
      );
    } catch {
      return;
    }
  };
  const canGoPreviousPage = page > 1;
  const canGoNextPage = totalPages > 0 && page < totalPages;
  const previewOrderRow = selectedRows[0] ?? null;
  const selectedEmailTemplate = useMemo(
    () =>
      emailTemplates.find((template) => template.template_id === selectedEmailTemplateId) ??
      null,
    [emailTemplates, selectedEmailTemplateId]
  );
  const selectedEmailSender = useMemo(
    () =>
      emailSenders.find((sender) => sender.email === selectedEmailSenderEmail) ?? null,
    [emailSenders, selectedEmailSenderEmail]
  );
  const selectedEmailSenderSignature = useMemo(
    () => String(selectedEmailSender?.signature ?? ""),
    [selectedEmailSender]
  );
  const selectedEmailPartnerReceiver = useMemo(
    () =>
      ORDER_EMAIL_PARTNER_RECEIVER_OPTIONS.find(
        (option) => option.key === selectedEmailPartnerReceiverKey
      ) ?? null,
    [selectedEmailPartnerReceiverKey]
  );
  const selectedEmailMacroKeys = useMemo(() => {
    if (!selectedEmailTemplate) return [];
    return Array.from(
      new Set([
        ...(Array.isArray(selectedEmailTemplate.macros)
          ? selectedEmailTemplate.macros
          : []),
        ...collectMacros(
          `${emailSubjectTemplateDraft ?? ""}\n${emailBodyTemplateDraft ?? ""}`
        ),
      ])
    ).sort((a, b) => a.localeCompare(b));
  }, [emailBodyTemplateDraft, emailSubjectTemplateDraft, selectedEmailTemplate]);
  const getStatusText = (status: unknown) => {
    switch (normalizeDisplayStatus(status)) {
      case "pending":
        return t("orders.status.pending");
      case "purchased":
        return t("orders.status.purchased");
      case "being_packed_and_shipped":
        return t("orders.status.beingPackedAndShipped");
      default:
        return t("orders.status.shipped");
    }
  };
  const getStatusClassName = (status: unknown) => {
    switch (normalizeDisplayStatus(status)) {
      case "pending":
        return styles.statusPending;
      case "purchased":
        return styles.statusPurchased;
      case "being_packed_and_shipped":
        return styles.statusPacking;
      default:
        return styles.statusShipped;
    }
  };
  const getDelayWarningText = (row: OrderRow) => {
    if (!row.is_delayed) return "-";
    const days =
      typeof row.delay_days === "number" && Number.isFinite(row.delay_days)
        ? row.delay_days
        : 0;
    return t("orders.flags.delayedDays", { days });
  };
  const getCountryName = (row: OrderRow, code: CountryCode | null) => {
    switch (code) {
      case "NO":
        return t("orders.country.no");
      case "SE":
        return t("orders.country.se");
      case "FI":
        return t("orders.country.fi");
      default:
        if (row.customer_country) return row.customer_country;
        const genericCountryCode = normalizeCountryCode(row.customer_country_code);
        if (genericCountryCode) return genericCountryCode;
        return t("orders.country.unknown");
    }
  };
  const getLatestNotificationText = (row: OrderRow) => {
    const name = String(row.latest_notification_name ?? "").trim();
    const sentAt = String(row.latest_notification_sent_at ?? "").trim();
    if (name && sentAt) {
      return `${name} (${formatDate(sentAt)})`;
    }
    if (name) return name;
    if (sentAt) return formatDate(sentAt);
    return t("orders.notifications.none");
  };
  const hasLatestNotification = (row: OrderRow) => {
    const name = String(row.latest_notification_name ?? "").trim();
    const sentAt = String(row.latest_notification_sent_at ?? "").trim();
    return Boolean(name || sentAt);
  };
  const openEmailDialog = async (
    mode: OrdersEmailDialogMode = ORDER_EMAIL_DIALOG_MODE.PARTNER_ONLY
  ) => {
    if (selectedRows.length === 0) return;
    setEmailDialogMode(mode);
    setEmailDialogOpen(true);
    setEmailDialogLoading(true);
    setEmailDialogError(null);
    setEmailDialogInfo(null);
    try {
      const [templatesResponse, sendersResponse] = await Promise.all([
        fetch("/api/email/templates"),
        fetch("/api/sendpulse/senders"),
      ]);
      const templatesPayload = await templatesResponse.json();
      if (!templatesResponse.ok) {
        throw new Error(templatesPayload?.error || "Unable to load email templates.");
      }
      const sendersPayload = await sendersResponse.json();
      if (!sendersResponse.ok) {
        throw new Error(sendersPayload?.error || "Unable to load SendPulse senders.");
      }

      const loadedTemplates = Array.isArray(templatesPayload.templates)
        ? (templatesPayload.templates as EmailTemplateOption[])
        : [];
      const loadedSenders = Array.isArray(sendersPayload.senders)
        ? (sendersPayload.senders as EmailSenderOption[])
        : [];

      setEmailTemplates(loadedTemplates);
      setEmailSenders(loadedSenders);
      setSelectedEmailTemplateId((prev) => {
        if (prev && loadedTemplates.some((template) => template.template_id === prev)) {
          return prev;
        }
        return loadedTemplates[0]?.template_id || "";
      });
      setSelectedEmailSenderEmail((prev) => {
        if (prev && loadedSenders.some((sender) => sender.email === prev)) {
          return prev;
        }
        return loadedSenders[0]?.email || "";
      });
      setSelectedEmailPartnerReceiverKey((prev) => {
        if (
          prev &&
          ORDER_EMAIL_PARTNER_RECEIVER_OPTIONS.some((option) => option.key === prev)
        ) {
          return prev;
        }
        return ORDER_EMAIL_PARTNER_RECEIVER_OPTIONS[0]?.key ?? "";
      });
    } catch (err) {
      setEmailDialogError((err as Error).message);
    } finally {
      setEmailDialogLoading(false);
    }
  };
  const closeEmailDialog = () => {
    setEmailDialogOpen(false);
    setEmailDialogMode(ORDER_EMAIL_DIALOG_MODE.PARTNER_ONLY);
    setEmailDialogLoading(false);
    setEmailPreviewLoading(false);
    setEmailDialogError(null);
    setEmailDialogInfo(null);
    setEmailPreview(null);
    setEmailSubjectTemplateDraft("");
    setEmailBodyTemplateDraft("");
  };
  const openStatusDialog = () => {
    if (!hasSelection) return;
    const firstSelected =
      rows.find((row) => selectedOrderIds.has(row.id)) ?? selectedRows[0] ?? null;
    setStatusDialogValue(normalizeDisplayStatus(firstSelected?.status));
    setStatusDialogError(null);
    setStatusDialogOpen(true);
  };
  const closeStatusDialog = () => {
    setStatusDialogOpen(false);
    setStatusDialogSaving(false);
    setStatusDialogError(null);
  };
  const saveSelectedOrdersStatus = async () => {
    const ids = Array.from(selectedOrderIds);
    if (ids.length === 0) return;
    setStatusDialogSaving(true);
    setStatusDialogError(null);
    try {
      const response = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids,
          status: statusDialogValue,
        }),
      });
      let payload: { ids?: string[]; status?: string; error?: string } | null =
        null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        throw new Error(payload?.error || t("orders.statusDialog.error.update"));
      }
      const updatedIds = new Set(
        Array.isArray(payload?.ids) && payload.ids.length > 0
          ? payload.ids.map((id) => String(id))
          : ids
      );
      const nextStatus = normalizeDisplayStatus(payload?.status ?? statusDialogValue);
      const shouldClearShippedDate = nextStatus === "pending";

      setRows((prev) =>
        prev.map((row) => {
          if (!updatedIds.has(row.id)) return row;
          if (nextStatus === "shipped") {
            return {
              ...row,
              status: nextStatus,
              is_delayed: false,
              delay_days: null,
            };
          }
          if (shouldClearShippedDate) {
            return {
              ...row,
              status: nextStatus,
              date_shipped: null,
            };
          }
          return { ...row, status: nextStatus };
        })
      );

      setDetailsById((prev) => {
        const next = { ...prev };
        updatedIds.forEach((id) => {
          const details = next[id];
          if (!details?.order) return;
          next[id] = {
            ...details,
            order: {
              ...details.order,
              status: nextStatus,
              date_shipped: shouldClearShippedDate
                ? null
                : details.order.date_shipped,
            },
          };
        });
        return next;
      });

      setStatusDialogOpen(false);
    } catch (err) {
      setStatusDialogError((err as Error).message);
    } finally {
      setStatusDialogSaving(false);
    }
  };
  const exportSelectedOrders = async () => {
    const ids = Array.from(selectedOrderIds);
    if (ids.length === 0) return;
    setIsExporting(true);
    setError(null);
    try {
      const response = await fetch("/api/orders/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) {
        let message = "Export failed.";
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch {
          const text = await response.text();
          if (text) message = text;
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "orders-export.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };
  const handleSendEmails = async () => {
    const isPartnerOnlyMode =
      emailDialogMode === ORDER_EMAIL_DIALOG_MODE.PARTNER_ONLY;
    if (!selectedEmailSender || selectedRows.length === 0) return;
    if (isPartnerOnlyMode && !selectedEmailTemplate) return;
    if (
      isPartnerOnlyMode &&
      (!selectedEmailPartnerReceiver ||
        selectedEmailPartnerReceiver.key === "none")
    ) {
      setEmailDialogError("A partner receiver is required.");
      return;
    }
    setIsSendingEmails(true);
    setEmailDialogError(null);
    setEmailDialogInfo(null);
    try {
      const requestBody: Record<string, unknown> = {
        ids: selectedRows.map((row) => row.id),
        mode: emailDialogMode,
        senderEmail: selectedEmailSender.email,
        senderName: selectedEmailSender.name ?? undefined,
        bccEmails: selectedEmailBcc,
      };
      if (isPartnerOnlyMode) {
        requestBody.templateId = selectedEmailTemplate?.template_id;
        requestBody.subjectTemplate = emailSubjectTemplateDraft;
        requestBody.bodyTemplate = emailBodyTemplateDraft;
        requestBody.macros = selectedEmailMacroKeys;
        requestBody.partnerReceiverKey = selectedEmailPartnerReceiver?.key;
      }

      const response = await fetch("/api/orders/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to send emails.");
      }
      const resultEntries = Array.isArray(payload?.results)
        ? (payload.results as Array<{
            order_id?: unknown;
            status?: unknown;
            latest_notification_name?: unknown;
            latest_notification_sent_at?: unknown;
          }>)
        : [];
      const fallbackNotificationName =
        String(payload?.notification_name ?? "").trim() ||
        selectedEmailTemplate?.name ||
        "Notification sent";
      const fallbackNotificationSentAt = String(
        payload?.notification_sent_at ?? ""
      ).trim();
      const sentNotificationByOrderId = new Map<
        string,
        { name: string | null; sentAt: string | null }
      >();
      resultEntries.forEach((entry) => {
        if (String(entry?.status ?? "") !== "sent") return;
        const orderId = String(entry?.order_id ?? "").trim();
        if (!orderId) return;
        const latestName = String(entry.latest_notification_name ?? "").trim();
        const latestSentAt = String(
          entry.latest_notification_sent_at ?? ""
        ).trim();
        sentNotificationByOrderId.set(orderId, {
          name: latestName || fallbackNotificationName || null,
          sentAt: latestSentAt || fallbackNotificationSentAt || null,
        });
      });
      if (sentNotificationByOrderId.size > 0) {
        setRows((prev) =>
          prev.map((row) => {
            const nextNotification = sentNotificationByOrderId.get(row.id);
            if (!nextNotification) return row;
            return {
              ...row,
              latest_notification_name:
                nextNotification.name ?? row.latest_notification_name ?? null,
              latest_notification_sent_at:
                nextNotification.sentAt ??
                row.latest_notification_sent_at ??
                null,
            };
          })
        );
      }
      closeEmailDialog();
    } catch (err) {
      setEmailDialogError((err as Error).message);
    } finally {
      setIsSendingEmails(false);
    }
  };

  useEffect(() => {
    if (
      !emailDialogOpen ||
      emailDialogMode !== ORDER_EMAIL_DIALOG_MODE.PARTNER_ONLY ||
      !selectedEmailTemplate ||
      !previewOrderRow
    ) {
      setEmailPreview(null);
      setEmailPreviewLoading(false);
      return;
    }
    let active = true;
    const runPreview = async () => {
      setEmailPreviewLoading(true);
      try {
        let orderItemsForPreview: OrderItem[] = [];
        let trackingEntriesForPreview: TrackingNumberEntry[] = [];
        const cachedDetails = detailsById[previewOrderRow.id];
        if (cachedDetails?.items?.length) {
          orderItemsForPreview = cachedDetails.items;
          trackingEntriesForPreview = Array.isArray(cachedDetails.tracking_numbers)
            ? cachedDetails.tracking_numbers
            : [];
        } else {
          const detailsResponse = await fetch(`/api/orders/${previewOrderRow.id}`);
          if (detailsResponse.ok) {
            const detailsPayload = await detailsResponse.json();
            const loadedItems = Array.isArray(detailsPayload?.items)
              ? (detailsPayload.items as OrderItem[])
              : [];
            const loadedTracking = normalizeTrackingEntries(
              detailsPayload?.tracking_numbers
            );
            orderItemsForPreview = loadedItems;
            trackingEntriesForPreview = loadedTracking;
            setDetailsById((prev) => {
              if (prev[previewOrderRow.id]) return prev;
              return {
                ...prev,
                [previewOrderRow.id]: {
                  order:
                    detailsPayload?.order && typeof detailsPayload.order === "object"
                      ? (detailsPayload.order as OrderDetails["order"])
                      : null,
                  items: loadedItems,
                  tracking_numbers: loadedTracking,
                  email_history: normalizeEmailHistoryEntries(
                    detailsPayload?.email_history
                  ),
                  loading: false,
                  error: undefined,
                },
              };
            });
          }
        }
        const orderContentList = formatOrderContentList(
          orderItemsForPreview.map((item) => ({
            quantity: item.quantity,
            product_title: item.product_title,
            sku: item.sku,
          }))
        );
        const preferredOrderId = resolvePreferredOrderIdFromItems(
          orderItemsForPreview
        );
        const primaryTrackingNumber = resolvePrimaryTrackingNumber(
          trackingEntriesForPreview
        );
        const orderVariables = buildOrderEmailMacroVariables({
          id: previewOrderRow.id,
          order_number: previewOrderRow.order_number,
          preferred_order_id: preferredOrderId,
          transaction_date: previewOrderRow.transaction_date,
          date_shipped: previewOrderRow.date_shipped,
          tracking_number: primaryTrackingNumber,
          customer_name: previewOrderRow.customer_name,
          customer_email: previewOrderRow.customer_email,
          sales_channel_id: previewOrderRow.sales_channel_id,
          sales_channel_name: previewOrderRow.sales_channel_name,
          status: previewOrderRow.status,
          order_content_list: orderContentList,
        });
        const response = await fetch("/api/email/templates/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject_template: emailSubjectTemplateDraft,
            body_template: emailBodyTemplateDraft,
            macros: selectedEmailMacroKeys,
            variables: orderVariables,
            context: { order: orderVariables },
            sender_signature: selectedEmailSenderSignature,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to preview template.");
        }
        if (!active) return;
        setEmailPreview(payload as EmailTemplatePreview);
      } catch (err) {
        if (!active) return;
        setEmailPreview(null);
        setEmailDialogError((err as Error).message);
      } finally {
        if (active) {
          setEmailPreviewLoading(false);
        }
      }
    };
    void runPreview();
    return () => {
      active = false;
    };
  }, [
    detailsById,
    emailBodyTemplateDraft,
    emailDialogOpen,
    emailDialogMode,
    emailSubjectTemplateDraft,
    previewOrderRow,
    selectedEmailSenderSignature,
    selectedEmailMacroKeys,
    selectedEmailTemplate,
  ]);

  useEffect(() => {
    if (
      !emailDialogOpen ||
      emailDialogMode !== ORDER_EMAIL_DIALOG_MODE.PARTNER_ONLY ||
      !selectedEmailTemplate
    ) {
      setEmailSubjectTemplateDraft("");
      setEmailBodyTemplateDraft("");
      return;
    }
    setEmailSubjectTemplateDraft(selectedEmailTemplate.subject_template ?? "");
    setEmailBodyTemplateDraft(selectedEmailTemplate.body_template ?? "");
  }, [
    emailDialogMode,
    emailDialogOpen,
    emailTemplates,
    selectedEmailTemplate,
    selectedEmailTemplateId,
  ]);

  useEffect(() => {
    if (!urlStateReady) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(params);
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Unable to load orders.");
        }
        const payload = await response.json();
        const loadedRows = Array.isArray(payload.items)
          ? (payload.items as Array<OrderRow & { id?: unknown }>)
              .map((row) => ({
                ...row,
                id: String(row.id ?? "").trim(),
              }))
              .filter((row) => row.id.length > 0)
          : [];
        const nextTotalCount = Math.max(
          0,
          Number.parseInt(String(payload.count ?? "0"), 10) || 0
        );
        const nextTotalPages = Math.max(
          0,
          Number.parseInt(String(payload.pageCount ?? "0"), 10) || 0
        );
        const nextLoadedFrom = Math.max(
          0,
          Number.parseInt(String(payload.from ?? "0"), 10) || 0
        );
        const nextLoadedTo = Math.max(
          0,
          Number.parseInt(String(payload.to ?? "0"), 10) || 0
        );
        setTotalCount(nextTotalCount);
        setTotalPages(nextTotalPages);
        setLoadedFrom(nextLoadedFrom);
        setLoadedTo(nextLoadedTo);
        setRows(loadedRows);
        if (nextTotalPages > 0 && page > nextTotalPages) {
          setPage(nextTotalPages);
        }
      } catch (err) {
        setError((err as Error).message);
        setRows([]);
        setTotalCount(0);
        setTotalPages(0);
        setLoadedFrom(0);
        setLoadedTo(0);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page, params, urlStateReady]);

  useEffect(() => {
    if (totalCount <= 0) {
      if (loadedFrom !== 0) setLoadedFrom(0);
      if (loadedTo !== 0) setLoadedTo(0);
      return;
    }
    if (loadedFrom > totalCount) {
      setLoadedFrom(totalCount);
    }
    if (loadedTo > totalCount) {
      setLoadedTo(totalCount);
    }
  }, [loadedFrom, loadedTo, totalCount]);

  useEffect(() => {
    setSelectedOrderIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(filteredRows.map((row) => row.id));
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredRows]);

  useEffect(() => {
    if (!resendOrderId) return;
    const stillVisible = filteredRows.some((row) => row.id === resendOrderId);
    if (!stillVisible) {
      setResendOrderId(null);
      setResendItemIds(new Set());
    }
  }, [filteredRows, resendOrderId]);

  const loadDetails = async (orderId: string) => {
    setDetailsById((prev) => ({
      ...prev,
        [orderId]: {
          order: prev[orderId]?.order ?? null,
          items: prev[orderId]?.items ?? [],
          tracking_numbers: prev[orderId]?.tracking_numbers ?? [],
          email_history: prev[orderId]?.email_history ?? [],
          loading: true,
          error: undefined,
        },
      }));
    try {
      const response = await fetch(`/api/orders/${orderId}`);
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to load order details.");
      }
      const payload = await response.json();
      setDetailsById((prev) => ({
        ...prev,
        [orderId]: {
          order: payload.order ?? null,
          items: payload.items ?? [],
          tracking_numbers: normalizeTrackingEntries(payload.tracking_numbers),
          email_history: normalizeEmailHistoryEntries(payload.email_history),
          loading: false,
          error: undefined,
        },
      }));
    } catch (err) {
      setDetailsById((prev) => ({
        ...prev,
        [orderId]: {
          order: null,
          items: [],
          tracking_numbers: [],
          email_history: [],
          loading: false,
          error: (err as Error).message,
        },
      }));
    }
  };

  const toggleExpanded = (orderId: string) => {
    const isCurrentlyExpanded = expandedOrders.has(orderId);
    if (isCurrentlyExpanded) {
      setExpandedOrders(new Set());
      if (editingOrderId === orderId) {
        setEditingOrderId(null);
      }
      return;
    }

    setExpandedOrders(new Set([orderId]));
    if (editingOrderId && editingOrderId !== orderId) {
      setEditingOrderId(null);
    }
    if (!detailsById[orderId]) {
      loadDetails(orderId);
    }
  };

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const truncateTitle = (title: string) => {
    const trimmed = title.trim();
    if (trimmed.length <= 30) return trimmed;
    return `${trimmed.slice(0, 27)}...`;
  };

  const renderItemTitle = (item: OrderItem) => {
    if (item.product_title) {
      return truncateTitle(item.product_title);
    }
    return item.sku ? "-" : "";
  };

  const buildOrderDetailsEditDraft = (
    details: OrderDetails | undefined
  ): OrderDetailsEditDraft => {
    const manualEmailHistory = String(
      details?.order?.manual_email_history ?? ""
    ).trim();
    const emailHistoryText = manualEmailHistory
      ? manualEmailHistory
      : (details?.email_history ?? [])
          .map((entry) => {
            const historyLabel =
              entry.notification_name ||
              entry.subject ||
              t("orders.notifications.none");
            const historyDate = entry.send_date || entry.created_at;
            if (!historyLabel) return "";
            return historyDate
              ? `${historyLabel} (${formatDate(historyDate)})`
              : historyLabel;
          })
          .filter(Boolean)
          .join("\n");

    const trackingText = (details?.tracking_numbers ?? [])
      .map((entry) => String(entry.tracking_number ?? "").trim())
      .filter(Boolean)
      .join("\n");

    return {
      customer_name: String(details?.order?.customer_name ?? ""),
      customer_address: String(details?.order?.customer_address ?? ""),
      customer_zip: String(details?.order?.customer_zip ?? ""),
      customer_city: String(details?.order?.customer_city ?? ""),
      customer_phone: String(details?.order?.customer_phone ?? ""),
      customer_email: String(details?.order?.customer_email ?? ""),
      shipping: String(details?.order?.date_shipped ?? ""),
      tracking_number: trackingText,
      email_history: emailHistoryText,
      notes: String(details?.order?.customer_note ?? ""),
    };
  };

  const startEditingOrderDetails = (orderId: string) => {
    const details = detailsById[orderId];
    setDetailsEditDrafts((prev) => ({
      ...prev,
      [orderId]: buildOrderDetailsEditDraft(details),
    }));
    setDetailsEditErrorByOrderId((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    setEditingOrderId(orderId);
  };

  const cancelEditingOrderDetails = (orderId: string) => {
    if (editingOrderId === orderId) {
      setEditingOrderId(null);
    }
    setDetailsEditErrorByOrderId((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  };

  const updateOrderDetailsDraftField = (
    orderId: string,
    field: keyof OrderDetailsEditDraft,
    value: string
  ) => {
    setDetailsEditDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] ?? buildOrderDetailsEditDraft(detailsById[orderId])),
        [field]: value,
      },
    }));
  };

  const saveOrderDetailsEdits = async (orderId: string) => {
    const draft = detailsEditDrafts[orderId];
    if (!draft) return;
    setDetailsEditSavingOrderId(orderId);
    setDetailsEditErrorByOrderId((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to save order details.");
      }

      const orderPayload =
        payload?.order && typeof payload.order === "object"
          ? (payload.order as OrderDetails["order"])
          : null;
      const trackingPayload = Array.isArray(payload?.tracking_numbers)
        ? normalizeTrackingEntries(payload.tracking_numbers)
        : null;

      setDetailsById((prev) => {
        const current = prev[orderId];
        if (!current) return prev;
        return {
          ...prev,
          [orderId]: {
            ...current,
            order: orderPayload ?? current.order,
            tracking_numbers: trackingPayload ?? current.tracking_numbers,
          },
        };
      });

      if (orderPayload) {
        setRows((prev) =>
          prev.map((row) =>
            row.id === orderId
              ? {
                  ...row,
                  customer_name: orderPayload.customer_name ?? row.customer_name,
                  customer_email: orderPayload.customer_email ?? row.customer_email,
                  date_shipped: orderPayload.date_shipped ?? row.date_shipped,
                }
              : row
          )
        );
      }

      setEditingOrderId((prev) => (prev === orderId ? null : prev));
    } catch (err) {
      setDetailsEditErrorByOrderId((prev) => ({
        ...prev,
        [orderId]: (err as Error).message,
      }));
    } finally {
      setDetailsEditSavingOrderId((prev) => (prev === orderId ? null : prev));
    }
  };

  const resolveHoverPreviewPosition = (
    event: ReactMouseEvent<HTMLElement>
  ) => {
    const previewSize = 100;
    const margin = 12;
    const x = event.clientX + margin;
    const y = event.clientY + margin;
    if (typeof window === "undefined") {
      return { x, y };
    }
    const maxX = Math.max(margin, window.innerWidth - previewSize - margin);
    const maxY = Math.max(margin, window.innerHeight - previewSize - margin);
    return {
      x: Math.min(x, maxX),
      y: Math.min(y, maxY),
    };
  };

  const showHoverPreview = (
    event: ReactMouseEvent<HTMLElement>,
    src: string,
    alt: string
  ) => {
    const position = resolveHoverPreviewPosition(event);
    setHoverImagePreview({
      src,
      alt,
      x: position.x,
      y: position.y,
    });
  };

  const moveHoverPreview = (event: ReactMouseEvent<HTMLElement>) => {
    setHoverImagePreview((previous) => {
      if (!previous) return previous;
      const position = resolveHoverPreviewPosition(event);
      return {
        ...previous,
        x: position.x,
        y: position.y,
      };
    });
  };

  const hideHoverPreview = () => {
    setHoverImagePreview(null);
  };

  const handleResendItemToggle = (
    orderId: string,
    itemId: string,
    checked: boolean
  ) => {
    let nextOrderId = resendOrderId;
    let nextSelection = new Set(resendItemIds);

    if (nextOrderId && nextOrderId !== orderId) {
      nextSelection = new Set();
      nextOrderId = orderId;
    }

    if (!nextOrderId) {
      nextOrderId = orderId;
    }

    if (checked) {
      nextSelection.add(itemId);
    } else {
      nextSelection.delete(itemId);
    }

    if (nextSelection.size === 0) {
      nextOrderId = null;
    }

    setResendOrderId(nextOrderId);
    setResendItemIds(nextSelection);
  };

  const handleResendSelectAll = (
    orderId: string,
    itemIds: string[],
    checked: boolean
  ) => {
    if (checked) {
      setResendOrderId(orderId);
      setResendItemIds(new Set(itemIds));
    } else if (resendOrderId === orderId) {
      setResendOrderId(null);
      setResendItemIds(new Set());
    }
  };

  const openResendDialog = async () => {
    if (!resendOrderId || resendItemIds.size === 0) return;
    setResendDialogOpen(true);
    setResendDialogLoading(true);
    setResendDialogError(null);

    const buildDraft = (details: OrderDetails) => {
      if (!details.order) {
        setResendDialogError(t("orders.resend.error.missing"));
        return;
      }
      const selectedItems = details.items.filter(
        (item) => item.id && resendItemIds.has(item.id)
      );
      if (selectedItems.length === 0) {
        setResendDialogError(t("orders.resend.error.noItems"));
        return;
      }
      const baseOrderNumber = details.order.order_number ?? "";
      const orderNumber = baseOrderNumber
        ? baseOrderNumber.endsWith("-RS")
          ? baseOrderNumber
          : `${baseOrderNumber}-RS`
        : "";
      const draft: ResendDraft = {
        orderId: resendOrderId,
        salesChannelId: details.order.sales_channel_id ?? "",
        orderNumber,
        salesChannel: normalizeOrderPlatformName({
          salesChannelName: details.order.sales_channel_name,
          salesChannelId: details.order.sales_channel_id,
        }),
        customerName: details.order.customer_name ?? "",
        customerAddress: details.order.customer_address ?? "",
        customerZip: details.order.customer_zip ?? "",
        customerCity: details.order.customer_city ?? "",
        customerPhone: details.order.customer_phone ?? "",
        customerEmail: details.order.customer_email ?? "",
        transactionDate: details.order.transaction_date ?? "",
        comment: "",
        items: [
          ...selectedItems.map((item) => ({
            id: item.id,
            sku: item.sku ?? "",
            title: item.product_title ?? "",
            quantity:
              item.quantity === null || item.quantity === undefined
                ? ""
                : String(item.quantity),
            price:
              item.sales_value_eur === null || item.sales_value_eur === undefined
                ? ""
                : String(item.sales_value_eur),
          })),
          createEmptyResendRow(),
        ],
      };
      setResendDraft(draft);
    };

    const details = detailsById[resendOrderId];
    if (details && !details.loading) {
      buildDraft(details);
      setResendDialogLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/orders/${resendOrderId}`);
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to load order details.");
      }
      const payload = await response.json();
      const loaded: OrderDetails = {
        order: payload.order ?? null,
        items: payload.items ?? [],
        tracking_numbers: normalizeTrackingEntries(payload.tracking_numbers),
        email_history: normalizeEmailHistoryEntries(payload.email_history),
        loading: false,
        error: undefined,
      };
      setDetailsById((prev) => ({ ...prev, [resendOrderId]: loaded }));
      buildDraft(loaded);
    } catch (err) {
      setResendDialogError(
        (err as Error).message || t("orders.resend.error.details")
      );
    } finally {
      setResendDialogLoading(false);
    }
  };

  const closeResendDialog = () => {
    setResendDialogOpen(false);
    setResendDialogLoading(false);
    setResendDialogError(null);
    setResendDraft(null);
  };

  const updateResendField = (field: keyof ResendDraft, value: string) => {
    setResendDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateResendItemField = (
    itemId: string,
    field: keyof ResendItemDraft,
    value: string
  ) => {
    setResendDraft((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((item) => {
        if (item.id !== itemId) return item;
        const updated = { ...item, [field]: value };
        if (
          item.isPlaceholder &&
          (updated.sku.trim() || updated.quantity.trim() || updated.price.trim())
        ) {
          return { ...updated, isPlaceholder: false };
        }
        return updated;
      });
      const hasPlaceholder = items.some((item) => item.isPlaceholder);
      return {
        ...prev,
        items: hasPlaceholder ? items : [...items, createEmptyResendRow()],
      };
    });
  };

  const addResendRow = () => {
    setResendDraft((prev) => {
      if (!prev) return prev;
      const nextRow: ResendItemDraft = {
        id: `draft-${Date.now()}-${prev.items.length}`,
        sku: "",
        title: "",
        quantity: "",
        price: "",
        isPlaceholder: false,
      };
      const items = [...prev.items];
      const placeholderIndex = items.findIndex((item) => item.isPlaceholder);
      if (placeholderIndex >= 0) {
        items.splice(placeholderIndex, 0, nextRow);
      } else {
        items.push(nextRow, createEmptyResendRow());
      }
      return { ...prev, items };
    });
  };

  const removeResendRow = (itemId: string) => {
    setResendDraft((prev) => {
      if (!prev) return prev;
      const items = prev.items.filter((item) => item.id !== itemId);
      const hasPlaceholder = items.some((item) => item.isPlaceholder);
      return {
        ...prev,
        items: hasPlaceholder ? items : [...items, createEmptyResendRow()],
      };
    });
    setResendItemIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  };

  const handleAddToResend = async () => {
    if (!resendDraft) return;
    setIsAddingResend(true);
    setResendDialogError(null);
    try {
      const itemsPayload = resendDraft.items
        .map((item) => ({
          ...item,
          sku: item.sku.trim(),
          quantity: item.quantity.trim(),
          price: item.price.trim(),
        }))
        .filter((item) => item.sku || item.quantity || item.price);

      if (itemsPayload.length === 0) {
        setResendDialogError(t("orders.resend.error.noItems"));
        setIsAddingResend(false);
        return;
      }

      const response = await fetch("/api/orders/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_order_id: resendDraft.orderId,
          sales_channel_id: resendDraft.salesChannelId,
          order_number: resendDraft.orderNumber,
          sales_channel_name: resendDraft.salesChannel,
          customer_name: resendDraft.customerName,
          customer_address: resendDraft.customerAddress,
          customer_zip: resendDraft.customerZip,
          customer_city: resendDraft.customerCity,
          customer_phone: resendDraft.customerPhone,
          customer_email: resendDraft.customerEmail,
          transaction_date: resendDraft.transactionDate,
          resend_comment: resendDraft.comment,
          items: itemsPayload.map((item) => ({
            source_item_id: item.id,
            sku: item.sku,
            title: item.title,
            quantity: item.quantity,
            price: item.price,
          })),
        }),
      });

      if (!response.ok) {
        let message = "Unable to add to resend.";
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch {
          const text = await response.text();
          if (text) message = text;
        }
        throw new Error(message);
      }

      closeResendDialog();
      setResendOrderId(null);
      setResendItemIds(new Set());
    } catch (err) {
      setResendDialogError((err as Error).message);
    } finally {
      setIsAddingResend(false);
    }
  };

  return (
    <div className={styles.page}>
      <Card className={styles.filtersCard}>
        <div className={styles.filterRow}>
          <Field label={t("orders.filters.search")}>
            <Input
              value={searchInput}
              onChange={(_, data) => setSearchInput(data.value)}
              placeholder={t("orders.filters.searchPlaceholder")}
              className={styles.searchInput}
            />
          </Field>
          <Field label={t("orders.filters.transactionFrom")}>
            <Input
              type="date"
              value={transactionFrom}
              onChange={(_, data) => setTransactionFrom(data.value)}
            />
          </Field>
          <Field label={t("orders.filters.transactionTo")}>
            <Input
              type="date"
              value={transactionTo}
              onChange={(_, data) => setTransactionTo(data.value)}
            />
          </Field>
          <Field label={t("orders.filters.shippedFrom")}>
            <Input
              type="date"
              value={shippedFrom}
              onChange={(_, data) => setShippedFrom(data.value)}
            />
          </Field>
          <Field label={t("orders.filters.shippedTo")}>
            <Input
              type="date"
              value={shippedTo}
              onChange={(_, data) => setShippedTo(data.value)}
            />
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>{t("orders.filters.dateSort")}</span>
            }
            className={styles.filterField}
          >
            <Dropdown
              selectedOptions={[dateSortOption]}
              value={(() => {
                if (dateSortOption === "transaction_desc") {
                  return t("orders.filters.dateSortDescending");
                }
                if (dateSortOption === "shipped_asc") {
                  return t("orders.filters.dateSortShippedAscending");
                }
                if (dateSortOption === "shipped_desc") {
                  return t("orders.filters.dateSortShippedDescending");
                }
                return t("orders.filters.dateSortAscending");
              })()}
              onOptionSelect={(_, data) => {
                const nextValue = String(
                  data.optionValue ?? "transaction_desc"
                ) as DateSortOption;
                setDateSortOption(nextValue);
              }}
            >
              <Option value="transaction_asc">
                {t("orders.filters.dateSortAscending")}
              </Option>
              <Option value="transaction_desc">
                {t("orders.filters.dateSortDescending")}
              </Option>
              <Option value="shipped_asc">
                {t("orders.filters.dateSortShippedAscending")}
              </Option>
              <Option value="shipped_desc">
                {t("orders.filters.dateSortShippedDescending")}
              </Option>
            </Dropdown>
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>{t("orders.filters.country")}</span>
            }
            className={styles.filterField}
          >
            <Dropdown
              selectedOptions={[countryFilter]}
              value={
                countryFilter === "all"
                  ? t("orders.filters.countryAll")
                  : countryFilter === "NO"
                    ? t("orders.country.no")
                    : countryFilter === "SE"
                      ? t("orders.country.se")
                      : countryFilter === "FI"
                        ? t("orders.country.fi")
                        : t("orders.country.unknown")
              }
              onOptionSelect={(_, data) => {
                setCountryFilter(String(data.optionValue ?? "all"));
              }}
            >
              <Option value="all">{t("orders.filters.countryAll")}</Option>
              <Option value="NO">{t("orders.country.no")}</Option>
              <Option value="SE">{t("orders.country.se")}</Option>
              <Option value="FI">{t("orders.country.fi")}</Option>
            </Dropdown>
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>
                {t("orders.filters.salesChannel")}
              </span>
            }
            className={styles.filterField}
          >
            <Dropdown
              multiselect
              selectedOptions={salesChannelFilters}
              value={
                salesChannelFilters.length === 0
                  ? t("orders.filters.salesChannelAll")
                  : salesChannelFilters.join(", ")
              }
              onOptionSelect={(_, data) => {
                setSalesChannelFilters(
                  normalizeSalesChannelFilters(data.selectedOptions ?? [])
                );
              }}
            >
              {salesChannelOptions.map((name) => (
                <Option key={name} value={name} text={name}>
                  {name}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>{t("orders.filters.status")}</span>
            }
            className={styles.filterField}
          >
            <Dropdown
              selectedOptions={[statusFilter]}
              value={
                statusFilter === "all"
                  ? t("orders.filters.statusAll")
                  : getStatusText(statusFilter)
              }
              onOptionSelect={(_, data) => {
                setStatusFilter(String(data.optionValue ?? "all"));
              }}
            >
              <Option value="all">{t("orders.filters.statusAll")}</Option>
              <Option value="pending">{t("orders.status.pending")}</Option>
              <Option value="purchased">{t("orders.status.purchased")}</Option>
              <Option value="being_packed_and_shipped">
                {t("orders.status.beingPackedAndShipped")}
              </Option>
              <Option value="shipped">{t("orders.status.shipped")}</Option>
            </Dropdown>
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>{t("orders.filters.warnings")}</span>
            }
            className={styles.filterField}
          >
            <Dropdown
              selectedOptions={[warningFilter]}
              value={
                warningFilter === "delayed"
                  ? t("orders.filters.warningsDelayed")
                  : warningFilter === "on_time"
                    ? t("orders.filters.warningsOnTime")
                    : t("orders.filters.warningsAll")
              }
              onOptionSelect={(_, data) => {
                setWarningFilter(String(data.optionValue ?? "all"));
              }}
            >
              <Option value="all">{t("orders.filters.warningsAll")}</Option>
              <Option value="delayed">{t("orders.filters.warningsDelayed")}</Option>
              <Option value="on_time">{t("orders.filters.warningsOnTime")}</Option>
            </Dropdown>
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>
                {t("orders.filters.notifications")}
              </span>
            }
            className={styles.filterField}
          >
            <Dropdown
              selectedOptions={[notificationFilter]}
              value={
                notificationFilter === "have"
                  ? t("orders.filters.notificationsHave")
                  : notificationFilter === "none"
                    ? t("orders.filters.notificationsNone")
                    : t("orders.filters.notificationsAll")
              }
              onOptionSelect={(_, data) => {
                const nextValue = String(
                  data.optionValue ?? "all"
                ) as NotificationFilterOption;
                setNotificationFilter(nextValue);
              }}
            >
              <Option value="all">{t("orders.filters.notificationsAll")}</Option>
              <Option value="have">{t("orders.filters.notificationsHave")}</Option>
              <Option value="none">{t("orders.filters.notificationsNone")}</Option>
            </Dropdown>
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>
                {t("orders.filters.showColumns")}
              </span>
            }
            className={styles.filterField}
          >
            <Popover
              open={columnPickerOpen}
              onOpenChange={(_, data) => {
                setColumnPickerOpen(data.open);
                if (data.open) {
                  setOrderColumnDraft(visibleOrderColumns);
                }
              }}
              positioning={{ position: "below", align: "start" }}
            >
              <PopoverTrigger disableButtonEnhancement>
                <Button appearance="secondary" className={styles.actionMenuButton}>
                  {t("orders.filters.selectColumns")}
                  <span className={styles.actionButtonArrow} aria-hidden="true">
                    ▾
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverSurface className={styles.columnsPopover}>
                <div className={styles.columnsHeader}>
                  <Text className={styles.columnsHeaderText}>
                    {t("orders.filters.selectColumns")}
                  </Text>
                </div>
                <div className={styles.columnsOptionsList}>
                  {ORDER_COLUMN_KEYS.map((columnKey) => (
                    <div key={columnKey} className={styles.columnsOptionRow}>
                      <Checkbox
                        label={t(ORDER_COLUMN_LABEL_KEY_BY_ID[columnKey])}
                        checked={orderColumnDraftSet.has(columnKey)}
                        onChange={(_, data) => {
                          toggleOrderColumnDraft(columnKey, data.checked === true);
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className={styles.columnsActions}>
                  <Button
                    appearance="secondary"
                    onClick={() => {
                      setOrderColumnDraft(visibleOrderColumns);
                      setColumnPickerOpen(false);
                    }}
                  >
                    {t("common.close")}
                  </Button>
                  <Button
                    appearance="primary"
                    onClick={saveOrderColumns}
                  >
                    {t("common.save")}
                  </Button>
                </div>
                <div className={styles.columnsCounter}>
                  {`${orderColumnDraft.length}/${ORDER_COLUMN_KEYS.length}`}
                </div>
              </PopoverSurface>
            </Popover>
          </Field>
          <div className={styles.actionRow}>
            <Button
              appearance="primary"
              disabled={!hasResendSelection}
              onClick={() => {
                void openResendDialog();
              }}
            >
              {t("orders.resend.button")}
            </Button>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button
                  appearance="secondary"
                  disabled={!hasSelection}
                  className={styles.actionMenuButton}
                >
                  {t("orders.actions.button")}
                  <span className={styles.actionButtonArrow} aria-hidden="true">
                    ▾
                  </span>
                </Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem disabled={!hasSelection} onClick={openStatusDialog}>
                    {t("orders.actions.changeStatus")}
                  </MenuItem>
                  <MenuItem
                    disabled={!hasSelection || isExporting}
                    onClick={() => {
                      void exportSelectedOrders();
                    }}
                  >
                    {isExporting
                      ? `${t("orders.export.button")}...`
                      : t("orders.export.button")}
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
            {hasSelection ? (
              <>
                <Button
                  appearance="primary"
                  onClick={() => {
                    void openEmailDialog(ORDER_EMAIL_DIALOG_MODE.PARTNER_ONLY);
                  }}
                >
                  {t("orders.email.button")}
                </Button>
                <Button
                  appearance="secondary"
                  onClick={() => {
                    void openEmailDialog(ORDER_EMAIL_DIALOG_MODE.DELIVERY_LETSDEAL);
                  }}
                >
                  {t("orders.delivery.button")}
                </Button>
              </>
            ) : null}
            <Button
              appearance="outline"
              disabled={!hasSelection || isRemoving}
              onClick={async () => {
                const ids = Array.from(selectedOrderIds);
                if (ids.length === 0) return;
                if (!window.confirm(t("orders.remove.confirm"))) return;
                setIsRemoving(true);
                setError(null);
                try {
                  const response = await fetch("/api/orders", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids }),
                  });
                  if (!response.ok) {
                    let message = "Remove failed.";
                    try {
                      const payload = await response.json();
                      if (payload?.error) message = payload.error;
                    } catch {
                      const text = await response.text();
                      if (text) message = text;
                    }
                    throw new Error(message);
                  }
                  const idSet = new Set(ids);
                  setRows((prev) => prev.filter((row) => !idSet.has(row.id)));
                  const removedCount = ids.length;
                  setTotalCount((prev) => Math.max(0, prev - removedCount));
                  setLoadedTo((prev) => Math.max(0, prev - removedCount));
                  setSelectedOrderIds(new Set());
                  setExpandedOrders((prev) => {
                    const next = new Set(prev);
                    ids.forEach((id) => next.delete(id));
                    return next;
                  });
                  setDetailsById((prev) => {
                    const next = { ...prev };
                    ids.forEach((id) => {
                      delete next[id];
                    });
                    return next;
                  });
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setIsRemoving(false);
                }
              }}
            >
              {isRemoving ? <Spinner size="tiny" /> : t("orders.remove.button")}
            </Button>
          </div>
        </div>
        <div className={styles.paginationBar}>
          <Text className={styles.paginationMeta}>
            {totalCount > 0
              ? t("orders.pagination.summary", {
                  from: loadedFrom,
                  to: loadedTo,
                  count: totalCount,
                })
              : t("orders.pagination.emptySummary")}
          </Text>
          <div className={styles.paginationControls}>
            <Text className={styles.paginationMeta}>
              {totalPages > 0
                ? t("orders.pagination.pageOf", {
                    page,
                    pageCount: totalPages,
                  })
                : t("orders.pagination.pageOf", { page: 0, pageCount: 0 })}
            </Text>
            <Dropdown
              className={styles.paginationPageSize}
              selectedOptions={[String(pageSize)]}
              value={t("orders.pagination.pageSizeValue", { size: pageSize })}
              onOptionSelect={(_, data) => {
                const nextSize = Number.parseInt(
                  String(data.optionValue ?? ""),
                  10
                );
                if (!Number.isFinite(nextSize) || nextSize <= 0) return;
                setPageSize(nextSize);
              }}
            >
              {ORDERS_PAGE_SIZE_OPTIONS.map((size) => (
                <Option
                  key={size}
                  value={String(size)}
                  text={t("orders.pagination.pageSizeValue", { size })}
                >
                  {t("orders.pagination.pageSizeValue", { size })}
                </Option>
              ))}
            </Dropdown>
            <Button
              appearance="secondary"
              disabled={loading || !canGoPreviousPage}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              {t("orders.pagination.previous")}
            </Button>
            <Button
              appearance="secondary"
              disabled={loading || !canGoNextPage}
              onClick={() => setPage((prev) => prev + 1)}
            >
              {t("orders.pagination.next")}
            </Button>
          </div>
        </div>
      </Card>

      <Card className={styles.tableCard}>
        {error ? <Text className={styles.errorText}>{error}</Text> : null}
        <div className={styles.tableWrapper}>
          {loading ? (
            <div className={styles.tableLoadingState}>
              <Spinner size="tiny" />
              <Text className={styles.tableLoadingLabel}>
                {t("orders.loading")}
              </Text>
            </div>
          ) : (
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell
                    className={mergeClasses(
                      styles.stickyHeader,
                      styles.selectCell
                    )}
                  >
                    <Checkbox
                      checked={selectAllState}
                      aria-label={t("common.selectAll")}
                      onChange={(_, data) => {
                        setSelectedOrderIds(() => {
                          if (data.checked === true) {
                            return new Set(filteredRows.map((row) => row.id));
                          }
                          return new Set();
                        });
                        lastSelectedOrderIndexRef.current = null;
                      }}
                    />
                  </TableHeaderCell>
                  {visibleOrderColumnSet.has("sales_channel_id") ? (
                    <TableHeaderCell
                      className={mergeClasses(styles.stickyHeader, styles.colSalesChannelId)}
                    >
                      {t("orders.columns.salesChannelId")}
                    </TableHeaderCell>
                  ) : null}
                  {visibleOrderColumnSet.has("order_number") ? (
                    <TableHeaderCell
                      className={mergeClasses(styles.stickyHeader, styles.colOrderNumber)}
                    >
                      {t("orders.columns.orderNumber")}
                    </TableHeaderCell>
                  ) : null}
                  {visibleOrderColumnSet.has("sales_channel") ? (
                    <TableHeaderCell
                      className={mergeClasses(styles.stickyHeader, styles.colSalesChannel)}
                    >
                      {t("orders.columns.salesChannel")}
                    </TableHeaderCell>
                  ) : null}
                  {visibleOrderColumnSet.has("customer") ? (
                    <TableHeaderCell
                      className={mergeClasses(styles.stickyHeader, styles.colCustomer)}
                    >
                      {t("orders.columns.customer")}
                    </TableHeaderCell>
                  ) : null}
                  {visibleOrderColumnSet.has("country") ? (
                    <TableHeaderCell
                      className={mergeClasses(styles.stickyHeader, styles.colCountry)}
                    >
                      {t("orders.columns.country")}
                    </TableHeaderCell>
                  ) : null}
                  {visibleOrderColumnSet.has("order_value") ? (
                    <TableHeaderCell
                      className={mergeClasses(styles.stickyHeader, styles.colOrderValue)}
                    >
                      {t("orders.columns.orderValue")}
                    </TableHeaderCell>
                  ) : null}
                  {visibleOrderColumnSet.has("transaction_date") ? (
                    <TableHeaderCell
                      className={mergeClasses(styles.stickyHeader, styles.colTransactionDate)}
                    >
                      {t("orders.columns.transactionDate")}
                    </TableHeaderCell>
                  ) : null}
                  {visibleOrderColumnSet.has("status") ? (
                    <TableHeaderCell
                      className={mergeClasses(styles.stickyHeader, styles.colStatus)}
                    >
                      {t("orders.columns.status")}
                    </TableHeaderCell>
                  ) : null}
                  {visibleOrderColumnSet.has("warnings") ? (
                    <TableHeaderCell
                      className={mergeClasses(styles.stickyHeader, styles.colWarnings)}
                    >
                      {t("orders.columns.warnings")}
                    </TableHeaderCell>
                  ) : null}
                  {visibleOrderColumnSet.has("notifications") ? (
                    <TableHeaderCell
                      className={mergeClasses(styles.stickyHeader, styles.colNotifications)}
                    >
                      {t("orders.columns.notifications")}
                    </TableHeaderCell>
                  ) : null}
                  {visibleOrderColumnSet.has("partner_informed") ? (
                    <TableHeaderCell
                      className={mergeClasses(styles.stickyHeader, styles.colPartnerInformed)}
                    >
                      {t("orders.columns.partnerInformed")}
                    </TableHeaderCell>
                  ) : null}
                  {visibleOrderColumnSet.has("date_shipped") ? (
                    <TableHeaderCell
                      className={mergeClasses(styles.stickyHeader, styles.colDateShipped)}
                    >
                      {t("orders.columns.dateShipped")}
                    </TableHeaderCell>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleTableColumnCount}>
                      {t("orders.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row, index) => {
                    const isExpanded = expandedOrders.has(row.id);
                    const details = detailsById[row.id];
                    const isResendOrder = resendOrderId === row.id;
                    const itemIds =
                      (details?.items
                        ?.map((item) => item.id)
                        .filter(Boolean) as string[]) ?? [];
                    const allItemsSelected =
                      isResendOrder &&
                      itemIds.length > 0 &&
                      itemIds.every((id) => resendItemIds.has(id));
                    const someItemsSelected =
                      isResendOrder && itemIds.some((id) => resendItemIds.has(id));
                    const itemSelectState = allItemsSelected
                      ? true
                      : someItemsSelected
                        ? "mixed"
                        : false;
                    const rowClass =
                      index % 2 === 1 ? styles.tableRowAlt : styles.tableRow;
                    const countryCode = getCountryCodeForOrder(row);
                    const countryName = getCountryName(row, countryCode);
                    const platformDisplayName = getNormalizedSalesChannelName(row);
                    const latestNotificationText = getLatestNotificationText(row);
                    const hasNotification = hasLatestNotification(row);
                    const isEditingDetails = editingOrderId === row.id;
                    const detailsEditDraft =
                      detailsEditDrafts[row.id] ??
                      buildOrderDetailsEditDraft(details);
                    const detailsEditSaving = detailsEditSavingOrderId === row.id;
                    const detailsEditError = detailsEditErrorByOrderId[row.id] ?? null;
                    const manualEmailHistoryText = String(
                      details?.order?.manual_email_history ?? ""
                    ).trim();
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          className={mergeClasses(
                            rowClass,
                            styles.clickableRow
                          )}
                          onClick={() => toggleExpanded(row.id)}
                        >
                          <TableCell
                            className={styles.selectCell}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Checkbox
                              checked={selectedOrderIds.has(row.id)}
                              aria-label={t("common.selectItem", {
                                item: row.order_number ?? row.id,
                              })}
                              onChange={(event, data) => {
                                const wantsChecked = data.checked === true;
                                const isShiftSelect = eventHasShiftKey(event);
                                const clickedIndex = index;
                                const anchorIndex = lastSelectedOrderIndexRef.current;
                                setSelectedOrderIds((prev) => {
                                  const next = new Set(prev);
                                  if (
                                    isShiftSelect &&
                                    anchorIndex !== null &&
                                    anchorIndex >= 0 &&
                                    anchorIndex < filteredRows.length
                                  ) {
                                    const start = Math.min(anchorIndex, clickedIndex);
                                    const end = Math.max(anchorIndex, clickedIndex);
                                    for (
                                      let rowIndex = start;
                                      rowIndex <= end;
                                      rowIndex += 1
                                    ) {
                                      const rowId = filteredRows[rowIndex]?.id;
                                      if (!rowId) continue;
                                      if (wantsChecked) {
                                        next.add(rowId);
                                      } else {
                                        next.delete(rowId);
                                      }
                                    }
                                  } else if (wantsChecked) {
                                    next.add(row.id);
                                  } else {
                                    next.delete(row.id);
                                  }
                                  return next;
                                });
                                lastSelectedOrderIndexRef.current = clickedIndex;
                              }}
                            />
                          </TableCell>
                          {visibleOrderColumnSet.has("sales_channel_id") ? (
                            <TableCell className={styles.colSalesChannelId}>
                              {row.sales_channel_id ?? ""}
                            </TableCell>
                          ) : null}
                          {visibleOrderColumnSet.has("order_number") ? (
                            <TableCell className={styles.colOrderNumber}>
                              {row.order_number ?? ""}
                            </TableCell>
                          ) : null}
                          {visibleOrderColumnSet.has("sales_channel") ? (
                            <TableCell className={styles.colSalesChannel}>
                              {platformDisplayName}
                            </TableCell>
                          ) : null}
                          {visibleOrderColumnSet.has("customer") ? (
                            <TableCell className={styles.colCustomer}>
                              {row.customer_name ?? ""}
                            </TableCell>
                          ) : null}
                          {visibleOrderColumnSet.has("country") ? (
                            <TableCell className={styles.colCountry}>
                              <span className={styles.countryCell}>
                                {countryCode ? (
                                  <Image
                                    src={flagByCountryCode[countryCode]}
                                    alt={countryName}
                                    width={19}
                                    height={19}
                                    className={styles.countryFlag}
                                  />
                                ) : null}
                                <span>{countryName}</span>
                              </span>
                            </TableCell>
                          ) : null}
                          {visibleOrderColumnSet.has("order_value") ? (
                            <TableCell className={styles.colOrderValue}>
                              {formatCurrency(row.order_total_value, "EUR") || "-"}
                            </TableCell>
                          ) : null}
                          {visibleOrderColumnSet.has("transaction_date") ? (
                            <TableCell className={styles.colTransactionDate}>
                              {formatDate(row.transaction_date)}
                            </TableCell>
                          ) : null}
                          {visibleOrderColumnSet.has("status") ? (
                            <TableCell className={styles.colStatus}>
                              <span
                                className={mergeClasses(
                                  styles.statusPill,
                                  getStatusClassName(row.status)
                                )}
                              >
                                {getStatusText(row.status)}
                              </span>
                            </TableCell>
                          ) : null}
                          {visibleOrderColumnSet.has("warnings") ? (
                            <TableCell className={styles.colWarnings}>
                              {row.is_delayed ? (
                                <span className={styles.warningPill}>
                                  {getDelayWarningText(row)}
                                </span>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                          ) : null}
                          {visibleOrderColumnSet.has("notifications") ? (
                            <TableCell className={styles.colNotifications}>
                              <span
                                className={mergeClasses(
                                  styles.notificationField,
                                  hasNotification ? styles.notificationFieldHas : undefined
                                )}
                                title={latestNotificationText}
                              >
                                {latestNotificationText}
                              </span>
                            </TableCell>
                          ) : null}
                          {visibleOrderColumnSet.has("partner_informed") ? (
                            <TableCell className={styles.colPartnerInformed}>
                              {row.partner_informed ? (
                                <span
                                  className={mergeClasses(
                                    styles.statusPill,
                                    styles.statusShipped
                                  )}
                                >
                                  {t("orders.partnerInformed.sent")}
                                </span>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                          ) : null}
                          {visibleOrderColumnSet.has("date_shipped") ? (
                            <TableCell className={styles.colDateShipped}>
                              {formatDate(row.date_shipped)}
                            </TableCell>
                          ) : null}
                        </TableRow>
                        {isExpanded ? (
                          <TableRow>
                            <TableCell
                              colSpan={visibleTableColumnCount}
                              className={styles.detailsCell}
                            >
                              <div className={styles.detailsCard}>
                                {details?.loading ? (
                                  <Text>{t("orders.details.loading")}</Text>
                                ) : details?.error ? (
                                  <Text className={styles.errorText}>
                                    {details.error}
                                  </Text>
                                ) : (
                                  <>
                                    <div className={styles.detailsSplit}>
                                      <div className={styles.detailsSection}>
                                        <Text weight="semibold">
                                          {t("orders.details.itemsTitle")}
                                        </Text>
                                        <div className={styles.detailsTableWrapper}>
                                          <Table size="small" className={styles.detailsTable}>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHeaderCell
                                                  className={mergeClasses(
                                                    styles.detailsTableHeader,
                                                    styles.detailsColSelect
                                                  )}
                                                >
                                                  <Checkbox
                                                    checked={itemSelectState}
                                                    aria-label={t("common.selectAll")}
                                                    disabled={!itemIds.length}
                                                    onChange={(_, data) => {
                                                      handleResendSelectAll(
                                                        row.id,
                                                        itemIds,
                                                        data.checked === true
                                                      );
                                                    }}
                                                  />
                                                </TableHeaderCell>
                                                <TableHeaderCell
                                                  className={mergeClasses(
                                                    styles.detailsTableHeader,
                                                    styles.detailsColImage
                                                  )}
                                                >
                                                  {t("orders.details.columns.image")}
                                                </TableHeaderCell>
                                                <TableHeaderCell
                                                  className={mergeClasses(
                                                    styles.detailsTableHeader,
                                                    styles.detailsColSku
                                                  )}
                                                >
                                                  {t("orders.details.columns.sku")}
                                                </TableHeaderCell>
                                                <TableHeaderCell
                                                  className={mergeClasses(
                                                    styles.detailsTableHeader,
                                                    styles.detailsColTitle
                                                  )}
                                                >
                                                  {t("orders.details.columns.title")}
                                                </TableHeaderCell>
                                                <TableHeaderCell
                                                  className={mergeClasses(
                                                    styles.detailsTableHeader,
                                                    styles.detailsColQty
                                                  )}
                                                >
                                                  {t("orders.details.columns.quantity")}
                                                </TableHeaderCell>
                                                <TableHeaderCell
                                                  className={mergeClasses(
                                                    styles.detailsTableHeader,
                                                    styles.detailsColSalesValue
                                                  )}
                                                >
                                                  {t("orders.details.columns.salesValue")}
                                                </TableHeaderCell>
                                                <TableHeaderCell
                                                  className={mergeClasses(
                                                    styles.detailsTableHeader,
                                                    styles.detailsColMarketplace
                                                  )}
                                                >
                                                  {t("orders.details.columns.marketplaceOrder")}
                                                </TableHeaderCell>
                                                <TableHeaderCell
                                                  className={mergeClasses(
                                                    styles.detailsTableHeader,
                                                    styles.detailsColSalesChannel
                                                  )}
                                                >
                                                  {t("orders.details.columns.salesChannelOrder")}
                                                </TableHeaderCell>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {details?.items?.length ? (
                                                details.items.map((item) => (
                                                  <TableRow key={item.id}>
                                                    <TableCell className={styles.detailsColSelect}>
                                                      <Checkbox
                                                        checked={
                                                          Boolean(
                                                            isResendOrder &&
                                                              item.id &&
                                                              resendItemIds.has(item.id)
                                                          )
                                                        }
                                                        aria-label={t("common.selectItem", {
                                                          item: item.sku ?? item.id,
                                                        })}
                                                        disabled={!item.id}
                                                        onChange={(_, data) => {
                                                          if (!item.id) return;
                                                          handleResendItemToggle(
                                                            row.id,
                                                            item.id,
                                                            data.checked === true
                                                          );
                                                        }}
                                                      />
                                                    </TableCell>
                                                    <TableCell className={styles.detailsColImage}>
                                                      {item.item_image_url ? (
                                                        <span
                                                          className={styles.itemImageWrap}
                                                          onMouseEnter={(event) => {
                                                            showHoverPreview(
                                                              event,
                                                              item.item_image_url ?? "",
                                                              item.product_title ||
                                                                item.sku ||
                                                                "Product image"
                                                            );
                                                          }}
                                                          onMouseMove={moveHoverPreview}
                                                          onMouseLeave={hideHoverPreview}
                                                        >
                                                          <img
                                                            src={item.item_image_url}
                                                            alt={
                                                              item.product_title ||
                                                              item.sku ||
                                                              "Product image"
                                                            }
                                                            className={styles.itemImageThumb}
                                                            loading="lazy"
                                                          />
                                                        </span>
                                                      ) : (
                                                        <Text className={styles.detailLabel}>-</Text>
                                                      )}
                                                    </TableCell>
                                                    <TableCell className={styles.detailsColSku}>
                                                      {item.sku ?? ""}
                                                    </TableCell>
                                                    <TableCell className={styles.detailsTitleCell}>
                                                      <Text className={styles.detailsTitleText}>
                                                        {renderItemTitle(item)}
                                                      </Text>
                                                    </TableCell>
                                                    <TableCell className={styles.detailsColQty}>
                                                      {item.quantity === 0 ||
                                                      item.quantity === null ||
                                                      item.quantity === undefined
                                                        ? ""
                                                        : item.quantity}
                                                    </TableCell>
                                                    <TableCell className={styles.detailsColSalesValue}>
                                                      {formatCurrency(item.sales_value_eur, "EUR")}
                                                    </TableCell>
                                                    <TableCell className={styles.detailsColMarketplace}>
                                                      {item.marketplace_order_number ?? "-"}
                                                    </TableCell>
                                                    <TableCell className={styles.detailsColSalesChannel}>
                                                      {item.sales_channel_order_number ?? "-"}
                                                    </TableCell>
                                                  </TableRow>
                                                ))
                                              ) : (
                                                <TableRow>
                                                  <TableCell colSpan={8}>
                                                    {t("orders.details.none")}
                                                  </TableCell>
                                                </TableRow>
                                              )}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>
                                      <div className={styles.detailsSection}>
                                        <Text weight="semibold">
                                          {t("orders.details.customerTitle")}
                                        </Text>
                                        <div className={styles.detailsPanel}>
                                          <div className={styles.detailsPanelGrid}>
                                            <div className={styles.detailsInfoGrid}>
                                              <div className={styles.detailsRow}>
                                                <Text
                                                  className={mergeClasses(
                                                    styles.detailLabel,
                                                    styles.detailsInfoKey
                                                  )}
                                                >
                                                  {t("orders.details.customerName")}
                                                </Text>
                                                {isEditingDetails ? (
                                                  <Input
                                                    className={styles.detailsEditField}
                                                    size="small"
                                                    value={detailsEditDraft.customer_name}
                                                    onChange={(_, data) =>
                                                      updateOrderDetailsDraftField(
                                                        row.id,
                                                        "customer_name",
                                                        data.value
                                                      )
                                                    }
                                                  />
                                                ) : (
                                                  <Text className={styles.detailValue}>
                                                    {details?.order?.customer_name ?? "-"}
                                                  </Text>
                                                )}
                                              </div>
                                              <div className={styles.detailsRow}>
                                                <Text
                                                  className={mergeClasses(
                                                    styles.detailLabel,
                                                    styles.detailsInfoKey
                                                  )}
                                                >
                                                  {t("orders.details.customerAddress")}
                                                </Text>
                                                {isEditingDetails ? (
                                                  <Input
                                                    className={styles.detailsEditField}
                                                    size="small"
                                                    value={detailsEditDraft.customer_address}
                                                    onChange={(_, data) =>
                                                      updateOrderDetailsDraftField(
                                                        row.id,
                                                        "customer_address",
                                                        data.value
                                                      )
                                                    }
                                                  />
                                                ) : (
                                                  <Text className={styles.detailValue}>
                                                    {[
                                                      details?.order?.customer_address ?? "",
                                                      details?.order?.customer_zip ?? "",
                                                      details?.order?.customer_city ?? "",
                                                    ]
                                                      .map((value) => value.trim())
                                                      .filter(Boolean)
                                                      .join(", ")}
                                                  </Text>
                                                )}
                                              </div>
                                              {isEditingDetails ? (
                                                <>
                                                  <div className={styles.detailsRow}>
                                                    <Text
                                                      className={mergeClasses(
                                                        styles.detailLabel,
                                                        styles.detailsInfoKey
                                                      )}
                                                    >
                                                      ZIP
                                                    </Text>
                                                    <Input
                                                      className={styles.detailsEditField}
                                                      size="small"
                                                      value={detailsEditDraft.customer_zip}
                                                      onChange={(_, data) =>
                                                        updateOrderDetailsDraftField(
                                                          row.id,
                                                          "customer_zip",
                                                          data.value
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                  <div className={styles.detailsRow}>
                                                    <Text
                                                      className={mergeClasses(
                                                        styles.detailLabel,
                                                        styles.detailsInfoKey
                                                      )}
                                                    >
                                                      City
                                                    </Text>
                                                    <Input
                                                      className={styles.detailsEditField}
                                                      size="small"
                                                      value={detailsEditDraft.customer_city}
                                                      onChange={(_, data) =>
                                                        updateOrderDetailsDraftField(
                                                          row.id,
                                                          "customer_city",
                                                          data.value
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                </>
                                              ) : null}
                                              <div className={styles.detailsRow}>
                                                <Text
                                                  className={mergeClasses(
                                                    styles.detailLabel,
                                                    styles.detailsInfoKey
                                                  )}
                                                >
                                                  {t("orders.details.customerEmail")}
                                                </Text>
                                                {isEditingDetails ? (
                                                  <Input
                                                    className={styles.detailsEditField}
                                                    size="small"
                                                    value={detailsEditDraft.customer_email}
                                                    onChange={(_, data) =>
                                                      updateOrderDetailsDraftField(
                                                        row.id,
                                                        "customer_email",
                                                        data.value
                                                      )
                                                    }
                                                  />
                                                ) : (
                                                  <Text className={styles.detailValue}>
                                                    {(() => {
                                                      const email =
                                                        details?.order?.customer_email ?? "";
                                                      return email && isValidEmail(email)
                                                        ? email
                                                        : "-";
                                                    })()}
                                                  </Text>
                                                )}
                                              </div>
                                              <div className={styles.detailsRow}>
                                                <Text
                                                  className={mergeClasses(
                                                    styles.detailLabel,
                                                    styles.detailsInfoKey
                                                  )}
                                                >
                                                  {t("orders.details.customerPhone")}
                                                </Text>
                                                {isEditingDetails ? (
                                                  <Input
                                                    className={styles.detailsEditField}
                                                    size="small"
                                                    value={detailsEditDraft.customer_phone}
                                                    onChange={(_, data) =>
                                                      updateOrderDetailsDraftField(
                                                        row.id,
                                                        "customer_phone",
                                                        data.value
                                                      )
                                                    }
                                                  />
                                                ) : (
                                                  <Text className={styles.detailValue}>
                                                    {details?.order?.customer_phone ?? "-"}
                                                  </Text>
                                                )}
                                              </div>
                                            </div>
                                            <div className={styles.detailsColumn}>
                                              <Text className={styles.detailLabel}>
                                                {t("orders.details.status")}
                                              </Text>
                                              <span
                                                className={mergeClasses(
                                                  styles.statusPill,
                                                  getStatusClassName(details?.order?.status)
                                                )}
                                              >
                                                {getStatusText(details?.order?.status)}
                                              </span>
                                              {row.is_delayed ? (
                                                <span className={styles.warningPill}>
                                                  {getDelayWarningText(row)}
                                                </span>
                                              ) : null}
                                              <Text className={styles.detailLabel}>
                                                Shipping
                                              </Text>
                                              {isEditingDetails ? (
                                                <Input
                                                  className={styles.detailsEditField}
                                                  size="small"
                                                  value={detailsEditDraft.shipping}
                                                  onChange={(_, data) =>
                                                    updateOrderDetailsDraftField(
                                                      row.id,
                                                      "shipping",
                                                      data.value
                                                    )
                                                  }
                                                  placeholder="YYYY-MM-DD"
                                                />
                                              ) : (
                                                <Text className={styles.detailValue}>
                                                  {formatDate(details?.order?.date_shipped)}
                                                </Text>
                                              )}
                                              <Text className={styles.detailLabel}>
                                                Tracking Number
                                              </Text>
                                              {isEditingDetails ? (
                                                <Textarea
                                                  className={styles.detailsEditTextarea}
                                                  value={detailsEditDraft.tracking_number}
                                                  onChange={(_, data) =>
                                                    updateOrderDetailsDraftField(
                                                      row.id,
                                                      "tracking_number",
                                                      data.value
                                                    )
                                                  }
                                                />
                                              ) : (
                                                <>
                                                  {details?.tracking_numbers?.length ? (
                                                    <div className={styles.trackingList}>
                                                      {details.tracking_numbers.map((tracking) => (
                                                        <div
                                                          key={tracking.tracking_number}
                                                          className={styles.trackingItem}
                                                        >
                                                          <a
                                                            className={styles.trackingLink}
                                                            href={`https://t.17track.net/en#nums=${encodeURIComponent(
                                                              tracking.tracking_number
                                                            )}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            aria-label={t(
                                                              "orders.details.trackExternal"
                                                            )}
                                                          >
                                                            {tracking.tracking_number}
                                                          </a>
                                                          {tracking.sent_date ? (
                                                            <span className={styles.trackingDate}>
                                                              {formatDate(tracking.sent_date)}
                                                            </span>
                                                          ) : null}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  ) : (
                                                    <Text className={styles.detailValue}>-</Text>
                                                  )}
                                                </>
                                              )}
                                              <Text className={styles.detailLabel}>
                                                {t("orders.details.emailHistory")}
                                              </Text>
                                              {isEditingDetails ? (
                                                <Textarea
                                                  className={styles.detailsEditTextarea}
                                                  value={detailsEditDraft.email_history}
                                                  onChange={(_, data) =>
                                                    updateOrderDetailsDraftField(
                                                      row.id,
                                                      "email_history",
                                                      data.value
                                                    )
                                                  }
                                                />
                                              ) : (
                                                <>
                                                  {manualEmailHistoryText ? (
                                                    <Text className={styles.detailValue}>
                                                      {manualEmailHistoryText}
                                                    </Text>
                                                  ) : details?.email_history?.length ? (
                                                    <div className={styles.emailHistoryList}>
                                                      {details.email_history.map((entry) => {
                                                        const historyLabel =
                                                          entry.notification_name ||
                                                          entry.subject ||
                                                          t("orders.notifications.none");
                                                        const historyDate =
                                                          entry.send_date ||
                                                          entry.created_at;
                                                        return (
                                                          <div
                                                            key={entry.id}
                                                            className={styles.emailHistoryItem}
                                                          >
                                                            <Text className={styles.detailValue}>
                                                              {historyLabel}
                                                            </Text>
                                                            {historyDate ? (
                                                              <Text
                                                                className={styles.emailHistoryDate}
                                                              >
                                                                ({formatDate(historyDate)})
                                                              </Text>
                                                            ) : null}
                                                          </div>
                                                        );
                                                      })}
                                                    </div>
                                                  ) : (
                                                    <Text className={styles.detailValue}>
                                                      {t("orders.details.emailHistoryNone")}
                                                    </Text>
                                                  )}
                                                </>
                                              )}
                                              <Text className={styles.detailLabel}>
                                                {t("orders.details.customerNote")}
                                              </Text>
                                              {isEditingDetails ? (
                                                <Textarea
                                                  className={styles.detailsEditTextarea}
                                                  value={detailsEditDraft.notes}
                                                  onChange={(_, data) =>
                                                    updateOrderDetailsDraftField(
                                                      row.id,
                                                      "notes",
                                                      data.value
                                                    )
                                                  }
                                                />
                                              ) : (
                                                <Text className={styles.detailValue}>
                                                  {details?.order?.customer_note ?? "-"}
                                                </Text>
                                              )}
                                              <div className={styles.detailsEditActions}>
                                                {isEditingDetails ? (
                                                  <>
                                                    <Button
                                                      size="small"
                                                      appearance="secondary"
                                                      onClick={() =>
                                                        cancelEditingOrderDetails(row.id)
                                                      }
                                                      disabled={detailsEditSaving}
                                                    >
                                                      Close
                                                    </Button>
                                                    <Button
                                                      size="small"
                                                      appearance="primary"
                                                      onClick={() => {
                                                        void saveOrderDetailsEdits(row.id);
                                                      }}
                                                      disabled={detailsEditSaving}
                                                    >
                                                      {detailsEditSaving ? (
                                                        <Spinner size="tiny" />
                                                      ) : (
                                                        "Save"
                                                      )}
                                                    </Button>
                                                  </>
                                                ) : (
                                                  <Button
                                                    size="small"
                                                    appearance="secondary"
                                                    onClick={() =>
                                                      startEditingOrderDetails(row.id)
                                                    }
                                                  >
                                                    Edit
                                                  </Button>
                                                )}
                                              </div>
                                              {detailsEditError ? (
                                                <Text className={styles.errorText}>
                                                  {detailsEditError}
                                                </Text>
                                              ) : null}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </>
                                )}
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
      {hoverImagePreview ? (
        <div
          className={styles.floatingImagePreview}
          style={{
            left: `${hoverImagePreview.x}px`,
            top: `${hoverImagePreview.y}px`,
          }}
        >
          <img
            src={hoverImagePreview.src}
            alt={hoverImagePreview.alt}
            className={styles.floatingImagePreviewImg}
          />
        </div>
      ) : null}
      <Dialog
        open={statusDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closeStatusDialog();
          }
        }}
      >
        <DialogSurface className={styles.statusDialog}>
          <DialogBody>
            <DialogTitle>{t("orders.statusDialog.title")}</DialogTitle>
            <DialogContent className={styles.statusDialogBody}>
              <Text className={styles.emailSelectionMeta}>
                {t("orders.statusDialog.selectionCount", {
                  count: selectedRows.length,
                })}
              </Text>
              <Field label={t("orders.statusDialog.statusLabel")}>
                <Dropdown
                  selectedOptions={[statusDialogValue]}
                  value={getStatusText(statusDialogValue)}
                  onOptionSelect={(_, data) => {
                    setStatusDialogValue(
                      normalizeDisplayStatus(data.optionValue ?? "pending")
                    );
                    setStatusDialogError(null);
                  }}
                >
                  <Option value="pending">{t("orders.status.pending")}</Option>
                  <Option value="purchased">{t("orders.status.purchased")}</Option>
                  <Option value="being_packed_and_shipped">
                    {t("orders.status.beingPackedAndShipped")}
                  </Option>
                  <Option value="shipped">{t("orders.status.shipped")}</Option>
                </Dropdown>
              </Field>
              {statusDialogError ? (
                <Text className={styles.errorText}>{statusDialogError}</Text>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeStatusDialog}>
                {t("orders.statusDialog.actions.close")}
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  void saveSelectedOrdersStatus();
                }}
                disabled={statusDialogSaving || !hasSelection}
              >
                {statusDialogSaving ? (
                  <Spinner size="tiny" />
                ) : (
                  t("orders.statusDialog.actions.save")
                )}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog
        open={emailDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closeEmailDialog();
          }
        }}
      >
        <DialogSurface className={styles.emailDialog}>
          <DialogBody>
            <DialogTitle>
              {emailDialogMode === ORDER_EMAIL_DIALOG_MODE.DELIVERY_LETSDEAL
                ? t("orders.delivery.dialogTitle")
                : t("orders.email.dialogTitle")}
            </DialogTitle>
            <DialogContent className={styles.emailDialogBody}>
              {emailDialogLoading ? (
                <Spinner size="tiny" />
              ) : (
                <>
                  <div className={styles.emailSection}>
                    <Text className={styles.emailSelectionMeta}>
                      {t("orders.email.selectionCount", { count: selectedRows.length })}
                    </Text>
                    {emailDialogMode === ORDER_EMAIL_DIALOG_MODE.PARTNER_ONLY &&
                    previewOrderRow ? (
                      <Text className={styles.emailSelectionMeta}>
                        {t("orders.email.previewCustomer", {
                          order: previewOrderRow.order_number ?? previewOrderRow.id,
                          customer: previewOrderRow.customer_name ?? "-",
                        })}
                      </Text>
                    ) : null}
                  </div>
                  <div className={styles.resendMetaRow}>
                    {emailDialogMode === ORDER_EMAIL_DIALOG_MODE.PARTNER_ONLY ? (
                      <Field label={t("orders.email.templateLabel")}>
                        <Dropdown
                          value={selectedEmailTemplate?.name ?? ""}
                          selectedOptions={
                            selectedEmailTemplateId ? [selectedEmailTemplateId] : []
                          }
                          placeholder={t("orders.email.templatePlaceholder")}
                          onOptionSelect={(_, data) => {
                            setSelectedEmailTemplateId(String(data.optionValue ?? ""));
                            setEmailDialogInfo(null);
                            setEmailDialogError(null);
                          }}
                        >
                          {emailTemplates.map((template) => (
                            <Option
                              key={template.template_id}
                              value={template.template_id}
                              text={template.name}
                            >
                              {template.name}
                            </Option>
                          ))}
                        </Dropdown>
                      </Field>
                    ) : null}
                    <Field label={t("orders.email.senderLabel")}>
                      <Dropdown
                        value={
                          selectedEmailSender
                            ? selectedEmailSender.name
                              ? `${selectedEmailSender.name} (${selectedEmailSender.email})`
                              : selectedEmailSender.email
                            : ""
                        }
                        selectedOptions={
                          selectedEmailSenderEmail ? [selectedEmailSenderEmail] : []
                        }
                        placeholder={t("orders.email.senderPlaceholder")}
                        onOptionSelect={(_, data) => {
                          setSelectedEmailSenderEmail(String(data.optionValue ?? ""));
                          setEmailDialogInfo(null);
                          setEmailDialogError(null);
                        }}
                      >
                        {emailSenders.map((sender) => (
                          <Option key={sender.email} value={sender.email} text={sender.email}>
                            {sender.name
                              ? `${sender.name} (${sender.email})`
                              : sender.email}
                          </Option>
                        ))}
                      </Dropdown>
                    </Field>
                    <Field label={t("orders.email.bccLabel")}>
                      <Dropdown
                        multiselect
                        value={
                          selectedEmailBcc.length > 0
                            ? selectedEmailBcc.join(", ")
                            : t("orders.email.bccPlaceholder")
                        }
                        selectedOptions={selectedEmailBcc}
                        placeholder={t("orders.email.bccPlaceholder")}
                        onOptionSelect={(_, data) => {
                          setSelectedEmailBcc(data.selectedOptions.map((item) => String(item)));
                          setEmailDialogInfo(null);
                          setEmailDialogError(null);
                        }}
                      >
                        {ORDER_EMAIL_BCC_OPTIONS.map((bccEmail) => (
                          <Option key={bccEmail} value={bccEmail} text={bccEmail}>
                            {bccEmail}
                          </Option>
                        ))}
                      </Dropdown>
                    </Field>
                    {emailDialogMode === ORDER_EMAIL_DIALOG_MODE.PARTNER_ONLY ? (
                      <Field label={t("orders.email.partnerReceiverLabel")}>
                        <Dropdown
                          value={
                            selectedEmailPartnerReceiver
                              ? t(selectedEmailPartnerReceiver.labelKey)
                              : ""
                          }
                          selectedOptions={
                            selectedEmailPartnerReceiverKey
                              ? [selectedEmailPartnerReceiverKey]
                              : []
                          }
                          placeholder={t("orders.email.partnerReceiverPlaceholder")}
                          onOptionSelect={(_, data) => {
                            setSelectedEmailPartnerReceiverKey(
                              String(data.optionValue ?? "")
                            );
                            setEmailDialogInfo(null);
                            setEmailDialogError(null);
                          }}
                        >
                          {ORDER_EMAIL_PARTNER_RECEIVER_OPTIONS.map((receiver) => (
                            <Option
                              key={receiver.key}
                              value={receiver.key}
                              text={t(receiver.labelKey)}
                            >
                              {t(receiver.labelKey)}
                            </Option>
                          ))}
                        </Dropdown>
                      </Field>
                    ) : null}
                  </div>

                  <Text className={styles.emailSelectionMeta}>
                    {emailDialogMode === ORDER_EMAIL_DIALOG_MODE.DELIVERY_LETSDEAL
                      ? t("orders.delivery.modeHelp")
                      : t("orders.email.sendpulseNote")}
                  </Text>

                  {emailDialogError ? (
                    <Text className={styles.errorText}>{emailDialogError}</Text>
                  ) : null}
                  {emailDialogInfo ? (
                    <Text className={styles.emailInfoText}>{emailDialogInfo}</Text>
                  ) : null}

                  {emailDialogMode === ORDER_EMAIL_DIALOG_MODE.PARTNER_ONLY ? (
                    <>
                      <div className={styles.emailSection}>
                        <Text weight="semibold">{t("orders.email.editorTitle")}</Text>
                        <Text className={styles.emailSelectionMeta}>
                          {t("orders.email.editorHint")}
                        </Text>
                        <Field label={t("orders.email.editorSubjectLabel")}>
                          <Input
                            value={emailSubjectTemplateDraft}
                            onChange={(_, data) => {
                              setEmailSubjectTemplateDraft(data.value);
                              setEmailDialogInfo(null);
                              setEmailDialogError(null);
                            }}
                          />
                        </Field>
                        <Field label={t("orders.email.editorBodyLabel")}>
                          <Textarea
                            value={emailBodyTemplateDraft}
                            onChange={(_, data) => {
                              setEmailBodyTemplateDraft(data.value);
                              setEmailDialogInfo(null);
                              setEmailDialogError(null);
                            }}
                            className={styles.emailTemplateEditor}
                            resize="vertical"
                          />
                        </Field>
                      </div>

                      <div className={styles.emailSection}>
                        <Text weight="semibold">{t("orders.email.previewTitle")}</Text>
                        <div className={styles.emailPreviewCard}>
                          <div className={styles.emailPreviewHeader}>
                            <Text className={styles.emailSelectionMeta}>
                              {t("orders.email.previewSubjectLabel")}
                            </Text>
                            <Text weight="semibold">
                              {emailPreview?.rendered_subject ||
                                t("orders.email.previewSubjectEmpty")}
                            </Text>
                            {emailPreview?.macro_resolution?.missingRequiredMacros
                              ?.length ? (
                              <Text className={styles.errorText}>
                                {t("orders.email.previewMissingMacros", {
                                  macros:
                                    emailPreview.macro_resolution.missingRequiredMacros
                                      .map((macro) => `{{${macro}}}`)
                                      .join(", "),
                                })}
                              </Text>
                            ) : null}
                          </div>
                          <div className={styles.emailPreviewBody}>
                            {emailPreviewLoading ? (
                              <Spinner size="tiny" />
                            ) : (
                              <div
                                dangerouslySetInnerHTML={{
                                  __html: emailPreview?.rendered_body || "",
                                }}
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      <div className={styles.emailSection}>
                        <Text className={styles.emailSelectionMeta}>
                          {t("orders.email.macrosUsed")}
                        </Text>
                        <div className={styles.emailMacroBadges}>
                          {selectedEmailMacroKeys.length > 0 ? (
                            selectedEmailMacroKeys.map((macro) => (
                              <Badge key={macro} appearance="tint" shape="rounded">
                                {`{{${macro}}}`}
                              </Badge>
                            ))
                          ) : (
                            <Text className={styles.emailSelectionMeta}>
                              {t("orders.email.noMacros")}
                            </Text>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className={styles.emailSection}>
                      <Text weight="semibold">{t("orders.delivery.rulesTitle")}</Text>
                      <Text className={styles.emailSelectionMeta}>
                        {t("orders.delivery.rule.normal", {
                          template: "se_support_deliveryconfirm_normal",
                        })}
                      </Text>
                      <Text className={styles.emailSelectionMeta}>
                        {t("orders.delivery.rule.shortDelay", {
                          template: "se_support_deliveryconfirm_shortdelay",
                        })}
                      </Text>
                      <Text className={styles.emailSelectionMeta}>
                        {t("orders.delivery.rule.longDelay", {
                          template: "se_support_deliveryconfirm_longdelay",
                        })}
                      </Text>
                      <Text className={styles.emailSelectionMeta}>
                        {t("orders.delivery.rule.partner", {
                          template: "en_order_partner_tracking",
                        })}
                      </Text>
                    </div>
                  )}
                </>
              )}
            </DialogContent>
            <DialogActions className={styles.emailDialogActions}>
              <Text className={styles.emailSelectionMeta}>
                {emailDialogMode === ORDER_EMAIL_DIALOG_MODE.DELIVERY_LETSDEAL
                  ? t("orders.delivery.sendSummary", { count: selectedRows.length })
                  : t("orders.email.sendSummary", { count: selectedRows.length })}
              </Text>
              <div className={styles.emailActionGroup}>
                <Button appearance="secondary" onClick={closeEmailDialog}>
                  {t("orders.email.actions.cancel")}
                </Button>
                <Button
                  appearance="primary"
                  onClick={handleSendEmails}
                  disabled={
                    isSendingEmails ||
                    emailDialogLoading ||
                    !selectedEmailSender ||
                    (emailDialogMode === ORDER_EMAIL_DIALOG_MODE.PARTNER_ONLY &&
                      (!selectedEmailTemplate ||
                        !selectedEmailPartnerReceiver ||
                        selectedEmailPartnerReceiver.key === "none")) ||
                    selectedRows.length === 0
                  }
                >
                  {isSendingEmails ? (
                    <Spinner size="tiny" />
                  ) : (
                    emailDialogMode === ORDER_EMAIL_DIALOG_MODE.DELIVERY_LETSDEAL
                      ? t("orders.delivery.actions.send")
                      : t("orders.email.actions.send")
                  )}
                </Button>
              </div>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog
        open={resendDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closeResendDialog();
          }
        }}
      >
        <DialogSurface className={styles.resendDialog}>
          <DialogBody>
            <DialogTitle>{t("orders.resend.dialogTitle")}</DialogTitle>
            <DialogContent className={styles.resendDialogBody}>
              {resendDialogLoading ? (
                <Spinner size="tiny" />
              ) : resendDialogError ? (
                <Text className={styles.errorText}>{resendDialogError}</Text>
              ) : resendDraft ? (
                <>
                  <div className={styles.resendSection}>
                    <Text weight="semibold">
                      {t("orders.resend.summaryTitle")}
                    </Text>
                    <div className={styles.resendMetaRow}>
                      <div>
                        <Text className={styles.detailLabel}>
                          {t("orders.resend.fields.orderNumber")}
                        </Text>
                        <Text className={styles.detailValue}>
                          {resendDraft.orderNumber || "-"}
                        </Text>
                      </div>
                      <div>
                        <Text className={styles.detailLabel}>
                          {t("orders.resend.fields.salesChannel")}
                        </Text>
                        <Text className={styles.detailValue}>
                          {resendDraft.salesChannel || "-"}
                        </Text>
                      </div>
                    </div>
                  </div>
                  <div className={styles.resendSection}>
                    <Text weight="semibold">
                      {t("orders.resend.addressTitle")}
                    </Text>
                    <div className={styles.resendAddressGrid}>
                      <Field label={t("orders.resend.fields.customerName")}>
                        <Input
                          value={resendDraft.customerName}
                          onChange={(_, data) =>
                            updateResendField("customerName", data.value)
                          }
                        />
                      </Field>
                      <Field label={t("orders.resend.fields.email")}>
                        <Input
                          value={resendDraft.customerEmail}
                          onChange={(_, data) =>
                            updateResendField("customerEmail", data.value)
                          }
                        />
                      </Field>
                      <Field label={t("orders.resend.fields.address")}>
                        <Input
                          value={resendDraft.customerAddress}
                          onChange={(_, data) =>
                            updateResendField("customerAddress", data.value)
                          }
                        />
                      </Field>
                      <Field label={t("orders.resend.fields.zip")}>
                        <Input
                          value={resendDraft.customerZip}
                          onChange={(_, data) =>
                            updateResendField("customerZip", data.value)
                          }
                        />
                      </Field>
                      <Field label={t("orders.resend.fields.city")}>
                        <Input
                          value={resendDraft.customerCity}
                          onChange={(_, data) =>
                            updateResendField("customerCity", data.value)
                          }
                        />
                      </Field>
                      <Field label={t("orders.resend.fields.phone")}>
                        <Input
                          value={resendDraft.customerPhone}
                          onChange={(_, data) =>
                            updateResendField("customerPhone", data.value)
                          }
                        />
                      </Field>
                    </div>
                  </div>
                  <div className={styles.resendSection}>
                    <Text weight="semibold">
                      {t("orders.resend.itemsTitle")}
                    </Text>
                    <div className={styles.resendItemsWrapper}>
                      <Table size="small" className={styles.resendTable}>
                        <TableHeader>
                          <TableRow>
                            <TableHeaderCell className={styles.detailsTableHeader}>
                              {t("orders.resend.columns.sku")}
                            </TableHeaderCell>
                            <TableHeaderCell className={styles.detailsTableHeader}>
                              {t("orders.resend.columns.title")}
                            </TableHeaderCell>
                            <TableHeaderCell className={styles.detailsTableHeader}>
                              {t("orders.resend.columns.quantity")}
                            </TableHeaderCell>
                            <TableHeaderCell className={styles.detailsTableHeader}>
                              {t("orders.resend.columns.price")}
                            </TableHeaderCell>
                            <TableHeaderCell
                              className={mergeClasses(
                                styles.detailsTableHeader,
                                styles.resendRemoveCell
                              )}
                            />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resendDraft.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <Input
                                  value={item.sku}
                                  onChange={(_, data) =>
                                    updateResendItemField(
                                      item.id,
                                      "sku",
                                      data.value
                                    )
                                  }
                                  className={styles.resendInput}
                                />
                              </TableCell>
                              <TableCell>
                                <Text>{item.title}</Text>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(_, data) =>
                                    updateResendItemField(
                                      item.id,
                                      "quantity",
                                      data.value
                                    )
                                  }
                                  className={styles.resendInput}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.price}
                                  onChange={(_, data) =>
                                    updateResendItemField(
                                      item.id,
                                      "price",
                                      data.value
                                    )
                                  }
                                  className={styles.resendInput}
                                />
                              </TableCell>
                              <TableCell className={styles.resendRemoveCell}>
                                {item.isPlaceholder ? null : (
                                  <Button
                                    appearance="subtle"
                                    className={styles.rowRemoveButton}
                                    icon={<TrashIcon />}
                                    aria-label={t("orders.resend.actions.removeRow")}
                                    onClick={() => removeResendRow(item.id)}
                                  />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  <div className={styles.resendSection}>
                    <Text weight="semibold">
                      {t("orders.resend.commentsTitle")}
                    </Text>
                    <Textarea
                      value={resendDraft.comment}
                      onChange={(_, data) =>
                        updateResendField("comment", data.value)
                      }
                      placeholder={t("orders.resend.fields.commentPlaceholder")}
                      resize="vertical"
                      aria-label={t("orders.resend.fields.comment")}
                    />
                  </div>
                </>
              ) : (
                <Text>{t("orders.resend.empty")}</Text>
              )}
            </DialogContent>
            <DialogActions className={styles.resendDialogActions}>
              <Button appearance="subtle" onClick={addResendRow}>
                {t("orders.resend.actions.addRow")}
              </Button>
              <div className={styles.resendActionGroup}>
                <Button appearance="secondary" onClick={closeResendDialog}>
                  {t("orders.resend.actions.cancel")}
                </Button>
                <Button
                  appearance="primary"
                  onClick={handleAddToResend}
                  disabled={!resendDraft || isAddingResend}
                >
                  {isAddingResend ? (
                    <Spinner size="tiny" />
                  ) : (
                    t("orders.resend.actions.resend")
                  )}
                </Button>
              </div>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
