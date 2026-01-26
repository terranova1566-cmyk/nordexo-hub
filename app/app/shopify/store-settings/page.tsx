"use client";

import {
  Button,
  Card,
  Field,
  Input,
  MessageBar,
  Spinner,
  Tab,
  TabList,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

const COLOR_KEYS = [
  "color_body_bg",
  "color_body",
  "color_heading",
  "color_accent",
  "color_overlay",
  "color_announcement_bar_text",
  "color_announcement_bar_bg",
  "color_header_bg",
  "color_header_text",
  "color_price",
  "color_price_discounted",
  "color_footer_text",
  "color_footer_bg",
];

const isValidHex = (value: string) =>
  /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value);

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  tabRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  card: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  helperText: {
    color: tokens.colorNeutralForeground3,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "16px",
  },
  colorRow: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  colorInputs: {
    display: "grid",
    gridTemplateColumns: "56px 1fr",
    gap: "10px",
    alignItems: "center",
  },
  colorPicker: {
    width: "56px",
    height: "36px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "8px",
    backgroundColor: "transparent",
    padding: 0,
  },
  saveRow: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
  },
  sectionTabs: {
    marginTop: "8px",
  },
  overrideList: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  overrideCard: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "12px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  overrideHeader: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
    justifyContent: "space-between",
  },
  overrideLabelRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  linkedBadge: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    padding: "2px 8px",
    borderRadius: "999px",
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
  overrideInputs: {
    display: "grid",
    gridTemplateColumns: "28px 56px 1fr",
    gap: "10px",
    alignItems: "center",
  },
  overrideSwatch: {
    width: "20px",
    height: "20px",
    borderRadius: "6px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  sourceDetails: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: "10px",
  },
  sourceSummary: {
    cursor: "pointer",
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
  },
  sourceGrid: {
    display: "grid",
    gridTemplateColumns: "140px 1fr",
    columnGap: "12px",
    rowGap: "6px",
    marginTop: "8px",
  },
  sourceLabel: {
    color: tokens.colorNeutralForeground3,
  },
  sourceValue: {
    color: tokens.colorNeutralForeground1,
    wordBreak: "break-word",
  },
  sourceCode: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    backgroundColor: tokens.colorNeutralBackground2,
    padding: "6px 8px",
    borderRadius: "6px",
  },
});

type StoreSettingsResponse = {
  colors: Record<string, string>;
  custom_color_overrides?: CustomColorOverride[];
  store?: {
    code?: string;
    name?: string;
    domain?: string;
  } | null;
};

type CustomColorOverride = {
  id: string;
  label: string;
  value: string;
  source_type: string;
  source_file: string;
  source_line: number | null;
  selector: string;
  source_line_text: string;
  other_refs: string[];
  csv_key: string;
  notes: string;
};

export default function StoreSettingsPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [colors, setColors] = useState<Record<string, string>>({});
  const [storeName, setStoreName] = useState<string | null>(null);
  const [storeCode, setStoreCode] = useState<string>("tingelo");
  const [activeTab, setActiveTab] = useState<string>("tingelo");
  const [activeSection, setActiveSection] = useState<string>("colors");
  const [overrides, setOverrides] = useState<CustomColorOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/shopify/store-settings");
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            payload?.error || t("shopify.storeSettings.error")
          );
        }
        const payload = (await response.json()) as StoreSettingsResponse;
        if (!active) return;
        setColors(payload.colors ?? {});
        setOverrides(
          Array.isArray(payload.custom_color_overrides)
            ? payload.custom_color_overrides
            : []
        );
        setStoreName(payload.store?.name ?? null);
        if (payload.store?.code) {
          setStoreCode(payload.store.code);
          setActiveTab(payload.store.code);
        }
      } catch (err) {
        if (!active) return;
        setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [t]);

  const colorEntries = useMemo(
    () => COLOR_KEYS.map((key) => [key, colors[key] ?? ""]),
    [colors]
  );

  const handleColorChange = (key: string, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(false);
    const invalidKey = colorEntries.find(([_, value]) => !isValidHex(value));
    if (invalidKey) {
      setSaveError(
        t("shopify.storeSettings.invalidColor", { key: invalidKey[0] })
      );
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/shopify/store-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colors, custom_color_overrides: overrides }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || t("shopify.storeSettings.saveError"));
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateOverrideValue = (id: string, value: string) => {
    setOverrides((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, value } : entry))
    );
  };

  const hasBaseColorNote = (notes: string) =>
    notes.toLowerCase().includes("base color");

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text size={700} weight="semibold">
          {t("shopify.storeSettings.title")}
        </Text>
        <Text size={200} className={styles.helperText}>
          {t("shopify.storeSettings.helper")}
        </Text>
      </div>

      <Card className={styles.card}>
        <Text weight="semibold">
          {t("shopify.storeSettings.sectionTitle")}
        </Text>
        <div className={styles.tabRow}>
          <TabList
            selectedValue={activeTab}
            onTabSelect={(_, data) => {
              if (data.value) setActiveTab(String(data.value));
            }}
          >
            <Tab value={storeCode}>{storeName ?? "Tingelo"}</Tab>
          </TabList>
        </div>
        <div className={styles.sectionTabs}>
          <TabList
            selectedValue={activeSection}
            onTabSelect={(_, data) => {
              if (data.value) setActiveSection(String(data.value));
            }}
          >
            <Tab value="colors">{t("shopify.storeSettings.tabs.colors")}</Tab>
            <Tab value="overrides">
              {t("shopify.storeSettings.tabs.overrides")}
            </Tab>
          </TabList>
        </div>
        {activeTab === storeCode ? (
          <>
            {error ? <MessageBar>{error}</MessageBar> : null}
            {loading ? (
              <Spinner label={t("shopify.storeSettings.loading")} />
            ) : null}

            {!loading && !error && activeSection === "colors" ? (
              <div className={styles.colorRow}>
                <Text weight="semibold">
                  {t("shopify.storeSettings.colorsTitle")}
                </Text>
                <div className={styles.grid}>
                  {colorEntries.map(([key, value]) => {
                    const pickerValue = isValidHex(value) ? value : "#000000";
                    return (
                      <div key={key} className={styles.colorRow}>
                        <Field label={key}>
                          <div className={styles.colorInputs}>
                            <input
                              type="color"
                              className={styles.colorPicker}
                              value={pickerValue}
                              onChange={(event) =>
                                handleColorChange(key, event.target.value)
                              }
                              aria-label={key}
                            />
                            <Input
                              value={value}
                              onChange={(_, data) =>
                                handleColorChange(key, data.value)
                              }
                              placeholder="#000000"
                            />
                          </div>
                        </Field>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {!loading && !error && activeSection === "overrides" ? (
              <div className={styles.overrideList}>
                {overrides.map((entry) => {
                  const pickerValue = isValidHex(entry.value)
                    ? entry.value
                    : "#000000";
                  return (
                    <div key={entry.id} className={styles.overrideCard}>
                      <div className={styles.overrideHeader}>
                        <div className={styles.overrideLabelRow}>
                          <Text weight="semibold">{entry.label}</Text>
                          {hasBaseColorNote(entry.notes) ? (
                            <span className={styles.linkedBadge}>
                              {t("shopify.storeSettings.linkedBadge")}
                            </span>
                          ) : null}
                        </div>
                        <Text size={200} className={styles.helperText}>
                          {entry.id}
                        </Text>
                      </div>
                      <div className={styles.overrideInputs}>
                        <span
                          className={styles.overrideSwatch}
                          style={{ backgroundColor: entry.value || "transparent" }}
                        />
                        <input
                          type="color"
                          className={styles.colorPicker}
                          value={pickerValue}
                          onChange={(event) =>
                            updateOverrideValue(entry.id, event.target.value)
                          }
                          aria-label={entry.label}
                        />
                        <Input
                          value={entry.value}
                          onChange={(_, data) =>
                            updateOverrideValue(entry.id, data.value)
                          }
                          placeholder="#000000"
                        />
                      </div>
                      <details className={styles.sourceDetails}>
                        <summary className={styles.sourceSummary}>
                          {t("shopify.storeSettings.sourceTitle")}
                        </summary>
                        <div className={styles.sourceGrid}>
                          <div className={styles.sourceLabel}>
                            {t("shopify.storeSettings.source.type")}
                          </div>
                          <div className={styles.sourceValue}>
                            {entry.source_type || "-"}
                          </div>
                          <div className={styles.sourceLabel}>
                            {t("shopify.storeSettings.source.file")}
                          </div>
                          <div className={styles.sourceValue}>
                            {entry.source_file || "-"}{" "}
                            {entry.source_line ? `:${entry.source_line}` : ""}
                          </div>
                          <div className={styles.sourceLabel}>
                            {t("shopify.storeSettings.source.selector")}
                          </div>
                          <div className={styles.sourceValue}>
                            {entry.selector || "-"}
                          </div>
                          <div className={styles.sourceLabel}>
                            {t("shopify.storeSettings.source.lineText")}
                          </div>
                          <div className={styles.sourceValue}>
                            {entry.source_line_text ? (
                              <div className={styles.sourceCode}>
                                {entry.source_line_text}
                              </div>
                            ) : (
                              "-"
                            )}
                          </div>
                          <div className={styles.sourceLabel}>
                            {t("shopify.storeSettings.source.otherRefs")}
                          </div>
                          <div className={styles.sourceValue}>
                            {entry.other_refs?.length
                              ? entry.other_refs.join(", ")
                              : "-"}
                          </div>
                          <div className={styles.sourceLabel}>
                            {t("shopify.storeSettings.source.csvKey")}
                          </div>
                          <div className={styles.sourceValue}>
                            {entry.csv_key || "-"}
                          </div>
                          <div className={styles.sourceLabel}>
                            {t("shopify.storeSettings.source.notes")}
                          </div>
                          <div className={styles.sourceValue}>
                            {entry.notes || "-"}
                          </div>
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {saveError ? <MessageBar>{saveError}</MessageBar> : null}
            {saveSuccess ? (
              <MessageBar>{t("shopify.storeSettings.saveSuccess")}</MessageBar>
            ) : null}

            <div className={styles.saveRow}>
              <Button
                appearance="primary"
                onClick={handleSave}
                disabled={loading || saving}
              >
                {saving ? t("shopify.storeSettings.saving") : t("common.save")}
              </Button>
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
