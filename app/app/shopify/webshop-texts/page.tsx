"use client";

import {
  Button,
  Card,
  Dropdown,
  Field,
  Input,
  MessageBar,
  Option,
  Spinner,
  Tab,
  TabList,
  Text,
  Textarea,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

type StoreInfo = {
  code: string;
  name?: string;
  domain?: string;
};

type TextItem = {
  id: string;
  assetKey: string;
  jsonPointer: string;
  scope: "global" | "section" | "block";
  sectionId?: string;
  sectionType?: string;
  blockId?: string;
  blockType?: string;
  settingId: string;
  settingType: string;
  label?: string;
  info?: string;
  value: string;
};

type WebshopTextsResponse = {
  stores: StoreInfo[];
  store: {
    code: string;
    overrides: Record<string, string>;
  };
  base: {
    items: TextItem[];
    items_count: number;
  };
};

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
  helperText: {
    color: tokens.colorNeutralForeground3,
  },
  card: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  controlsRow: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-end",
    flexWrap: "wrap",
  },
  dropdown: {
    minWidth: "220px",
  },
  search: {
    minWidth: "260px",
    flex: 1,
  },
  list: {
    display: "grid",
    gap: "16px",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    alignItems: "start",
  },
  itemCard: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "12px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  itemHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
  },
  titleRow: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  meta: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    wordBreak: "break-word",
  },
  badgeRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  badge: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    padding: "2px 8px",
    borderRadius: "999px",
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
  textarea: {
    minHeight: "110px",
  },
  actionRow: {
    display: "flex",
    gap: "10px",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
  },
  smallRight: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  saveRow: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
  },
});

const stableStringify = (obj: Record<string, string>) =>
  JSON.stringify(
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
  );

const getPayloadError = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  return typeof record.error === "string" ? record.error : null;
};

export default function WebshopTextsPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [storeCode, setStoreCode] = useState("wellando");
  const [activeTab, setActiveTab] = useState<"base" | "overrides">("base");
  const [assetFilter, setAssetFilter] = useState<string>("__all__");
  const [items, setItems] = useState<TextItem[]>([]);
  const [baseValues, setBaseValues] = useState<Record<string, string>>({});
  const [storeOverrides, setStoreOverrides] = useState<Record<string, string>>({});
  const [origBaseValues, setOrigBaseValues] = useState<Record<string, string>>({});
  const [origStoreOverrides, setOrigStoreOverrides] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = async (nextStore: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/shopify/webshop-texts?store=${encodeURIComponent(nextStore)}`);
      const raw = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(getPayloadError(raw) || t("shopify.webshopTexts.error"));
      }
      const payload = raw as WebshopTextsResponse | null;
      if (!payload) throw new Error(t("shopify.webshopTexts.error"));

      setStores(payload.stores ?? []);
      setStoreCode(payload.store?.code ?? nextStore);
      setItems(payload.base?.items ?? []);
      setAssetFilter("__all__");

      const nextBaseValues: Record<string, string> = {};
      for (const item of payload.base?.items ?? []) {
        nextBaseValues[item.id] = item.value ?? "";
      }
      const nextOverrides: Record<string, string> = payload.store?.overrides ?? {};

      setBaseValues(nextBaseValues);
      setStoreOverrides(nextOverrides);
      setOrigBaseValues(nextBaseValues);
      setOrigStoreOverrides(nextOverrides);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const assets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.assetKey, (counts.get(item.assetKey) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([assetKey, count]) => ({ assetKey, count }));
  }, [items]);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      await load(storeCode);
      if (!active) return;
    };
    boot();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = assetFilter === "__all__" ? items : items.filter((i) => i.assetKey === assetFilter);
    if (!q) return base;
    return base.filter((item) => {
      const hay = [
        item.label,
        item.info,
        item.settingId,
        item.sectionType,
        item.blockType,
        item.assetKey,
        baseValues[item.id],
        storeOverrides[item.id],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, baseValues, storeOverrides, assetFilter]);

  const overrideItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const scoped = assetFilter === "__all__" ? items : items.filter((i) => i.assetKey === assetFilter);
    const rows = scoped.filter((item) => Object.prototype.hasOwnProperty.call(storeOverrides, item.id));
    if (!q) return rows;
    return rows.filter((item) => {
      const hay = [
        item.label,
        item.info,
        item.settingId,
        item.sectionType,
        item.blockType,
        item.assetKey,
        storeOverrides[item.id],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, storeOverrides, assetFilter]);

  const removeFromBase = (id: string) => {
    if (Object.prototype.hasOwnProperty.call(storeOverrides, id)) return;
    setStoreOverrides((prev) => ({ ...prev, [id]: baseValues[id] ?? "" }));
    setActiveTab("overrides");
  };

  const returnToBase = (id: string) => {
    setStoreOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updateBaseValue = (id: string, value: string) => {
    setBaseValues((prev) => ({ ...prev, [id]: value }));
  };

  const updateOverrideValue = (id: string, value: string) => {
    setStoreOverrides((prev) => ({ ...prev, [id]: value }));
  };

  const hasChanges = useMemo(() => {
    const baseChanged = Object.entries(baseValues).some(
      ([id, value]) => (origBaseValues[id] ?? "") !== value
    );
    const overridesChanged = stableStringify(storeOverrides) !== stableStringify(origStoreOverrides);
    return baseChanged || overridesChanged;
  }, [baseValues, origBaseValues, storeOverrides, origStoreOverrides]);

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(false);
    if (!hasChanges) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      return;
    }

    const baseEdits: Record<string, string> = {};
    for (const [id, value] of Object.entries(baseValues)) {
      const prev = origBaseValues[id] ?? "";
      if (value !== prev) baseEdits[id] = value;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/shopify/webshop-texts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_code: storeCode,
          base_edits: baseEdits,
          store_overrides: storeOverrides,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || t("shopify.webshopTexts.saveError"));
      }
      setOrigBaseValues(baseValues);
      setOrigStoreOverrides(storeOverrides);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const activeList = activeTab === "base" ? filteredItems : overrideItems;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text size={700} weight="semibold">
          {t("shopify.webshopTexts.title")}
        </Text>
        <Text size={200} className={styles.helperText}>
          {t("shopify.webshopTexts.helper")}
        </Text>
      </div>

      <Card className={styles.card}>
        <div className={styles.controlsRow}>
          <Field label={t("shopify.webshopTexts.storeLabel")}>
            <Dropdown
              className={styles.dropdown}
              selectedOptions={[storeCode]}
              value={
                stores.find((s) => s.code === storeCode)?.name
                  ? `${stores.find((s) => s.code === storeCode)?.name} (${storeCode})`
                  : storeCode
              }
              onOptionSelect={(_, data) => {
                const next = String(data.optionValue ?? "");
                if (!next || next === storeCode) return;
                load(next);
              }}
            >
              {stores.map((store) => (
                <Option key={store.code} value={store.code}>
                  {store.name ? `${store.name} (${store.code})` : store.code}
                </Option>
              ))}
            </Dropdown>
          </Field>

          <Field label={t("shopify.webshopTexts.assetLabel")}>
            <Dropdown
              className={styles.dropdown}
              selectedOptions={[assetFilter]}
              value={
                assetFilter === "__all__"
                  ? t("shopify.webshopTexts.assetAll")
                  : assetFilter
              }
              onOptionSelect={(_, data) => {
                const next = String(data.optionValue ?? "");
                if (!next || next === assetFilter) return;
                setAssetFilter(next);
              }}
            >
              <Option
                value="__all__"
                text={`${t("shopify.webshopTexts.assetAll")} (${items.length})`}
              >
                {t("shopify.webshopTexts.assetAll")} ({items.length})
              </Option>
              {assets.map((asset) => (
                <Option
                  key={asset.assetKey}
                  value={asset.assetKey}
                  text={`${asset.assetKey} (${asset.count})`}
                >
                  {asset.assetKey} ({asset.count})
                </Option>
              ))}
            </Dropdown>
          </Field>

          <Field label={t("shopify.webshopTexts.searchLabel")} className={styles.search}>
            <Input
              value={search}
              onChange={(_, data) => setSearch(data.value)}
              placeholder={t("shopify.webshopTexts.searchPlaceholder")}
            />
          </Field>

          <TabList
            selectedValue={activeTab}
            onTabSelect={(_, data) => {
              if (data.value) setActiveTab(String(data.value) as "base" | "overrides");
            }}
          >
            <Tab value="base">{t("shopify.webshopTexts.tabs.base")}</Tab>
            <Tab value="overrides">{t("shopify.webshopTexts.tabs.overrides")}</Tab>
          </TabList>
        </div>

        {error ? <MessageBar>{error}</MessageBar> : null}
        {loading ? <Spinner label={t("shopify.webshopTexts.loading")} /> : null}

        {!loading && !error ? (
          <div className={styles.list}>
            {activeList.map((item) => {
              const isOverridden = Object.prototype.hasOwnProperty.call(storeOverrides, item.id);
              const baseValue = baseValues[item.id] ?? "";
              const overrideValue = storeOverrides[item.id] ?? "";
              const shownValue = activeTab === "base" ? baseValue : overrideValue;

              const title = item.label || item.settingId;
              const subtitle = item.info || `${item.assetKey} ${item.jsonPointer}`;

              return (
                <div key={item.id} className={styles.itemCard}>
                  <div className={styles.itemHeader}>
                    <div className={styles.titleRow}>
                      <Text weight="semibold">{title}</Text>
                      <Text className={styles.meta}>{subtitle}</Text>
                      <div className={styles.badgeRow}>
                        <span className={styles.badge}>{item.scope}</span>
                        <span className={styles.badge}>{item.settingType}</span>
                        {item.sectionType ? (
                          <span className={styles.badge}>{item.sectionType}</span>
                        ) : null}
                        {item.blockType ? (
                          <span className={styles.badge}>{item.blockType}</span>
                        ) : null}
                        {isOverridden ? (
                          <span className={styles.badge}>
                            {t("shopify.webshopTexts.overriddenBadge")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <Text size={200} className={styles.smallRight}>
                      {item.id}
                    </Text>
                  </div>

                  <Textarea
                    className={styles.textarea}
                    value={shownValue}
                    onChange={(_, data) => {
                      if (activeTab === "base") updateBaseValue(item.id, data.value);
                      else updateOverrideValue(item.id, data.value);
                    }}
                  />

                  <div className={styles.actionRow}>
                    {activeTab === "base" ? (
                      <Tooltip
                        content={
                          isOverridden
                            ? t("shopify.webshopTexts.removeFromBaseDisabled")
                            : t("shopify.webshopTexts.removeFromBaseHint")
                        }
                        relationship="label"
                      >
                        <span>
                          <Button
                            size="small"
                            appearance="outline"
                            disabled={isOverridden || saving}
                            onClick={() => removeFromBase(item.id)}
                          >
                            {t("shopify.webshopTexts.removeFromBase")}
                          </Button>
                        </span>
                      </Tooltip>
                    ) : (
                      <Button
                        size="small"
                        appearance="outline"
                        disabled={saving}
                        onClick={() => returnToBase(item.id)}
                      >
                        {t("shopify.webshopTexts.returnToBase")}
                      </Button>
                    )}

                    <Text className={styles.meta}>
                      {item.assetKey}
                      {item.sectionId ? ` · ${item.sectionId}` : ""}
                      {item.blockId ? ` · ${item.blockId}` : ""}
                    </Text>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {saveError ? <MessageBar>{saveError}</MessageBar> : null}
        {saveSuccess ? <MessageBar>{t("shopify.webshopTexts.saveSuccess")}</MessageBar> : null}

        <div className={styles.saveRow}>
          <Button appearance="primary" onClick={handleSave} disabled={loading || saving}>
            {saving ? t("shopify.webshopTexts.saving") : t("common.save")}
          </Button>
          {!hasChanges ? (
            <Text size={200} className={styles.helperText}>
              {t("shopify.webshopTexts.noChanges")}
            </Text>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
