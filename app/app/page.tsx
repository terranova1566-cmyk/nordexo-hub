"use client";

import {
  Button,
  Card,
  mergeClasses,
  Spinner,
  Text,
  Title2,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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

type ProfileResponse = {
  email?: string | null;
  full_name?: string | null;
};

type RecentPublishedImage = {
  product_id: string;
  spu: string | null;
  title: string | null;
  image_url: string;
};

type DeliveryNotice = {
  id: string;
  partner: string;
  title: string;
  created_at: string | null;
  item_count: number;
};

const extractFirstName = (fullName: string | null | undefined, email?: string | null) => {
  const fullNameText = String(fullName ?? "").trim();
  if (fullNameText.length > 0) {
    return fullNameText.split(/\s+/)[0] ?? "Partner";
  }
  const emailPrefix = String(email ?? "")
    .split("@", 1)[0]
    ?.trim();
  if (emailPrefix && emailPrefix.length > 0) {
    return emailPrefix.replace(/[._-]+/g, " ").split(/\s+/)[0] ?? "Partner";
  }
  return "Partner";
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
    backgroundColor: tokens.colorNeutralBackground2,
  },
  splitRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "16px",
    alignItems: "stretch",
  },
  splitCard: {
    flex: "1 1 calc(50% - 8px)",
    width: "calc(50% - 8px)",
    minWidth: "420px",
    maxWidth: "calc(50% - 8px)",
    height: "750px",
    maxHeight: "750px",
    minHeight: "750px",
    overflow: "hidden",
    "@media (max-width: 1200px)": {
      flexBasis: "100%",
      width: "100%",
      minWidth: "100%",
      maxWidth: "100%",
      minHeight: "560px",
      height: "560px",
      maxHeight: "560px",
    },
  },
  splitScrollArea: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    paddingRight: "4px",
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
  galleryMeta: {
    color: tokens.colorNeutralForeground3,
  },
  galleryViewport: {
    height: "300px",
    overflowX: "auto",
    overflowY: "hidden",
    borderRadius: "12px",
    boxShadow: tokens.shadow8,
    backgroundColor: tokens.colorNeutralBackground2,
    cursor: "grab",
    touchAction: "pan-x",
    userSelect: "none",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
    "&::-webkit-scrollbar": {
      display: "none",
    },
  },
  galleryViewportDragging: {
    cursor: "grabbing",
  },
  galleryTrack: {
    height: "100%",
    width: "max-content",
    display: "flex",
    flexDirection: "row",
    gap: "12px",
    padding: "0 12px 0 0",
    alignItems: "stretch",
  },
  galleryTile: {
    flex: "0 0 300px",
    width: "300px",
    height: "300px",
    borderRadius: "10px",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground3,
    boxShadow: tokens.shadow4,
  },
  galleryImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  noticeList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  noticeItem: {
    padding: "12px",
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  noticeTitle: {
    color: tokens.colorNeutralForeground1,
  },
  noticeMeta: {
    color: tokens.colorNeutralForeground3,
  },
});

export default function LandingPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const router = useRouter();

  const [firstName, setFirstName] = useState("Partner");
  const [report, setReport] = useState<MarketTrendReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);
  const [recentImages, setRecentImages] = useState<RecentPublishedImage[]>([]);
  const [loadingRecentImages, setLoadingRecentImages] = useState(true);
  const [recentImagesError, setRecentImagesError] = useState<string | null>(null);
  const [deliveryNotices, setDeliveryNotices] = useState<DeliveryNotice[]>([]);
  const [loadingNotices, setLoadingNotices] = useState(true);
  const [noticesError, setNoticesError] = useState<string | null>(null);
  const [isDraggingGallery, setIsDraggingGallery] = useState(false);
  const galleryViewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startScrollLeft: 0,
  });

  const normalizeLoopScroll = (viewport: HTMLDivElement) => {
    const loopWidth = viewport.scrollWidth / 2;
    if (!Number.isFinite(loopWidth) || loopWidth <= 0) return;
    if (viewport.scrollLeft >= loopWidth) {
      viewport.scrollLeft -= loopWidth;
    } else if (viewport.scrollLeft < 0) {
      viewport.scrollLeft += loopWidth;
    }
  };

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

  useEffect(() => {
    let active = true;
    const loadHomeData = async () => {
      setLoadingRecentImages(true);
      setRecentImagesError(null);
      setLoadingNotices(true);
      setNoticesError(null);
      try {
        const [profileRes, galleryRes, noticesRes] = await Promise.all([
          fetch("/api/settings/profile"),
          fetch("/api/home/recent-published-products?limit=40"),
          fetch("/api/home/partner-delivery-notices"),
        ]);
        const profilePayload = (await profileRes.json()) as ProfileResponse;
        const galleryPayload = (await galleryRes.json()) as {
          items?: RecentPublishedImage[];
          error?: string;
        };
        const noticesPayload = (await noticesRes.json()) as {
          items?: DeliveryNotice[];
          error?: string;
        };
        if (!active) return;

        setFirstName(
          extractFirstName(profilePayload?.full_name ?? null, profilePayload?.email ?? null)
        );

        if (!galleryRes.ok) {
          setRecentImagesError(
            galleryPayload?.error || "Unable to load recently published products."
          );
          setRecentImages([]);
        } else {
          setRecentImages(Array.isArray(galleryPayload?.items) ? galleryPayload.items : []);
          if (galleryPayload?.error) {
            setRecentImagesError(galleryPayload.error);
          }
        }

        if (!noticesRes.ok) {
          setNoticesError(noticesPayload?.error || "Unable to load partner notices.");
          setDeliveryNotices([]);
        } else {
          setDeliveryNotices(Array.isArray(noticesPayload?.items) ? noticesPayload.items : []);
          if (noticesPayload?.error) {
            setNoticesError(noticesPayload.error);
          }
        }
      } catch (error) {
        if (!active) return;
        setRecentImagesError(
          error instanceof Error
            ? error.message
            : "Unable to load recently published products."
        );
        setNoticesError(
          error instanceof Error ? error.message : "Unable to load partner notices."
        );
      } finally {
        if (active) {
          setLoadingRecentImages(false);
          setLoadingNotices(false);
        }
      }
    };

    loadHomeData();

    return () => {
      active = false;
    };
  }, []);

  const loopedGalleryImages = useMemo(
    () => (recentImages.length > 1 ? [...recentImages, ...recentImages] : recentImages),
    [recentImages]
  );

  useEffect(() => {
    const viewport = galleryViewportRef.current;
    if (!viewport || recentImages.length <= 1) return;

    let raf = 0;
    const speedPerFrame = 0.75;

    const tick = () => {
      if (!dragStateRef.current.active) {
        viewport.scrollLeft += speedPerFrame;
        normalizeLoopScroll(viewport);
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [recentImages.length]);

  const handleGalleryPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = galleryViewportRef.current;
    if (!viewport || recentImages.length <= 1) return;
    dragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
    };
    viewport.setPointerCapture(event.pointerId);
    setIsDraggingGallery(true);
  };

  const handleGalleryPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = galleryViewportRef.current;
    const dragState = dragStateRef.current;
    if (!viewport || !dragState.active || dragState.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragState.startX;
    viewport.scrollLeft = dragState.startScrollLeft - deltaX;
    normalizeLoopScroll(viewport);
  };

  const handleGalleryPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = galleryViewportRef.current;
    const dragState = dragStateRef.current;
    if (dragState.pointerId !== event.pointerId) return;
    dragStateRef.current = {
      active: false,
      pointerId: -1,
      startX: 0,
      startScrollLeft: viewport?.scrollLeft ?? 0,
    };
    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    setIsDraggingGallery(false);
  };

  const reportBody = useMemo(() => {
    if (!report) return "";
    const candidate = report.condensed_markdown || report.report_markdown || "";
    return candidate.trim();
  }, [report]);

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return "Unknown date";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const welcomeHeading = `Welcome ${firstName}, welcome to Nodexo Hub!`;
  const welcomeBody = `This is where we gather and deliver products for our partners in one simple place. Here you can download product images and files, review sales data, explore new product opportunities, and receive curated product suggestions based on market trends. The Hub also gives you access to our AI tools that help you prepare listings, analyze demand, and move faster from idea to live product.

Everything here is designed to help you discover, prepare, and launch products more efficiently. Browse the latest deliveries, explore the data, and pick the items that make sense for your business.`;

  return (
    <div className={styles.layout}>
      <Card className={styles.card}>
        <Title2>{welcomeHeading}</Title2>
        <Text className={styles.subtitle}>{welcomeBody}</Text>
      </Card>

      <Card className={styles.card}>
        <Title3>Recent Newly Published Products</Title3>
        {loadingRecentImages ? (
          <Text className={styles.galleryMeta}>
            <Spinner size="tiny" /> Loading recent ENV gallery...
          </Text>
        ) : recentImagesError ? (
          <Text className={styles.galleryMeta}>{recentImagesError}</Text>
        ) : loopedGalleryImages.length > 0 ? (
          <div
            ref={galleryViewportRef}
            className={mergeClasses(
              styles.galleryViewport,
              isDraggingGallery ? styles.galleryViewportDragging : undefined
            )}
            onPointerDown={handleGalleryPointerDown}
            onPointerMove={handleGalleryPointerMove}
            onPointerUp={handleGalleryPointerUp}
            onPointerCancel={handleGalleryPointerUp}
            onPointerLeave={handleGalleryPointerUp}
          >
            <div className={styles.galleryTrack}>
              {loopedGalleryImages.map((item, index) => (
                <div
                  key={`${item.product_id}-${item.image_url}-${index}`}
                  className={styles.galleryTile}
                  title={item.title ?? item.spu ?? ""}
                >
                  <Image
                    src={item.image_url}
                    alt={
                      item.title
                        ? `${item.title} (${item.spu ?? "Product"})`
                        : item.spu ?? "Recently published product"
                    }
                    width={300}
                    height={300}
                    className={styles.galleryImage}
                    draggable={false}
                    unoptimized
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Text className={styles.galleryMeta}>No recent ENV images available yet.</Text>
        )}
      </Card>

      <div className={styles.splitRow}>
        <Card className={mergeClasses(styles.card, styles.splitCard)}>
          <Title3>{t("home.marketTrends.title")}</Title3>
          <div className={styles.splitScrollArea}>
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
          </div>

          <div className={styles.reportActions}>
            <Text className={styles.reportMeta}>{t("home.marketTrends.viewHint")}</Text>
            <Button appearance="primary" onClick={() => router.push("/app/market-trends")}>
              {t("home.marketTrends.view")}
            </Button>
          </div>
        </Card>

        <Card className={mergeClasses(styles.card, styles.splitCard)}>
          <Title3>Partner Updates</Title3>
          <div className={styles.splitScrollArea}>
            {loadingNotices ? (
              <Text className={styles.noticeMeta}>
                <Spinner size="tiny" /> Loading notices...
              </Text>
            ) : noticesError ? (
              <Text className={styles.noticeMeta}>{noticesError}</Text>
            ) : deliveryNotices.length > 0 ? (
              <div className={styles.noticeList}>
                {deliveryNotices.slice(0, 8).map((notice) => (
                  <div key={notice.id} className={styles.noticeItem}>
                    <Text weight="semibold" className={styles.noticeTitle}>
                      {notice.title}
                    </Text>
                    <Text className={styles.noticeMeta}>
                      Partner: {notice.partner}
                    </Text>
                    <Text className={styles.noticeMeta}>
                      Date: {formatDateTime(notice.created_at)}
                    </Text>
                    <Text className={styles.noticeMeta}>
                      Products: {notice.item_count}
                    </Text>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.noticeList}>
                <div className={styles.noticeItem}>
                  <Text weight="semibold" className={styles.noticeTitle}>
                    Dashboard notice placeholder
                  </Text>
                  <Text className={styles.noticeMeta}>
                    This panel will show latest product deliveries for your company.
                  </Text>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
