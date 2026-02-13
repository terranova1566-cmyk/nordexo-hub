"use client";

import {
  Badge,
  Button,
  Card,
  Field,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

type SuggestionBatch = {
  id: string;
  createdAt: string;
  imageCount: number;
  urlCount: number;
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
    gap: "4px",
  },
  title: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightSemibold,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    "@media (max-width: 1000px)": {
      gridTemplateColumns: "1fr",
    },
  },
  paneCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  dropZone: {
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: "12px",
    padding: "20px",
    minHeight: "170px",
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "10px",
    textAlign: "center",
  },
  dropZoneActive: {
    border: "1px dashed #2b88d8",
    backgroundColor: "#edf6ff",
  },
  fileInputHidden: {
    display: "none",
  },
  helperText: {
    color: tokens.colorNeutralForeground3,
  },
  selectedMeta: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  saveRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap",
  },
  saveActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  errorText: {
    color: tokens.colorStatusDangerForeground1,
  },
  tableCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
  },
});

const parseUrls = (raw: string): string[] => {
  return raw
    .split(/[\n,]+/g)
    .map((value) => value.trim())
    .filter(Boolean);
};

const nowString = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
};

export default function DigiDealProductSuggestionsPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [isDragOver, setIsDragOver] = useState(false);
  const [urlsText, setUrlsText] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [batches, setBatches] = useState<SuggestionBatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedUrls = useMemo(() => parseUrls(urlsText), [urlsText]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files);
    if (next.length === 0) return;
    setImageFiles((prev) => [...prev, ...next]);
  };

  const handleSaveBatch = () => {
    setError(null);
    if (imageFiles.length === 0 && parsedUrls.length === 0) {
      setError(t("digidealSuggestions.validation.emptyBatch"));
      return;
    }
    const nextBatch: SuggestionBatch = {
      id: `batch-${Date.now()}`,
      createdAt: nowString(),
      imageCount: imageFiles.length,
      urlCount: parsedUrls.length,
    };
    setBatches((prev) => [nextBatch, ...prev]);
    setImageFiles([]);
    setUrlsText("");
  };

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <Text className={styles.title}>{t("digidealSuggestions.title")}</Text>
        <Text className={styles.subtitle}>{t("digidealSuggestions.subtitle")}</Text>
      </div>

      <div className={styles.grid}>
        <Card className={styles.paneCard}>
          <Text weight="semibold">{t("digidealSuggestions.images.title")}</Text>
          <div
            className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragOver(false);
              handleFiles(event.dataTransfer.files);
            }}
          >
            <Text>{t("digidealSuggestions.images.dropHint")}</Text>
            <Button
              appearance="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              {t("digidealSuggestions.images.selectButton")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className={styles.fileInputHidden}
              onChange={(event) => handleFiles(event.currentTarget.files)}
            />
          </div>
          <div className={styles.selectedMeta}>
            <Badge appearance="outline">{`${imageFiles.length} image(s)`}</Badge>
            <Text className={styles.helperText}>
              {t("digidealSuggestions.images.helper")}
            </Text>
          </div>
        </Card>

        <Card className={styles.paneCard}>
          <Text weight="semibold">{t("digidealSuggestions.urls.title")}</Text>
          <Field label={t("digidealSuggestions.urls.label")}>
            <Textarea
              value={urlsText}
              resize="vertical"
              rows={8}
              placeholder={t("digidealSuggestions.urls.placeholder")}
              onChange={(_, data) => setUrlsText(data.value)}
            />
          </Field>
          <div className={styles.selectedMeta}>
            <Badge appearance="outline">{`${parsedUrls.length} URL(s)`}</Badge>
            <Text className={styles.helperText}>
              {t("digidealSuggestions.urls.helper")}
            </Text>
          </div>
        </Card>
      </div>

      <div className={styles.saveRow}>
        {error ? <Text className={styles.errorText}>{error}</Text> : <span />}
        <div className={styles.saveActions}>
          <Button
            appearance="outline"
            onClick={() => {
              setImageFiles([]);
              setUrlsText("");
              setError(null);
            }}
          >
            {t("common.clear")}
          </Button>
          <Button appearance="primary" onClick={handleSaveBatch}>
            {t("digidealSuggestions.save")}
          </Button>
        </div>
      </div>

      <Card className={styles.tableCard}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{t("digidealSuggestions.table.createdAt")}</TableHeaderCell>
              <TableHeaderCell>{t("digidealSuggestions.table.images")}</TableHeaderCell>
              <TableHeaderCell>{t("digidealSuggestions.table.urls")}</TableHeaderCell>
              <TableHeaderCell>{t("digidealSuggestions.table.total")}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.length === 0 ? (
              <TableRow>
                <TableCell>{t("digidealSuggestions.table.empty")}</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
              </TableRow>
            ) : (
              batches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell>{batch.createdAt}</TableCell>
                  <TableCell>{batch.imageCount}</TableCell>
                  <TableCell>{batch.urlCount}</TableCell>
                  <TableCell>{batch.imageCount + batch.urlCount}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
