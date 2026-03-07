"use client";

import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  MessageBar,
  ProgressBar,
  Switch,
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
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { CampaignSearchRunView } from "@/lib/campaign-search/types";

const useStyles = makeStyles({
  page: {
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
  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  controlsRow: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    alignItems: "flex-end",
  },
  textarea: {
    minHeight: "280px",
    "&.fui-Textarea": {
      height: "100%",
    },
    "& .fui-Textarea__textarea": {
      minHeight: "280px",
      fontFamily: tokens.fontFamilyMonospace,
      lineHeight: tokens.lineHeightBase300,
    },
  },
  buttonRow: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  sectionHeading: {
    fontWeight: tokens.fontWeightSemibold,
  },
  tabList: {
    flexWrap: "wrap",
  },
  chipRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  monoBlock: {
    fontFamily: tokens.fontFamilyMonospace,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    padding: "12px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: "320px",
    overflow: "auto",
  },
  resultMeta: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  resultExplanation: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  resultTable: {
    width: "100%",
  },
  rankCol: {
    width: "40px",
    minWidth: "40px",
    maxWidth: "40px",
    textAlign: "right",
    whiteSpace: "nowrap",
  },
  imageCol: {
    width: "75px",
    minWidth: "75px",
    maxWidth: "75px",
    paddingLeft: "6px",
    paddingRight: "6px",
  },
  scoreCol: {
    width: "75px",
    minWidth: "75px",
    maxWidth: "75px",
    textAlign: "right",
    whiteSpace: "nowrap",
  },
  imageCell: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  resultThumbnail: {
    width: "75px",
    height: "75px",
    borderRadius: "12px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
    display: "block",
  },
  resultThumbnailPlaceholder: {
    width: "75px",
    height: "75px",
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  recentRunRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    paddingBlock: "8px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  dialogSurface: {
    width: "min(1080px, calc(100vw - 32px))",
  },
  dialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    maxHeight: "85vh",
  },
  dialogContent: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    overflow: "auto",
  },
  dialogSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  dialogRow: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  dialogLabel: {
    fontWeight: tokens.fontWeightSemibold,
  },
});

type RecentRun = {
  id: string;
  inputTextPreview: string;
  status: string;
  createdAt: string;
  errorMessage: string | null;
  progressPercent?: number | null;
  progressLabel?: string | null;
  estimatedRemainingMs?: number | null;
  etaAt?: string | null;
};

type FingerprintSegment = NonNullable<CampaignSearchRunView["run"]["fingerprintJson"]>["segments"][number];
type CampaignSearchProgress = {
  phase: string;
  label: string;
  message: string;
  percent: number;
  estimatedRemainingMs: number | null;
  etaAt: string | null;
};

function formatScore(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
}

function formatPercent(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return `${Math.round(numeric * 100)}%`;
}

function buildExplanation(result: CampaignSearchRunView["segments"][number]["results"][number]) {
  const breakdown = result.scoreBreakdown as Record<string, unknown>;
  const items: string[] = [];
  const maybePush = (label: string, value: unknown) => {
    const numeric = Number(value ?? 0);
    if (Number.isFinite(numeric) && numeric > 0) {
      items.push(label);
    }
  };

  maybePush("title hit", breakdown.title_exact_boost);
  maybePush("phrase hit", breakdown.title_phrase_boost);
  maybePush("keyword hit", breakdown.keyword_field_boost);
  maybePush("taxonomy hit", breakdown.taxonomy_boost);
  maybePush("compound rescue", breakdown.trigram_rescue_score);
  maybePush("semantic recall", breakdown.semantic_similarity_score);
  maybePush("hybrid overlap", breakdown.semantic_overlap_bonus);
  maybePush("must-have", breakdown.must_have_boost);
  if (result.matchedTerms.length > 0) {
    items.push(`matched: ${result.matchedTerms.slice(0, 4).join(", ")}`);
  }
  if (result.retrievalSources.length > 0) {
    items.push(`sources: ${result.retrievalSources.join(", ")}`);
  }
  return items.join(" • ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function formatDuration(ms: number | null | undefined) {
  const numeric = Number(ms ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "Estimating...";
  }

  const totalSeconds = Math.max(1, Math.round(numeric / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatEta(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRunProgress(runView: CampaignSearchRunView | null): CampaignSearchProgress | null {
  const progress = asRecord(runView?.run.debugJson ? asRecord(runView.run.debugJson)?.progress : null);
  if (!progress) {
    return null;
  }

  return {
    phase: String(progress.phase ?? ""),
    label: String(progress.label ?? ""),
    message: String(progress.message ?? ""),
    percent: Number(progress.percent ?? 0),
    estimatedRemainingMs:
      progress.estimatedRemainingMs == null ? null : Number(progress.estimatedRemainingMs ?? 0),
    etaAt: progress.etaAt ? String(progress.etaAt) : null,
  };
}

export default function CampaignSearchPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [inputText, setInputText] = useState("");
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runView, setRunView] = useState<CampaignSearchRunView | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [aiDataOpen, setAiDataOpen] = useState(false);

  const activeSegment = useMemo(
    () =>
      runView?.segments.find((entry) => entry.segment.id === activeSegmentId) ??
      runView?.segments[0] ??
      null,
    [activeSegmentId, runView]
  );

  const activeFingerprintSegment = useMemo<FingerprintSegment | null>(() => {
    if (!runView?.run.fingerprintJson || !activeSegment) {
      return null;
    }
    return (
      runView.run.fingerprintJson.segments.find(
        (segment) => segment.key === activeSegment.segment.segmentKey
      ) ?? null
    );
  }, [activeSegment, runView]);

  const activeSegmentPlan = useMemo(
    () => asRecord(activeSegment?.segment.segmentJson ?? null),
    [activeSegment]
  );

  const activeSegmentExecution = useMemo(() => {
    const runDebug = asRecord(runView?.run.debugJson ?? null);
    const segmentPlans = Array.isArray(runDebug?.segmentPlans) ? runDebug.segmentPlans : [];
    const matchingPlan = segmentPlans.find((entry) => {
      const typed = asRecord(entry);
      return typed?.key === activeSegment?.segment.segmentKey;
    });
    return asRecord(matchingPlan);
  }, [activeSegment, runView]);

  const runProgress = useMemo(() => getRunProgress(runView), [runView]);
  const isRunPending = runView?.run.status === "running";

  const renderBadgeRow = (
    items: string[],
    appearance: "filled" | "outline" = "filled"
  ) =>
    items.length > 0 ? (
      <div className={styles.chipRow}>
        {items.map((item, index) => (
          <Badge key={`${appearance}-${item}-${index}`} appearance={appearance}>
            {item}
          </Badge>
        ))}
      </div>
    ) : (
      <Text size={200}>-</Text>
    );

  const summarizeRecentRun = (nextRun: CampaignSearchRunView): RecentRun => {
    const progress = getRunProgress(nextRun);
    return {
      id: nextRun.run.id,
      inputTextPreview: nextRun.run.inputText.slice(0, 180),
      status: nextRun.run.status,
      createdAt: nextRun.run.createdAt,
      errorMessage: nextRun.run.errorMessage,
      progressPercent: progress?.percent ?? null,
      progressLabel: progress?.label ?? null,
      estimatedRemainingMs: progress?.estimatedRemainingMs ?? null,
      etaAt: progress?.etaAt ?? null,
    };
  };

  const applyRunView = (nextRun: CampaignSearchRunView | null) => {
    setRunView(nextRun);
    setActiveSegmentId((current) => {
      if (!nextRun) {
        return null;
      }
      if (current && nextRun.segments.some((entry) => entry.segment.id === current)) {
        return current;
      }
      return nextRun.segments[0]?.segment.id ?? null;
    });
  };

  const upsertRecentRun = (nextRun: CampaignSearchRunView | null) => {
    if (!nextRun) return;
    const summary = summarizeRecentRun(nextRun);
    setRecentRuns((current) =>
      [summary, ...current.filter((row) => row.id !== summary.id)].slice(0, 20)
    );
  };

  const fetchRecentRuns = async (suppressError = false) => {
    try {
      const response = await fetch("/api/campaign-search", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(payload?.error || "Unable to load campaign search runs."));
      }
      setRecentRuns(Array.isArray(payload?.runs) ? payload.runs : []);
    } catch (err) {
      if (!suppressError) {
        setError(err instanceof Error ? err.message : "Unable to load campaign search runs.");
      }
    }
  };

  const fetchRun = async (runId: string, suppressError = false) => {
    try {
      const response = await fetch(`/api/campaign-search/${encodeURIComponent(runId)}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(payload?.error || "Unable to load campaign search run."));
      }
      const nextRun = payload?.run as CampaignSearchRunView | null;
      applyRunView(nextRun);
      upsertRecentRun(nextRun);
      return nextRun;
    } catch (err) {
      if (!suppressError) {
        setError(err instanceof Error ? err.message : "Unable to load campaign search run.");
      }
      return null;
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!active) return;
      await fetchRecentRuns();
    };
    void load();

    const intervalId = window.setInterval(() => {
      void fetchRecentRuns(true);
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (runView || recentRuns.length === 0) {
      return;
    }
    const latestRunning = recentRuns.find((run) => run.status === "running");
    if (!latestRunning) {
      return;
    }
    void fetchRun(latestRunning.id, true);
  }, [recentRuns, runView]);

  useEffect(() => {
    if (!runView || runView.run.status !== "running") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchRun(runView.run.id, true);
    }, 2500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [runView]);

  const executeSearch = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isStarting) return;

    setIsStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/campaign-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputText: trimmed }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(payload?.error || "Campaign search execution failed."));
      }

      const nextRun = payload?.run as CampaignSearchRunView | null;
      applyRunView(nextRun);
      upsertRecentRun(nextRun);
      void fetchRecentRuns(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Campaign search execution failed.");
    } finally {
      setIsStarting(false);
    }
  };

  const reloadRun = async (runId: string) => {
    setError(null);
    await fetchRun(runId);
  };

  const rebuildIndex = async () => {
    if (isReindexing) return;
    setIsReindexing(true);
    setError(null);
    try {
      const response = await fetch("/api/campaign-search/reindex", {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(payload?.error || "Unable to rebuild campaign search index."));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rebuild campaign search index.");
    } finally {
      setIsReindexing(false);
    }
  };

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <div className={styles.titleRow}>
          <div>
            <Text size={600} className={styles.sectionHeading}>
              {t("campaignSearch.title")}
            </Text>
            <Text>
              {t("campaignSearch.subtitle")}
            </Text>
          </div>
          <div className={styles.buttonRow}>
            <Switch
              checked={debugEnabled}
              label={t("campaignSearch.debug")}
              onChange={(_, data) => setDebugEnabled(Boolean(data.checked))}
            />
            <Button appearance="secondary" onClick={rebuildIndex} disabled={isReindexing}>
              {isReindexing ? t("campaignSearch.reindexing") : t("campaignSearch.reindex")}
            </Button>
          </div>
        </div>

        {error ? <MessageBar intent="error">{error}</MessageBar> : null}

        <Field label={t("campaignSearch.inputLabel")}>
          <Textarea
            value={inputText}
            onChange={(_, data) => setInputText(data.value)}
            placeholder={t("campaignSearch.inputPlaceholder")}
            className={styles.textarea}
          />
        </Field>

        <div className={styles.controlsRow}>
          <Button appearance="primary" onClick={executeSearch} disabled={isStarting || !inputText.trim()}>
            {isStarting ? t("campaignSearch.executing") : t("campaignSearch.execute")}
          </Button>
          <Text>{t("campaignSearch.executionHint")}</Text>
        </div>
      </Card>

      {isStarting || isRunPending ? (
        <Card className={styles.card}>
          <Text size={500} className={styles.sectionHeading}>
            {runProgress?.label || t("campaignSearch.progressTitle")}
          </Text>
          <ProgressBar value={Math.max(0.01, Math.min(1, Number(runProgress?.percent ?? (isStarting ? 1 : 0)) / 100))} />
          <Text>
            {Math.round(Number(runProgress?.percent ?? (isStarting ? 1 : 0)))}% •{" "}
            {runProgress?.message || t("campaignSearch.progressStarting")}
          </Text>
          <Text size={200}>
            {t("campaignSearch.progressRemaining")}: {formatDuration(runProgress?.estimatedRemainingMs)}
            {" • "}
            {t("campaignSearch.progressEta")}: {formatEta(runProgress?.etaAt)}
          </Text>
        </Card>
      ) : null}

      {runView ? (
        <Card className={styles.card}>
          <div className={styles.titleRow}>
            <div>
              <Text size={500} className={styles.sectionHeading}>
                {t("campaignSearch.latestRun")}
              </Text>
              <Text>
                {runView.run.status} • {new Date(runView.run.createdAt).toLocaleString()}
              </Text>
            </div>
            <Badge appearance="filled">{runView.segments.length} {t("campaignSearch.segments")}</Badge>
          </div>

          {runView.segments.length > 0 ? (
            <>
              <TabList
                selectedValue={activeSegment?.segment.id}
                onTabSelect={(_, data) => setActiveSegmentId(String(data.value))}
                className={styles.tabList}
              >
                {runView.segments.map((entry) => (
                  <Tab key={entry.segment.id} value={entry.segment.id}>
                    {entry.segment.label}
                  </Tab>
                ))}
              </TabList>

              {activeSegment ? (
                <>
                  <div className={styles.resultMeta}>
                    <Badge>{formatPercent(activeSegment.segment.confidence)}</Badge>
                    <Badge appearance="outline">{activeSegment.segment.taxonomyMode}</Badge>
                    <Text>
                      {activeSegment.results.length} {t("campaignSearch.results")}
                    </Text>
                    <Button
                      as="a"
                      href={`/app/products?campaignRunId=${encodeURIComponent(runView.run.id)}&campaignSegmentId=${encodeURIComponent(activeSegment.segment.id)}`}
                      appearance="secondary"
                    >
                      {t("campaignSearch.openInProductManager")}
                    </Button>
                    <Button appearance="secondary" onClick={() => setAiDataOpen(true)}>
                      {t("campaignSearch.viewAiSearchData")}
                    </Button>
                  </div>

                  <div className={styles.chipRow}>
                    {(activeSegment.segment.segmentJson?.taxonomyHints as string[] | undefined)?.map((hint) => (
                      <Badge key={hint} appearance="outline">
                        {hint}
                      </Badge>
                    ))}
                  </div>

                  <div className={styles.chipRow}>
                    {(activeSegment.segment.segmentJson?.coreTerms as string[] | undefined)?.map((term) => (
                      <Badge key={term}>{term}</Badge>
                    ))}
                  </div>

                  <Table className={styles.resultTable}>
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell className={styles.rankCol}>
                          {t("campaignSearch.table.rank")}
                        </TableHeaderCell>
                        <TableHeaderCell className={styles.imageCol}>
                          {t("campaignSearch.table.image")}
                        </TableHeaderCell>
                        <TableHeaderCell>{t("campaignSearch.table.product")}</TableHeaderCell>
                        <TableHeaderCell>{t("campaignSearch.table.taxonomy")}</TableHeaderCell>
                        <TableHeaderCell className={styles.scoreCol}>
                          {t("campaignSearch.table.score")}
                        </TableHeaderCell>
                        <TableHeaderCell>{t("campaignSearch.table.explanation")}</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeSegment.results.map((result) => (
                        <TableRow key={`${activeSegment.segment.id}-${result.productId}`}>
                          <TableCell className={styles.rankCol}>{result.rank}</TableCell>
                          <TableCell className={styles.imageCol}>
                            <div className={styles.imageCell}>
                              {result.product?.thumbnailUrl ? (
                                <img
                                  src={result.product.thumbnailUrl}
                                  alt={result.product?.title || result.product?.spu || result.productId}
                                  className={styles.resultThumbnail}
                                  loading="lazy"
                                />
                              ) : (
                                <div className={styles.resultThumbnailPlaceholder} />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <Text weight="semibold">
                                {result.product?.title || result.product?.spu || result.productId}
                              </Text>
                              {result.product?.spu ? (
                                <Text block size={200}>
                                  {result.product.spu}
                                </Text>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            {[result.product?.googleTaxonomyL1, result.product?.googleTaxonomyL2, result.product?.googleTaxonomyL3]
                              .filter(Boolean)
                              .join(" > ") || "-"}
                          </TableCell>
                          <TableCell className={styles.scoreCol}>{formatScore(result.finalScore)}</TableCell>
                          <TableCell>
                            <Text className={styles.resultExplanation}>{buildExplanation(result)}</Text>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              ) : null}
            </>
          ) : runView.run.status === "running" ? (
            <MessageBar>{t("campaignSearch.runningNoSegments")}</MessageBar>
          ) : (
            <MessageBar>{t("campaignSearch.emptySegments")}</MessageBar>
          )}

          {debugEnabled ? (
            <>
              <Text className={styles.sectionHeading}>{t("campaignSearch.debugFingerprint")}</Text>
              <div className={styles.monoBlock}>
                {JSON.stringify(runView.run.fingerprintJson ?? {}, null, 2)}
              </div>
              <Text className={styles.sectionHeading}>{t("campaignSearch.debugRun")}</Text>
              <div className={styles.monoBlock}>
                {JSON.stringify(runView.run.debugJson ?? {}, null, 2)}
              </div>
            </>
          ) : null}
        </Card>
      ) : null}

      <Card className={styles.card}>
        <Text size={500} className={styles.sectionHeading}>
          {t("campaignSearch.recentRuns")}
        </Text>
        {recentRuns.length === 0 ? (
          <Text>{t("campaignSearch.recentRunsEmpty")}</Text>
        ) : (
          recentRuns.map((run) => (
            <div key={run.id} className={styles.recentRunRow}>
              <div>
                <Text weight="semibold">{run.status}</Text>
                {run.status === "running" ? (
                  <Text block size={200}>
                    {Math.round(Number(run.progressPercent ?? 0))}% • {run.progressLabel || t("campaignSearch.progressTitle")}
                    {" • "}
                    {t("campaignSearch.progressRemaining")}: {formatDuration(run.estimatedRemainingMs)}
                  </Text>
                ) : null}
                <Text block>{run.inputTextPreview}</Text>
              </div>
              <div className={styles.buttonRow}>
                <Text>{new Date(run.createdAt).toLocaleString()}</Text>
                <Button appearance="secondary" onClick={() => reloadRun(run.id)}>
                  {t("campaignSearch.loadRun")}
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>

      <Dialog open={aiDataOpen} onOpenChange={(_, data) => setAiDataOpen(data.open)}>
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody className={styles.dialogBody}>
            <DialogTitle>{t("campaignSearch.aiDataTitle")}</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <Text>{t("campaignSearch.aiDataIntro")}</Text>

              <div className={styles.dialogSection}>
                <Text className={styles.sectionHeading}>{t("campaignSearch.aiDataCampaign")}</Text>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataSourceLanguage")}</Text>
                  <Text>{runView?.run.fingerprintJson?.sourceLanguage || "-"}</Text>
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataCampaignSummary")}</Text>
                  <Text>{runView?.run.fingerprintJson?.campaignSummarySv || "-"}</Text>
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataGlobalNegativeTerms")}</Text>
                  {renderBadgeRow(runView?.run.fingerprintJson?.globalNegativeTerms ?? [], "outline")}
                </div>
              </div>

              <div className={styles.dialogSection}>
                <Text className={styles.sectionHeading}>{t("campaignSearch.aiDataExtraction")}</Text>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataSegment")}</Text>
                  <Text>
                    {activeFingerprintSegment?.label || activeSegment?.segment.label || "-"} •{" "}
                    {formatPercent(activeFingerprintSegment?.confidence ?? activeSegment?.segment.confidence)}
                  </Text>
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataTaxonomyHints")}</Text>
                  {renderBadgeRow(activeFingerprintSegment?.taxonomyHints ?? [], "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataCoreTerms")}</Text>
                  {renderBadgeRow(activeFingerprintSegment?.coreTermsSv ?? [])}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataSynonyms")}</Text>
                  {renderBadgeRow(activeFingerprintSegment?.synonymsSv ?? [], "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataJoinedVariants")}</Text>
                  {renderBadgeRow(activeFingerprintSegment?.joinedVariants ?? [], "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataSplitVariants")}</Text>
                  {renderBadgeRow(activeFingerprintSegment?.splitVariants ?? [], "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataMustHave")}</Text>
                  {renderBadgeRow(activeFingerprintSegment?.mustHave ?? [])}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataNiceToHave")}</Text>
                  {renderBadgeRow(activeFingerprintSegment?.niceToHave ?? [], "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataNegativeTerms")}</Text>
                  {renderBadgeRow(activeFingerprintSegment?.negativeTerms ?? [], "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataBrandTerms")}</Text>
                  {renderBadgeRow(activeFingerprintSegment?.brandTerms ?? [], "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataStrictQueries")}</Text>
                  {renderBadgeRow(activeFingerprintSegment?.strictQueries ?? [], "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataBalancedQueries")}</Text>
                  {renderBadgeRow(activeFingerprintSegment?.balancedQueries ?? [], "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataBroadQueries")}</Text>
                  {renderBadgeRow(activeFingerprintSegment?.broadQueries ?? [], "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataNotes")}</Text>
                  <Text>{activeFingerprintSegment?.notes || "-"}</Text>
                </div>
              </div>

              <div className={styles.dialogSection}>
                <Text className={styles.sectionHeading}>{t("campaignSearch.aiDataPlan")}</Text>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataMappedTaxonomy")}</Text>
                  {renderBadgeRow(
                    [
                      ...asStringArray(activeSegmentPlan?.mappedTaxonomy ? asRecord(activeSegmentPlan.mappedTaxonomy)?.taxonomyL1 : []),
                      ...asStringArray(activeSegmentPlan?.mappedTaxonomy ? asRecord(activeSegmentPlan.mappedTaxonomy)?.taxonomyL2 : []),
                    ],
                    "outline"
                  )}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataMappedTaxonomyReasoning")}</Text>
                  {renderBadgeRow(
                    asStringArray(
                      activeSegmentPlan?.debug ? asRecord(activeSegmentPlan.debug)?.mappedTaxonomyReasoning : []
                    ),
                    "outline"
                  )}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataStrictTerms")}</Text>
                  {renderBadgeRow(asStringArray(activeSegmentPlan?.strictTerms))}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataBalancedTerms")}</Text>
                  {renderBadgeRow(asStringArray(activeSegmentPlan?.balancedTerms))}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataBroadTerms")}</Text>
                  {renderBadgeRow(asStringArray(activeSegmentPlan?.broadTerms), "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataRescueTerms")}</Text>
                  {renderBadgeRow(asStringArray(activeSegmentPlan?.rescueTerms), "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataStrictTsQuery")}</Text>
                  <div className={styles.monoBlock}>{String(activeSegmentPlan?.strictTsQuery ?? "-")}</div>
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataBalancedTsQuery")}</Text>
                  <div className={styles.monoBlock}>{String(activeSegmentPlan?.balancedTsQuery ?? "-")}</div>
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataBroadTsQuery")}</Text>
                  <div className={styles.monoBlock}>{String(activeSegmentPlan?.broadTsQuery ?? "-")}</div>
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataStrictPhrases")}</Text>
                  {renderBadgeRow(asStringArray(activeSegmentPlan?.strictPhrases), "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataBalancedPhrases")}</Text>
                  {renderBadgeRow(asStringArray(activeSegmentPlan?.balancedPhrases), "outline")}
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataSemanticQuery")}</Text>
                  <div className={styles.monoBlock}>{String(activeSegmentPlan?.semanticQueryText ?? "-")}</div>
                </div>
              </div>

              <div className={styles.dialogSection}>
                <Text className={styles.sectionHeading}>{t("campaignSearch.aiDataExecution")}</Text>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataCandidateCounts")}</Text>
                  <Text>
                    {t("campaignSearch.aiDataLexicalCandidates")}:{" "}
                    {String(activeSegmentExecution?.execution ? asRecord(activeSegmentExecution.execution)?.lexicalCandidateCount ?? "-" : "-")}
                    {" • "}
                    {t("campaignSearch.aiDataSemanticCandidates")}:{" "}
                    {String(activeSegmentExecution?.execution ? asRecord(activeSegmentExecution.execution)?.semanticCandidateCount ?? "-" : "-")}
                    {" • "}
                    {t("campaignSearch.aiDataMergedCandidates")}:{" "}
                    {String(activeSegmentExecution?.execution ? asRecord(activeSegmentExecution.execution)?.mergedCandidateCount ?? "-" : "-")}
                  </Text>
                </div>
              </div>

              <div className={styles.dialogSection}>
                <Text className={styles.sectionHeading}>{t("campaignSearch.aiDataRawJson")}</Text>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataFingerprintJson")}</Text>
                  <div className={styles.monoBlock}>
                    {JSON.stringify(activeFingerprintSegment ?? {}, null, 2)}
                  </div>
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataPlanJson")}</Text>
                  <div className={styles.monoBlock}>
                    {JSON.stringify(activeSegmentPlan ?? {}, null, 2)}
                  </div>
                </div>
                <div className={styles.dialogRow}>
                  <Text className={styles.dialogLabel}>{t("campaignSearch.aiDataExecutionJson")}</Text>
                  <div className={styles.monoBlock}>
                    {JSON.stringify(activeSegmentExecution ?? {}, null, 2)}
                  </div>
                </div>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setAiDataOpen(false)}>
                {t("common.close")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
