"use client";

import {
  Button,
  Card,
  Field,
  MessageBar,
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
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDateTime } from "@/lib/format";

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  heading: {
    fontWeight: tokens.fontWeightSemibold,
  },
  tabsCard: {
    padding: "8px 16px",
    borderRadius: "var(--app-radius)",
    backgroundColor: "#fafafa",
  },
  section: {
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
  helperText: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: "pre-line",
  },
  fileInput: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "8px",
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
  },
  mono: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    wordBreak: "break-all",
  },
  tableWrap: {
    overflowX: "auto",
  },
  jsonArea: {
    minHeight: "220px",
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
  },
  outputArea: {
    minHeight: "260px",
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: "pre-wrap",
    padding: "12px",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground2,
  },
});

type AdminToolTab = "file-upload" | "json-tools" | "quick-actions";

type UploadItem = {
  storedName: string;
  originalName: string;
  mimeType: string | null;
  size: number;
  uploadedAt: string;
};

type UploadListPayload = {
  targetDirectory: string;
  files: UploadItem[];
};

const ADMIN_TABS: readonly AdminToolTab[] = [
  "file-upload",
  "json-tools",
  "quick-actions",
] as const;

const isAdminToolTab = (value: string): value is AdminToolTab =>
  (ADMIN_TABS as readonly string[]).includes(value);

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export default function AdminPage() {
  const styles = useStyles();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<AdminToolTab>("file-upload");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoadingUploads, setIsLoadingUploads] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [targetDirectory, setTargetDirectory] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);

  const [jsonInput, setJsonInput] = useState("");
  const [jsonOutput, setJsonOutput] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const response = await fetch("/api/settings/profile", { cache: "no-store" });
        if (!response.ok) {
          if (active) setIsAdminUser(false);
          return;
        }
        const payload = (await response.json().catch(() => null)) as
          | { is_admin?: boolean }
          | null;
        if (active) {
          setIsAdminUser(Boolean(payload?.is_admin));
        }
      } catch {
        if (active) setIsAdminUser(false);
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const loadUploads = useCallback(async () => {
    setIsLoadingUploads(true);
    setUploadError(null);

    try {
      const response = await fetch("/api/admin/file-upload", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | UploadListPayload
        | { error?: string }
        | null;

      if (response.status === 401 || response.status === 403) {
        setAccessDenied(true);
        setUploads([]);
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload && "error" in payload
            ? payload.error || "Unable to load uploads."
            : "Unable to load uploads."
        );
      }

      setAccessDenied(false);
      setTargetDirectory((payload as UploadListPayload)?.targetDirectory ?? "");
      setUploads(
        Array.isArray((payload as UploadListPayload)?.files)
          ? (payload as UploadListPayload).files
          : []
      );
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setIsLoadingUploads(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "file-upload" || isAdminUser !== true) return;
    loadUploads();
  }, [activeTab, isAdminUser, loadUploads]);

  const hasFilesSelected = useMemo(() => selectedFiles.length > 0, [selectedFiles]);

  const handleUpload = async () => {
    if (isAdminUser !== true) return;
    if (!selectedFiles.length) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/admin/file-upload", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | { uploadedCount?: number; error?: string }
        | null;

      if (response.status === 401 || response.status === 403) {
        setAccessDenied(true);
        throw new Error("You do not have permission to upload files.");
      }

      if (!response.ok) {
        throw new Error(payload?.error || "Upload failed.");
      }

      const uploadedCount = payload?.uploadedCount ?? selectedFiles.length;
      setUploadSuccess(`${uploadedCount} file(s) uploaded.`);
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await loadUploads();
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFormatJson = () => {
    setJsonError(null);
    setJsonOutput("");

    if (!jsonInput.trim()) {
      setJsonError("Paste JSON input first.");
      return;
    }

    try {
      const parsed = JSON.parse(jsonInput);
      setJsonOutput(JSON.stringify(parsed, null, 2));
    } catch (err) {
      setJsonError((err as Error).message || "Invalid JSON.");
    }
  };

  const handleCopyJson = async () => {
    if (!jsonOutput.trim()) return;
    await navigator.clipboard.writeText(jsonOutput);
  };

  if (isAdminUser === null) {
    return (
      <div className={styles.page}>
        <Text size={700} className={styles.heading}>
          Admin
        </Text>
        <Card className={styles.card}>
          <Spinner label="Loading admin tools" />
        </Card>
      </div>
    );
  }

  if (!isAdminUser) {
    return (
      <div className={styles.page}>
        <Text size={700} className={styles.heading}>
          Admin
        </Text>
        <Card className={styles.card}>
          <MessageBar intent="error">
            You do not have permission to access this area.
          </MessageBar>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Text size={700} className={styles.heading}>
        Admin
      </Text>

      <Card className={styles.tabsCard}>
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, data) => setActiveTab(String(data.value) as AdminToolTab)}
        >
          <Tab value="file-upload">File Upload</Tab>
          <Tab value="json-tools">JSON Tools</Tab>
          <Tab value="quick-actions">Quick Actions</Tab>
        </TabList>
      </Card>

      {activeTab === "file-upload" ? (
        <div className={styles.section}>
          <Card className={styles.card}>
            <Text weight="semibold">File Upload</Text>
            <Text size={200} className={styles.helperText}>
              Upload files to a server-side staging directory for review by Codex and
              backend workflows. Destination wiring can be changed later via
              `ADMIN_UPLOAD_DIR`.
            </Text>

            {accessDenied ? (
              <MessageBar intent="error">
                You do not have permission to access admin uploads.
              </MessageBar>
            ) : null}
            {uploadError ? <MessageBar intent="error">{uploadError}</MessageBar> : null}
            {uploadSuccess ? (
              <MessageBar intent="success">{uploadSuccess}</MessageBar>
            ) : null}

            <Field label="Select files">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className={styles.fileInput}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  setSelectedFiles(files);
                  setUploadError(null);
                  setUploadSuccess(null);
                }}
              />
            </Field>

            <div className={styles.row}>
              <Button
                appearance="primary"
                onClick={handleUpload}
                disabled={!hasFilesSelected || isUploading || accessDenied}
              >
                {isUploading ? "Uploading..." : "Upload files"}
              </Button>
              <Button
                appearance="outline"
                onClick={loadUploads}
                disabled={isLoadingUploads || accessDenied}
              >
                Refresh list
              </Button>
            </div>

            {selectedFiles.length > 0 ? (
              <Text size={200} className={styles.helperText}>
                Selected: {selectedFiles.map((file) => file.name).join(", ")}
              </Text>
            ) : null}

            <Text size={200} className={styles.helperText}>
              Staging directory
            </Text>
            <div className={styles.mono}>{targetDirectory || "Loading..."}</div>
          </Card>

          <Card className={styles.card}>
            <Text weight="semibold">Recent uploads</Text>
            {isLoadingUploads ? <Spinner label="Loading uploads" /> : null}

            {!isLoadingUploads && uploads.length === 0 ? (
              <Text size={200} className={styles.helperText}>
                No files uploaded yet.
              </Text>
            ) : null}

            {uploads.length > 0 ? (
              <div className={styles.tableWrap}>
                <Table size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Stored name</TableHeaderCell>
                      <TableHeaderCell>Original file</TableHeaderCell>
                      <TableHeaderCell>Type</TableHeaderCell>
                      <TableHeaderCell>Size</TableHeaderCell>
                      <TableHeaderCell>Uploaded</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploads.map((item) => (
                      <TableRow key={`${item.storedName}:${item.uploadedAt}`}>
                        <TableCell>
                          <div className={styles.mono}>{item.storedName}</div>
                        </TableCell>
                        <TableCell>{item.originalName || "-"}</TableCell>
                        <TableCell>{item.mimeType || "-"}</TableCell>
                        <TableCell>{formatBytes(item.size)}</TableCell>
                        <TableCell>{formatDateTime(item.uploadedAt) || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {activeTab === "json-tools" ? (
        <div className={styles.section}>
          <Card className={styles.card}>
            <Text weight="semibold">JSON Formatter & Validator</Text>
            <Text size={200} className={styles.helperText}>
              Paste JSON payloads to validate and format before using them in APIs
              or scripts.
            </Text>

            <Field label="JSON input">
              <Textarea
                value={jsonInput}
                onChange={(_, data) => setJsonInput(data.value)}
                className={styles.jsonArea}
              />
            </Field>

            <div className={styles.row}>
              <Button appearance="primary" onClick={handleFormatJson}>
                Validate & format
              </Button>
              <Button
                appearance="outline"
                onClick={handleCopyJson}
                disabled={!jsonOutput.trim()}
              >
                Copy output
              </Button>
            </div>

            {jsonError ? <MessageBar intent="error">{jsonError}</MessageBar> : null}

            {jsonOutput ? (
              <>
                <Text size={200} className={styles.helperText}>
                  Formatted output
                </Text>
                <div className={styles.outputArea}>{jsonOutput}</div>
              </>
            ) : null}
          </Card>
        </div>
      ) : null}

      {activeTab === "quick-actions" ? (
        <div className={styles.section}>
          <Card className={styles.card}>
            <Text weight="semibold">Quick Actions</Text>
            <Text size={200} className={styles.helperText}>
              Shortcuts to common admin workflows.
            </Text>

            <div className={styles.row}>
              <Button appearance="primary" onClick={() => router.push("/app/settings?tab=system")}>
                Open system settings
              </Button>
              <Button appearance="outline" onClick={() => router.push("/app/settings?tab=shopify-syncer")}>
                Open Shopify Syncer
              </Button>
              <Button appearance="outline" onClick={() => router.push("/app/settings?tab=uikit")}>
                Open UIKit in Settings
              </Button>
              <Button appearance="outline" onClick={() => router.push("/app/production")}>
                Open production queue
              </Button>
            </div>

            <Text size={200} className={styles.helperText}>
              Upload staging path
            </Text>
            <div className={styles.mono}>{targetDirectory || "Run File Upload tab to load path."}</div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
