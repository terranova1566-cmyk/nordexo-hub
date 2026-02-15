"use client";

import {
  Button,
  Card,
  Spinner,
  Text,
  Title2,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";

type MarketTrendReport = {
  id: string;
  scope: "site" | "all";
  provider: string | null;
  period: "daily" | "weekly";
  period_start: string;
  period_end: string;
  report_markdown: string | null;
  condensed_markdown: string | null;
  updated_at: string;
};

const useStyles = makeStyles({
  layout: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  card: {
    padding: "24px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: "pre-line",
  },
  reportBody: {
    color: tokens.colorNeutralForeground2,
    whiteSpace: "pre-wrap",
  },
  reportMeta: {
    color: tokens.colorNeutralForeground3,
  },
  reportActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
    justifyContent: "space-between",
  },
});

export default function LandingPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const router = useRouter();

  const [report, setReport] = useState<MarketTrendReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingReport(true);
      setReportError(null);
      try {
        const res = await fetch("/api/market-trends/latest?scope=all&period=weekly");
        const payload = await res.json();
        if (!active) return;
        setReport((payload?.report ?? null) as MarketTrendReport | null);
        if (!res.ok) {
          setReportError(payload?.error || "Unable to load market trends report.");
        } else if (payload?.error) {
          setReportError(payload.error);
        }
      } catch (e) {
        if (!active) return;
        setReportError(e instanceof Error ? e.message : "Unable to load market trends report.");
      } finally {
        if (active) setLoadingReport(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  const reportBody = useMemo(() => {
    if (!report) return "";
    const candidate = report.condensed_markdown || report.report_markdown || "";
    return candidate.trim();
  }, [report]);

  return (
    <div className={styles.layout}>
      <Card className={styles.card}>
        <Title2>{t("home.title")}</Title2>
        <Text className={styles.subtitle}>{t("home.subtitle")}</Text>
      </Card>

      <Card className={styles.card}>
        <Title3>{t("home.marketTrends.title")}</Title3>
        {loadingReport ? (
          <Text className={styles.reportMeta}>
            <Spinner size="tiny" /> {t("home.marketTrends.loading")}
          </Text>
        ) : reportError ? (
          <Text className={styles.reportMeta}>{reportError}</Text>
        ) : report ? (
          <>
            <Text className={styles.reportMeta}>
              {report.period_start === report.period_end
                ? report.period_start
                : `${report.period_start} → ${report.period_end}`}
            </Text>
            <Text className={styles.reportBody}>
              {reportBody || t("home.marketTrends.empty")}
            </Text>
          </>
        ) : (
          <Text className={styles.reportMeta}>{t("home.marketTrends.empty")}</Text>
        )}

        <div className={styles.reportActions}>
          <Text className={styles.reportMeta}>{t("home.marketTrends.viewHint")}</Text>
          <Button appearance="primary" onClick={() => router.push("/app/market-trends")}>
            {t("home.marketTrends.view")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
