"use client";

import {
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
import { Fragment, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatCurrency, formatDate } from "@/lib/format";

type OrderRow = {
  id: string;
  sales_channel_id: string | null;
  order_number: string | null;
  sales_channel_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_city: string | null;
  customer_zip: string | null;
  transaction_date: string | null;
  date_shipped: string | null;
};

type OrderItem = {
  id: string;
  sku: string | null;
  quantity: number | null;
  sales_value_eur: number | null;
  marketplace_order_number: string | null;
  sales_channel_order_number: string | null;
  product_title: string | null;
  product_spu: string | null;
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
  } | null;
  items: OrderItem[];
  tracking_numbers: string[];
  loading: boolean;
  error?: string;
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
  filtersCard: {
    padding: "16px",
    borderRadius: "16px",
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
  searchInput: {
    width: "420px",
    maxWidth: "100%",
  },
  tableCard: {
    padding: "16px",
    borderRadius: "16px",
  },
  tableWrapper: {
    maxHeight: "520px",
    overflow: "auto",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
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
  clickableRow: {
    cursor: "pointer",
  },
  detailsCell: {
    backgroundColor: tokens.colorNeutralBackground1,
  },
  selectCell: {
    width: "36px",
    minWidth: "36px",
    textAlign: "center",
    paddingLeft: "8px",
    paddingRight: "8px",
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
  detailsRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "6px",
  },
  detailLabel: {
    color: tokens.colorNeutralForeground3,
  },
  detailValue: {
    color: tokens.colorNeutralForeground1,
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
  detailsColSelect: {
    width: "6%",
  },
  detailsColSku: {
    width: "25%",
  },
  detailsColQty: {
    width: "10%",
  },
  detailsColSalesValue: {
    width: "10%",
  },
  detailsColMarketplace: {
    width: "10%",
  },
  detailsColSalesChannel: {
    width: "10%",
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
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
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

export default function OrdersPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [transactionFrom, setTransactionFrom] = useState("");
  const [transactionTo, setTransactionTo] = useState("");
  const [shippedFrom, setShippedFrom] = useState("");
  const [shippedTo, setShippedTo] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isAddingResend, setIsAddingResend] = useState(false);
  const [resendOrderId, setResendOrderId] = useState<string | null>(null);
  const [resendItemIds, setResendItemIds] = useState<Set<string>>(new Set());
  const [resendDialogOpen, setResendDialogOpen] = useState(false);
  const [resendDialogLoading, setResendDialogLoading] = useState(false);
  const [resendDialogError, setResendDialogError] = useState<string | null>(null);
  const [resendDraft, setResendDraft] = useState<ResendDraft | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    new Set()
  );
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [detailsById, setDetailsById] = useState<Record<string, OrderDetails>>(
    {}
  );

  useEffect(() => {
    const handle = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const params = useMemo(() => {
    const searchParams = new URLSearchParams();
    if (searchQuery) searchParams.set("q", searchQuery);
    if (transactionFrom) searchParams.set("transaction_from", transactionFrom);
    if (transactionTo) searchParams.set("transaction_to", transactionTo);
    if (shippedFrom) searchParams.set("shipped_from", shippedFrom);
    if (shippedTo) searchParams.set("shipped_to", shippedTo);
    const query = searchParams.toString();
    return query ? `/api/orders?${query}` : "/api/orders";
  }, [searchQuery, transactionFrom, transactionTo, shippedFrom, shippedTo]);

  const allSelected =
    rows.length > 0 && rows.every((row) => selectedOrderIds.has(row.id));
  const someSelected = rows.some((row) => selectedOrderIds.has(row.id));
  const selectAllState = allSelected ? true : someSelected ? "mixed" : false;
  const hasSelection = selectedOrderIds.size > 0;
  const hasResendSelection = resendItemIds.size > 0;

  useEffect(() => {
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
        setRows(payload.items ?? []);
      } catch (err) {
        setError((err as Error).message);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params]);

  useEffect(() => {
    setSelectedOrderIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(rows.map((row) => row.id));
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  useEffect(() => {
    if (!resendOrderId) return;
    const stillVisible = rows.some((row) => row.id === resendOrderId);
    if (!stillVisible) {
      setResendOrderId(null);
      setResendItemIds(new Set());
    }
  }, [rows, resendOrderId]);

  const loadDetails = async (orderId: string) => {
    setDetailsById((prev) => ({
      ...prev,
      [orderId]: {
        order: prev[orderId]?.order ?? null,
        items: prev[orderId]?.items ?? [],
        tracking_numbers: prev[orderId]?.tracking_numbers ?? [],
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
          tracking_numbers: payload.tracking_numbers ?? [],
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
          loading: false,
          error: (err as Error).message,
        },
      }));
    }
  };

  const toggleExpanded = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
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
        salesChannel: details.order.sales_channel_name ?? "",
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
        tracking_numbers: payload.tracking_numbers ?? [],
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
      <div className={styles.header}>
        <Text size={700} weight="semibold">
          {t("orders.view.title")}
        </Text>
        <Text size={300} color="neutral">
          {t("orders.view.subtitle")}
        </Text>
      </div>

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
            <Button
              appearance="primary"
              disabled={!hasSelection || isExporting}
              onClick={async () => {
                const ids = Array.from(selectedOrderIds);
                if (ids.length === 0) return;
                setIsExporting(true);
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
              }}
            >
              {isExporting ? <Spinner size="tiny" /> : t("orders.export.button")}
            </Button>
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
      </Card>

      <Card className={styles.tableCard}>
        {error ? <Text className={styles.errorText}>{error}</Text> : null}
        <div className={styles.tableWrapper}>
          {loading ? (
            <div style={{ padding: "12px" }}>
              <Spinner size="tiny" />
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
                            return new Set(rows.map((row) => row.id));
                          }
                          return new Set();
                        });
                      }}
                    />
                  </TableHeaderCell>
                  {[
                    t("orders.columns.salesChannelId"),
                    t("orders.columns.orderNumber"),
                    t("orders.columns.salesChannel"),
                    t("orders.columns.customer"),
                    t("orders.columns.email"),
                    t("orders.columns.city"),
                    t("orders.columns.transactionDate"),
                    t("orders.columns.dateShipped"),
                  ].map((label) => (
                    <TableHeaderCell key={label} className={styles.stickyHeader}>
                      {label}
                    </TableHeaderCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>{t("orders.empty")}</TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, index) => {
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
                              onChange={(_, data) => {
                                setSelectedOrderIds((prev) => {
                                  const next = new Set(prev);
                                  if (data.checked === true) {
                                    next.add(row.id);
                                  } else {
                                    next.delete(row.id);
                                  }
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell>{row.sales_channel_id ?? ""}</TableCell>
                          <TableCell>{row.order_number ?? ""}</TableCell>
                          <TableCell>{row.sales_channel_name ?? ""}</TableCell>
                          <TableCell>{row.customer_name ?? ""}</TableCell>
                          <TableCell>{row.customer_email ?? ""}</TableCell>
                          <TableCell>{row.customer_city ?? ""}</TableCell>
                          <TableCell>
                            {formatDate(row.transaction_date)}
                          </TableCell>
                          <TableCell>{formatDate(row.date_shipped)}</TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow>
                            <TableCell colSpan={9} className={styles.detailsCell}>
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
                                                    styles.detailsColSku
                                                  )}
                                                >
                                                  {t("orders.details.columns.sku")}
                                                </TableHeaderCell>
                                                <TableHeaderCell className={styles.detailsTableHeader}>
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
                                                    <TableCell className={styles.detailsColSku}>
                                                      {item.sku ?? ""}
                                                    </TableCell>
                                                    <TableCell>
                                                      {renderItemTitle(item)}
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
                                                  <TableCell colSpan={7}>
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
                                          <div className={styles.detailsRow}>
                                            <Text className={styles.detailLabel}>
                                              {t("orders.details.customerName")}
                                            </Text>
                                            <Text className={styles.detailValue}>
                                              {details?.order?.customer_name ?? "-"}
                                            </Text>
                                          </div>
                                          <div className={styles.detailsRow}>
                                            <Text className={styles.detailLabel}>
                                              {t("orders.details.customerAddress")}
                                            </Text>
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
                                          </div>
                                          <div className={styles.detailsRow}>
                                            <Text className={styles.detailLabel}>
                                              {t("orders.details.customerEmail")}
                                            </Text>
                                            <Text className={styles.detailValue}>
                                              {(() => {
                                                const email =
                                                  details?.order?.customer_email ?? "";
                                                return email && isValidEmail(email) ? email : "-";
                                              })()}
                                            </Text>
                                          </div>
                                          <div className={styles.detailsRow}>
                                            <Text className={styles.detailLabel}>
                                              {t("orders.details.customerPhone")}
                                            </Text>
                                            <Text className={styles.detailValue}>
                                              {details?.order?.customer_phone ?? "-"}
                                            </Text>
                                          </div>
                                          <div className={styles.detailsRow}>
                                            <Text className={styles.detailLabel}>
                                              {t("orders.details.customerNote")}
                                            </Text>
                                            <Text className={styles.detailValue}>-</Text>
                                          </div>
                                          <div className={styles.detailsRow}>
                                            <Text className={styles.detailLabel}>
                                              {t("orders.details.tracking")}
                                            </Text>
                                            <Text className={styles.detailValue}>
                                              {details?.tracking_numbers?.length ? (
                                                <span className={styles.trackingInline}>
                                                  {details.tracking_numbers.map((tracking, idx) => (
                                                    <span key={tracking}>
                                                      {idx > 0 ? " : " : ""}
                                                      <a
                                                        className={styles.trackingLink}
                                                        href={`https://t.17track.net/en#nums=${encodeURIComponent(
                                                          tracking
                                                        )}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        aria-label={t("orders.details.trackExternal")}
                                                      >
                                                        {tracking}
                                                      </a>
                                                    </span>
                                                  ))}
                                                </span>
                                              ) : (
                                                "-"
                                              )}
                                            </Text>
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
                      <div>
                        <Text className={styles.detailLabel}>
                          {t("orders.resend.fields.customerName")}
                        </Text>
                        <Text className={styles.detailValue}>
                          {resendDraft.customerName || "-"}
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
                    <Field label={t("orders.resend.fields.comment")}>
                      <Textarea
                        value={resendDraft.comment}
                        onChange={(_, data) =>
                          updateResendField("comment", data.value)
                        }
                        placeholder={t("orders.resend.fields.commentPlaceholder")}
                        resize="vertical"
                      />
                    </Field>
                  </div>
                </>
              ) : (
                <Text>{t("orders.resend.empty")}</Text>
              )}
            </DialogContent>
            <DialogActions>
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
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
