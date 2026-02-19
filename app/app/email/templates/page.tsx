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
  Tab,
  TabList,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useState } from "react";

type EmailTemplate = {
  template_id: string;
  name: string;
  description?: string | null;
  subject_template: string;
  body_template: string;
  macros: string[];
  updated_at?: string | null;
};

type TemplateVersion = {
  id: string;
  template_id: string;
  subject_template: string;
  body_template: string;
  macros: string[];
  created_at: string;
};

type PublicFileEntry = {
  id: string;
  token: string;
  file_path: string;
  original_name: string | null;
  created_at: string;
  expires_at: string;
  retain_until: string;
  download_count: number;
  url: string;
};

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "280px minmax(0, 1fr)",
    gap: "16px",
    "@media (max-width: 980px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  card: {
    padding: "16px",
    borderRadius: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  templateList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "560px",
    overflowY: "auto",
  },
  selectedBtn: {
    border: `1px solid ${tokens.colorBrandStroke1}`,
    boxShadow: `inset 0 0 0 1px ${tokens.colorBrandStroke1}`,
  },
  helper: {
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  tableWrap: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    overflow: "hidden",
  },
});

const emptyTemplate: EmailTemplate = {
  template_id: "",
  name: "",
  description: "",
  subject_template: "",
  body_template: "",
  macros: [],
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

export default function EmailTemplatesPage() {
  const styles = useStyles();

  const [activeTab, setActiveTab] = useState<"templates" | "files">("templates");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<EmailTemplate>(emptyTemplate);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const [sourcePath, setSourcePath] = useState("");
  const [fileName, setFileName] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [files, setFiles] = useState<PublicFileEntry[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.template_id === selectedId) ?? null,
    [templates, selectedId]
  );

  const loadTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const response = await fetch("/api/email/templates");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load templates.");
      }
      const next = Array.isArray(payload.templates) ? payload.templates : [];
      setTemplates(next);
      setSelectedId((prev) => prev || next[0]?.template_id || "");
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setIsLoadingTemplates(false);
    }
  }, []);

  const loadVersions = useCallback(async (templateId: string) => {
    if (!templateId) {
      setVersions([]);
      return;
    }
    try {
      const response = await fetch(
        `/api/email/templates/versions?template_id=${encodeURIComponent(templateId)}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load versions.");
      }
      setVersions(Array.isArray(payload.versions) ? payload.versions : []);
    } catch {
      setVersions([]);
    }
  }, []);

  const loadFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    try {
      const response = await fetch("/api/public/files");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load files.");
      }
      setFiles(Array.isArray(payload.files) ? payload.files : []);
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
    loadFiles();
  }, [loadFiles, loadTemplates]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setDraft(selectedTemplate);
    loadVersions(selectedTemplate.template_id);
  }, [loadVersions, selectedTemplate]);

  const saveTemplate = async () => {
    setIsSavingTemplate(true);
    setMessage(null);

    try {
      const macros = draft.macros?.length
        ? draft.macros
        : Array.from(
            new Set(
              `${draft.subject_template}\n${draft.body_template}`
                .match(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)
                ?.map((entry) => entry.replace(/[{}\s]/g, "")) ?? []
            )
          );

      const payload = {
        template_id: draft.template_id,
        name: draft.name,
        description: draft.description,
        subject_template: draft.subject_template,
        body_template: draft.body_template,
        macros,
      };

      const isNew = !selectedId;
      const response = await fetch(
        isNew ? "/api/email/templates" : `/api/email/templates/${encodeURIComponent(selectedId)}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Unable to save template.");
      }

      const nextId = String(result.template_id || draft.template_id);
      await loadTemplates();
      setSelectedId(nextId);
      setMessage({ type: "success", text: "Template saved." });
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const deleteTemplate = async () => {
    if (!selectedId) return;
    if (!window.confirm(`Delete template ${selectedId}?`)) return;

    try {
      const response = await fetch(
        `/api/email/templates/${encodeURIComponent(selectedId)}`,
        { method: "DELETE" }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Unable to delete template.");
      }

      const remaining = templates.filter((item) => item.template_id !== selectedId);
      setTemplates(remaining);
      setSelectedId(remaining[0]?.template_id || "");
      setDraft(remaining[0] || emptyTemplate);
      setMessage({ type: "success", text: "Template deleted." });
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    }
  };

  const createNewTemplateDraft = () => {
    setSelectedId("");
    setDraft({
      ...emptyTemplate,
      template_id: "new_products",
      name: "New products",
      subject_template: "New products for {{partner_name}} ({{date_range}})",
      body_template:
        "<p>Hey {{partner_name}},</p><p>Here are the latest products:</p><p><a href='{{products_csv_url}}'>Download product file</a></p>",
      macros: [
        "partner_name",
        "products_csv_url",
        "top_sellers_url",
        "date_range",
        "PARTNER_CONTACT_NAME",
      ],
    });
    setVersions([]);
  };

  const publishFile = async () => {
    setIsPublishing(true);
    try {
      const response = await fetch("/api/public/files/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath, fileName }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to publish file.");
      }
      setMessage({ type: "success", text: `Public URL created: ${payload.url}` });
      setSourcePath("");
      setFileName("");
      await loadFiles();
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setIsPublishing(false);
    }
  };

  const runCleanup = async () => {
    try {
      const response = await fetch("/api/public/files/cleanup", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Cleanup failed.");
      }
      setMessage({
        type: "success",
        text: `Cleanup complete. Deleted ${payload.deleted} old files.`,
      });
      await loadFiles();
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    }
  };

  return (
    <div className={styles.page}>
      <Text size={700} weight="semibold">
        Templates
      </Text>
      <Text className={styles.helper}>
        Manage reusable email templates and generate secure public file links.
      </Text>

      {message ? <MessageBar intent={message.type}>{message.text}</MessageBar> : null}

      <TabList
        selectedValue={activeTab}
        onTabSelect={(_, data) => setActiveTab(String(data.value) as "templates" | "files")}
      >
        <Tab value="templates">Templates</Tab>
        <Tab value="files">Public files</Tab>
      </TabList>

      {activeTab === "templates" ? (
        <div className={styles.row}>
          <Card className={styles.card}>
            <Text weight="semibold">Templates</Text>
            <Button appearance="primary" onClick={createNewTemplateDraft}>
              New template
            </Button>
            {isLoadingTemplates ? <Spinner label="Loading templates" /> : null}
            <div className={styles.templateList}>
              {templates.map((item) => (
                <Button
                  key={item.template_id}
                  appearance="secondary"
                  className={item.template_id === selectedId ? styles.selectedBtn : undefined}
                  onClick={() => setSelectedId(item.template_id)}
                >
                  {item.name} ({item.template_id})
                </Button>
              ))}
            </div>
          </Card>

          <Card className={styles.card}>
            <Field label="Template ID">
              <Input
                value={draft.template_id}
                onChange={(_, data) => setDraft((prev) => ({ ...prev, template_id: data.value }))}
                placeholder="new_products"
              />
            </Field>
            <Field label="Name">
              <Input
                value={draft.name}
                onChange={(_, data) => setDraft((prev) => ({ ...prev, name: data.value }))}
              />
            </Field>
            <Field label="Description">
              <Input
                value={draft.description || ""}
                onChange={(_, data) =>
                  setDraft((prev) => ({ ...prev, description: data.value }))
                }
              />
            </Field>
            <Field label="Subject template">
              <Input
                value={draft.subject_template}
                onChange={(_, data) =>
                  setDraft((prev) => ({ ...prev, subject_template: data.value }))
                }
                placeholder="New products for {{partner_name}}"
              />
            </Field>
            <Field label="Body template (HTML)">
              <Textarea
                rows={12}
                value={draft.body_template}
                onChange={(_, data) =>
                  setDraft((prev) => ({ ...prev, body_template: data.value }))
                }
              />
            </Field>
            <Field label="Macros (comma-separated)">
              <Input
                value={(draft.macros || []).join(", ")}
                onChange={(_, data) =>
                  setDraft((prev) => ({
                    ...prev,
                    macros: data.value
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="partner_name, products_csv_url, top_sellers_url, date_range"
              />
            </Field>

            <div className={styles.actions}>
              <Button appearance="primary" onClick={saveTemplate} disabled={isSavingTemplate}>
                {isSavingTemplate ? "Saving..." : "Save"}
              </Button>
              <Button appearance="secondary" onClick={deleteTemplate} disabled={!selectedId}>
                Delete
              </Button>
            </div>

            <Text size={200} className={styles.helper}>
              Last updated: {formatDate(draft.updated_at)}
            </Text>

            <Text weight="semibold">Version history</Text>
            <div className={styles.tableWrap}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Created</TableHeaderCell>
                    <TableHeaderCell>Macros</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell>{formatDate(version.created_at)}</TableCell>
                      <TableCell>{(version.macros || []).join(", ") || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {versions.length === 0 ? (
                    <TableRow>
                      <TableCell>No versions</TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      ) : (
        <div className={styles.page}>
          <Card className={styles.card}>
            <Text weight="semibold">Create public file URL</Text>
            <Text className={styles.helper}>
              Links expire in 30 days. Files are retained for 90 days.
            </Text>
            <Field label="Source path (from /srv/nordexo-hub/exports or public root)">
              <Input
                value={sourcePath}
                onChange={(_, data) => setSourcePath(data.value)}
                placeholder="digideal/my-export.xlsx"
              />
            </Field>
            <Field label="Optional download filename">
              <Input
                value={fileName}
                onChange={(_, data) => setFileName(data.value)}
                placeholder="partner-products.xlsx"
              />
            </Field>
            <div className={styles.actions}>
              <Button appearance="primary" onClick={publishFile} disabled={isPublishing}>
                {isPublishing ? "Publishing..." : "Publish file"}
              </Button>
              <Button appearance="secondary" onClick={runCleanup}>
                Run retention cleanup
              </Button>
            </div>
          </Card>

          <Card className={styles.card}>
            <Text weight="semibold">Recent public files</Text>
            {isLoadingFiles ? <Spinner label="Loading files" /> : null}
            <div className={styles.tableWrap}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>File</TableHeaderCell>
                    <TableHeaderCell>URL</TableHeaderCell>
                    <TableHeaderCell>Expires</TableHeaderCell>
                    <TableHeaderCell>Retention</TableHeaderCell>
                    <TableHeaderCell>Downloads</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.original_name || item.file_path}</TableCell>
                      <TableCell>
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.url}
                        </a>
                      </TableCell>
                      <TableCell>{formatDate(item.expires_at)}</TableCell>
                      <TableCell>{formatDate(item.retain_until)}</TableCell>
                      <TableCell>{item.download_count ?? 0}</TableCell>
                    </TableRow>
                  ))}
                  {files.length === 0 ? (
                    <TableRow>
                      <TableCell>No files</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
