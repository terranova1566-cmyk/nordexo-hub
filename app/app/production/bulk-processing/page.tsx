"use client";

import {
  Button,
  Card,
  Field,
  Spinner,
  Tab,
  TabList,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

type BulkJobStatus = "queued" | "running" | "completed" | "failed" | "killed";

type BulkJobSummary = {
  spuCount: number;
  imageFolderCount: number | null;
  outputExcelPath: string | null;
  outputZipPath: string | null;
};

type BulkJob = {
  jobId: string;
  status: BulkJobStatus;
  inputName: string;
  itemCount: number;
  workerCount: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  summary?: BulkJobSummary | null;
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
  uploadCard: {
    padding: "18px",
    borderRadius: "16px",
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
  summaryTable: {
    marginTop: "4px",
  },
  statusPill: {
    display: "inline-flex",
    paddingInline: "8px",
    paddingBlock: "2px",
    borderRadius: "999px",
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase100,
  },
  logCard: {
    padding: "16px",
    borderRadius: "16px",
  },
  logBox: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "12px",
    minHeight: "220px",
    maxHeight: "420px",
    overflow: "auto",
    fontSize: tokens.fontSizeBase100,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    whiteSpace: "pre-wrap",
  },
  tabList: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  downloadsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
  },
});

export default function BulkProcessingPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [job, setJob] = useState<BulkJob | null>(null);
  const [activeTab, setActiveTab] = useState<string>("parallel");
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logSourcesRef = useRef<EventSource[]>([]);

  useEffect(() => {
    if (job) return;
    let active = true;
    const loadLatest = async () => {
      try {
        const response = await fetch("/api/bulk-jobs");
        if (!response.ok) return;
        const payload = await response.json();
        const items = (payload?.items ?? []) as BulkJob[];
        if (!items.length) return;
        const running = items.find((entry) => entry.status === "running");
        const queued = items.find((entry) => entry.status === "queued");
        const selected = running ?? queued ?? items[0];
        if (active) setJob(selected);
      } catch {
        return;
      }
    };
    loadLatest();
    return () => {
      active = false;
    };
  }, [job]);

  const tabs = useMemo(() => {
    const workerCount = job?.workerCount ?? 1;
    return ["parallel", ...Array.from({ length: workerCount }, (_, i) => `w${i + 1}`)];
  }, [job?.workerCount]);

  const appendLog = useCallback((key: string, line: string) => {
    setLogs((prev) => {
      const next = { ...prev };
      const list = [...(next[key] ?? []), line];
      if (list.length > 500) {
        list.splice(0, list.length - 500);
      }
      next[key] = list;
      return next;
    });
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await fetch("/api/bulk-jobs/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Upload failed.");
      }
      const payload = await response.json();
      setJob(payload.job as BulkJob);
      setLogs({});
      setActiveTab("parallel");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleStart = async () => {
    if (!job) return;
    setIsStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/bulk-jobs/${job.jobId}/start`, {
        method: "POST",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to start job.");
      }
      const payload = await response.json();
      setJob(payload.job as BulkJob);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    if (!job) return;
    setIsStopping(true);
    setError(null);
    try {
      const response = await fetch(`/api/bulk-jobs/${job.jobId}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to stop job.");
      }
      const payload = await response.json();
      setJob(payload.job as BulkJob);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsStopping(false);
    }
  };

  useEffect(() => {
    if (!job) return;
    if (job.status !== "running" && job.status !== "queued") return;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/bulk-jobs/${job.jobId}`);
        if (!response.ok) return;
        const payload = await response.json();
        setJob(payload.job as BulkJob);
      } catch {
        return;
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [job]);

  useEffect(() => {
    logSourcesRef.current.forEach((source) => source.close());
    logSourcesRef.current = [];
    if (!job) return;

    const attachSource = (key: string, url: string) => {
      const source = new EventSource(url);
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.line) {
            appendLog(key, payload.line);
          }
        } catch {
          return;
        }
      };
      logSourcesRef.current.push(source);
    };

    attachSource("parallel", `/api/bulk-jobs/${job.jobId}/logs/parallel`);
    const workerCount = job.workerCount ?? 1;
    for (let i = 1; i <= workerCount; i += 1) {
      attachSource(`w${i}`, `/api/bulk-jobs/${job.jobId}/logs/worker/${i}`);
    }

    return () => {
      logSourcesRef.current.forEach((source) => source.close());
      logSourcesRef.current = [];
    };
  }, [job?.jobId, job?.workerCount, appendLog]);

  const statusLabel = job ? job.status : "idle";

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text size={700} weight="semibold">
          {t("bulkProcessing.title")}
        </Text>
        <Text size={300} color="neutral">
          {t("bulkProcessing.subtitle")}
        </Text>
      </div>

      <Card className={styles.uploadCard}>
        <div className={styles.uploadRow}>
          <Field label={t("bulkProcessing.uploadLabel")}>
            <input
              type="file"
              accept="application/json"
              className={styles.fileInput}
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] ?? null)
              }
            />
          </Field>
          <Button
            appearance="outline"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
          >
            {isUploading ? <Spinner size="tiny" /> : t("bulkProcessing.upload")}
          </Button>
          <Button
            appearance="primary"
            onClick={handleStart}
            disabled={!job || job.status === "running" || isStarting}
          >
            {isStarting ? <Spinner size="tiny" /> : t("bulkProcessing.run")}
          </Button>
          <Button
            appearance="outline"
            onClick={handleStop}
            disabled={
              !job ||
              (job.status !== "running" && job.status !== "queued") ||
              isStopping
            }
          >
            {isStopping ? <Spinner size="tiny" /> : t("bulkProcessing.stop")}
          </Button>
        </div>

        {error ? (
          <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
            {error}
          </Text>
        ) : null}

        {job ? (
          <Table size="small" className={styles.summaryTable}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{t("bulkProcessing.summary.file")}</TableHeaderCell>
                <TableHeaderCell>{t("bulkProcessing.summary.count")}</TableHeaderCell>
                <TableHeaderCell>{t("bulkProcessing.summary.workers")}</TableHeaderCell>
                <TableHeaderCell>{t("bulkProcessing.summary.status")}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>{job.inputName}</TableCell>
                <TableCell>{job.itemCount}</TableCell>
                <TableCell>{job.workerCount}</TableCell>
                <TableCell>
                  <span className={styles.statusPill}>{statusLabel}</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : null}

        {job?.status === "completed" ? (
          <div className={styles.downloadsRow}>
            <Text size={200}>{t("bulkProcessing.completed")}</Text>
            {job.summary?.outputExcelPath ? (
              <Button
                appearance="outline"
                onClick={() =>
                  window.open(
                    `/api/bulk-jobs/${job.jobId}/download?type=excel`,
                    "_blank"
                  )
                }
              >
                {t("bulkProcessing.downloadExcel")}
              </Button>
            ) : null}
            {job.summary?.outputZipPath ? (
              <Button
                appearance="outline"
                onClick={() =>
                  window.open(
                    `/api/bulk-jobs/${job.jobId}/download?type=zip`,
                    "_blank"
                  )
                }
              >
                {t("bulkProcessing.downloadZip")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className={styles.logCard}>
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, data) => setActiveTab(String(data.value))}
          className={styles.tabList}
        >
          {tabs.map((tab) => (
            <Tab key={tab} value={tab}>
              {tab === "parallel"
                ? t("bulkProcessing.logs.parallel")
                : `${t("bulkProcessing.logs.worker")} ${tab.replace("w", "")}`}
            </Tab>
          ))}
        </TabList>

        {tabs.map((tab) =>
          activeTab === tab ? (
            <div key={tab} className={styles.logBox}>
              {(logs[tab]?.join("\n") ?? "") || t("bulkProcessing.logs.empty")}
            </div>
          ) : null
        )}
      </Card>
    </div>
  );
}
