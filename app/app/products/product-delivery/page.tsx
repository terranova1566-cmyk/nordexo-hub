"use client";

import {
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogSurface,
  DialogTitle,
  MessageBar,
  Spinner,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatCurrency, formatDateTime } from "@/lib/format";

type DeliveryList = {
  id: string;
  name: string;
  created_at: string | null;
  item_count: number;
  preview_images?: string[];
};

type DeliveryListPreviewItem = {
  product_id: string;
  title: string;
  image_url: string | null;
  price_min: number | null;
  price_max: number | null;
};

type DeckHoverPreview = {
  listId: string;
  index: number;
  src: string;
  x: number;
  y: number;
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
  },
  tableCard: {
    padding: "16px",
    borderRadius: "var(--app-radius)",
  },
  tableTitle: {
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: "12px",
  },
  imageExplorerCol: {
    width: "190px",
    minWidth: "190px",
  },
  titleCol: {
    minWidth: "260px",
  },
  dateCol: {
    width: "170px",
    minWidth: "170px",
  },
  itemsCol: {
    width: "120px",
    minWidth: "120px",
  },
  previewCol: {
    width: "120px",
    minWidth: "120px",
  },
  downloadsCol: {
    width: "290px",
    minWidth: "290px",
  },
  queueDeckWrap: {
    position: "relative",
    width: "155px",
    height: "95px",
    paddingBlock: "10px",
  },
  queueDeckThumb: {
    position: "absolute",
    top: "10px",
    width: "75px",
    height: "75px",
    borderRadius: "10px",
    overflow: "hidden",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    cursor: "default",
    boxShadow: tokens.shadow4,
  },
  queueDeckImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  queueDeckPlaceholder: {
    width: "75px",
    height: "75px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  queueZoomPreview: {
    position: "fixed",
    width: "300px",
    height: "300px",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: 2000,
  },
  queueZoomImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  actionWhiteButton: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground1,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
    "&:active": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  downloadsActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  previewDialog: {
    maxWidth: "1080px",
    width: "min(1080px, 96vw)",
  },
  previewBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  previewMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px",
  },
  previewTableWrap: {
    maxHeight: "520px",
    overflow: "auto",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  previewImageCell: {
    width: "90px",
    minWidth: "90px",
  },
  previewThumb: {
    width: "64px",
    height: "64px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  previewThumbImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  previewPriceCell: {
    width: "180px",
    minWidth: "180px",
  },
  previewActionCell: {
    width: "120px",
    minWidth: "120px",
  },
  previewDeleteButton: {
    color: tokens.colorPaletteRedForeground1,
  },
});

const extractErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = await response.json();
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    // ignore parse failures
  }
  try {
    const text = await response.text();
    if (text.trim()) return text.trim();
  } catch {
    // ignore parse failures
  }
  return fallback;
};

const triggerFileDownload = async (response: Response, fallbackFileName: string) => {
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const fileName = match?.[1] ?? fallbackFileName;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const formatPriceRange = (
  min: number | null,
  max: number | null,
  notAvailableLabel: string
) => {
  if (min === null && max === null) return notAvailableLabel;
  const start = min ?? max;
  const end = max ?? min;
  if (start === null || end === null) return notAvailableLabel;
  const startText = formatCurrency(start, "SEK") || notAvailableLabel;
  const endText = formatCurrency(end, "SEK") || notAvailableLabel;
  if (start === end) return startText;
  return `${startText} - ${endText}`;
};

export default function ProductDeliveryPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const [lists, setLists] = useState<DeliveryList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyDownloads, setBusyDownloads] = useState<Set<string>>(new Set());
  const [deckHoverPreview, setDeckHoverPreview] = useState<DeckHoverPreview | null>(null);
  const [previewList, setPreviewList] = useState<DeliveryList | null>(null);
  const [previewItems, setPreviewItems] = useState<DeliveryListPreviewItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  const loadLists = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/product-delivery/digideal/lists");
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, t("products.lists.error")));
      }
      const payload = await response.json();
      setLists(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  const handleDownload = async (list: DeliveryList, mode: "excel" | "images") => {
    const key = `${list.id}:${mode}`;
    setBusyDownloads((prev) => new Set(prev).add(key));
    setError(null);
    try {
      const endpoint = mode === "excel" ? "/api/exports/digideal" : "/api/exports/digideal/images";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "excel"
            ? {
                listId: list.id,
                name: list.name,
                market: "SE",
                dataset: "all",
              }
            : {
                listId: list.id,
                name: list.name,
                imageMode: "all",
              }
        ),
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, t("products.lists.exportError")));
      }
      await triggerFileDownload(
        response,
        mode === "excel" ? "digideal_delivery_all.xlsx" : "digideal_delivery_images.zip"
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyDownloads((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const loadPreviewItems = useCallback(
    async (listId: string) => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const params = new URLSearchParams({ listId });
        const response = await fetch(
          `/api/product-delivery/digideal/lists/items?${params.toString()}`
        );
        if (!response.ok) {
          throw new Error(await extractErrorMessage(response, t("products.error.load")));
        }
        const payload = await response.json();
        setPreviewItems(Array.isArray(payload?.items) ? payload.items : []);
      } catch (err) {
        setPreviewError((err as Error).message);
      } finally {
        setPreviewLoading(false);
      }
    },
    [t]
  );

  const openPreview = async (list: DeliveryList) => {
    setPreviewList(list);
    setPreviewItems([]);
    await loadPreviewItems(list.id);
  };

  const handleRemoveFromPreview = async (productId: string) => {
    if (!previewList || !productId || deletingProductId) return;
    setDeletingProductId(productId);
    setPreviewError(null);
    try {
      const response = await fetch("/api/product-delivery/digideal/lists/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listId: previewList.id,
          productId,
        }),
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, t("products.lists.deleteError")));
      }
      setPreviewItems((prev) => prev.filter((item) => item.product_id !== productId));
      await loadLists();
    } catch (err) {
      setPreviewError((err as Error).message);
    } finally {
      setDeletingProductId(null);
    }
  };

  const previewTitle = useMemo(() => {
    if (!previewList) return t("digidealDelivery.preview.button");
    return `${t("digidealDelivery.preview.title")} - ${previewList.name}`;
  }, [previewList, t]);

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <Text className={styles.title}>{t("digidealDelivery.title")}</Text>
        <Text className={styles.subtitle}>{t("digidealDelivery.subtitle")}</Text>
      </div>

      <Card className={styles.tableCard}>
        <Text className={styles.tableTitle}>{t("digidealDelivery.partner.digideal")}</Text>
        {error ? <MessageBar intent="error">{error}</MessageBar> : null}
        {isLoading ? (
          <Spinner label={t("products.loading")} />
        ) : lists.length === 0 ? (
          <Text>{t("digidealDelivery.table.empty")}</Text>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.imageExplorerCol}>
                  {t("digidealDelivery.table.imageExplorer")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.titleCol}>
                  {t("digidealDelivery.table.title")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.dateCol}>
                  {t("digidealDelivery.table.createdAt")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.itemsCol}>
                  {t("digidealDelivery.table.itemCount")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.previewCol}>
                  {t("digidealDelivery.table.preview")}
                </TableHeaderCell>
                <TableHeaderCell className={styles.downloadsCol}>
                  {t("digidealDelivery.table.downloads")}
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((list) => {
                const deckImages = (list.preview_images ?? []).slice(0, 5);
                return (
                  <TableRow key={list.id}>
                    <TableCell className={styles.imageExplorerCol}>
                      {deckImages.length === 0 ? (
                        <div className={styles.queueDeckPlaceholder}>
                          {t("common.notAvailable")}
                        </div>
                      ) : (
                        <div className={styles.queueDeckWrap}>
                          {deckImages.map((imageUrl, index) => {
                            const isHovered =
                              deckHoverPreview?.listId === list.id &&
                              deckHoverPreview?.index === index;
                            return (
                              <div
                                key={`${list.id}-img-${index}`}
                                className={styles.queueDeckThumb}
                                style={{
                                  left: `${index * 20}px`,
                                  zIndex: isHovered ? 30 : index + 1,
                                }}
                                onMouseEnter={(ev) => {
                                  setDeckHoverPreview({
                                    listId: list.id,
                                    index,
                                    src: imageUrl,
                                    x: ev.clientX,
                                    y: ev.clientY,
                                  });
                                }}
                                onMouseMove={(ev) => {
                                  setDeckHoverPreview((prev) => {
                                    if (!prev) return prev;
                                    if (prev.listId !== list.id || prev.index !== index) {
                                      return prev;
                                    }
                                    return { ...prev, x: ev.clientX, y: ev.clientY };
                                  });
                                }}
                                onMouseLeave={() => {
                                  setDeckHoverPreview((prev) => {
                                    if (!prev) return prev;
                                    if (prev.listId !== list.id || prev.index !== index) {
                                      return prev;
                                    }
                                    return null;
                                  });
                                }}
                              >
                                <img src={imageUrl} alt="" className={styles.queueDeckImage} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={styles.titleCol}>
                      {list.name || t("common.notAvailable")}
                    </TableCell>
                    <TableCell className={styles.dateCol}>
                      {formatDateTime(list.created_at) || t("common.notAvailable")}
                    </TableCell>
                    <TableCell className={styles.itemsCol}>
                      {list.item_count ?? 0}
                    </TableCell>
                    <TableCell className={styles.previewCol}>
                      <Button
                        appearance="outline"
                        size="small"
                        className={styles.actionWhiteButton}
                        onClick={() => {
                          void openPreview(list);
                        }}
                      >
                        {t("digidealDelivery.preview.button")}
                      </Button>
                    </TableCell>
                    <TableCell className={styles.downloadsCol}>
                      <div className={styles.downloadsActions}>
                        <Button
                          appearance="outline"
                          size="small"
                          className={styles.actionWhiteButton}
                          disabled={busyDownloads.has(`${list.id}:excel`)}
                          onClick={() => {
                            void handleDownload(list, "excel");
                          }}
                        >
                          {t("digidealDelivery.download.completeExcel")}
                        </Button>
                        <Button
                          appearance="outline"
                          size="small"
                          className={styles.actionWhiteButton}
                          disabled={busyDownloads.has(`${list.id}:images`)}
                          onClick={() => {
                            void handleDownload(list, "images");
                          }}
                        >
                          {t("digidealDelivery.download.imagesZip")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {deckHoverPreview ? (
        <div
          className={styles.queueZoomPreview}
          style={{
            left: `${deckHoverPreview.x + 24}px`,
            top: `${Math.max(16, deckHoverPreview.y - 150)}px`,
          }}
        >
          <img src={deckHoverPreview.src} alt="" className={styles.queueZoomImage} />
        </div>
      ) : null}

      <Dialog
        open={Boolean(previewList)}
        onOpenChange={(_, data) => {
          if (!data.open) {
            setPreviewList(null);
            setPreviewItems([]);
            setPreviewError(null);
            setPreviewLoading(false);
            setDeletingProductId(null);
          }
        }}
      >
        <DialogSurface className={styles.previewDialog}>
          <DialogBody className={styles.previewBody}>
            <DialogTitle>{previewTitle}</DialogTitle>
            {previewList ? (
              <div className={styles.previewMeta}>
                <Text size={200}>
                  {t("digidealDelivery.preview.productCount", {
                    count: previewItems.length,
                  })}
                </Text>
                <Text size={200}>
                  {formatDateTime(previewList.created_at) || t("common.notAvailable")}
                </Text>
              </div>
            ) : null}
            {previewError ? <MessageBar intent="error">{previewError}</MessageBar> : null}
            {previewLoading ? (
              <Spinner label={t("digidealDelivery.preview.loading")} />
            ) : previewItems.length === 0 ? (
              <Text>{t("digidealDelivery.preview.empty")}</Text>
            ) : (
              <div className={styles.previewTableWrap}>
                <Table size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell className={styles.previewImageCell}>
                        {t("products.table.image")}
                      </TableHeaderCell>
                      <TableHeaderCell>{t("digidealDelivery.preview.table.title")}</TableHeaderCell>
                      <TableHeaderCell className={styles.previewPriceCell}>
                        {t("digidealDelivery.preview.table.priceRange")}
                      </TableHeaderCell>
                      <TableHeaderCell className={styles.previewActionCell}>
                        {t("digidealDelivery.preview.table.actions")}
                      </TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewItems.map((item) => (
                      <TableRow key={item.product_id}>
                        <TableCell className={styles.previewImageCell}>
                          <div className={styles.previewThumb}>
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt=""
                                className={styles.previewThumbImage}
                              />
                            ) : (
                              t("common.notAvailable")
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{item.title || t("common.notAvailable")}</TableCell>
                        <TableCell className={styles.previewPriceCell}>
                          {formatPriceRange(
                            item.price_min,
                            item.price_max,
                            t("common.notAvailable")
                          )}
                        </TableCell>
                        <TableCell className={styles.previewActionCell}>
                          <Button
                            appearance="outline"
                            size="small"
                            disabled={deletingProductId === item.product_id}
                            className={mergeClasses(
                              styles.actionWhiteButton,
                              styles.previewDeleteButton
                            )}
                            onClick={() => {
                              void handleRemoveFromPreview(item.product_id);
                            }}
                          >
                            {t("common.delete")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <DialogActions>
              <Button
                appearance="outline"
                className={styles.actionWhiteButton}
                onClick={() => setPreviewList(null)}
              >
                {t("common.close")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
