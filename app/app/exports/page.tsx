"use client";

import {
  Badge,
  Card,
  MessageBar,
  Button,
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
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/components/i18n-provider";

  const useStyles = makeStyles({
    card: {
      padding: "16px",
      borderRadius: "var(--app-radius)",
    },
    metaText: {
      color: tokens.colorNeutralForeground3,
    },
    downloadButton: {
      whiteSpace: "nowrap",
      fontSize: tokens.fontSizeBase300,
    },
    deleteButton: {
      whiteSpace: "nowrap",
      fontSize: tokens.fontSizeBase300,
      color: tokens.colorNeutralForeground1,
      backgroundColor: tokens.colorNeutralBackground2,
    },
    table: {
      tableLayout: "auto",
      ["& .fui-TableCell, & .fui-TableHeaderCell"]: {
        fontSize: tokens.fontSizeBase300,
        lineHeight: tokens.lineHeightBase300,
      },
    },
    exportIdCell: {
      whiteSpace: "nowrap",
      width: "max-content",
      maxWidth: "max-content",
      fontSize: tokens.fontSizeBase400,
      lineHeight: tokens.lineHeightBase400,
    },
    listNameCell: {
      minWidth: "360px",
    },
    slimCell: {
      width: "56px",
      minWidth: "56px",
      maxWidth: "56px",
      whiteSpace: "nowrap",
    },
  });

type ExportRow = {
  id: string;
  created_at: string;
  status: string;
  file_path: string | null;
  meta: {
    export_name?: string;
    spu_count?: number;
    sku_count?: number;
    product_count?: number;
    row_count?: number;
  } | null;
};

export default function ExportsPage() {
  const styles = useStyles();
  const supabase = useMemo(() => createClient(), []);
  const { t } = useI18n();
  const [items, setItems] = useState<ExportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("partner_exports")
        .select("id, created_at, status, file_path, meta")
        .order("created_at", { ascending: false })
        .limit(20)
        .abortSignal(controller.signal);

      if (error) {
        setError(error.message);
      } else {
        setItems((data ?? []) as ExportRow[]);
      }

      setIsLoading(false);
    };

    load();

    return () => controller.abort();
  }, [supabase]);

  const statusAppearance = (status: string) => {
    switch (status) {
      case "generated":
        return "filled" as const;
      case "failed":
        return "outline" as const;
      default:
        return "tint" as const;
    }
  };
  const statusLabel = (status: string) => {
    switch (status) {
      case "generated":
        return t("exports.status.generated");
      case "failed":
        return t("exports.status.failed");
      case "pending":
        return t("exports.status.pending");
      default:
        return status;
    }
  };

  const parseCount = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  };

  const getCount = (
    meta: ExportRow["meta"],
    keys: Array<keyof NonNullable<ExportRow["meta"]>>
  ) => {
    for (const key of keys) {
      const parsed = parseCount(meta?.[key]);
      if (parsed !== null) {
        return parsed;
      }
    }
    return null;
  };

  const handleDelete = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    setError(null);
    try {
      const response = await fetch(`/api/exports/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || t("exports.error.delete"));
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <Card className={styles.card}>
      <Text weight="semibold">{t("exports.title")}</Text>
      <Text size={200} className={styles.metaText}>
        {t("exports.subtitle")}
      </Text>

      {error ? <MessageBar intent="error">{error}</MessageBar> : null}
      {isLoading ? (
        <Spinner label={t("exports.loading")} />
      ) : items.length === 0 ? (
        <Text>{t("exports.empty")}</Text>
      ) : (
        <Table size="small" className={styles.table}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell className={styles.listNameCell}>
                {t("exports.table.listName")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.exportIdCell}>
                {t("exports.table.exportId")}
              </TableHeaderCell>
              <TableHeaderCell>{t("exports.table.created")}</TableHeaderCell>
              <TableHeaderCell className={styles.slimCell}>
                {t("exports.table.spus")}
              </TableHeaderCell>
              <TableHeaderCell className={styles.slimCell}>
                {t("exports.table.skus")}
              </TableHeaderCell>
              <TableHeaderCell>{t("exports.table.status")}</TableHeaderCell>
              <TableHeaderCell>{t("exports.table.file")}</TableHeaderCell>
              <TableHeaderCell>{t("exports.table.actions")}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const exportName = item.meta?.export_name ?? t("exports.unnamed");
              const spuCount = getCount(item.meta, ["spu_count", "product_count"]);
              const skuCount = getCount(item.meta, ["sku_count", "row_count"]);
              const isDeleting = deletingIds.has(item.id);

              return (
                <TableRow key={item.id}>
                  <TableCell className={styles.listNameCell}>
                    {exportName}
                  </TableCell>
                  <TableCell className={styles.exportIdCell}>{item.id}</TableCell>
                  <TableCell>{formatDateTime(item.created_at)}</TableCell>
                  <TableCell className={styles.slimCell}>
                    {spuCount ?? t("common.notAvailable")}
                  </TableCell>
                  <TableCell className={styles.slimCell}>
                    {skuCount ?? t("common.notAvailable")}
                  </TableCell>
                  <TableCell>
                    <Badge appearance={statusAppearance(item.status)}>
                      {statusLabel(item.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.file_path ? (
                      <Button
                        appearance="outline"
                        size="small"
                        className={styles.downloadButton}
                        disabled={isDeleting}
                        onClick={() => {
                          window.location.href = `/api/exports/${item.id}/download`;
                        }}
                      >
                        {t("exports.download")}
                      </Button>
                    ) : (
                      <Text size={200} className={styles.metaText}>
                        {t("common.notAvailable")}
                      </Text>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      appearance="outline"
                      size="small"
                      className={styles.deleteButton}
                      disabled={isDeleting}
                      onClick={() => handleDelete(item.id)}
                    >
                      {isDeleting ? t("exports.deleting") : t("exports.delete")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
