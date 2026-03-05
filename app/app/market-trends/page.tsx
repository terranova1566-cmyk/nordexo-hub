"use client";

import {
  Badge,
  Body1Strong,
  Button,
  Card,
  Dropdown,
  Field,
  Option,
  Spinner,
  Text,
  Title2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowClockwise24Regular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

type VectorSnapshot = {
  id: string;
  snapshot_date: string;
  total_items: number;
  source_counts: Record<string, number>;
  generation_meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type VectorItem = {
  rank: number;
  source: string;
  source_scrape_date: string | null;
  product_id: string;
  title: string;
  product_url: string | null;
  image_url: string | null;
  price: number | null;
  currency: string | null;
  sales_total: number | null;
  delta_1d: number | null;
  delta_7d: number | null;
  baseline_7d: number | null;
  spike_ratio: number | null;
  signal_score: number | null;
  is_new_release: boolean;
  is_resurgence: boolean;
  taxonomy_path: string | null;
  meta?: Record<string, unknown>;
};

type TrendCategory = {
  name: string;
  signal_strength: number;
  item_count: number;
  why: string;
};

type TrendSectionItem = {
  source: string;
  product_id: string;
  title: string;
  delta_1d: number;
  price: number | null;
  currency: string | null;
  url: string | null;
};

type TrendSection = {
  name: string;
  description: string;
  items: TrendSectionItem[];
};

type VectorReportJson = {
  daily_summary?: string;
  market_temperature?: "cold" | "warm" | "hot" | "very_hot";
  top_categories?: TrendCategory[];
  trend_sections?: TrendSection[];
  hottest_products?: Array<{
    source: string;
    product_id: string;
    title: string;
    delta_1d: number;
    delta_7d?: number;
    sales_total?: number;
    price?: number;
    currency?: string;
    reason?: string;
    url?: string | null;
  }>;
  sourcing_focus?: string[];
  notable_signals?: string[];
};

type VectorReport = {
  snapshot_id: string;
  model: string | null;
  summary_markdown: string | null;
  report_json: VectorReportJson | null;
  hottest_top10: unknown[] | null;
  categories: unknown[] | null;
  created_at: string;
  updated_at: string;
};

type SourceStat = {
  source: string;
  items: number;
  total_delta_1d: number;
  avg_score: number;
};

type LatestPayload = {
  snapshot: VectorSnapshot | null;
  report: VectorReport | null;
  items: VectorItem[];
  available_dates: string[];
  source_stats: SourceStat[];
  error?: string;
};

const sourceNames: Record<string, string> = {
  cdon: "CDON",
  fyndiq: "Fyndiq",
  letsdeal: "LetsDeal",
  digideal: "DigiDeal",
  offerilla: "Offerilla",
  outspot: "Outspot",
  dealsales: "DealSales",
};

const useStyles = makeStyles({
  layout: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
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
    maxWidth: "1100px",
  },
  controls: {
    padding: "12px 16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexWrap: "nowrap",
    gap: "12px",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  filterField: {
    minWidth: "240px",
  },
  controlLeft: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-end",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: "12px",
    "@media (max-width: 1000px)": {
      gridTemplateColumns: "1fr",
    },
  },
  panelCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
  },
  sourceRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    "@media (max-width: 1000px)": {
      gridTemplateColumns: "1fr",
    },
  },
  listCard: {
    padding: "10px 12px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  rankRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
  },
  signalList: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "8px",
    maxHeight: "520px",
    overflow: "auto",
    paddingRight: "4px",
  },
  signalRow: {
    display: "grid",
    gridTemplateColumns: "70px 1.2fr 120px 120px 120px",
    gap: "8px",
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    "@media (max-width: 1100px)": {
      gridTemplateColumns: "1fr",
    },
  },
  titleLink: {
    color: tokens.colorBrandForeground1,
    textDecorationLine: "none",
    ":hover": {
      textDecorationLine: "underline",
    },
  },
  muted: {
    color: tokens.colorNeutralForeground2,
  },
  errorText: {
    color: tokens.colorStatusDangerForeground1,
    whiteSpace: "pre-wrap",
  },
  bulletList: {
    display: "grid",
    gap: "6px",
  },
});

function sourceLabel(source: string): string {
  return sourceNames[source] || source;
}

function temperatureAppearance(temperature: string | undefined) {
  switch (temperature) {
    case "very_hot":
      return { label: "Very hot", appearance: "filled" as const };
    case "hot":
      return { label: "Hot", appearance: "tint" as const };
    case "warm":
      return { label: "Warm", appearance: "outline" as const };
    default:
      return { label: "Cold", appearance: "outline" as const };
  }
}

function money(price: number | null | undefined, currency: string | null | undefined): string {
  if (price === null || price === undefined || !Number.isFinite(Number(price))) return "—";
  const rounded = Number(price);
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)} ${currency || ""}`.trim();
}

export default function MarketTrendsPage() {
  const styles = useStyles();
  const { t } = useI18n();

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [payload, setPayload] = useState<LatestPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportJson = payload?.report?.report_json ?? null;
  const hottestProducts = useMemo(() => {
    if (Array.isArray(reportJson?.hottest_products) && reportJson.hottest_products.length > 0) {
      return reportJson.hottest_products.slice(0, 10);
    }
    return (payload?.items ?? []).slice(0, 10).map((item) => ({
      source: item.source,
      product_id: item.product_id,
      title: item.title,
      delta_1d: item.delta_1d ?? 0,
      delta_7d: item.delta_7d ?? 0,
      sales_total: item.sales_total ?? 0,
      price: item.price ?? 0,
      currency: item.currency ?? "",
      reason: item.is_new_release
        ? "New release moving quickly"
        : item.is_resurgence
          ? "Resurgence from older listing"
          : "Strong day-over-day acceleration",
      url: item.product_url,
    }));
  }, [payload?.items, reportJson?.hottest_products]);

  const topCategories = useMemo(() => {
    if (Array.isArray(reportJson?.top_categories)) {
      return reportJson.top_categories.slice(0, 10);
    }
    return [];
  }, [reportJson?.top_categories]);

  const trendSections = useMemo(() => {
    if (Array.isArray(reportJson?.trend_sections)) {
      return reportJson.trend_sections.slice(0, 6);
    }
    return [];
  }, [reportJson?.trend_sections]);

  const load = async (nextDate?: string) => {
    setIsLoading(true);
    setError(null);
    const qs = new URLSearchParams({ limit: "100" });
    if (nextDate) qs.set("date", nextDate);

    try {
      const res = await fetch(`/api/market-trends/vector/latest?${qs.toString()}`);
      const body = (await res.json()) as LatestPayload;
      if (!res.ok) {
        setError(body?.error || t("marketTrends.error"));
      } else if (body?.error) {
        setError(body.error);
      } else {
        setError(null);
      }
      setPayload(body);
      const dates = body?.available_dates ?? [];
      setAvailableDates(dates);
      if (!nextDate && dates.length && !selectedDate) {
        setSelectedDate(dates[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("marketTrends.error"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load(selectedDate || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const temperature = temperatureAppearance(reportJson?.market_temperature);
  const summaryText = reportJson?.daily_summary || payload?.report?.summary_markdown || "";

  const sourceStats = payload?.source_stats ?? [];
  const items = payload?.items ?? [];
  const snapshot = payload?.snapshot ?? null;

  const dateDropdownValue = selectedDate || availableDates[0] || "";
  const canRender = !!snapshot && !isLoading && !error;

  const onRefresh = () => {
    void load(selectedDate || undefined);
  };

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <Text className={styles.title}>{t("marketTrends.title")}</Text>
        <Text className={styles.subtitle}>
          Unified daily sales vectors from CDON, Fyndiq, LetsDeal, DigiDeal, Offerilla, and DealSales.
        </Text>
      </div>

      <Card className={styles.controls}>
        <div className={styles.controlLeft}>
          <Field className={styles.filterField} label="Snapshot date">
            <Dropdown
              value={dateDropdownValue}
              selectedOptions={dateDropdownValue ? [dateDropdownValue] : []}
              onOptionSelect={(_, data) => setSelectedDate(String(data.optionValue))}
            >
              {availableDates.map((date) => (
                <Option key={date} value={date}>
                  {date}
                </Option>
              ))}
            </Dropdown>
          </Field>
        </div>
        <Button appearance="secondary" icon={<ArrowClockwise24Regular />} onClick={onRefresh}>
          Refresh
        </Button>
      </Card>

      {isLoading ? (
        <Card className={styles.panelCard}>
          <Text>
            <Spinner size="tiny" /> {t("marketTrends.loading")}
          </Text>
        </Card>
      ) : error ? (
        <Card className={styles.panelCard}>
          <Text className={styles.errorText}>{error}</Text>
        </Card>
      ) : !canRender ? (
        <Card className={styles.panelCard}>
          <Text>{t("marketTrends.empty")}</Text>
        </Card>
      ) : (
        <>
          <div className={styles.summaryGrid}>
            <Card className={styles.panelCard}>
              <div className={styles.metaRow}>
                <Badge appearance="outline">{`Snapshot ${snapshot.snapshot_date}`}</Badge>
                <Badge appearance="outline">{`${snapshot.total_items} products`}</Badge>
                <Badge appearance={temperature.appearance}>{temperature.label}</Badge>
              </div>
              <Title2>Daily Summary</Title2>
              <Text>{summaryText || "No summary available yet."}</Text>
              {Array.isArray(reportJson?.notable_signals) && reportJson.notable_signals.length > 0 ? (
                <div className={styles.bulletList}>
                  {reportJson.notable_signals.slice(0, 8).map((signal, idx) => (
                    <Text key={`${idx}-${signal}`} className={styles.muted}>
                      {`• ${signal}`}
                    </Text>
                  ))}
                </div>
              ) : null}
            </Card>

            <Card className={styles.panelCard}>
              <Title2>Source Mix</Title2>
              <div className={styles.sourceRow}>
                {sourceStats.map((stat) => (
                  <Badge key={stat.source} appearance="outline">
                    {`${sourceLabel(stat.source)}: ${stat.items} (Δ ${stat.total_delta_1d})`}
                  </Badge>
                ))}
              </div>
              <Text className={styles.muted}>{`Generated ${new Date(snapshot.created_at).toLocaleString()}`}</Text>
            </Card>
          </div>

          <div className={styles.grid2}>
            <Card className={styles.panelCard}>
              <Title2>Top Categories & Trends</Title2>
              {topCategories.length === 0 ? (
                <Text className={styles.muted}>No category summary available.</Text>
              ) : (
                topCategories.map((cat) => (
                  <div key={cat.name} className={styles.listCard}>
                    <div className={styles.rankRow}>
                      <Body1Strong>{cat.name}</Body1Strong>
                      <Badge appearance="outline">{`${cat.item_count} items`}</Badge>
                    </div>
                    <Text className={styles.muted}>{cat.why}</Text>
                  </div>
                ))
              )}
            </Card>

            <Card className={styles.panelCard}>
              <Title2>Trend Sections</Title2>
              {trendSections.length === 0 ? (
                <Text className={styles.muted}>No trend sections available.</Text>
              ) : (
                trendSections.map((section) => (
                  <div key={section.name} className={styles.listCard}>
                    <Body1Strong>{section.name}</Body1Strong>
                    <Text className={styles.muted}>{section.description}</Text>
                    {Array.isArray(section.items) && section.items.length > 0 ? (
                      <Text className={styles.muted}>
                        {section.items
                          .slice(0, 3)
                          .map((i) => `${sourceLabel(i.source)}: ${i.title}`)
                          .join(" | ")}
                      </Text>
                    ) : null}
                  </div>
                ))
              )}
            </Card>
          </div>

          <Card className={styles.panelCard}>
            <Title2>10 Hottest Products Right Now</Title2>
            <div className={styles.grid2}>
              {hottestProducts.map((item, idx) => (
                <div key={`${item.source}-${item.product_id}-${idx}`} className={styles.listCard}>
                  <div className={styles.rankRow}>
                    <Badge appearance="filled">{`#${idx + 1}`}</Badge>
                    <Badge appearance="outline">{sourceLabel(item.source)}</Badge>
                  </div>
                  <a href={item.url || "#"} target="_blank" rel="noreferrer" className={styles.titleLink}>
                    {item.title}
                  </a>
                  <div className={styles.metaRow}>
                    <Badge appearance="outline">{`Δ1d ${item.delta_1d ?? 0}`}</Badge>
                    <Badge appearance="outline">{`Δ7d ${item.delta_7d ?? 0}`}</Badge>
                    <Badge appearance="outline">{money(item.price ?? null, item.currency ?? null)}</Badge>
                  </div>
                  {item.reason ? <Text className={styles.muted}>{item.reason}</Text> : null}
                </div>
              ))}
            </div>
          </Card>

          <Card className={styles.panelCard}>
            <Title2>Signal Feed (Top 100)</Title2>
            <div className={styles.signalList}>
              {items.map((item) => (
                <div key={`${item.source}-${item.product_id}`} className={styles.signalRow}>
                  <Badge appearance="outline">{`#${item.rank}`}</Badge>
                  <div>
                    <a href={item.product_url || "#"} target="_blank" rel="noreferrer" className={styles.titleLink}>
                      {item.title}
                    </a>
                    <Text className={styles.muted}>{sourceLabel(item.source)}</Text>
                  </div>
                  <Badge appearance="outline">{`Δ1d ${item.delta_1d ?? 0}`}</Badge>
                  <Badge appearance="outline">{`Score ${Number(item.signal_score ?? 0).toFixed(2)}`}</Badge>
                  <Badge appearance="outline">{money(item.price, item.currency)}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
