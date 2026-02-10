"use client";

import {
  Button,
  Card,
  Field,
  Input,
  MessageBar,
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
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

type BatchRow = {
  id: string;
  name: string;
  created_at: string;
  created_by: string | null;
  source_filename: string | null;
  source_sha256: string | null;
  product_count: number;
};

const useStyles = makeStyles({
  layout: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  card: {
    padding: "14px 16px 16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "flex-end",
  },
  grow: {
    flex: 1,
    minWidth: "280px",
  },
  fileInput: {
    display: "block",
    width: "100%",
    padding: "8px 10px",
    borderRadius: "8px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase200,
  },
  tableCard: {
    padding: "12px 12px 16px",
  },
  table: {
    width: "100%",
  },
  empty: {
    padding: "12px",
    color: tokens.colorNeutralForeground3,
  },
});

async function readJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function BatchImageEditorPage() {
  const styles = useStyles();
  const { t } = useI18n();

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{
    intent: "success" | "error";
    text: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);

  const loadBatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/batch-image-editor/batches", {
        cache: "no-store",
      });
      const json = await readJsonSafe(res);
      if (!res.ok) {
        throw new Error(json?.error || `Request failed (${res.status}).`);
      }
      setBatches(Array.isArray(json?.batches) ? json.batches : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load batches.");
      setBatches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBatches();
  }, []);

  const canUpload = useMemo(() => {
    return !uploading && hasFile;
  }, [uploading, hasFile]);

  const onUpload = async () => {
    const file = fileRef.current?.files?.[0] ?? null;
    if (!file) return;

    setUploading(true);
    setUploadMessage(null);
    try {
      const form = new FormData();
      form.set("name", batchName.trim());
      form.set("file", file);

      const res = await fetch("/api/batch-image-editor/batches", {
        method: "POST",
        body: form,
      });
      const json = await readJsonSafe(res);
      if (!res.ok) {
        throw new Error(json?.error || `Upload failed (${res.status}).`);
      }

      const inserted = Number(json?.inserted_products ?? 0);
      const unresolved = Number(json?.unresolved_count ?? 0);
      const summary =
        unresolved > 0
          ? `Created batch with ${inserted} product(s). Unresolved lines: ${unresolved}.`
          : `Created batch with ${inserted} product(s).`;

      setUploadMessage({ intent: "success", text: summary });
      setBatchName("");
      if (fileRef.current) fileRef.current.value = "";
      setHasFile(false);
      await loadBatches();
    } catch (err: any) {
      setUploadMessage({
        intent: "error",
        text: err?.message || "Failed to upload batch.",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <Text size={700} weight="semibold">
          {t("batchImageEditor.title")}
        </Text>
        <Text className={styles.subtitle}>{t("batchImageEditor.subtitle")}</Text>
      </div>

      {uploadMessage ? (
        <MessageBar intent={uploadMessage.intent}>{uploadMessage.text}</MessageBar>
      ) : null}

      <Card className={styles.card}>
        <Text size={500} weight="semibold">
          {t("batchImageEditor.create.title")}
        </Text>
        <div className={styles.row}>
          <Field
            label={t("batchImageEditor.create.nameLabel")}
            className={styles.grow}
          >
            <Input
              value={batchName}
              onChange={(_, data) => setBatchName(data.value)}
              placeholder="Legacy cleanup batch"
            />
          </Field>

          <Field
            label={t("batchImageEditor.create.fileLabel")}
            className={styles.grow}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              className={styles.fileInput}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                setHasFile(Boolean(file));
              }}
            />
          </Field>

          <Button
            appearance="primary"
            disabled={!canUpload}
            onClick={onUpload}
          >
            {uploading ? <Spinner size="tiny" /> : null}{" "}
            {t("batchImageEditor.create.button")}
          </Button>
        </div>
      </Card>

      <Card className={`${styles.card} ${styles.tableCard}`}>
        <Text size={500} weight="semibold">
          {t("batchImageEditor.list.title")}
        </Text>

        {loading ? (
          <Spinner label="Loading..." />
        ) : error ? (
          <MessageBar intent="error">{error}</MessageBar>
        ) : batches.length === 0 ? (
          <div className={styles.empty}>{t("batchImageEditor.list.empty")}</div>
        ) : (
          <Table className={styles.table} size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Products</TableHeaderCell>
                <TableHeaderCell>Created</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell>
                    <Text weight="semibold">{batch.name}</Text>
                    {batch.source_filename ? (
                      <Text block className={styles.subtitle}>
                        {batch.source_filename}
                      </Text>
                    ) : null}
                  </TableCell>
                  <TableCell>{batch.product_count ?? 0}</TableCell>
                  <TableCell>
                    {batch.created_at
                      ? new Date(batch.created_at).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/app/products/batch-image-editor/${batch.id}/edit`}
                    >
                      <Button size="small">
                        {t("batchImageEditor.list.startEdit")}
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
