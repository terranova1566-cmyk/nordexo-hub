"use client";

import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
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

type ResendRow = {
  id: string;
  sales_channel_id: string | null;
  order_number: string | null;
  sales_channel_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_city: string | null;
  customer_zip: string | null;
  transaction_date: string | null;
};

type ResendItem = {
  id: string;
  sku: string | null;
  title: string | null;
  quantity: number | null;
  sales_value_eur: number | null;
};

type ResendDetails = {
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
    resend_comment?: string | null;
  } | null;
  items: ResendItem[];
  loading: boolean;
  error?: string;
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
  detailsColSku: {
    width: "30%",
  },
  detailsColQty: {
    width: "15%",
  },
  detailsColSalesValue: {
    width: "15%",
  },
  errorText: {
    color: tokens.colorStatusDangerForeground1,
  },
  selectCell: {
    width: "36px",
    minWidth: "36px",
    textAlign: "center",
    paddingLeft: "8px",
    paddingRight: "8px",
  },
});

export default function OrdersResendPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [rows, setRows] = useState<ResendRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [transactionFrom, setTransactionFrom] = useState("");
  const [transactionTo, setTransactionTo] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    new Set()
  );
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [detailsById, setDetailsById] = useState<Record<string, ResendDetails>>(
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
    const query = searchParams.toString();
    return query ? `/api/orders/resend?${query}` : "/api/orders/resend";
  }, [searchQuery, transactionFrom, transactionTo]);

  const allSelected =
    rows.length > 0 && rows.every((row) => selectedOrderIds.has(row.id));
  const someSelected = rows.some((row) => selectedOrderIds.has(row.id));
  const selectAllState = allSelected ? true : someSelected ? "mixed" : false;
  const hasSelection = selectedOrderIds.size > 0;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(params);
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Unable to load resends.");
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

  const loadDetails = async (orderId: string) => {
    setDetailsById((prev) => ({
      ...prev,
      [orderId]: {
        order: prev[orderId]?.order ?? null,
        items: prev[orderId]?.items ?? [],
        loading: true,
        error: undefined,
      },
    }));
    try {
      const response = await fetch(`/api/orders/resend/${orderId}`);
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

  const renderItemTitle = (item: ResendItem) => {
    if (item.title) {
      return truncateTitle(item.title);
    }
    return item.sku ? "-" : "";
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text size={700} weight="semibold">
          {t("orders.resendView.title")}
        </Text>
        <Text size={300} color="neutral">
          {t("orders.resendView.subtitle")}
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
          <div className={styles.actionRow}>
            <Button
              appearance="primary"
              disabled={!hasSelection || isExporting}
              onClick={async () => {
                const ids = Array.from(selectedOrderIds);
                if (ids.length === 0) return;
                setIsExporting(true);
                try {
                  const response = await fetch("/api/orders/resend/export", {
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
                  link.download = "orders-resend-export.xlsx";
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
                  const response = await fetch("/api/orders/resend", {
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
                    <TableCell colSpan={8}>{t("orders.empty")}</TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, index) => {
                    const isExpanded = expandedOrders.has(row.id);
                    const details = detailsById[row.id];
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
                        </TableRow>
                        {isExpanded ? (
                          <TableRow>
                            <TableCell colSpan={8} className={styles.detailsCell}>
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
                                                  {t("orders.resend.columns.price")}
                                                </TableHeaderCell>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {details?.items?.length ? (
                                                details.items.map((item) => (
                                                  <TableRow key={item.id}>
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
                                                  </TableRow>
                                                ))
                                              ) : (
                                                <TableRow>
                                                  <TableCell colSpan={4}>
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
                                            <Text className={styles.detailValue}>
                                              {details?.order?.resend_comment ?? "-"}
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
    </div>
  );
}
