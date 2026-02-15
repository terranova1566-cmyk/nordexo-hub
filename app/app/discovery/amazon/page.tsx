"use client";

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Field,
  Option,
  Spinner,
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
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { canonicalizeAmazonProductUrl, parseAmazonUrls } from "@/lib/amazon/urls";

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
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    "@media (max-width: 1000px)": {
      gridTemplateColumns: "1fr",
    },
  },
  paneCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  optionsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "center",
  },
  actionsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
    justifyContent: "space-between",
  },
  helperText: {
    color: tokens.colorNeutralForeground3,
  },
  errorText: {
    color: tokens.colorStatusDangerForeground1,
    whiteSpace: "pre-wrap",
  },
  tableCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
});

type ApiError = { url: string; error: string; code?: string; provider?: string; detail?: unknown };

type ProductScrapeResult = {
  url: string;
  asin: string;
  title: string | null;
  productUrl: string;
  relatedCount: number;
  variantCount: number;
};

type ListingScrapeResult = {
  url: string;
  domain: string;
  asinCount: number;
  cardCount: number;
};

type JobType = "product" | "listing";
type JobStatus = "queued" | "running" | "done" | "canceled";

type ScrapeJob = {
  id: string;
  type: JobType;
  provider: "oxylabs" | "direct";
  urls: string[];
  createdAtMs: number;
  startedAtMs: number | null;
  finishedAtMs: number | null;
  status: JobStatus;
  currentUrl: string | null;
  cancelRequested: boolean;
  progress: {
    totalTargets: number;
    processedTargets: number;
    successTargets: number;
    failedTargets: number;
    cardsExtracted: number;
  };
  options:
    | {
        type: "product";
        includeVariantImages: boolean;
        includeRelatedProducts: boolean;
        downloadImages: boolean;
        maxRelated: number;
      }
    | {
        type: "listing";
        maxItems: number;
      };
  results: ProductScrapeResult[] | ListingScrapeResult[];
  errors: ApiError[];
};

const dedupeKeepOrder = (values: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
};

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
};

export default function AmazonScraperPage() {
  const styles = useStyles();
  const { t } = useI18n();

  const [productUrlsText, setProductUrlsText] = useState("");
  const [listingUrlsText, setListingUrlsText] = useState("");

  const [includeVariantImages, setIncludeVariantImages] = useState(true);
  const [includeRelatedProducts, setIncludeRelatedProducts] = useState(true);
  const [downloadImages, setDownloadImages] = useState(false);
  const [maxRelated, setMaxRelated] = useState(24);
  const [maxItems, setMaxItems] = useState(40);
  const [provider, setProvider] = useState<"oxylabs" | "direct">("oxylabs");

  const [uiError, setUiError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const jobsRef = useRef<ScrapeJob[]>([]);
  const workerRunningRef = useRef(false);
  const abortByJobIdRef = useRef<Map<string, AbortController>>(new Map());

  const setJobsBoth = (next: ScrapeJob[]) => {
    jobsRef.current = next;
    setJobs(next);
  };

  const updateJob = (jobId: string, updater: (job: ScrapeJob) => ScrapeJob) => {
    const next = jobsRef.current.map((j) => (j.id === jobId ? updater(j) : j));
    setJobsBoth(next);
  };

  const requestCancelJob = (jobId: string) => {
    updateJob(jobId, (j) => ({ ...j, cancelRequested: true }));
    const ac = abortByJobIdRef.current.get(jobId);
    if (ac) ac.abort();
  };

  const downloadJobJson = (job: ScrapeJob) => {
    const payload = {
      id: job.id,
      type: job.type,
      provider: job.provider,
      status: job.status,
      createdAt: new Date(job.createdAtMs).toISOString(),
      startedAt: job.startedAtMs ? new Date(job.startedAtMs).toISOString() : null,
      finishedAt: job.finishedAtMs ? new Date(job.finishedAtMs).toISOString() : null,
      urls: job.urls,
      options: job.options,
      progress: job.progress,
      results: job.results,
      errors: job.errors,
    };

    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `amazon_job_${job.type}_${job.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const productUrls = useMemo(() => {
    const raw = parseAmazonUrls(productUrlsText);
    const canonical = raw.map((u) => canonicalizeAmazonProductUrl(u));
    return dedupeKeepOrder(canonical);
  }, [productUrlsText]);

  const listingUrls = useMemo(() => dedupeKeepOrder(parseAmazonUrls(listingUrlsText)), [listingUrlsText]);

  useEffect(() => {
    // Keep a ticking "now" for ETA/duration while jobs run.
    const hasRunning = jobsRef.current.some((j) => j.status === "running");
    if (!hasRunning) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [jobs]);

  const enqueueProductJob = () => {
    setUiError(null);
    if (productUrls.length === 0) {
      setUiError(t("amazonScraper.validation.missingProductUrls"));
      return;
    }
    const id = crypto.randomUUID();
    const job: ScrapeJob = {
      id,
      type: "product",
      provider,
      urls: productUrls,
      createdAtMs: Date.now(),
      startedAtMs: null,
      finishedAtMs: null,
      status: "queued",
      currentUrl: null,
      cancelRequested: false,
      progress: {
        totalTargets: productUrls.length,
        processedTargets: 0,
        successTargets: 0,
        failedTargets: 0,
        cardsExtracted: 0,
      },
      options: {
        type: "product",
        includeVariantImages,
        includeRelatedProducts,
        downloadImages,
        maxRelated,
      },
      results: [],
      errors: [],
    };
    setJobsBoth([...jobsRef.current, job]);
  };

  const enqueueListingJob = () => {
    setUiError(null);
    if (listingUrls.length === 0) {
      setUiError(t("amazonScraper.validation.missingListingUrls"));
      return;
    }
    const id = crypto.randomUUID();
    const job: ScrapeJob = {
      id,
      type: "listing",
      provider,
      urls: listingUrls,
      createdAtMs: Date.now(),
      startedAtMs: null,
      finishedAtMs: null,
      status: "queued",
      currentUrl: null,
      cancelRequested: false,
      progress: {
        totalTargets: listingUrls.length,
        processedTargets: 0,
        successTargets: 0,
        failedTargets: 0,
        cardsExtracted: 0,
      },
      options: {
        type: "listing",
        maxItems,
      },
      results: [],
      errors: [],
    };
    setJobsBoth([...jobsRef.current, job]);
  };

  const runOneJob = async (jobId: string) => {
    const job = jobsRef.current.find((j) => j.id === jobId) ?? null;
    if (!job) return;
    if (job.cancelRequested) {
      updateJob(jobId, (j) => ({
        ...j,
        status: "canceled",
        finishedAtMs: Date.now(),
        currentUrl: null,
      }));
      return;
    }

    updateJob(jobId, (j) => ({
      ...j,
      status: "running",
      startedAtMs: Date.now(),
      finishedAtMs: null,
      currentUrl: null,
    }));

    for (const url of job.urls) {
      const latest = jobsRef.current.find((j) => j.id === jobId) ?? null;
      if (!latest || latest.cancelRequested) {
        updateJob(jobId, (j) => ({
          ...j,
          status: "canceled",
          finishedAtMs: Date.now(),
          currentUrl: null,
        }));
        return;
      }

      updateJob(jobId, (j) => ({ ...j, currentUrl: url }));

      const ac = new AbortController();
      abortByJobIdRef.current.set(jobId, ac);

      try {
        if (job.type === "product") {
          const opt = job.options.type === "product" ? job.options : null;
          const res = await fetch("/api/amazon/scrape-product", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ac.signal,
            body: JSON.stringify({
              urls: [url],
              provider: job.provider,
              include_variant_images: opt?.includeVariantImages ?? true,
              include_related_products: opt?.includeRelatedProducts ?? true,
              max_related: opt?.maxRelated ?? 24,
              download_images: opt?.downloadImages ?? false,
            }),
          });
          const payload = await res.json();
          if (!res.ok) {
            throw new Error(payload?.error || t("amazonScraper.error.generic"));
          }

          const results = (payload?.results ?? []) as ProductScrapeResult[];
          const errors = (payload?.errors ?? []) as ApiError[];

          updateJob(jobId, (j) => ({
            ...j,
            results: ([...(j.results as ProductScrapeResult[]), ...results] as unknown) as ScrapeJob["results"],
            errors: [...j.errors, ...errors],
            progress: {
              ...j.progress,
              processedTargets: j.progress.processedTargets + 1,
              successTargets: j.progress.successTargets + (results.length > 0 ? 1 : 0),
              failedTargets: j.progress.failedTargets + (results.length > 0 ? 0 : 1),
            },
          }));
        } else {
          const opt = job.options.type === "listing" ? job.options : null;
          const res = await fetch("/api/amazon/scrape-listing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ac.signal,
            body: JSON.stringify({
              urls: [url],
              provider: job.provider,
              max_items: opt?.maxItems ?? 40,
            }),
          });
          const payload = await res.json();
          if (!res.ok) {
            throw new Error(payload?.error || t("amazonScraper.error.generic"));
          }

          const results = (payload?.results ?? []) as ListingScrapeResult[];
          const errors = (payload?.errors ?? []) as ApiError[];

          updateJob(jobId, (j) => ({
            ...j,
            results: ([...(j.results as ListingScrapeResult[]), ...results] as unknown) as ScrapeJob["results"],
            errors: [...j.errors, ...errors],
            progress: {
              ...j.progress,
              processedTargets: j.progress.processedTargets + 1,
              successTargets: j.progress.successTargets + (results.length > 0 ? 1 : 0),
              failedTargets: j.progress.failedTargets + (results.length > 0 ? 0 : 1),
              cardsExtracted:
                j.progress.cardsExtracted + (results[0]?.cardCount ? Number(results[0].cardCount) : 0),
            },
          }));
        }
      } catch (e) {
        if (ac.signal.aborted) {
          updateJob(jobId, (j) => ({
            ...j,
            status: "canceled",
            finishedAtMs: Date.now(),
            currentUrl: null,
          }));
          return;
        }
        const message = e instanceof Error ? e.message : t("amazonScraper.error.generic");
        updateJob(jobId, (j) => ({
          ...j,
          errors: [...j.errors, { url, error: message }],
          progress: {
            ...j.progress,
            processedTargets: j.progress.processedTargets + 1,
            failedTargets: j.progress.failedTargets + 1,
          },
        }));
      } finally {
        abortByJobIdRef.current.delete(jobId);
      }
    }

    updateJob(jobId, (j) => ({
      ...j,
      status: "done",
      finishedAtMs: Date.now(),
      currentUrl: null,
    }));
  };

  useEffect(() => {
    const hasQueued = jobsRef.current.some((j) => j.status === "queued");
    if (!hasQueued) return;
    if (workerRunningRef.current) return;

    const run = async () => {
      workerRunningRef.current = true;
      try {
        while (true) {
          const next = jobsRef.current.find((j) => j.status === "queued") ?? null;
          if (!next) break;
          await runOneJob(next.id);
        }
      } finally {
        workerRunningRef.current = false;
      }
    };

    void run();
  }, [jobs]);

  const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const finishedJobs = jobs.filter((j) => j.status === "done" || j.status === "canceled");
  const hasRunning = jobs.some((j) => j.status === "running");
  const runningJob = jobs.find((j) => j.status === "running") ?? null;

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <Text className={styles.title}>{t("amazonScraper.title")}</Text>
        <Text className={styles.subtitle}>{t("amazonScraper.subtitle")}</Text>
      </div>

      <div className={styles.grid}>
        <Card className={styles.paneCard}>
          <Text weight="semibold">{t("amazonScraper.products.title")}</Text>
          <Field label={t("amazonScraper.products.urlsLabel")}>
            <Textarea
              value={productUrlsText}
              resize="vertical"
              rows={10}
              placeholder={t("amazonScraper.products.urlsPlaceholder")}
              onChange={(_, data) => setProductUrlsText(data.value)}
            />
          </Field>
          <div className={styles.metaRow}>
            <Badge appearance="outline">{`${productUrls.length} URL(s)`}</Badge>
            <Text className={styles.helperText}>
              {t("amazonScraper.products.helper")}
            </Text>
          </div>
        </Card>

        <Card className={styles.paneCard}>
          <Text weight="semibold">{t("amazonScraper.listings.title")}</Text>
          <Field label={t("amazonScraper.listings.urlsLabel")}>
            <Textarea
              value={listingUrlsText}
              resize="vertical"
              rows={10}
              placeholder={t("amazonScraper.listings.urlsPlaceholder")}
              onChange={(_, data) => setListingUrlsText(data.value)}
            />
          </Field>
          <div className={styles.metaRow}>
            <Badge appearance="outline">{`${listingUrls.length} URL(s)`}</Badge>
            <Text className={styles.helperText}>
              {t("amazonScraper.listings.helper")}
            </Text>
          </div>
        </Card>
      </div>

      <Card className={styles.paneCard}>
        <Text weight="semibold">{t("amazonScraper.options.title")}</Text>
        <div className={styles.optionsRow}>
          <Field label={t("amazonScraper.options.provider")} style={{ minWidth: 240 }}>
            <Dropdown
              value={
                provider === "oxylabs"
                  ? t("amazonScraper.options.providerOxylabs")
                  : t("amazonScraper.options.providerDirect")
              }
              selectedOptions={[provider]}
              onOptionSelect={(_, data) => {
                const v = String(data.optionValue ?? "");
                setProvider(v === "direct" ? "direct" : "oxylabs");
              }}
            >
              <Option value="oxylabs">{t("amazonScraper.options.providerOxylabs")}</Option>
              <Option value="direct">{t("amazonScraper.options.providerDirect")}</Option>
            </Dropdown>
          </Field>
          <Checkbox
            checked={includeVariantImages}
            label={t("amazonScraper.options.includeVariantImages")}
            onChange={(_, data) => setIncludeVariantImages(Boolean(data.checked))}
          />
          <Checkbox
            checked={includeRelatedProducts}
            label={t("amazonScraper.options.includeRelated")}
            onChange={(_, data) => setIncludeRelatedProducts(Boolean(data.checked))}
          />
          <Checkbox
            checked={downloadImages}
            label={t("amazonScraper.options.downloadImages")}
            onChange={(_, data) => setDownloadImages(Boolean(data.checked))}
          />
          <Field label={t("amazonScraper.options.maxRelated")} style={{ minWidth: 140 }}>
            <input
              type="number"
              value={maxRelated}
              min={0}
              max={50}
              onChange={(e) => setMaxRelated(Number(e.target.value || 0))}
              style={{ width: "100%" }}
            />
          </Field>
          <Field label={t("amazonScraper.options.maxItems")} style={{ minWidth: 140 }}>
            <input
              type="number"
              value={maxItems}
              min={1}
              max={80}
              onChange={(e) => setMaxItems(Number(e.target.value || 1))}
              style={{ width: "100%" }}
            />
          </Field>
        </div>
      </Card>

      <div className={styles.actionsRow}>
        <div className={styles.leftActions}>
          <Button
            appearance="outline"
            onClick={() => {
              setProductUrlsText("");
              setListingUrlsText("");
              setUiError(null);
            }}
          >
            {t("common.clear")}
          </Button>
          <Button
            appearance="primary"
            onClick={enqueueProductJob}
          >
            {t("amazonScraper.actions.scrapeProducts")}
          </Button>
          <Button
            appearance="primary"
            onClick={enqueueListingJob}
          >
            {t("amazonScraper.actions.scrapeListings")}
          </Button>
          <Button
            appearance="outline"
            onClick={() => setJobsBoth(jobsRef.current.filter((j) => j.status === "queued" || j.status === "running"))}
            disabled={activeJobs.length === jobs.length}
          >
            Clear finished
          </Button>
        </div>
        <div className={styles.statusRow}>
          {hasRunning ? <Spinner size="tiny" /> : null}
          <Text className={styles.helperText}>
            {hasRunning
              ? `Running: ${runningJob?.type ?? "job"}`
              : t("amazonScraper.status.idle")}
          </Text>
        </div>
      </div>

      {uiError ? <Text className={styles.errorText}>{uiError}</Text> : null}

      <Card className={styles.tableCard}>
        <Text weight="semibold">Active Jobs</Text>
        {activeJobs.length === 0 ? (
          <Text className={styles.helperText}>No active jobs.</Text>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Provider</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
                <TableHeaderCell>Scraped</TableHeaderCell>
                <TableHeaderCell>Targets</TableHeaderCell>
                <TableHeaderCell>ETA</TableHeaderCell>
                <TableHeaderCell>Current</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeJobs.map((job) => {
                const startedAt = job.startedAtMs;
                const elapsedMs = startedAt ? nowMs - startedAt : 0;
                const processed = job.progress.processedTargets;
                const total = job.progress.totalTargets;
                const remaining = Math.max(0, total - processed);
                const avgMsPer = processed > 0 ? elapsedMs / processed : null;
                const etaMs = avgMsPer !== null ? remaining * avgMsPer : null;

                const totalProducts =
                  job.type === "listing" && job.options.type === "listing"
                    ? total * Math.max(1, Math.trunc(job.options.maxItems || 1))
                    : total;
                const scrapedProducts =
                  job.type === "listing" ? job.progress.cardsExtracted : job.progress.successTargets;

                return (
                  <TableRow key={job.id}>
                    <TableCell>
                      <Badge appearance="outline">
                        {job.status === "running" ? "RUNNING" : "QUEUED"}
                      </Badge>
                    </TableCell>
                    <TableCell>{job.type}</TableCell>
                    <TableCell>{job.provider}</TableCell>
                    <TableCell>{job.type === "listing" ? `${totalProducts} (est.)` : totalProducts}</TableCell>
                    <TableCell>{scrapedProducts}</TableCell>
                    <TableCell>{`${processed}/${total}`}</TableCell>
                    <TableCell>{etaMs !== null ? formatDuration(etaMs) : "-"}</TableCell>
                    <TableCell style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {job.currentUrl ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        appearance="outline"
                        size="small"
                        onClick={() => requestCancelJob(job.id)}
                        disabled={job.cancelRequested}
                      >
                        {job.cancelRequested ? "Canceling" : "Cancel"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className={styles.tableCard}>
        <Text weight="semibold">Finished Jobs</Text>
        {finishedJobs.length === 0 ? (
          <Text className={styles.helperText}>No finished jobs.</Text>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Provider</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
                <TableHeaderCell>Scraped</TableHeaderCell>
                <TableHeaderCell>Errors</TableHeaderCell>
                <TableHeaderCell>Duration</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {finishedJobs.map((job) => {
                const total = job.progress.totalTargets;
                const totalProducts =
                  job.type === "listing" && job.options.type === "listing"
                    ? total * Math.max(1, Math.trunc(job.options.maxItems || 1))
                    : total;
                const scrapedProducts =
                  job.type === "listing" ? job.progress.cardsExtracted : job.progress.successTargets;
                const durationMs =
                  job.startedAtMs && job.finishedAtMs ? job.finishedAtMs - job.startedAtMs : 0;
                return (
                  <TableRow key={job.id}>
                    <TableCell>
                      <Badge appearance="outline">
                        {job.status === "done" ? "DONE" : "CANCELED"}
                      </Badge>
                    </TableCell>
                    <TableCell>{job.type}</TableCell>
                    <TableCell>{job.provider}</TableCell>
                    <TableCell>{job.type === "listing" ? `${totalProducts} (est.)` : totalProducts}</TableCell>
                    <TableCell>{scrapedProducts}</TableCell>
                    <TableCell>{job.errors.length}</TableCell>
                    <TableCell>{durationMs > 0 ? formatDuration(durationMs) : "-"}</TableCell>
                    <TableCell>
                      <Button
                        appearance="primary"
                        size="small"
                        onClick={() => downloadJobJson(job)}
                      >
                        Download JSON
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
