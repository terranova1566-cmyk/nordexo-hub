"use client";

import {
  Button,
  Card,
  Dropdown,
  Field,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  Option,
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
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { type ClipboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { collectMacros } from "@/lib/email-templates";

type EmailTemplate = {
  template_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  owner_user_id?: string | null;
  owner_team?: string | null;
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

type EmailMacroDefinition = {
  id: string;
  macroKey: string;
  label: string;
  description: string | null;
  dataSource: string;
  formatter: string | null;
  fallbackValue: string | null;
  isRequired: boolean;
  isDeprecated: boolean;
  isActive: boolean;
};

type PreviewDataset = {
  id: string;
  name: string;
  description: string;
  variables: Record<string, string>;
  context?: Record<string, unknown>;
};

type TemplatePreviewResult = {
  rendered_subject: string;
  rendered_body: string;
  macro_resolution?: {
    unknownMacros?: string[];
    deprecatedMacros?: string[];
    missingRequiredMacros?: string[];
  };
};

type DiffLine = {
  type: "same" | "added" | "removed";
  text: string;
};

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  helper: {
    color: tokens.colorNeutralForeground3,
  },
  card: {
    padding: "16px",
    borderRadius: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
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
  fullWidthControl: {
    width: "100%",
  },

  // AI Prompt manager style copy (sidebar + editor)
  templateGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(300px, 25%) minmax(0, 1fr)",
    gap: "16px",
    alignItems: "stretch",
    "@media (max-width: 980px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  templateSidebar: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  templateSidebarHeader: {
    padding: "12px 12px 10px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#fafafa",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  templateSidebarHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  templateList: {
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    flex: "1 1 auto",
    minHeight: 0,
    maxHeight: "72vh",
  },
  templateItem: {
    border: "none",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    padding: "12px 12px 10px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    transition: "background-color 0.12s ease",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
    "&:focus-visible": {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "-2px",
    },
  },
  templateItemActive: {
    backgroundColor: "#edf6ff",
  },
  templateItemTopRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "10px",
  },
  templateItemUpdated: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
  },
  templateItemMeta: {
    marginTop: "4px",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  templateItemDescription: {
    marginTop: "2px",
    color: tokens.colorNeutralForeground4,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase200,
  },
  templateItemContext: {
    marginTop: "2px",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
  },
  templateSidebarFooter: {
    padding: "12px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#fafafa",
    display: "flex",
    justifyContent: "flex-end",
  },

  templateEditor: {
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  templateEditorHeader: {
    padding: "12px 12px 10px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#fafafa",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  templateEditorHeaderText: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  templateEditorMeta: {
    padding: "12px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  idNameRow: {
    display: "grid",
    gridTemplateColumns: "minmax(140px, 20%) minmax(0, 1fr)",
    gap: "10px",
    "@media (max-width: 900px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  metadataRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
    "@media (max-width: 900px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  formField: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  formLabel: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    color: tokens.colorNeutralForeground3,
  },
  formInput: {
    width: "100%",
    "& input": {
      minHeight: "36px",
      paddingTop: "8px",
      paddingBottom: "8px",
    },
  },
  formTextarea: {
    width: "100%",
    "& textarea": {
      minHeight: "88px",
      paddingTop: "8px",
      paddingBottom: "8px",
    },
  },
  editorModeRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap",
    padding: "10px 12px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#fafafa",
  },
  editorModeButtons: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  previewControls: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  previewDropdown: {
    minWidth: "220px",
  },
  macroMenuList: {
    maxHeight: "280px",
    overflowY: "auto",
    minWidth: "240px",
  },
  macroToken: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  richToolbar: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
    padding: "8px 12px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  richSurface: {
    minHeight: "460px",
    maxHeight: "70vh",
    overflowY: "auto",
    padding: "12px",
    outline: "none",
    lineHeight: "1.5",
    "&:focus-visible": {
      boxShadow: `inset 0 0 0 2px ${tokens.colorBrandStroke1}`,
    },
  },
  htmlEditor: {
    border: "none",
    borderRadius: 0,
    minHeight: "460px",
    resize: "vertical",
    padding: "12px",
    backgroundColor: tokens.colorNeutralBackground1,
    "& textarea": {
      minHeight: "460px",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      lineHeight: "1.45",
    },
  },
  htmlPreview: {
    minHeight: "460px",
    maxHeight: "70vh",
    overflowY: "auto",
    padding: "12px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  previewSubject: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    paddingBottom: "12px",
    marginBottom: "12px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  previewWarnings: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    color: tokens.colorPaletteMarigoldForeground2,
  },
  templateEditorActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    padding: "12px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#fafafa",
  },
  versionsBlock: {
    padding: "12px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  versionsHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap",
  },
  versionControls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  versionDropdown: {
    minWidth: "260px",
  },
  diffBlocks: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
    "@media (max-width: 980px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  diffBlock: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "8px",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  diffBlockHeader: {
    padding: "8px 10px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: "#fafafa",
  },
  diffCode: {
    margin: 0,
    padding: "8px 10px",
    maxHeight: "220px",
    overflowY: "auto",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: tokens.fontSizeBase100,
    lineHeight: "1.45",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  diffLineSame: {
    color: tokens.colorNeutralForeground2,
  },
  diffLineAdded: {
    color: "#0f5132",
    backgroundColor: "#ecfdf3",
  },
  diffLineRemoved: {
    color: "#842029",
    backgroundColor: "#fdecef",
  },
  highlight: {
    backgroundColor: "#fff6bf",
    borderRadius: "2px",
    padding: "0 1px",
  },
});

const emptyTemplate: EmailTemplate = {
  template_id: "",
  name: "",
  description: "",
  category: "",
  tags: [],
  owner_user_id: "",
  owner_team: "",
  subject_template: "",
  body_template: "",
  macros: [],
};

const DEFAULT_EMAIL_MACROS = [
  "partner_name",
  "products_csv_url",
  "top_sellers_url",
  "date_range",
  "PARTNER_CONTACT_NAME",
];

const PREVIEW_DATASETS: PreviewDataset[] = [
  {
    id: "partner_weekly",
    name: "Partner weekly update",
    description: "Typical weekly partner export email payload.",
    variables: {
      partner_name: "Nordic Retail AB",
      date_range: "2026-02-01 to 2026-02-07",
      products_csv_url: "https://hub.nordexo.se/public/example-products.csv",
      top_sellers_url: "https://hub.nordexo.se/public/example-top-sellers.xlsx",
      PARTNER_CONTACT_NAME: "Anna Larsson",
    },
  },
  {
    id: "orders_pending",
    name: "Orders pending sample",
    description: "Pending order payload for order + platform macros.",
    variables: {
      orders_id: "f9a96526-779a-4546-8eab-293bf4fdfd8b",
      orders_number: "ND-550321",
      orders_date: "2026-02-24",
      orders_transaction_date: "2026-02-24",
      orders_ship_date: "",
      orders_date_shipped: "",
      orders_customer_name: "Sofia Berg",
      orders_customer_email: "sofia.berg@example.com",
      orders_status: "pending",
      order_content_list: "2 X Example Product A\n1 X Example Product B",
      platform_id: "LETSDEAL_SE",
      platform_name: "LetsDeal",

      // Legacy aliases for older templates.
      order_id: "f9a96526-779a-4546-8eab-293bf4fdfd8b",
      order_number: "ND-550321",
      transaction_date: "2026-02-24",
      date_shipped: "",
      ship_date: "",
      customer_name: "Sofia Berg",
      customer_email: "sofia.berg@example.com",
      sales_channel_id: "LETSDEAL_SE",
      sales_channel_name: "LetsDeal",
      platform: "LetsDeal",
      order_status: "pending",
    },
  },
  {
    id: "missing_required",
    name: "Missing values test",
    description: "Sparse payload to verify required-macro guardrails.",
    variables: {
      partner_name: "Test Partner",
    },
  },
  {
    id: "empty",
    name: "Empty payload",
    description: "No variables, useful to verify fallback behavior.",
    variables: {},
  },
];

const parseTagsFromInput = (input: string) =>
  Array.from(
    new Set(
      input
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

const normalizeSearchQuery = (value: string) => value.trim().toLowerCase();

const splitForHighlight = (text: string, query: string) => {
  const q = normalizeSearchQuery(query);
  const t = String(text || "");
  if (!q) return [{ text: t, hit: false }];

  const lower = t.toLowerCase();
  const parts: Array<{ text: string; hit: boolean }> = [];
  let idx = 0;
  while (idx < t.length) {
    const next = lower.indexOf(q, idx);
    if (next === -1) {
      parts.push({ text: t.slice(idx), hit: false });
      break;
    }
    if (next > idx) {
      parts.push({ text: t.slice(idx, next), hit: false });
    }
    parts.push({ text: t.slice(next, next + q.length), hit: true });
    idx = next + q.length;
  }
  return parts;
};

const buildLineDiff = (previousText: string, currentText: string): DiffLine[] => {
  const prevLines = String(previousText ?? "").split(/\r?\n/);
  const nextLines = String(currentText ?? "").split(/\r?\n/);
  const rows = prevLines.length;
  const cols = nextLines.length;

  const matrix: number[][] = Array.from({ length: rows + 1 }, () =>
    Array.from({ length: cols + 1 }, () => 0)
  );

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      if (prevLines[i] === nextLines[j]) {
        matrix[i][j] = matrix[i + 1][j + 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i + 1][j], matrix[i][j + 1]);
      }
    }
  }

  const diff: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < rows && j < cols) {
    if (prevLines[i] === nextLines[j]) {
      diff.push({ type: "same", text: prevLines[i] });
      i += 1;
      j += 1;
      continue;
    }
    if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      diff.push({ type: "removed", text: prevLines[i] });
      i += 1;
    } else {
      diff.push({ type: "added", text: nextLines[j] });
      j += 1;
    }
  }

  while (i < rows) {
    diff.push({ type: "removed", text: prevLines[i] });
    i += 1;
  }
  while (j < cols) {
    diff.push({ type: "added", text: nextLines[j] });
    j += 1;
  }

  return diff;
};

export default function EmailTemplatesPage() {
  const styles = useStyles();
  const router = useRouter();
  const pathname = usePathname();
  const isNewTemplateRoute = pathname?.endsWith("/email/templates/new") ?? false;

  const [activeTab, setActiveTab] = useState<"templates" | "macros" | "files">("templates");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<EmailTemplate>(emptyTemplate);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [editorMode, setEditorMode] = useState<"rich" | "html" | "preview">("rich");
  const [selectedPreviewDatasetId, setSelectedPreviewDatasetId] = useState(
    PREVIEW_DATASETS[0]?.id || ""
  );
  const [previewResult, setPreviewResult] = useState<TemplatePreviewResult | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [macroDefinitions, setMacroDefinitions] = useState<EmailMacroDefinition[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoadingMacros, setIsLoadingMacros] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isCreatingNewTemplate, setIsCreatingNewTemplate] = useState(false);

  const [sourcePath, setSourcePath] = useState("");
  const [fileName, setFileName] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [files, setFiles] = useState<PublicFileEntry[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const richEditorRef = useRef<HTMLDivElement | null>(null);
  const htmlBodyRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.template_id === selectedId) ?? null,
    [templates, selectedId]
  );

  const selectedVersion = useMemo(
    () => versions.find((item) => item.id === selectedVersionId) ?? null,
    [selectedVersionId, versions]
  );

  const selectedPreviewDataset = useMemo(
    () => PREVIEW_DATASETS.find((item) => item.id === selectedPreviewDatasetId) ?? null,
    [selectedPreviewDatasetId]
  );

  const filteredTemplates = useMemo(() => {
    const q = normalizeSearchQuery(templateSearch);
    if (!q) return templates;

    return templates.filter((item) => {
      const haystack = [
        item.name,
        item.template_id,
        item.description,
        item.category,
        item.owner_team,
        item.owner_user_id,
        (item.tags || []).join(" "),
        item.subject_template,
        item.body_template,
        (item.macros || []).join(" "),
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join("\n");
      return haystack.includes(q);
    });
  }, [templateSearch, templates]);

  const inferredDraftMacros = useMemo(
    () => collectMacros(`${draft.subject_template || ""}\n${draft.body_template || ""}`),
    [draft.subject_template, draft.body_template]
  );

  const availableMacroKeys = useMemo(() => {
    const set = new Set<string>(DEFAULT_EMAIL_MACROS);
    for (const definition of macroDefinitions) {
      if (!definition.isActive || definition.isDeprecated) continue;
      if (!definition.macroKey) continue;
      set.add(definition.macroKey);
    }
    for (const key of inferredDraftMacros) {
      if (key) set.add(String(key));
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [inferredDraftMacros, macroDefinitions]);

  const macroUsageRows = useMemo(() => {
    const usage = new Map<string, Set<string>>();
    for (const template of templates) {
      const keys = new Set<string>([
        ...(template.macros || []).map((entry) => String(entry ?? "").trim()),
        ...collectMacros(`${template.subject_template || ""}\n${template.body_template || ""}`),
      ]);
      for (const keyRaw of keys) {
        const key = keyRaw.trim();
        if (!key) continue;
        if (!usage.has(key)) usage.set(key, new Set<string>());
        usage.get(key)?.add(template.template_id);
      }
    }
    const usageRows = Array.from(usage.entries())
      .map(([macro, templateIds]) => ({
        macro,
        count: templateIds.size,
        templates: Array.from(templateIds.values()).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.macro.localeCompare(b.macro));
    const usageMap = new Map(usageRows.map((row) => [row.macro.toLowerCase(), row]));

    const merged = macroDefinitions.map((definition) => {
      const usageRow = usageMap.get(definition.macroKey.toLowerCase());
      return {
        macro: definition.macroKey,
        label: definition.label,
        dataSource: definition.dataSource,
        isRequired: definition.isRequired,
        isDeprecated: definition.isDeprecated,
        isActive: definition.isActive,
        count: usageRow?.count ?? 0,
        templates: usageRow?.templates ?? [],
      };
    });

    for (const usageRow of usageRows) {
      const exists = merged.some(
        (row) => row.macro.toLowerCase() === usageRow.macro.toLowerCase()
      );
      if (exists) continue;
      merged.push({
        macro: usageRow.macro,
        label: usageRow.macro,
        dataSource: "variables",
        isRequired: false,
        isDeprecated: false,
        isActive: true,
        count: usageRow.count,
        templates: usageRow.templates,
      });
    }

    return merged.sort((a, b) => a.macro.localeCompare(b.macro));
  }, [macroDefinitions, templates]);

  const initializeNewTemplateDraft = useCallback(() => {
    setSelectedId("");
    setDraft({
      ...emptyTemplate,
      tags: [],
      macros: [],
    });
    setVersions([]);
    setSelectedVersionId("");
    setEditorMode("rich");
    setPreviewResult(null);
    setPreviewError("");
    setMessage(null);
  }, []);

  const loadTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const response = await fetch("/api/email/templates");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load templates.");
      }
      const next: EmailTemplate[] = Array.isArray(payload.templates)
        ? (payload.templates as EmailTemplate[])
        : [];
      setTemplates(next);
      setSelectedId((prev) => {
        if (isCreatingNewTemplate || isNewTemplateRoute) return "";
        if (prev && next.some((item) => item.template_id === prev)) return prev;
        return next[0]?.template_id || "";
      });
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [isCreatingNewTemplate, isNewTemplateRoute]);

  const loadMacros = useCallback(async () => {
    setIsLoadingMacros(true);
    try {
      const response = await fetch("/api/email/macros");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load macros.");
      }
      const rows = Array.isArray(payload.macros) ? payload.macros : [];
      const normalized: EmailMacroDefinition[] = rows.map((row: Record<string, unknown>) => ({
        id: String(row.id ?? ""),
        macroKey: String(row.macroKey ?? row.macro_key ?? ""),
        label: String(row.label ?? row.macroKey ?? row.macro_key ?? ""),
        description: row.description ? String(row.description) : null,
        dataSource: String(row.dataSource ?? row.data_source ?? "variables"),
        formatter: row.formatter ? String(row.formatter) : null,
        fallbackValue: row.fallbackValue
          ? String(row.fallbackValue)
          : row.fallback_value
            ? String(row.fallback_value)
            : null,
        isRequired: Boolean(row.isRequired ?? row.is_required),
        isDeprecated: Boolean(row.isDeprecated ?? row.is_deprecated),
        isActive:
          row.isActive === undefined && row.is_active === undefined
            ? true
            : Boolean(row.isActive ?? row.is_active),
      }));
      setMacroDefinitions(normalized);
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setIsLoadingMacros(false);
    }
  }, []);

  const loadVersions = useCallback(async (templateId: string) => {
    if (!templateId) {
      setVersions([]);
      setSelectedVersionId("");
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
      const nextVersions = Array.isArray(payload.versions) ? payload.versions : [];
      setVersions(nextVersions);
      setSelectedVersionId((prev) => {
        if (prev && nextVersions.some((item: TemplateVersion) => item.id === prev)) return prev;
        return nextVersions[0]?.id || "";
      });
    } catch {
      setVersions([]);
      setSelectedVersionId("");
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
    if (isNewTemplateRoute) {
      setIsCreatingNewTemplate(true);
      initializeNewTemplateDraft();
      return;
    }
    setIsCreatingNewTemplate(false);
  }, [initializeNewTemplateDraft, isNewTemplateRoute]);

  useEffect(() => {
    loadTemplates();
    loadMacros();
    loadFiles();
  }, [loadFiles, loadMacros, loadTemplates]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setIsCreatingNewTemplate(false);
    setDraft(selectedTemplate);
    loadVersions(selectedTemplate.template_id);
  }, [loadVersions, selectedTemplate]);

  useEffect(() => {
    const editor = richEditorRef.current;
    if (!editor || editorMode !== "rich") return;
    const nextHtml = draft.body_template || "";
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
  }, [draft.body_template, editorMode]);

  const syncRichBody = useCallback(() => {
    const editor = richEditorRef.current;
    if (!editor) return;
    const nextValue = editor.innerHTML;
    setDraft((prev) =>
      prev.body_template === nextValue ? prev : { ...prev, body_template: nextValue }
    );
  }, []);

  const insertMacroToken = useCallback(
    (macroKey: string) => {
      const key = String(macroKey || "").trim();
      if (!key) return;
      const token = `{{${key}}}`;

      if (editorMode === "rich" && richEditorRef.current) {
        const editor = richEditorRef.current;
        editor.focus();
        document.execCommand("insertText", false, token);
        syncRichBody();
        return;
      }

      if (editorMode === "html" && htmlBodyRef.current) {
        const control = htmlBodyRef.current;
        const start = Number.isFinite(control.selectionStart)
          ? control.selectionStart
          : control.value.length;
        const end = Number.isFinite(control.selectionEnd) ? control.selectionEnd : control.value.length;
        setDraft((prev) => {
          const current = String(prev.body_template ?? "");
          const safeStart = Math.max(0, Math.min(start, current.length));
          const safeEnd = Math.max(safeStart, Math.min(end, current.length));
          return {
            ...prev,
            body_template: `${current.slice(0, safeStart)}${token}${current.slice(safeEnd)}`,
          };
        });
        requestAnimationFrame(() => {
          control.focus();
          const nextCursor = start + token.length;
          control.setSelectionRange(nextCursor, nextCursor);
        });
        return;
      }

      setDraft((prev) => ({
        ...prev,
        body_template: `${String(prev.body_template ?? "")}${token}`,
      }));
      if (editorMode === "preview") {
        setEditorMode("html");
      }
    },
    [editorMode, syncRichBody]
  );

  const runRichCommand = useCallback(
    (command: string, value?: string) => {
      const editor = richEditorRef.current;
      if (!editor) return;
      if (editorMode !== "rich") {
        setEditorMode("rich");
      }
      editor.focus();
      document.execCommand(command, false, value);
      syncRichBody();
    },
    [editorMode, syncRichBody]
  );

  const insertRichLink = useCallback(() => {
    const url = window.prompt("Enter URL");
    if (!url) return;
    runRichCommand("createLink", url.trim());
  }, [runRichCommand]);

  const handleRichPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") || "";
      document.execCommand("insertText", false, text);
      syncRichBody();
    },
    [syncRichBody]
  );

  const runTemplatePreview = useCallback(async () => {
    const dataset = selectedPreviewDataset;
    if (!dataset) {
      setPreviewResult(null);
      return;
    }

    setIsLoadingPreview(true);
    setPreviewError("");
    try {
      const response = await fetch("/api/email/templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_template: draft.subject_template || "",
          body_template: draft.body_template || "",
          macros: draft.macros || [],
          variables: dataset.variables || {},
          context: dataset.context || {},
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to render preview.");
      }
      setPreviewResult(payload as TemplatePreviewResult);
    } catch (error) {
      setPreviewResult(null);
      setPreviewError((error as Error).message);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [
    draft.body_template,
    draft.macros,
    draft.subject_template,
    selectedPreviewDataset,
  ]);

  const restoreSelectedVersion = useCallback(() => {
    if (!selectedVersion) return;
    setDraft((prev) => ({
      ...prev,
      subject_template: String(selectedVersion.subject_template ?? ""),
      body_template: String(selectedVersion.body_template ?? ""),
      macros: Array.isArray(selectedVersion.macros) ? selectedVersion.macros : prev.macros,
    }));
    setMessage({
      type: "success",
      text: `Loaded version from ${formatDate(selectedVersion.created_at)} into draft.`,
    });
  }, [selectedVersion]);

  useEffect(() => {
    if (editorMode !== "preview") return;
    void runTemplatePreview();
  }, [editorMode, runTemplatePreview, selectedPreviewDatasetId]);

  const saveTemplate = async () => {
    setIsSavingTemplate(true);
    setMessage(null);

    try {
      const macros = collectMacros(`${draft.subject_template || ""}\n${draft.body_template || ""}`);

      const payload = {
        template_id: draft.template_id,
        name: draft.name,
        description: draft.description,
        category: draft.category || null,
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        owner_user_id: draft.owner_user_id || null,
        owner_team: draft.owner_team || null,
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
      await loadMacros();
      setSelectedId(nextId);
      setIsCreatingNewTemplate(false);
      if (isNewTemplateRoute) {
        router.replace("/app/email/templates");
      }
      const warningText = Array.isArray(result?.warnings)
        ? result.warnings.filter(Boolean).join(" ")
        : "";
      setMessage({
        type: "success",
        text: warningText ? `Template saved. ${warningText}` : "Template saved.",
      });
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
    setIsCreatingNewTemplate(true);
    initializeNewTemplateDraft();
    if (!isNewTemplateRoute) {
      router.push("/app/email/templates/new");
    }
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

  const subjectDiffLines = useMemo(() => {
    if (!selectedVersion) return [] as DiffLine[];
    return buildLineDiff(
      String(selectedVersion.subject_template ?? ""),
      String(draft.subject_template ?? "")
    );
  }, [draft.subject_template, selectedVersion]);

  const bodyDiffLines = useMemo(() => {
    if (!selectedVersion) return [] as DiffLine[];
    return buildLineDiff(
      String(selectedVersion.body_template ?? ""),
      String(draft.body_template ?? "")
    );
  }, [draft.body_template, selectedVersion]);

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
        onTabSelect={(_, data) =>
          setActiveTab(String(data.value) as "templates" | "macros" | "files")
        }
      >
        <Tab value="templates">Templates</Tab>
        <Tab value="macros">Macros</Tab>
        <Tab value="files">Public files</Tab>
      </TabList>

      {activeTab === "templates" ? (
        <div className={styles.templateGrid}>
          <div className={styles.templateSidebar}>
            <div className={styles.templateSidebarHeader}>
              <div className={styles.templateSidebarHeaderRow}>
                <Text weight="semibold">Templates</Text>
                <Text size={200} className={styles.helper}>
                  {templates.length}
                </Text>
              </div>
              <Input
                value={templateSearch}
                onChange={(_, data) => setTemplateSearch(data.value)}
                placeholder="Search templates"
                size="small"
                className={styles.fullWidthControl}
              />
            </div>

            {isLoadingTemplates ? <Spinner label="Loading templates" /> : null}

            <div className={styles.templateList}>
              {filteredTemplates.map((item) => {
                const active = item.template_id === selectedId;
                return (
                  <button
                    key={item.template_id}
                    type="button"
                    className={mergeClasses(
                      styles.templateItem,
                      active ? styles.templateItemActive : undefined
                    )}
                    onClick={() => {
                      setIsCreatingNewTemplate(false);
                      setSelectedId(item.template_id);
                      if (isNewTemplateRoute) {
                        router.replace("/app/email/templates");
                      }
                    }}
                  >
                    <div className={styles.templateItemTopRow}>
                      <Text weight="semibold">
                        {splitForHighlight(item.name || item.template_id, templateSearch).map(
                          (part, idx) =>
                            part.hit ? (
                              <span key={`${idx}-${part.text}`} className={styles.highlight}>
                                {part.text}
                              </span>
                            ) : (
                              <span key={`${idx}-${part.text}`}>{part.text}</span>
                            )
                        )}
                      </Text>
                      <span className={styles.templateItemUpdated}>
                        {formatDate(item.updated_at)}
                      </span>
                    </div>
                    <div className={styles.templateItemMeta}>
                      {splitForHighlight(item.template_id, templateSearch).map((part, idx) =>
                        part.hit ? (
                          <span key={`${idx}-${part.text}`} className={styles.highlight}>
                            {part.text}
                          </span>
                        ) : (
                          <span key={`${idx}-${part.text}`}>{part.text}</span>
                        )
                      )}
                    </div>
                    <div className={styles.templateItemContext}>
                      {item.category ? `Category: ${item.category}` : "Category: -"}
                      {item.owner_team ? ` | Team: ${item.owner_team}` : ""}
                      {Array.isArray(item.tags) && item.tags.length > 0
                        ? ` | Tags: ${item.tags.join(", ")}`
                        : ""}
                    </div>
                    <div className={styles.templateItemDescription}>
                      {splitForHighlight(String(item.description ?? ""), templateSearch).map(
                        (part, idx) =>
                          part.hit ? (
                            <span key={`${idx}-${part.text}`} className={styles.highlight}>
                              {part.text}
                            </span>
                          ) : (
                            <span key={`${idx}-${part.text}`}>{part.text}</span>
                          )
                      )}
                    </div>
                  </button>
                );
              })}
              {!isLoadingTemplates && filteredTemplates.length === 0 ? (
                <div className={styles.card}>
                  <Text size={200} className={styles.helper}>
                    No templates found.
                  </Text>
                </div>
              ) : null}
            </div>

            <div className={styles.templateSidebarFooter}>
              <Button appearance="primary" size="small" onClick={createNewTemplateDraft}>
                New template
              </Button>
            </div>
          </div>

          <div className={styles.templateEditor}>
            <div className={styles.templateEditorHeader}>
              <div className={styles.templateEditorHeaderText}>
                <Text weight="semibold">{draft.name || "New template"}</Text>
                <Text size={200} className={styles.helper}>
                  {draft.template_id || "template_id"}
                </Text>
                <Text size={200} className={styles.helper}>
                  Last updated: {formatDate(draft.updated_at)}
                </Text>
              </div>
            </div>

            <div className={styles.templateEditorMeta}>
              <div className={styles.idNameRow}>
                <div className={styles.formField}>
                  <Text className={styles.formLabel}>Template ID</Text>
                  <Input
                    value={draft.template_id}
                    onChange={(_, data) =>
                      setDraft((prev) => ({ ...prev, template_id: data.value }))
                    }
                    placeholder="new_products"
                    className={styles.formInput}
                    size="small"
                  />
                </div>
                <div className={styles.formField}>
                  <Text className={styles.formLabel}>Name</Text>
                  <Input
                    value={draft.name}
                    onChange={(_, data) => setDraft((prev) => ({ ...prev, name: data.value }))}
                    className={styles.formInput}
                    size="small"
                  />
                </div>
              </div>
              <div className={styles.formField}>
                <Text className={styles.formLabel}>Description</Text>
                <Textarea
                  rows={2}
                  value={draft.description || ""}
                  onChange={(_, data) =>
                    setDraft((prev) => ({ ...prev, description: data.value }))
                  }
                  className={styles.formTextarea}
                  size="small"
                />
              </div>
              <div className={styles.metadataRow}>
                <div className={styles.formField}>
                  <Text className={styles.formLabel}>Category</Text>
                  <Input
                    value={draft.category || ""}
                    onChange={(_, data) =>
                      setDraft((prev) => ({ ...prev, category: data.value }))
                    }
                    placeholder="partner_update"
                    className={styles.formInput}
                    size="small"
                  />
                </div>
                <div className={styles.formField}>
                  <Text className={styles.formLabel}>Owner team</Text>
                  <Input
                    value={draft.owner_team || ""}
                    onChange={(_, data) =>
                      setDraft((prev) => ({ ...prev, owner_team: data.value }))
                    }
                    placeholder="Email"
                    className={styles.formInput}
                    size="small"
                  />
                </div>
              </div>
              <div className={styles.metadataRow}>
                <div className={styles.formField}>
                  <Text className={styles.formLabel}>Owner user ID</Text>
                  <Input
                    value={draft.owner_user_id || ""}
                    onChange={(_, data) =>
                      setDraft((prev) => ({ ...prev, owner_user_id: data.value }))
                    }
                    placeholder="UUID (optional)"
                    className={styles.formInput}
                    size="small"
                  />
                </div>
                <div className={styles.formField}>
                  <Text className={styles.formLabel}>Tags (comma-separated)</Text>
                  <Input
                    value={Array.isArray(draft.tags) ? draft.tags.join(", ") : ""}
                    onChange={(_, data) =>
                      setDraft((prev) => ({
                        ...prev,
                        tags: parseTagsFromInput(data.value),
                      }))
                    }
                    placeholder="weekly, partner"
                    className={styles.formInput}
                    size="small"
                  />
                </div>
              </div>
              <div className={styles.formField}>
                <Text className={styles.formLabel}>Subject template</Text>
                <Input
                  value={draft.subject_template}
                  onChange={(_, data) =>
                    setDraft((prev) => ({ ...prev, subject_template: data.value }))
                  }
                  placeholder="New products for {{partner_name}}"
                  className={styles.formInput}
                  size="small"
                />
              </div>
            </div>

            <div className={styles.editorModeRow}>
              <Text size={200} className={styles.helper}>
                Body template
              </Text>
              <div className={styles.previewControls}>
                <div className={styles.editorModeButtons}>
                  <Button
                    size="small"
                    appearance={editorMode === "rich" ? "primary" : "secondary"}
                    onClick={() => setEditorMode("rich")}
                  >
                    Rich text
                  </Button>
                  <Button
                    size="small"
                    appearance={editorMode === "html" ? "primary" : "secondary"}
                    onClick={() => setEditorMode("html")}
                  >
                    HTML
                  </Button>
                  <Button
                    size="small"
                    appearance={editorMode === "preview" ? "primary" : "secondary"}
                    onClick={() => setEditorMode("preview")}
                  >
                    Preview
                  </Button>
                  <Menu>
                    <MenuTrigger disableButtonEnhancement>
                      <Button size="small" appearance="secondary">
                        Macros
                      </Button>
                    </MenuTrigger>
                    <MenuPopover>
                      <MenuList className={styles.macroMenuList}>
                        {availableMacroKeys.map((macro) => (
                          <MenuItem key={macro} onClick={() => insertMacroToken(macro)}>
                            <span className={styles.macroToken}>{`{{${macro}}}`}</span>
                          </MenuItem>
                        ))}
                        {availableMacroKeys.length === 0 ? (
                          <MenuItem disabled>No macros available.</MenuItem>
                        ) : null}
                      </MenuList>
                    </MenuPopover>
                  </Menu>
                </div>
                <Dropdown
                  className={styles.previewDropdown}
                  selectedOptions={selectedPreviewDataset ? [selectedPreviewDataset.id] : []}
                  value={selectedPreviewDataset?.name || "Select dataset"}
                  placeholder="Select dataset"
                  size="small"
                  onOptionSelect={(_, data) =>
                    setSelectedPreviewDatasetId(String(data.optionValue ?? ""))
                  }
                >
                  {PREVIEW_DATASETS.map((dataset) => (
                    <Option key={dataset.id} value={dataset.id} text={dataset.name}>
                      {dataset.name}
                    </Option>
                  ))}
                </Dropdown>
                <Button
                  size="small"
                  appearance="secondary"
                  onClick={() => void runTemplatePreview()}
                  disabled={isLoadingPreview}
                >
                  {isLoadingPreview ? "Refreshing..." : "Refresh preview"}
                </Button>
              </div>
            </div>
            {editorMode === "rich" ? (
              <>
                <div className={styles.richToolbar}>
                  <Button size="small" onClick={() => runRichCommand("bold")}>
                    Bold
                  </Button>
                  <Button size="small" onClick={() => runRichCommand("italic")}>
                    Italic
                  </Button>
                  <Button size="small" onClick={() => runRichCommand("underline")}>
                    Underline
                  </Button>
                  <Button size="small" onClick={() => runRichCommand("insertUnorderedList")}>
                    Bullet list
                  </Button>
                  <Button size="small" onClick={() => runRichCommand("insertOrderedList")}>
                    Numbered list
                  </Button>
                  <Button size="small" onClick={insertRichLink}>
                    Link
                  </Button>
                  <Button size="small" onClick={() => runRichCommand("removeFormat")}>
                    Clear format
                  </Button>
                </div>
                <div
                  ref={richEditorRef}
                  className={styles.richSurface}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={syncRichBody}
                  onPaste={handleRichPaste}
                  onBlur={syncRichBody}
                  aria-label="Body template rich text editor"
                />
              </>
            ) : null}

            {editorMode === "html" ? (
              <Textarea
                ref={htmlBodyRef}
                value={draft.body_template}
                onChange={(_, data) =>
                  setDraft((prev) => ({ ...prev, body_template: data.value }))
                }
                className={styles.htmlEditor}
                disabled={isSavingTemplate}
              />
            ) : null}

            {editorMode === "preview" ? (
              <div className={styles.htmlPreview}>
                <div className={styles.previewSubject}>
                  <Text size={200} className={styles.helper}>
                    Dataset: {selectedPreviewDataset?.name || "-"}
                  </Text>
                  <Text size={300} weight="semibold">
                    Subject: {previewResult?.rendered_subject || ""}
                  </Text>
                  {previewError ? (
                    <Text size={200} style={{ color: "#b10e1e" }}>
                      {previewError}
                    </Text>
                  ) : null}
                  {previewResult?.macro_resolution ? (
                    <div className={styles.previewWarnings}>
                      {previewResult.macro_resolution.missingRequiredMacros?.length ? (
                        <Text size={200}>
                          Missing required:{" "}
                          {previewResult.macro_resolution.missingRequiredMacros
                            ?.map((key) => `{{${key}}}`)
                            .join(", ")}
                        </Text>
                      ) : null}
                      {previewResult.macro_resolution.unknownMacros?.length ? (
                        <Text size={200}>
                          Unknown:{" "}
                          {previewResult.macro_resolution.unknownMacros
                            ?.map((key) => `{{${key}}}`)
                            .join(", ")}
                        </Text>
                      ) : null}
                      {previewResult.macro_resolution.deprecatedMacros?.length ? (
                        <Text size={200}>
                          Deprecated:{" "}
                          {previewResult.macro_resolution.deprecatedMacros
                            ?.map((key) => `{{${key}}}`)
                            .join(", ")}
                        </Text>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {isLoadingPreview && !previewResult ? (
                  <Spinner label="Rendering preview" />
                ) : (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: previewResult?.rendered_body || "",
                    }}
                  />
                )}
              </div>
            ) : null}

            <div className={styles.templateEditorActions}>
              <Button appearance="primary" onClick={saveTemplate} disabled={isSavingTemplate}>
                {isSavingTemplate ? "Saving..." : "Save"}
              </Button>
              <Button appearance="secondary" onClick={deleteTemplate} disabled={!selectedId}>
                Delete
              </Button>
            </div>

            <div className={styles.versionsBlock}>
              <div className={styles.versionsHeader}>
                <Text weight="semibold">Version history</Text>
                <div className={styles.versionControls}>
                  <Dropdown
                    className={styles.versionDropdown}
                    size="small"
                    selectedOptions={selectedVersionId ? [selectedVersionId] : []}
                    value={
                      selectedVersion
                        ? formatDate(selectedVersion.created_at)
                        : versions.length
                          ? "Select version"
                          : "No versions"
                    }
                    onOptionSelect={(_, data) =>
                      setSelectedVersionId(String(data.optionValue ?? ""))
                    }
                    placeholder="Select version"
                  >
                    {versions.map((version) => (
                      <Option
                        key={version.id}
                        value={version.id}
                        text={formatDate(version.created_at)}
                      >
                        {formatDate(version.created_at)}
                      </Option>
                    ))}
                  </Dropdown>
                  <Button
                    size="small"
                    appearance="secondary"
                    onClick={restoreSelectedVersion}
                    disabled={!selectedVersion}
                  >
                    Restore selected
                  </Button>
                </div>
              </div>
              {selectedVersion ? (
                <div className={styles.diffBlocks}>
                  <div className={styles.diffBlock}>
                    <div className={styles.diffBlockHeader}>
                      <Text size={200} weight="semibold">
                        Subject diff
                      </Text>
                    </div>
                    <div className={styles.diffCode}>
                      {subjectDiffLines.map((line, index) => (
                        <div
                          key={`${line.type}-${index}-${line.text}`}
                          className={
                            line.type === "added"
                              ? styles.diffLineAdded
                              : line.type === "removed"
                                ? styles.diffLineRemoved
                                : styles.diffLineSame
                          }
                        >
                          {line.type === "added"
                            ? "+ "
                            : line.type === "removed"
                              ? "- "
                              : "  "}
                          {line.text || " "}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={styles.diffBlock}>
                    <div className={styles.diffBlockHeader}>
                      <Text size={200} weight="semibold">
                        Body diff
                      </Text>
                    </div>
                    <div className={styles.diffCode}>
                      {bodyDiffLines.map((line, index) => (
                        <div
                          key={`${line.type}-${index}-${line.text}`}
                          className={
                            line.type === "added"
                              ? styles.diffLineAdded
                              : line.type === "removed"
                                ? styles.diffLineRemoved
                                : styles.diffLineSame
                          }
                        >
                          {line.type === "added"
                            ? "+ "
                            : line.type === "removed"
                              ? "- "
                              : "  "}
                          {line.text || " "}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
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
            </div>
          </div>
        </div>
      ) : activeTab === "macros" ? (
        <div className={styles.page}>
          <Card className={styles.card}>
            <Text weight="semibold">Macro settings</Text>
            <Text className={styles.helper}>
              Macros are tokens like <code>{"{{partner_name}}"}</code>. They are detected from subject/body and resolved at send time from the variable payload in Email Send.
            </Text>
            <Text className={styles.helper}>
              This tab shows macro registry metadata plus where each macro is currently used.
            </Text>
            <div className={styles.tableWrap}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Macro</TableHeaderCell>
                    <TableHeaderCell>Label</TableHeaderCell>
                    <TableHeaderCell>Source</TableHeaderCell>
                    <TableHeaderCell>Required</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Used in templates</TableHeaderCell>
                    <TableHeaderCell>Template IDs</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingMacros ? (
                    <TableRow>
                      <TableCell>Loading macros...</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                  ) : null}
                  {macroUsageRows.map((row) => (
                    <TableRow key={row.macro}>
                      <TableCell>{`{{${row.macro}}}`}</TableCell>
                      <TableCell>{row.label || "-"}</TableCell>
                      <TableCell>{row.dataSource || "-"}</TableCell>
                      <TableCell>{row.isRequired ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        {!row.isActive
                          ? "Inactive"
                          : row.isDeprecated
                            ? "Deprecated"
                            : "Active"}
                      </TableCell>
                      <TableCell>{row.count}</TableCell>
                      <TableCell>{row.templates.join(", ") || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {!isLoadingMacros && macroUsageRows.length === 0 ? (
                    <TableRow>
                      <TableCell>No macros found</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>-</TableCell>
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
