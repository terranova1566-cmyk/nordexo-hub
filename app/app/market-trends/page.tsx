"use client";

import {
  Badge,
  Card,
  Checkbox,
  Dropdown,
  Field,
  Option,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

type MarketTrendSite = {
  provider: string;
  name: string;
  base_url: string;
  enabled: boolean;
  updated_at: string;
};

type MarketTrendReportRow = {
  id: string;
  scope: "site" | "all";
  provider: string | null;
  period: "daily" | "weekly";
  period_start: string;
  period_end: string;
  report_markdown: string | null;
  condensed_markdown: string | null;
  created_at: string;
  updated_at: string;
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
    maxWidth: "980px",
  },
  controls: {
    padding: "12px 16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "flex-end",
  },
  filterField: {
    minWidth: "220px",
  },
  reportCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  reportMetaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reportMetaLeft: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
  },
  reportText: {
    whiteSpace: "pre-wrap",
    fontFamily: tokens.fontFamilyBase,
    color: tokens.colorNeutralForeground2,
  },
  errorText: {
    color: tokens.colorStatusDangerForeground1,
    whiteSpace: "pre-wrap",
  },
});

const fallbackProviderOptions = [
  { value: "cdon", label: "CDON" },
  { value: "fyndiq", label: "Fyndiq" },
  { value: "megabilligt", label: "Megabilligt" },
  { value: "24se", label: "24.se" },
];

const periodOptions = [
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
];

export default function MarketTrendsPage() {
  const styles = useStyles();
  const { t } = useI18n();

  const [sites, setSites] = useState<MarketTrendSite[]>([]);
  const [sitesLoaded, setSitesLoaded] = useState(false);
  const [provider, setProvider] = useState<string>("all");
  const [period, setPeriod] = useState<"weekly" | "daily">("weekly");
  const [showCondensed, setShowCondensed] = useState(true);

  const [reports, setReports] = useState<MarketTrendReportRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope = provider === "all" ? ("all" as const) : ("site" as const);
  const effectivePeriod =
    scope === "all" ? ("weekly" as const) : (period as "weekly" | "daily");

  const providerOptions = useMemo(() => {
    const dynamic =
      sites.length > 0
        ? sites.map((site) => ({
            value: site.provider,
            label: site.name || site.provider,
          }))
        : fallbackProviderOptions;
    return [{ value: "all", label: "All websites" }, ...dynamic];
  }, [sites]);

  const providerLabelByValue = useMemo(() => {
    const map = new Map<string, string>();
    providerOptions.forEach((opt) => map.set(opt.value, opt.label));
    return map;
  }, [providerOptions]);

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId]
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      setSitesLoaded(false);
      try {
        const res = await fetch("/api/market-trends/sites");
        const payload = await res.json();
        if (!active) return;
        setSites((payload?.sites ?? []) as MarketTrendSite[]);
      } catch {
        if (!active) return;
        setSites([]);
      } finally {
        if (active) setSitesLoaded(true);
      }
    };
    load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (scope === "all" && period === "daily") {
      setPeriod("weekly");
    }
  }, [scope, period]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      setReports([]);
      setSelectedId("");

      const qs = new URLSearchParams({
        scope,
        period: effectivePeriod,
        limit: "30",
      });
      if (scope === "site") {
        qs.set("provider", provider);
      }

      try {
        const res = await fetch(`/api/market-trends/reports?${qs.toString()}`);
        const payload = await res.json();
        if (!active) return;

        const nextReports = (payload?.reports ?? []) as MarketTrendReportRow[];
        setReports(nextReports);
        setSelectedId(nextReports[0]?.id ?? "");

        if (!res.ok) {
          setError(payload?.error || t("marketTrends.error"));
        } else if (payload?.error) {
          setError(payload.error);
        } else if (nextReports.length === 0) {
          setError(null);
        }
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : t("marketTrends.error"));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [effectivePeriod, provider, scope, t]);

  const reportBody =
    (showCondensed ? selectedReport?.condensed_markdown : null) ??
    selectedReport?.report_markdown ??
    "";

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <Text className={styles.title}>{t("marketTrends.title")}</Text>
        <Text className={styles.subtitle}>{t("marketTrends.subtitle")}</Text>
      </div>

      <Card className={styles.controls}>
        <Field className={styles.filterField} label={t("marketTrends.provider.label")}>
          <Dropdown
            value={
              providerLabelByValue.get(provider) ?? provider
            }
            selectedOptions={[provider]}
            onOptionSelect={(_, data) => setProvider(String(data.optionValue))}
          >
            {providerOptions.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Dropdown>
        </Field>

        <Field className={styles.filterField} label={t("marketTrends.period.label")}>
          <Dropdown
            disabled={scope === "all"}
            value={
              periodOptions.find((opt) => opt.value === effectivePeriod)?.label ??
              effectivePeriod
            }
            selectedOptions={[effectivePeriod]}
            onOptionSelect={(_, data) =>
              setPeriod(data.optionValue === "daily" ? "daily" : "weekly")
            }
          >
            {periodOptions
              .filter((opt) => scope === "site" || opt.value === "weekly")
              .map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
          </Dropdown>
        </Field>

        <Field className={styles.filterField} label={t("marketTrends.report.label")}>
          <Dropdown
            disabled={reports.length === 0}
            value={selectedReport?.period_start ?? ""}
            selectedOptions={selectedId ? [selectedId] : []}
            onOptionSelect={(_, data) => setSelectedId(String(data.optionValue))}
          >
            {reports.map((report) => (
              <Option key={report.id} value={report.id}>
                {report.period_start}
              </Option>
            ))}
          </Dropdown>
        </Field>

        <Checkbox
          checked={showCondensed}
          onChange={(_, data) => setShowCondensed(!!data.checked)}
          label="Condensed"
        />
      </Card>

      <Card className={styles.reportCard}>
        {isLoading ? (
          <Text>
            <Spinner size="tiny" /> {t("marketTrends.loading")}
          </Text>
        ) : !sitesLoaded ? (
          <Text>
            <Spinner size="tiny" /> Loading sites...
          </Text>
        ) : error ? (
          <Text className={styles.errorText}>{error}</Text>
        ) : reports.length === 0 ? (
          <Text>{t("marketTrends.empty")}</Text>
        ) : !selectedReport ? (
          <Text>{t("marketTrends.empty")}</Text>
        ) : (
          <>
            <div className={styles.reportMetaRow}>
              <div className={styles.reportMetaLeft}>
                <Badge appearance="outline">
                  {selectedReport.scope === "all"
                    ? "All websites"
                    : providerLabelByValue.get(selectedReport.provider ?? "") ??
                      selectedReport.provider ??
                      "site"}
                </Badge>
                <Badge appearance="outline">{selectedReport.period}</Badge>
                <Badge appearance="outline">
                  {selectedReport.period_start === selectedReport.period_end
                    ? selectedReport.period_start
                    : `${selectedReport.period_start} → ${selectedReport.period_end}`}
                </Badge>
              </div>
              <Badge appearance="outline">{`${reports.length} report(s)`}</Badge>
            </div>

            <Text className={styles.reportText}>{reportBody || t("marketTrends.empty")}</Text>
          </>
        )}
      </Card>
    </div>
  );
}
