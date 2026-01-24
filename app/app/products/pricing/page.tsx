"use client";

import {
  Button,
  Card,
  Field,
  Input,
  MessageBar,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Dropdown,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Checkbox,
  mergeClasses,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatDateTime } from "@/lib/format";

type MarketRow = {
  market: string;
  currency: string;
  fx_rate_cny: string;
  weight_threshold_g: string;
  packing_fee: string;
  markup_percent: string;
  markup_fixed: string;
};

type ShippingRow = {
  id?: string;
  market: string;
  shipping_class: string;
  rate_low: string;
  rate_high: string;
  base_low: string;
  base_high: string;
  mult_low: string;
  mult_high: string;
};

type OverviewRow = {
  id: string;
  spu: string | null;
  sku: string | null;
  title: string | null;
  short_title: string | null;
  shipping_class: string | null;
  weight: number | null;
  purchase_price_cny: number | null;
  b2b_se: number | null;
  b2b_no: number | null;
  b2b_dk: number | null;
  b2b_fi: number | null;
  b2c_price: number | null;
  shopify_price: number | null;
  shopify_compare_at: number | null;
};

type PricingExportEntry = {
  id: string;
  file_name: string;
  row_count: number;
  created_at: string;
};

const MARKET_LABELS: Record<string, string> = {
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
};

const SHIPPING_CLASS_LABELS: Record<string, string> = {
  BAT: "Battery",
  LIQ: "Liquids",
  NOR: "Normal",
  PBA: "Pure Battery",
};

const formatMarketLabel = (market: string) => {
  const code = market?.toUpperCase?.() ?? "";
  const label = MARKET_LABELS[code];
  if (!label) return market;
  return `${label} (${code})`;
};

const formatShippingClassLabel = (shippingClass: string) => {
  const code = shippingClass?.toUpperCase?.() ?? "";
  const label = SHIPPING_CLASS_LABELS[code];
  if (!label) return shippingClass;
  return `${label} (${code})`;
};

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  card: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "12px",
  },
  sectionStack: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  table: {
    width: "100%",
    tableLayout: "fixed",
  },
  tableCell: {
    verticalAlign: "top",
  },
  tableHeader: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  resizableHeader: {
    resize: "horizontal",
    overflow: "hidden",
  },
  input: {
    minWidth: "120px",
  },
  sectionHelp: {
    color: tokens.colorNeutralForeground3,
  },
  actionsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
  },
  overviewHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  overviewControls: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "flex-end",
  },
  overviewEditInput: {
    maxWidth: "120px",
    width: "100%",
  },
  overviewSearchWrap: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
  },
  filterField: {
    minWidth: "200px",
  },
  rangeButton: {
    justifyContent: "flex-start",
    minWidth: "160px",
  },
  rangePopover: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "12px",
  },
  rangeActions: {
    display: "flex",
    justifyContent: "flex-end",
  },
  filterButtonText: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  pageSizeDropdown: {
    minWidth: "110px",
  },
  pageControls: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    alignSelf: "flex-end",
  },
  pageButton: {
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  overviewSearch: {
    width: "300px",
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  manualMissingRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "center",
  },
  scrollArea: {
    width: "100%",
    overflowX: "auto",
  },
  altSpuRow: {
    backgroundColor: tokens.colorNeutralBackground3,
  },
  skuCell: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  dimText: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  placeholder: {
    color: tokens.colorNeutralForeground3,
  },
});

const toString = (value: unknown) =>
  value === null || value === undefined ? "" : String(value);

export default function PricingPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const narrowColumnStyle = { width: "65px" };
  const spuColumnStyle = { width: "100px" };
  const skuColumnStyle = { width: "200px" };
  const titleColumnStyle = { width: "200px" };
  const classColumnStyle = { width: "65px" };
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [shipping, setShipping] = useState<ShippingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalcRunning, setRecalcRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [overviewRows, setOverviewRows] = useState<OverviewRow[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewQuery, setOverviewQuery] = useState("");
  const [overviewPage, setOverviewPage] = useState(1);
  const [overviewPageSize, setOverviewPageSize] = useState(50);
  const [overviewTotal, setOverviewTotal] = useState(0);
  const [overviewUpdatedFrom, setOverviewUpdatedFrom] = useState("");
  const [overviewUpdatedTo, setOverviewUpdatedTo] = useState("");
  const [overviewCreatedFrom, setOverviewCreatedFrom] = useState("");
  const [overviewCreatedTo, setOverviewCreatedTo] = useState("");
  const [overviewEditingCell, setOverviewEditingCell] = useState<{
    id: string;
    field: string;
  } | null>(null);
  const [overviewEditingValue, setOverviewEditingValue] = useState("");
  const [manualExporting, setManualExporting] = useState(false);
  const [manualImporting, setManualImporting] = useState(false);
  const [manualHistory, setManualHistory] = useState<PricingExportEntry[]>([]);
  const [manualMessage, setManualMessage] = useState<string | null>(null);
  const manualImportRef = useRef<HTMLInputElement | null>(null);
  const [manualSkuPrefix, setManualSkuPrefix] = useState("");
  const [manualCreatedFrom, setManualCreatedFrom] = useState("");
  const [manualCreatedTo, setManualCreatedTo] = useState("");
  const [manualMissingB2b, setManualMissingB2b] = useState(false);
  const [manualMissingB2c, setManualMissingB2c] = useState(false);
  const [manualMissingShopify, setManualMissingShopify] = useState(false);

  const fetchConfig = async (active = true) => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/pricing/config");
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json();
      if (!active) return;
      const marketRows = (payload.markets ?? []).map(
        (row: Record<string, unknown>) => ({
          market: toString(row.market),
          currency: toString(row.currency),
          fx_rate_cny: toString(row.fx_rate_cny),
          weight_threshold_g: toString(row.weight_threshold_g),
          packing_fee: toString(row.packing_fee),
          markup_percent: toString(row.markup_percent),
          markup_fixed: toString(row.markup_fixed),
        })
      );
      setMarkets(marketRows);
      setShipping(
        (payload.shippingClasses ?? []).map((row: Record<string, unknown>) => ({
          id: toString(row.id),
          market: toString(row.market),
          shipping_class: toString(row.shipping_class),
          rate_low: toString(row.rate_low),
          rate_high: toString(row.rate_high),
          base_low: toString(row.base_low),
          base_high: toString(row.base_high),
          mult_low: toString(row.mult_low),
          mult_high: toString(row.mult_high),
        }))
      );

    } catch (error) {
      if (!active) return;
      setMessage((error as Error).message || "Failed to load config.");
    } finally {
      if (active) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchConfig(active);
    return () => {
      active = false;
    };
  }, []);

  const fetchManualHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/pricing/manual/history");
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json();
      setManualHistory((payload.items ?? []) as PricingExportEntry[]);
    } catch (error) {
      setManualMessage((error as Error).message || "Failed to load export history.");
    }
  }, []);

  useEffect(() => {
    fetchManualHistory();
  }, [fetchManualHistory]);

  const handleManualExport = async () => {
    setManualExporting(true);
    setManualMessage(null);
    try {
      const response = await fetch("/api/pricing/manual/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuPrefix: manualSkuPrefix.trim(),
          createdFrom: manualCreatedFrom,
          createdTo: manualCreatedTo,
          missing: {
            b2b: manualMissingB2b,
            b2c: manualMissingB2c,
            shopify: manualMissingShopify,
          },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = (await response.json()) as PricingExportEntry;
      setManualHistory((prev) => [payload, ...prev]);
      setManualMessage(t("pricing.manualExportSuccess"));
    } catch (error) {
      setManualMessage((error as Error).message || "Export failed.");
    } finally {
      setManualExporting(false);
    }
  };

  const handleManualImport = async (file: File) => {
    setManualImporting(true);
    setManualMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/pricing/manual/import", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json();
      const summary = t("pricing.manualImportSummary", {
        updated: payload.updatedRows ?? 0,
        skipped: payload.skippedRows ?? 0,
      });
      setManualMessage(summary);
      fetchOverview(overviewQuery.trim(), true, {
        page: overviewPage,
        pageSize: overviewPageSize,
        updatedFrom: overviewUpdatedFrom,
        updatedTo: overviewUpdatedTo,
        createdFrom: overviewCreatedFrom,
        createdTo: overviewCreatedTo,
      });
    } catch (error) {
      setManualMessage((error as Error).message || "Import failed.");
    } finally {
      setManualImporting(false);
    }
  };

  const updateMarket = (
    market: string,
    field: keyof MarketRow,
    value: string
  ) => {
    setMarkets((prev) =>
      prev.map((row) => (row.market === market ? { ...row, [field]: value } : row))
    );
  };

  const updateShipping = (
    market: string,
    shippingClass: string,
    field: keyof ShippingRow,
    value: string
  ) => {
    setShipping((prev) =>
      prev.map((row) =>
        row.market === market && row.shipping_class === shippingClass
          ? { ...row, [field]: value }
          : row
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    setSummary(null);
    try {
      const response = await fetch("/api/pricing/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markets,
          shippingClasses: shipping,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setSummary(t("pricing.saved"));
    } catch (error) {
      setMessage((error as Error).message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleRecalc = async () => {
    setRecalcRunning(true);
    setMessage(null);
    setSummary(null);
    try {
      const response = await fetch("/api/pricing/recalculate", {
        method: "POST",
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json();
      setSummary(
        `${t("pricing.recalcSummary")} ${payload.processedVariants ?? 0} / ${
          payload.updatedRows ?? 0
        }`
      );
    } catch (error) {
      setMessage((error as Error).message || "Recalculate failed.");
    } finally {
      setRecalcRunning(false);
    }
  };

  const handleExportShipping = async () => {
    setMessage(null);
    try {
      const response = await fetch("/api/pricing/shipping/export");
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `b2b-shipping-classes-${Date.now()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setMessage((error as Error).message || "Export failed.");
    }
  };

  const handleImportShipping = async (file: File) => {
    setImporting(true);
    setMessage(null);
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append("workbook", file);
      const response = await fetch("/api/pricing/shipping/import", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(await response.text());
      await fetchConfig(true);
      setSummary(t("pricing.importSaved"));
    } catch (error) {
      setMessage((error as Error).message || "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const hasData = markets.length > 0;

  const actionLabel = useMemo(() => {
    if (recalcRunning) return t("pricing.recalculating");
    return t("pricing.recalculate");
  }, [recalcRunning, t]);

  const formatRangeSummary = (
    fromValue: string,
    toValue: string,
    emptyLabel: string
  ) => {
    if (!fromValue && !toValue) return emptyLabel;
    if (fromValue && toValue) return `${fromValue} → ${toValue}`;
    if (fromValue) return `${fromValue} →`;
    return `→ ${toValue}`;
  };

  const overviewUpdatedSummary = formatRangeSummary(
    overviewUpdatedFrom,
    overviewUpdatedTo,
    t("products.filters.rangeAll")
  );

  const overviewCreatedSummary = formatRangeSummary(
    overviewCreatedFrom,
    overviewCreatedTo,
    t("products.filters.rangeAll")
  );

  const formatDecimal = (value: number | null, decimals: number) => {
    if (value === null || value === undefined) return "";
    if (!Number.isFinite(value)) return "";
    return new Intl.NumberFormat("sv-SE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };
  const formatWeight = (value: number | null) => {
    const formatted = formatDecimal(value, 1);
    return formatted ? `${formatted} kg` : "";
  };
  const truncateTitle = (value: string | null, maxLength = 30) => {
    if (!value) return "-";
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...`;
  };

  const totalPages = Math.max(
    1,
    Math.ceil(overviewTotal / Math.max(overviewPageSize, 1))
  );

  const handleOverviewEdit = useCallback(
    async (variantId: string, field: string, value: string) => {
      setOverviewError(null);
      const numericFields = new Set([
        "weight",
        "purchase_price_cny",
        "b2c_price",
        "b2b_se",
        "b2b_no",
        "b2b_dk",
        "b2b_fi",
      ]);

      let nextValue: string | number | null = value;
      if (field === "shipping_class") {
        nextValue = value ? value.toUpperCase() : "";
      } else if (numericFields.has(field)) {
        const trimmed = value.trim();
        nextValue = trimmed === "" ? null : Number(trimmed);
        if (nextValue !== null && !Number.isFinite(nextValue)) {
          setOverviewError(t("pricing.overviewInvalidNumber"));
          return;
        }
      }

      const response = await fetch("/api/pricing/overview", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId,
          field,
          value: nextValue,
        }),
      });

      if (!response.ok) {
        setOverviewError(await response.text());
        return;
      }

      setOverviewRows((prev) =>
        prev.map((row) =>
          row.id === variantId
            ? {
                ...row,
                [field]:
                  field === "shipping_class"
                    ? (nextValue as string | null)
                    : (nextValue as number | null),
              }
            : row
        )
      );
    },
    [t]
  );

  const startOverviewEdit = (
    rowId: string,
    field: string,
    value: string | number | null | undefined
  ) => {
    setOverviewEditingCell({ id: rowId, field });
    setOverviewEditingValue(
      value === null || value === undefined ? "" : String(value)
    );
  };

  const commitOverviewEdit = async () => {
    if (!overviewEditingCell) return;
    const { id, field } = overviewEditingCell;
    await handleOverviewEdit(id, field, overviewEditingValue);
    setOverviewEditingCell(null);
    setOverviewEditingValue("");
  };

  const cancelOverviewEdit = () => {
    setOverviewEditingCell(null);
    setOverviewEditingValue("");
  };

  const renderOverviewEditableCell = (
    row: OverviewRow,
    field: string,
    value: string | number | null,
    options?: { numeric?: boolean; display?: string }
  ) => {
    const isEditing =
      overviewEditingCell?.id === row.id && overviewEditingCell?.field === field;
    const display =
      options?.display ?? (value === null || value === undefined ? "" : String(value));

    if (isEditing) {
      return (
        <Input
          value={overviewEditingValue}
          onChange={(_, data) => setOverviewEditingValue(data.value)}
          onBlur={() => commitOverviewEdit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitOverviewEdit();
            }
            if (event.key === "Escape") {
              cancelOverviewEdit();
            }
          }}
          type={options?.numeric ? "number" : "text"}
          size="small"
          className={styles.overviewEditInput}
          autoFocus
        />
      );
    }

    return (
      <Text
        size={200}
        title={display}
        onClick={() => startOverviewEdit(row.id, field, value)}
        style={{ cursor: "text" }}
      >
        {display || "-"}
      </Text>
    );
  };

  const fetchOverview = async (
    query: string,
    active = true,
    options?: {
      page?: number;
      pageSize?: number;
      updatedFrom?: string;
      updatedTo?: string;
      createdFrom?: string;
      createdTo?: string;
    }
  ) => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const page = options?.page ?? 1;
      const pageSize = options?.pageSize ?? overviewPageSize;
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (options?.updatedFrom) params.set("updatedFrom", options.updatedFrom);
      if (options?.updatedTo) params.set("updatedTo", options.updatedTo);
      if (options?.createdFrom) params.set("createdFrom", options.createdFrom);
      if (options?.createdTo) params.set("createdTo", options.createdTo);
      const response = await fetch(`/api/pricing/overview?${params.toString()}`);
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json();
      if (!active) return;
      setOverviewRows((payload.items ?? []) as OverviewRow[]);
      setOverviewTotal(payload.total ?? 0);
    } catch (error) {
      if (!active) return;
      setOverviewError((error as Error).message || "Failed to load overview.");
    } finally {
      if (active) setOverviewLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      fetchOverview(overviewQuery.trim(), active, {
        page: overviewPage,
        pageSize: overviewPageSize,
        updatedFrom: overviewUpdatedFrom,
        updatedTo: overviewUpdatedTo,
        createdFrom: overviewCreatedFrom,
        createdTo: overviewCreatedTo,
      });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    overviewQuery,
    overviewPage,
    overviewPageSize,
    overviewUpdatedFrom,
    overviewUpdatedTo,
    overviewCreatedFrom,
    overviewCreatedTo,
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.sectionStack}>
          <Text size={600} weight="semibold">
            {t("pricing.title")}
          </Text>
          <Text size={200} className={styles.sectionHelp}>
            {t("pricing.subtitle")}
          </Text>
        </div>
        <div className={styles.actionsRow}>
          <Button appearance="primary" onClick={handleSave} disabled={saving || loading}>
            {t("pricing.save")}
          </Button>
          <Button
            appearance="outline"
            onClick={handleRecalc}
            disabled={recalcRunning || loading || !hasData}
          >
            {actionLabel}
          </Button>
        </div>
      </div>

      {message ? <MessageBar intent="error">{message}</MessageBar> : null}
      {summary ? <MessageBar intent="success">{summary}</MessageBar> : null}

      <Card className={styles.card}>
        <div className={styles.sectionStack}>
          <Text size={400} weight="semibold">
            {t("pricing.exchangeRates")}
          </Text>
          <Text size={200} className={styles.sectionHelp}>
            {t("pricing.exchangeRatesHelp")}
          </Text>
        </div>
        <Table size="small" className={styles.table}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.market")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.currency")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.fxRate")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.weightThreshold")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.packingFee")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.markupPercent")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.markupFixed")}
              </TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {markets.map((row) => (
              <TableRow key={row.market}>
                <TableCell className={styles.tableCell}>
                  {formatMarketLabel(row.market)}
                </TableCell>
                <TableCell className={styles.tableCell}>{row.currency}</TableCell>
                <TableCell className={styles.tableCell}>
                  <Input
                    type="number"
                    className={styles.input}
                    value={row.fx_rate_cny}
                    onChange={(_, data) =>
                      updateMarket(row.market, "fx_rate_cny", data.value)
                    }
                  />
                </TableCell>
                <TableCell className={styles.tableCell}>
                  <Input
                    type="number"
                    className={styles.input}
                    value={row.weight_threshold_g}
                    onChange={(_, data) =>
                      updateMarket(row.market, "weight_threshold_g", data.value)
                    }
                  />
                </TableCell>
                <TableCell className={styles.tableCell}>
                  <Input
                    type="number"
                    className={styles.input}
                    value={row.packing_fee}
                    onChange={(_, data) =>
                      updateMarket(row.market, "packing_fee", data.value)
                    }
                  />
                </TableCell>
                <TableCell className={styles.tableCell}>
                  <Input
                    type="number"
                    className={styles.input}
                    value={row.markup_percent}
                    onChange={(_, data) =>
                      updateMarket(row.market, "markup_percent", data.value)
                    }
                  />
                </TableCell>
                <TableCell className={styles.tableCell}>
                  <Input
                    type="number"
                    className={styles.input}
                    value={row.markup_fixed}
                    onChange={(_, data) =>
                      updateMarket(row.market, "markup_fixed", data.value)
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div className={styles.sectionStack}>
            <Text size={400} weight="semibold">
              {t("pricing.shippingRates")}
            </Text>
            <Text size={200} className={styles.sectionHelp}>
              {t("pricing.shippingRatesHelp")}
            </Text>
          </div>
          <div className={styles.actionsRow}>
            <Button appearance="outline" onClick={handleExportShipping}>
              {t("pricing.export")}
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                handleImportShipping(file);
                event.currentTarget.value = "";
              }}
            />
            <Button
              appearance="outline"
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? t("pricing.importing") : t("pricing.import")}
            </Button>
          </div>
        </div>
        <Table size="small" className={styles.table}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.market")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.shippingClass")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.rateLow")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.rateHigh")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.baseLow")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.baseHigh")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.multLow")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.multHigh")}
              </TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipping.map((row) => (
              <TableRow key={`${row.market}-${row.shipping_class}`}>
                <TableCell className={styles.tableCell}>
                  {formatMarketLabel(row.market)}
                </TableCell>
                <TableCell className={styles.tableCell}>
                  {formatShippingClassLabel(row.shipping_class)}
                </TableCell>
                <TableCell className={styles.tableCell}>
                  <Input
                    type="number"
                    className={styles.input}
                    value={row.rate_low}
                    onChange={(_, data) =>
                      updateShipping(
                        row.market,
                        row.shipping_class,
                        "rate_low",
                        data.value
                      )
                    }
                  />
                </TableCell>
                <TableCell className={styles.tableCell}>
                  <Input
                    type="number"
                    className={styles.input}
                    value={row.rate_high}
                    onChange={(_, data) =>
                      updateShipping(
                        row.market,
                        row.shipping_class,
                        "rate_high",
                        data.value
                      )
                    }
                  />
                </TableCell>
                <TableCell className={styles.tableCell}>
                  <Input
                    type="number"
                    className={styles.input}
                    value={row.base_low}
                    onChange={(_, data) =>
                      updateShipping(
                        row.market,
                        row.shipping_class,
                        "base_low",
                        data.value
                      )
                    }
                  />
                </TableCell>
                <TableCell className={styles.tableCell}>
                  <Input
                    type="number"
                    className={styles.input}
                    value={row.base_high}
                    onChange={(_, data) =>
                      updateShipping(
                        row.market,
                        row.shipping_class,
                        "base_high",
                        data.value
                      )
                    }
                  />
                </TableCell>
                <TableCell className={styles.tableCell}>
                  <Input
                    type="number"
                    className={styles.input}
                    value={row.mult_low}
                    onChange={(_, data) =>
                      updateShipping(
                        row.market,
                        row.shipping_class,
                        "mult_low",
                        data.value
                      )
                    }
                  />
                </TableCell>
                <TableCell className={styles.tableCell}>
                  <Input
                    type="number"
                    className={styles.input}
                    value={row.mult_high}
                    onChange={(_, data) =>
                      updateShipping(
                        row.market,
                        row.shipping_class,
                        "mult_high",
                        data.value
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <div className={styles.sectionStack}>
            <Text size={400} weight="semibold">
              {t("pricing.manualTitle")}
            </Text>
            <Text size={200} className={styles.placeholder}>
              {t("pricing.manualBody")}
            </Text>
          </div>
          <div className={styles.actionsRow}>
            <Button appearance="outline" onClick={handleManualExport}>
              {manualExporting ? t("pricing.manualExporting") : t("pricing.manualExport")}
            </Button>
            <input
              ref={manualImportRef}
              type="file"
              accept=".xlsx"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                handleManualImport(file);
                event.currentTarget.value = "";
              }}
            />
            <Button
              appearance="outline"
              onClick={() => manualImportRef.current?.click()}
              disabled={manualImporting}
            >
              {manualImporting ? t("pricing.manualImporting") : t("pricing.manualImport")}
            </Button>
          </div>
        </div>
        <div className={styles.overviewControls}>
          <Field label={<span className={styles.dimText}>{t("pricing.manualSkuPrefix")}</span>}>
            <Input
              value={manualSkuPrefix}
              placeholder={t("pricing.manualSkuPrefixPlaceholder")}
              onChange={(_, data) => setManualSkuPrefix(data.value.toUpperCase())}
            />
          </Field>
          <Field label={<span className={styles.dimText}>{t("pricing.manualCreatedFrom")}</span>}>
            <Input
              type="date"
              value={manualCreatedFrom}
              onChange={(_, data) => setManualCreatedFrom(data.value)}
            />
          </Field>
          <Field label={<span className={styles.dimText}>{t("pricing.manualCreatedTo")}</span>}>
            <Input
              type="date"
              value={manualCreatedTo}
              onChange={(_, data) => setManualCreatedTo(data.value)}
            />
          </Field>
          <Field label={<span className={styles.dimText}>{t("pricing.manualMissingTitle")}</span>}>
            <div className={styles.manualMissingRow}>
              <Checkbox
                label={t("pricing.manualMissingB2b")}
                checked={manualMissingB2b}
                onChange={(_, data) => setManualMissingB2b(Boolean(data.checked))}
              />
              <Checkbox
                label={t("pricing.manualMissingB2c")}
                checked={manualMissingB2c}
                onChange={(_, data) => setManualMissingB2c(Boolean(data.checked))}
              />
              <Checkbox
                label={t("pricing.manualMissingShopify")}
                checked={manualMissingShopify}
                onChange={(_, data) => setManualMissingShopify(Boolean(data.checked))}
              />
            </div>
          </Field>
        </div>
        {manualMessage ? <MessageBar>{manualMessage}</MessageBar> : null}
        <Table size="small" className={styles.table}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.manualExportDate")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.manualExportFile")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.tableHeader}>
                {t("pricing.manualExportRows")}
              </TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {manualHistory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className={styles.tableCell}>
                  <Text className={styles.placeholder}>
                    {t("pricing.manualExportNone")}
                  </Text>
                </TableCell>
              </TableRow>
            ) : (
              manualHistory.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className={styles.tableCell}>
                    {formatDateTime(entry.created_at)}
                  </TableCell>
                  <TableCell className={styles.tableCell}>
                    <Button
                      appearance="transparent"
                      as="a"
                      href={`/api/pricing/manual/download?id=${entry.id}`}
                    >
                      {entry.file_name}
                    </Button>
                  </TableCell>
                  <TableCell className={styles.tableCell}>
                    {entry.row_count ?? 0}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className={styles.card}>
        <div className={styles.overviewHeader}>
          <div className={styles.sectionStack}>
            <Text size={400} weight="semibold">
              {t("pricing.overviewTitle")}
            </Text>
            <Text size={200} className={styles.placeholder}>
              {t("pricing.overviewBody")}
            </Text>
          </div>
          <div className={styles.overviewControls}>
            <div className={styles.overviewSearchWrap}>
              <Input
                className={styles.overviewSearch}
                placeholder={t("pricing.overviewSearchPlaceholder")}
                value={overviewQuery}
                onChange={(_, data) => {
                  setOverviewQuery(data.value);
                  setOverviewPage(1);
                }}
              />
            </div>
            <Field
              label={<span className={styles.dimText}>{t("products.filters.updatedRange")}</span>}
              className={styles.filterField}
            >
              <Popover positioning={{ position: "below", align: "start" }}>
                <PopoverTrigger disableButtonEnhancement>
                  <Button appearance="outline" className={styles.rangeButton}>
                    <span className={styles.filterButtonText}>
                      {overviewUpdatedSummary}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverSurface className={styles.rangePopover}>
                  <Field label={t("products.filters.rangeFrom")}>
                    <Input
                      type="date"
                      value={overviewUpdatedFrom}
                      onChange={(_, data) => {
                        setOverviewUpdatedFrom(data.value);
                        setOverviewPage(1);
                      }}
                    />
                  </Field>
                  <Field label={t("products.filters.rangeTo")}>
                    <Input
                      type="date"
                      value={overviewUpdatedTo}
                      onChange={(_, data) => {
                        setOverviewUpdatedTo(data.value);
                        setOverviewPage(1);
                      }}
                    />
                  </Field>
                  <div className={styles.rangeActions}>
                    <Button
                      appearance="subtle"
                      onClick={() => {
                        setOverviewUpdatedFrom("");
                        setOverviewUpdatedTo("");
                        setOverviewPage(1);
                      }}
                    >
                      {t("common.clear")}
                    </Button>
                  </div>
                </PopoverSurface>
              </Popover>
            </Field>
            <Field
              label={<span className={styles.dimText}>{t("products.filters.addedRange")}</span>}
              className={styles.filterField}
            >
              <Popover positioning={{ position: "below", align: "start" }}>
                <PopoverTrigger disableButtonEnhancement>
                  <Button appearance="outline" className={styles.rangeButton}>
                    <span className={styles.filterButtonText}>
                      {overviewCreatedSummary}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverSurface className={styles.rangePopover}>
                  <Field label={t("products.filters.rangeFrom")}>
                    <Input
                      type="date"
                      value={overviewCreatedFrom}
                      onChange={(_, data) => {
                        setOverviewCreatedFrom(data.value);
                        setOverviewPage(1);
                      }}
                    />
                  </Field>
                  <Field label={t("products.filters.rangeTo")}>
                    <Input
                      type="date"
                      value={overviewCreatedTo}
                      onChange={(_, data) => {
                        setOverviewCreatedTo(data.value);
                        setOverviewPage(1);
                      }}
                    />
                  </Field>
                  <div className={styles.rangeActions}>
                    <Button
                      appearance="subtle"
                      onClick={() => {
                        setOverviewCreatedFrom("");
                        setOverviewCreatedTo("");
                        setOverviewPage(1);
                      }}
                    >
                      {t("common.clear")}
                    </Button>
                  </div>
                </PopoverSurface>
              </Popover>
            </Field>
            <Field
              label={<span className={styles.dimText}>{t("pricing.overviewPageSize")}</span>}
            >
              <Dropdown
                value={String(overviewPageSize)}
                selectedOptions={[String(overviewPageSize)]}
                className={styles.pageSizeDropdown}
                onOptionSelect={(_, data) => {
                  const next = Number(data.optionValue);
                  if (!Number.isNaN(next)) {
                    setOverviewPageSize(next);
                    setOverviewPage(1);
                  }
                }}
              >
                {[25, 50, 100, 200].map((size) => (
                  <Option key={size} value={String(size)} text={String(size)}>
                    {size}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <div className={styles.pageControls}>
              <Button
                appearance="outline"
                className={styles.pageButton}
                disabled={overviewPage <= 1}
                onClick={() => setOverviewPage((prev) => Math.max(1, prev - 1))}
              >
                {t("common.previous")}
              </Button>
              <Text className={styles.dimText}>
                {t("pricing.overviewPageLabel", {
                  page: overviewPage,
                  total: totalPages,
                })}
              </Text>
              <Button
                appearance="outline"
                className={styles.pageButton}
                disabled={overviewPage >= totalPages}
                onClick={() =>
                  setOverviewPage((prev) => Math.min(totalPages, prev + 1))
                }
              >
                {t("common.next")}
              </Button>
            </div>
          </div>
        </div>
        {overviewError ? (
          <MessageBar intent="error">{overviewError}</MessageBar>
        ) : null}
        <div className={styles.scrollArea}>
          <Table size="small" className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell
                  className={mergeClasses(styles.tableHeader, styles.resizableHeader)}
                  style={spuColumnStyle}
                >
                  {t("pricing.overviewColSpu")}
                </TableHeaderCell>
                <TableHeaderCell
                  className={mergeClasses(styles.tableHeader, styles.resizableHeader)}
                  style={skuColumnStyle}
                >
                  {t("pricing.overviewColSku")}
                </TableHeaderCell>
                <TableHeaderCell
                  className={mergeClasses(styles.tableHeader, styles.resizableHeader)}
                  style={titleColumnStyle}
                >
                  {t("pricing.overviewColTitle")}
                </TableHeaderCell>
                <TableHeaderCell
                  className={mergeClasses(styles.tableHeader, styles.resizableHeader)}
                  style={classColumnStyle}
                >
                  {t("pricing.overviewColShippingClass")}
                </TableHeaderCell>
                <TableHeaderCell
                  className={mergeClasses(styles.tableHeader, styles.resizableHeader)}
                  style={narrowColumnStyle}
                >
                  {t("pricing.overviewColWeight")}
                </TableHeaderCell>
                <TableHeaderCell
                  className={mergeClasses(styles.tableHeader, styles.resizableHeader)}
                  style={narrowColumnStyle}
                >
                  {t("pricing.overviewColPurchasePrice")}
                </TableHeaderCell>
                <TableHeaderCell
                  className={mergeClasses(styles.tableHeader, styles.resizableHeader)}
                  style={narrowColumnStyle}
                >
                  {t("pricing.overviewColB2BSe")}
                </TableHeaderCell>
                <TableHeaderCell
                  className={mergeClasses(styles.tableHeader, styles.resizableHeader)}
                  style={narrowColumnStyle}
                >
                  {t("pricing.overviewColB2BNo")}
                </TableHeaderCell>
                <TableHeaderCell
                  className={mergeClasses(styles.tableHeader, styles.resizableHeader)}
                  style={narrowColumnStyle}
                >
                  {t("pricing.overviewColB2BDk")}
                </TableHeaderCell>
                <TableHeaderCell
                  className={mergeClasses(styles.tableHeader, styles.resizableHeader)}
                  style={narrowColumnStyle}
                >
                  {t("pricing.overviewColB2BFi")}
                </TableHeaderCell>
                <TableHeaderCell
                  className={mergeClasses(styles.tableHeader, styles.resizableHeader)}
                  style={narrowColumnStyle}
                >
                  {t("pricing.overviewColB2C")}
                </TableHeaderCell>
                <TableHeaderCell
                  className={mergeClasses(styles.tableHeader, styles.resizableHeader)}
                >
                  {t("pricing.overviewColShopifyTingeloPrice")}
                </TableHeaderCell>
                <TableHeaderCell
                  className={mergeClasses(styles.tableHeader, styles.resizableHeader)}
                >
                  {t("pricing.overviewColShopifyTingeloCompare")}
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                let lastSpu: string | null = null;
                let useAlt = false;
                return overviewRows.map((row) => {
                  const currentSpu = row.spu ?? "";
                  if (currentSpu !== lastSpu) {
                    if (lastSpu !== null) {
                      useAlt = !useAlt;
                    }
                    lastSpu = currentSpu;
                  }
                  const primaryTitle = row.short_title ?? row.title ?? "-";
                  return (
                    <TableRow
                      key={row.id}
                      className={mergeClasses(useAlt ? styles.altSpuRow : undefined)}
                    >
                      <TableCell className={styles.tableCell} style={spuColumnStyle}>
                        {row.spu ?? "-"}
                      </TableCell>
                      <TableCell className={styles.tableCell} style={skuColumnStyle}>
                        {row.sku ?? "-"}
                      </TableCell>
                      <TableCell className={styles.tableCell} style={titleColumnStyle}>
                        <Text weight="regular">
                          {truncateTitle(primaryTitle, 30)}
                        </Text>
                      </TableCell>
                      <TableCell className={styles.tableCell} style={classColumnStyle}>
                        {renderOverviewEditableCell(
                          row,
                          "shipping_class",
                          row.shipping_class,
                          {
                            display: row.shipping_class
                              ? row.shipping_class.toUpperCase()
                              : "",
                          }
                        )}
                      </TableCell>
                      <TableCell className={styles.tableCell} style={narrowColumnStyle}>
                        {renderOverviewEditableCell(row, "weight", row.weight, {
                          numeric: true,
                          display: formatWeight(row.weight),
                        })}
                      </TableCell>
                      <TableCell className={styles.tableCell} style={narrowColumnStyle}>
                        {renderOverviewEditableCell(
                          row,
                          "purchase_price_cny",
                          row.purchase_price_cny,
                          {
                            numeric: true,
                            display: formatDecimal(row.purchase_price_cny, 1),
                          }
                        )}
                      </TableCell>
                      <TableCell className={styles.tableCell} style={narrowColumnStyle}>
                        {renderOverviewEditableCell(row, "b2b_se", row.b2b_se, {
                          numeric: true,
                          display: formatDecimal(row.b2b_se, 0),
                        })}
                      </TableCell>
                      <TableCell className={styles.tableCell} style={narrowColumnStyle}>
                        {renderOverviewEditableCell(row, "b2b_no", row.b2b_no, {
                          numeric: true,
                          display: formatDecimal(row.b2b_no, 0),
                        })}
                      </TableCell>
                      <TableCell className={styles.tableCell} style={narrowColumnStyle}>
                        {renderOverviewEditableCell(row, "b2b_dk", row.b2b_dk, {
                          numeric: true,
                          display: formatDecimal(row.b2b_dk, 0),
                        })}
                      </TableCell>
                      <TableCell className={styles.tableCell} style={narrowColumnStyle}>
                        {renderOverviewEditableCell(row, "b2b_fi", row.b2b_fi, {
                          numeric: true,
                          display: formatDecimal(row.b2b_fi, 2),
                        })}
                      </TableCell>
                      <TableCell className={styles.tableCell} style={narrowColumnStyle}>
                        {renderOverviewEditableCell(row, "b2c_price", row.b2c_price, {
                          numeric: true,
                          display: formatDecimal(row.b2c_price, 0),
                        })}
                      </TableCell>
                      <TableCell className={styles.tableCell}>
                        <Text size={200}>{formatDecimal(row.shopify_price, 0)}</Text>
                      </TableCell>
                      <TableCell className={styles.tableCell}>
                        <Text size={200}>
                          {formatDecimal(row.shopify_compare_at, 0)}
                        </Text>
                      </TableCell>
                    </TableRow>
                  );
                });
              })()}
            </TableBody>
          </Table>
        </div>
        {overviewRows.length === 0 && !overviewLoading ? (
          <Text className={styles.placeholder}>{t("pricing.overviewEmpty")}</Text>
        ) : null}
      </Card>
    </div>
  );
}
