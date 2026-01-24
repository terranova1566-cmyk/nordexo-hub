"use client";

import {
  Button,
  Card,
  Field,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatDateTime } from "@/lib/format";

type ImportHistory = {
  id: string;
  file_name: string;
  row_count: number;
  created_at: string;
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
  card: {
    padding: "16px",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  topRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    "@media (max-width: 960px)": {
      gridTemplateColumns: "1fr",
    },
  },
  fileInput: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "8px",
    padding: "6px 8px",
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: "240px",
  },
  errorText: {
    color: tokens.colorStatusDangerForeground1,
  },
  instructions: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
  },
  tableWrapper: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "auto",
  },
  stickyHeader: {
    position: "sticky",
    top: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    zIndex: 1,
  },
  tableRowAlt: {
    backgroundColor: tokens.colorNeutralBackground2,
  },
});

export default function OrdersImportPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/orders/imports/history");
      if (!response.ok) throw new Error();
      const payload = await response.json();
      setHistory(payload.items ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleImport = async () => {
    if (!file) return;
    setIsUploading(true);
    setMessage(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/orders/import", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Import failed.");
      }
      const payload = await response.json();
      setMessage(
        t("orders.import.done", {
          orders: payload.ordersCount ?? 0,
          items: payload.itemsCount ?? 0,
          tracking: payload.trackingCount ?? 0,
        })
      );
      fetchHistory();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text size={700} weight="semibold">
          {t("orders.import.title")}
        </Text>
        <Text size={300} color="neutral">
          {t("orders.import.subtitle")}
        </Text>
      </div>

      <div className={styles.topRow}>
        <Card className={styles.card}>
          <Field label={t("orders.import.uploadLabel")}>
            <input
              type="file"
              accept=".xlsx"
              className={styles.fileInput}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          <Button
            appearance="primary"
            onClick={handleImport}
            disabled={!file || isUploading}
          >
            {isUploading ? <Spinner size="tiny" /> : t("orders.import.button")}
          </Button>
          {message ? <Text>{message}</Text> : null}
          {error ? <Text className={styles.errorText}>{error}</Text> : null}
        </Card>

        <Card className={styles.card}>
          <Text weight="semibold">{t("orders.import.instructionsTitle")}</Text>
          <Text className={styles.instructions}>
            {t("orders.import.instructions1")}
          </Text>
          <Text className={styles.instructions}>
            {t("orders.import.instructions2")}
          </Text>
          <Text className={styles.instructions}>
            {t("orders.import.instructions3")}
          </Text>
        </Card>
      </div>

      <Card className={styles.card}>
        <Text weight="semibold">{t("orders.import.historyTitle")}</Text>
        <div className={styles.tableWrapper}>
          {historyLoading ? (
            <div style={{ padding: "12px" }}>
              <Spinner size="tiny" />
            </div>
          ) : (
            <Table size="small">
              <TableHeader>
                <TableRow>
                  {[
                    t("orders.import.history.columns.date"),
                    t("orders.import.history.columns.file"),
                    t("orders.import.history.columns.rows"),
                  ].map((label) => (
                    <TableHeaderCell key={label} className={styles.stickyHeader}>
                      {label}
                    </TableHeaderCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      {t("orders.import.history.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((entry, index) => (
                    <TableRow
                      key={entry.id}
                      className={index % 2 === 1 ? styles.tableRowAlt : undefined}
                    >
                      <TableCell>{formatDateTime(entry.created_at)}</TableCell>
                      <TableCell>
                        <Button
                          appearance="subtle"
                          onClick={() =>
                            window.open(
                              `/api/orders/imports/download?id=${entry.id}`,
                              "_blank"
                            )
                          }
                        >
                          {entry.file_name}
                        </Button>
                      </TableCell>
                      <TableCell>{entry.row_count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
