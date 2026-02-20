"use client";

import {
  Button,
  Dropdown,
  Field,
  Input,
  MessageBar,
  Option,
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
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LanguageCode = "sv" | "no" | "fi" | "en";

type TemplateLocalization = {
  language_code: LanguageCode;
  subject_template: string;
  body_template: string;
  updated_at?: string | null;
};

type ChatwootTemplate = {
  template_id: string;
  name: string;
  description?: string | null;
  macros: string[];
  updated_at?: string | null;
  localizations: TemplateLocalization[];
};

type TemplateVersion = {
  id: string;
  template_id: string;
  language_code: LanguageCode;
  subject_template: string;
  body_template: string;
  macros: string[];
  created_at: string;
};

type TemplateDraft = {
  template_id: string;
  name: string;
  description: string;
  macros: string[];
  localizations: Record<
    LanguageCode,
    {
      subject_template: string;
      body_template: string;
    }
  >;
  updated_at?: string | null;
};

const DEFAULT_MACROS = [
  "ORDER_NUMBER",
  "TRACKING_NUMBER",
  "TRACKING_LINK",
  "SKU",
  "DATE_OF_PURCHASE",
  "DATE_SHIPPED",
  "SIGNATUR",
  "CUSTOMER_NAME",
  "PARTNER_NAME",
] as const;

const LANGUAGE_OPTIONS: Array<{ code: LanguageCode; label: string }> = [
  { code: "sv", label: "Swedish (Standard)" },
  { code: "no", label: "Norwegian" },
  { code: "fi", label: "Finnish" },
  { code: "en", label: "English" },
];

const emptyLocalizations = (): TemplateDraft["localizations"] => ({
  sv: { subject_template: "", body_template: "" },
  no: { subject_template: "", body_template: "" },
  fi: { subject_template: "", body_template: "" },
  en: { subject_template: "", body_template: "" },
});

const emptyTemplateDraft: TemplateDraft = {
  template_id: "",
  name: "",
  description: "",
  macros: [],
  localizations: emptyLocalizations(),
  updated_at: null,
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
  templateGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 28%) minmax(0, 1fr)",
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },
  templateItemUpdated: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
  },
  handleRow: {
    marginTop: "4px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  handleBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "999px",
    padding: "1px 8px",
    backgroundColor: "#f5f9ff",
    color: "#1f5fbf",
    fontWeight: 600,
    fontSize: tokens.fontSizeBase100,
  },
  handleDot: {
    width: "7px",
    height: "7px",
    borderRadius: "999px",
    backgroundColor: "#1f5fbf",
    display: "inline-block",
  },
  previewText: {
    marginTop: "6px",
    color: tokens.colorNeutralForeground4,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    display: "-webkit-box",
    WebkitLineClamp: "3",
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
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
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    flexWrap: "wrap",
  },
  templateEditorMeta: {
    padding: "12px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: "12px",
  },
  editorTextBlock: {
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  textarea: {
    width: "100%",
    minHeight: "80px",
    resize: "vertical",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "8px",
    padding: "10px 12px",
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  bodyTextarea: {
    minHeight: "360px",
  },
  actions: {
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
  tableWrap: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    overflow: "hidden",
  },
  fullWidth: {
    width: "100%",
  },
  topControls: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "flex-end",
  },
});

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

const templateToDraft = (template: ChatwootTemplate | null): TemplateDraft => {
  if (!template) return { ...emptyTemplateDraft, localizations: emptyLocalizations() };
  const localizations = emptyLocalizations();
  for (const entry of template.localizations || []) {
    if (!entry?.language_code) continue;
    localizations[entry.language_code] = {
      subject_template: String(entry.subject_template ?? ""),
      body_template: String(entry.body_template ?? ""),
    };
  }
  return {
    template_id: String(template.template_id ?? ""),
    name: String(template.name ?? ""),
    description: String(template.description ?? ""),
    macros: Array.isArray(template.macros) ? template.macros.map(String) : [],
    localizations,
    updated_at: template.updated_at ?? null,
  };
};

const buildSidebarPreview = (template: ChatwootTemplate) => {
  const preferred = ["sv", "en", "no", "fi"] as const;
  for (const code of preferred) {
    const found = template.localizations?.find((row) => row.language_code === code);
    if (found?.body_template?.trim()) {
      return found.body_template.trim();
    }
  }
  return "";
};

export default function ChatwootTemplatesPage() {
  const styles = useStyles();
  const [activeTab, setActiveTab] = useState<"templates">("templates");
  const [templates, setTemplates] = useState<ChatwootTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>("sv");
  const [templateSearch, setTemplateSearch] = useState("");
  const [draft, setDraft] = useState<TemplateDraft>({ ...emptyTemplateDraft, localizations: emptyLocalizations() });
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [macroToInsert, setMacroToInsert] = useState<string>("");
  const [message, setMessage] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(
    null
  );
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const subjectRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.template_id === selectedId) ?? null,
    [templates, selectedId]
  );

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((item) => {
      const preview = buildSidebarPreview(item);
      const haystack = [
        item.name,
        item.template_id,
        item.description,
        preview,
        (item.macros || []).join(" "),
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join("\n");
      return haystack.includes(q);
    });
  }, [templateSearch, templates]);

  const localizedDraft = draft.localizations[selectedLanguage] || {
    subject_template: "",
    body_template: "",
  };

  const availableMacros = useMemo(() => {
    return Array.from(
      new Set([...DEFAULT_MACROS, ...(draft.macros || [])])
    ).sort((a, b) => a.localeCompare(b));
  }, [draft.macros]);

  const loadTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const response = await fetch("/api/email/chatwoot/templates");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load Chatwoot templates.");
      }
      const next = Array.isArray(payload.templates)
        ? (payload.templates as ChatwootTemplate[])
        : [];
      setTemplates(next);
      setSelectedId((prev) => {
        if (prev && next.some((item) => item.template_id === prev)) return prev;
        return next[0]?.template_id || "";
      });
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setIsLoadingTemplates(false);
    }
  }, []);

  const loadVersions = useCallback(
    async (templateId: string, language: LanguageCode) => {
      if (!templateId) {
        setVersions([]);
        setSelectedVersionId("");
        return;
      }
      try {
        const response = await fetch(
          `/api/email/chatwoot/templates/versions?template_id=${encodeURIComponent(
            templateId
          )}&language_code=${encodeURIComponent(language)}`
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load version history.");
        }
        const next = Array.isArray(payload.versions)
          ? (payload.versions as TemplateVersion[])
          : [];
        setVersions(next);
        setSelectedVersionId(next[0]?.id || "");
      } catch {
        setVersions([]);
        setSelectedVersionId("");
      }
    },
    []
  );

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    setDraft(templateToDraft(selectedTemplate));
  }, [selectedTemplate]);

  useEffect(() => {
    if (!selectedId) return;
    loadVersions(selectedId, selectedLanguage);
  }, [loadVersions, selectedId, selectedLanguage]);

  const insertMacroIntoField = (field: "subject" | "body", macro: string) => {
    const token = `[${macro}]`;
    const ref = field === "subject" ? subjectRef.current : bodyRef.current;
    const key = field === "subject" ? "subject_template" : "body_template";
    const current = String(draft.localizations[selectedLanguage]?.[key] ?? "");

    if (!ref) {
      setDraft((prev) => ({
        ...prev,
        macros: Array.from(new Set([...(prev.macros || []), macro])),
        localizations: {
          ...prev.localizations,
          [selectedLanguage]: {
            ...prev.localizations[selectedLanguage],
            [key]: `${current}${token}`,
          },
        },
      }));
      return;
    }

    const start = Number.isFinite(ref.selectionStart) ? ref.selectionStart : current.length;
    const end = Number.isFinite(ref.selectionEnd) ? ref.selectionEnd : current.length;
    const nextValue = `${current.slice(0, start)}${token}${current.slice(end)}`;

    setDraft((prev) => ({
      ...prev,
      macros: Array.from(new Set([...(prev.macros || []), macro])),
      localizations: {
        ...prev.localizations,
        [selectedLanguage]: {
          ...prev.localizations[selectedLanguage],
          [key]: nextValue,
        },
      },
    }));

    requestAnimationFrame(() => {
      ref.focus();
      const nextCursor = start + token.length;
      ref.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleInsertMacro = () => {
    if (!macroToInsert) return;
    insertMacroIntoField(activeField, macroToInsert);
  };

  const handleSubjectChange = (value: string) => {
    setDraft((prev) => ({
      ...prev,
      localizations: {
        ...prev.localizations,
        [selectedLanguage]: {
          ...prev.localizations[selectedLanguage],
          subject_template: value,
        },
      },
    }));
  };

  const handleBodyChange = (value: string) => {
    setDraft((prev) => ({
      ...prev,
      localizations: {
        ...prev.localizations,
        [selectedLanguage]: {
          ...prev.localizations[selectedLanguage],
          body_template: value,
        },
      },
    }));
  };

  const createNewTemplateDraft = () => {
    setSelectedId("");
    setSelectedLanguage("sv");
    setVersions([]);
    setSelectedVersionId("");
    setDraft({
      template_id: "new_chatwoot_template",
      name: "New Chatwoot template",
      description: "",
      macros: [...DEFAULT_MACROS],
      localizations: emptyLocalizations(),
      updated_at: null,
    });
  };

  const saveTemplate = async () => {
    setIsSavingTemplate(true);
    setMessage(null);

    try {
      const payload = {
        template_id: draft.template_id,
        name: draft.name,
        description: draft.description,
        macros: draft.macros,
        language_code: selectedLanguage,
        subject_template: String(localizedDraft.subject_template ?? ""),
        body_template: String(localizedDraft.body_template ?? ""),
        auto_translate: selectedLanguage === "sv",
      };

      const isNew = !selectedId;
      const response = await fetch(
        isNew
          ? "/api/email/chatwoot/templates"
          : `/api/email/chatwoot/templates/${encodeURIComponent(selectedId)}`,
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

      const savedTemplateId = String(
        result?.template?.template_id || draft.template_id || selectedId
      );
      await loadTemplates();
      setSelectedId(savedTemplateId);

      if (result?.template) {
        setDraft(templateToDraft(result.template as ChatwootTemplate));
      }
      await loadVersions(savedTemplateId, selectedLanguage);

      if (result?.warning) {
        setMessage({
          type: "warning",
          text: `Template saved. ${String(result.warning)}`,
        });
      } else {
        setMessage({ type: "success", text: "Template saved." });
      }
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
        `/api/email/chatwoot/templates/${encodeURIComponent(selectedId)}`,
        { method: "DELETE" }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Unable to delete template.");
      }

      const remaining = templates.filter((item) => item.template_id !== selectedId);
      setTemplates(remaining);
      setSelectedId(remaining[0]?.template_id || "");
      setDraft(templateToDraft(remaining[0] ?? null));
      setVersions([]);
      setSelectedVersionId("");
      setMessage({ type: "success", text: "Template deleted." });
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    }
  };

  const loadSelectedVersion = () => {
    const selectedVersion = versions.find((item) => item.id === selectedVersionId);
    if (!selectedVersion) return;
    setDraft((prev) => ({
      ...prev,
      macros: Array.from(new Set([...(prev.macros || []), ...(selectedVersion.macros || [])])),
      localizations: {
        ...prev.localizations,
        [selectedLanguage]: {
          subject_template: String(selectedVersion.subject_template ?? ""),
          body_template: String(selectedVersion.body_template ?? ""),
        },
      },
    }));
    setMessage({
      type: "success",
      text: `Loaded version from ${formatDate(selectedVersion.created_at)}.`,
    });
  };

  return (
    <div className={styles.page}>
      <Text size={700} weight="semibold">
        Chatwoot settings
      </Text>
      <Text className={styles.helper}>
        Manage Chatwoot canned responses in one place with language variants, macro insertion, and version history.
      </Text>

      {message ? <MessageBar intent={message.type}>{message.text}</MessageBar> : null}

      <TabList
        selectedValue={activeTab}
        onTabSelect={(_, data) => setActiveTab(String(data.value) as "templates")}
      >
        <Tab value="templates">Templates</Tab>
      </TabList>

      <div className={styles.templateGrid}>
        <div className={styles.templateSidebar}>
          <div className={styles.templateSidebarHeader}>
            <div className={styles.templateSidebarHeaderRow}>
              <Text weight="semibold">Chatwoot templates</Text>
              <Text size={200} className={styles.helper}>
                {templates.length}
              </Text>
            </div>
            <Input
              value={templateSearch}
              onChange={(_, data) => setTemplateSearch(data.value)}
              placeholder="Search templates"
              size="small"
              className={styles.fullWidth}
            />
          </div>

          {isLoadingTemplates ? <Spinner label="Loading templates" /> : null}

          <div className={styles.templateList}>
            {filteredTemplates.map((item) => {
              const active = item.template_id === selectedId;
              const preview = buildSidebarPreview(item);

              return (
                <button
                  key={item.template_id}
                  type="button"
                  className={mergeClasses(styles.templateItem, active ? styles.templateItemActive : undefined)}
                  onClick={() => setSelectedId(item.template_id)}
                >
                  <div className={styles.templateItemTopRow}>
                    <Text weight="semibold">{item.name || item.template_id}</Text>
                    <span className={styles.templateItemUpdated}>{formatDate(item.updated_at)}</span>
                  </div>
                  <div className={styles.handleRow}>
                    <span className={styles.handleBadge}>
                      <span className={styles.handleDot} />
                      {item.template_id}
                    </span>
                  </div>
                  <div className={styles.previewText}>{preview || "No content yet."}</div>
                </button>
              );
            })}

            {!isLoadingTemplates && filteredTemplates.length === 0 ? (
              <div className={styles.templateSidebarHeader}>
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
            <div>
              <Text weight="semibold">{draft.name || "New template"}</Text>
              <Text size={200} className={styles.helper}>
                {draft.template_id || "template_handle"}
              </Text>
              <Text size={200} className={styles.helper}>
                Last updated: {formatDate(draft.updated_at)}
              </Text>
            </div>

            <div className={styles.topControls}>
              <Field label="Language">
                <Dropdown
                  selectedOptions={[selectedLanguage]}
                  value={LANGUAGE_OPTIONS.find((item) => item.code === selectedLanguage)?.label}
                  onOptionSelect={(_, data) =>
                    setSelectedLanguage((data.optionValue as LanguageCode) || "sv")
                  }
                >
                  {LANGUAGE_OPTIONS.map((item) => (
                    <Option key={item.code} value={item.code} text={item.label}>
                      {item.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label="Version">
                <Dropdown
                  selectedOptions={selectedVersionId ? [selectedVersionId] : []}
                  value={
                    selectedVersionId
                      ? formatDate(versions.find((item) => item.id === selectedVersionId)?.created_at)
                      : "Latest"
                  }
                  onOptionSelect={(_, data) => setSelectedVersionId(String(data.optionValue ?? ""))}
                >
                  {versions.map((version) => {
                    const label = formatDate(version.created_at);
                    return (
                      <Option key={version.id} value={version.id} text={label}>
                        {label}
                      </Option>
                    );
                  })}
                </Dropdown>
              </Field>
              <Field label="Macro">
                <Dropdown
                  selectedOptions={macroToInsert ? [macroToInsert] : []}
                  value={macroToInsert ? `[${macroToInsert}]` : "Select macro"}
                  onOptionSelect={(_, data) => setMacroToInsert(String(data.optionValue ?? ""))}
                >
                  {availableMacros.map((macro) => (
                    <Option key={macro} value={macro} text={`[${macro}]`}>
                      [{macro}]
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Button appearance="secondary" onClick={handleInsertMacro} disabled={!macroToInsert}>
                Insert macro
              </Button>
              <Button appearance="subtle" onClick={loadSelectedVersion} disabled={!selectedVersionId}>
                Load version
              </Button>
            </div>
          </div>

          <div className={styles.templateEditorMeta}>
            <Field label="Template handle">
              <Input
                value={draft.template_id}
                onChange={(_, data) =>
                  setDraft((prev) => ({ ...prev, template_id: data.value }))
                }
                placeholder="tracking_status_update"
                className={styles.fullWidth}
                size="small"
              />
            </Field>
            <Field label="Readable title">
              <Input
                value={draft.name}
                onChange={(_, data) => setDraft((prev) => ({ ...prev, name: data.value }))}
                placeholder="Tracking status update"
                className={styles.fullWidth}
                size="small"
              />
            </Field>
            <Field label="Description">
              <Input
                value={draft.description}
                onChange={(_, data) => setDraft((prev) => ({ ...prev, description: data.value }))}
                placeholder="When customer asks where the package is."
                className={styles.fullWidth}
                size="small"
              />
            </Field>
            <Field label="Detected macros">
              <Input value={(draft.macros || []).map((item) => `[${item}]`).join(", ")} readOnly size="small" />
            </Field>
          </div>

          <div className={styles.editorTextBlock}>
            <Field label="Subject">
              <textarea
                ref={subjectRef}
                className={styles.textarea}
                value={localizedDraft.subject_template}
                onFocus={() => setActiveField("subject")}
                onChange={(event) => handleSubjectChange(event.target.value)}
              />
            </Field>
            <Field label="Body">
              <textarea
                ref={bodyRef}
                className={mergeClasses(styles.textarea, styles.bodyTextarea)}
                value={localizedDraft.body_template}
                onFocus={() => setActiveField("body")}
                onChange={(event) => handleBodyChange(event.target.value)}
              />
            </Field>
            <Text size={200} className={styles.helper}>
              Saving Swedish automatically triggers GPT-5.2 translation to Norwegian, Finnish, and English.
            </Text>
          </div>

          <div className={styles.actions}>
            <Button appearance="primary" onClick={saveTemplate} disabled={isSavingTemplate}>
              {isSavingTemplate ? "Saving..." : "Save"}
            </Button>
            <Button appearance="secondary" onClick={deleteTemplate} disabled={!selectedId}>
              Delete
            </Button>
          </div>

          <div className={styles.versionsBlock}>
            <Text weight="semibold">Version history ({selectedLanguage.toUpperCase()})</Text>
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
                      <TableCell>{(version.macros || []).map((item) => `[${item}]`).join(", ") || "-"}</TableCell>
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
    </div>
  );
}
