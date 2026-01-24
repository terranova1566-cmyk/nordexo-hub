"use client";

import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogSurface,
  DialogTitle,
  Divider,
  Field,
  Image,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  Spinner,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Tag,
  TagGroup,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { extractProductImages } from "@/lib/product-media";
import ProductGallery, { GALLERY_WIDTH } from "@/components/product-gallery";
import { useI18n } from "@/components/i18n-provider";

const GALLERY_CARD_PADDING = 20;
const GALLERY_CARD_BORDER = 2;
const GALLERY_CARD_WIDTH =
  GALLERY_WIDTH + GALLERY_CARD_PADDING * 2 + GALLERY_CARD_BORDER;
const GALLERY_CARD_WIDTH_PX = `${GALLERY_CARD_WIDTH}px`;

const useStyles = makeStyles({
  layout: {
    display: "grid",
    gap: "24px",
    gridTemplateColumns: `${GALLERY_CARD_WIDTH_PX} minmax(0, 1fr)`,
    "@media (max-width: 1100px)": {
      gridTemplateColumns: "1fr",
    },
  },
  card: {
    padding: `${GALLERY_CARD_PADDING}px`,
    borderRadius: "var(--app-radius)",
  },
  galleryCard: {
    width: GALLERY_CARD_WIDTH_PX,
    minWidth: GALLERY_CARD_WIDTH_PX,
    maxWidth: GALLERY_CARD_WIDTH_PX,
    boxSizing: "border-box",
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  infoRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
  },
  metaLabel: {
    color: tokens.colorNeutralForeground3,
  },
  badgeRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  description: {
    color: tokens.colorNeutralForeground2,
  },
  variantImage: {
    width: "44px",
    height: "44px",
    borderRadius: "10px",
    objectFit: "cover",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  sectionTitle: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  titleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    flex: "1 1 240px",
    minWidth: 0,
  },
  titleText: {
    maxWidth: "100%",
    overflowWrap: "anywhere",
  },
  tagGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    alignItems: "center",
  },
  tagItem: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightRegular,
    color: tokens.colorNeutralForeground3,
    lineHeight: "1.2",
  },
  tagSection: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  tabHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  descriptionPanel: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  descriptionSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  bulletsGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 3fr 4fr",
    gap: "16px",
    "@media (max-width: 1100px)": {
      gridTemplateColumns: "1fr",
    },
  },
  tripleGrid: {
    display: "grid",
    gridTemplateColumns: "3fr 7fr",
    gap: "16px",
    "@media (max-width: 1100px)": {
      gridTemplateColumns: "1fr",
    },
  },
  fullRow: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  codeField: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  codeBlock: {
    position: "relative",
    padding: "10px 12px",
    borderRadius: "10px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    whiteSpace: "pre-wrap",
    lineHeight: "1.4",
  },
  codeBlockEmpty: {
    color: tokens.colorNeutralForeground3,
  },
  saveControls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  listSaveButton: {
    borderRadius: "6px",
    fontWeight: tokens.fontWeightSemibold,
    paddingInline: "16px",
  },
  removeButton: {
    minWidth: "32px",
    height: "32px",
    padding: 0,
    borderRadius: "999px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground2,
    "&:hover": {
      color: tokens.colorBrandForeground1,
      backgroundColor: "transparent",
      border: `1px solid ${tokens.colorBrandStroke1}`,
    },
  },
  variantImageHeader: {
    width: "52px",
  },
  variantTable: {
    "& .fui-TableHeaderCell": {
      fontSize: tokens.fontSizeBase100,
      color: tokens.colorNeutralForeground3,
      fontWeight: tokens.fontWeightRegular,
    },
  },
  variantHint: {
    marginTop: "8px",
    color: tokens.colorNeutralForeground3,
  },
});

type ProductResponse = {
  product: {
    id: string;
    spu: string;
    title: string | null;
    subtitle: string | null;
    description_html: string | null;
    tags: string | null;
    shopify_category_name: string | null;
    shopify_category_path: string | null;
    image_folder: string | null;
    images: unknown;
    updated_at: string | null;
    brand: string | null;
    vendor: string | null;
  };
  variants: Array<{
    id: string;
    sku: string;
    option1: string | null;
    option2: string | null;
    option3: string | null;
    option4: string | null;
    variation_color_se: string | null;
    variation_size_se: string | null;
    variation_other_se: string | null;
    variation_amount_se: string | null;
    price: number | null;
    variant_image_url: string | null;
    barcode: string | null;
    b2b_dropship_price_se: number | null;
    b2b_dropship_price_no: number | null;
    b2b_dropship_price_dk: number | null;
    b2b_dropship_price_fi: number | null;
  }>;
  is_saved: boolean;
  is_exported: boolean;
  latest_exported_at: string | null;
  active_markets?: string[];
  image_urls?: string[];
  thumbnail_urls?: string[];
  original_urls?: string[];
  short_title: string | null;
  long_title: string | null;
  description_short: string | null;
  description_extended: string | null;
  subtitle: string | null;
  bullets_short: string | null;
  bullets: string | null;
  bullets_long: string | null;
  specs: string | null;
};

type Wishlist = {
  id: string;
  name: string;
};

const TrashIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" />
    <path d="M4 7l16 0" />
    <path d="M10 11l0 6" />
    <path d="M14 11l0 6" />
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
  </svg>
);

export default function ProductDetailPage() {
  const styles = useStyles();
  const params = useParams();
  const productId = params.id as string;
  const { t } = useI18n();

  const [data, setData] = useState<ProductResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("variants");
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [wishlistsLoading, setWishlistsLoading] = useState(true);
  const [wishlistsError, setWishlistsError] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [isSavingList, setIsSavingList] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/products/${productId}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(t("productDetail.error.load"));
        }

        const payload = await response.json();
        setData(payload);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        setIsLoading(false);
      }
    };

    load();

    return () => controller.abort();
  }, [productId]);

  const fetchWishlists = async (signal?: AbortSignal) => {
    setWishlistsLoading(true);
    setWishlistsError(null);
    try {
      const response = await fetch("/api/products/wishlists", { signal });
      if (!response.ok) {
        throw new Error(t("products.lists.error"));
      }
      const payload = await response.json();
      setWishlists(Array.isArray(payload.items) ? payload.items : []);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setWishlistsError((err as Error).message);
      }
    } finally {
      setWishlistsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchWishlists(controller.signal);
    return () => controller.abort();
  }, []);

  const saveProductToWishlist = async (wishlistId: string) => {
    setIsSavingList(true);
    setError(null);
    try {
      const response = await fetch("/api/products/wishlists/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wishlistId,
          items: [{ product_id: productId }],
        }),
      });
      if (!response.ok) {
        let message = t("products.lists.saveError");
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch {
          // ignore parse failures
        }
        throw new Error(message);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSavingList(false);
    }
  };

  const createWishlist = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const response = await fetch("/api/products/wishlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!response.ok) {
      let message = t("products.lists.createError");
      try {
        const payload = await response.json();
        if (payload?.error) message = payload.error;
      } catch {
        // ignore parse failures
      }
      throw new Error(message);
    }
    const payload = await response.json();
    return payload.item as Wishlist;
  };

  const handleCreateWishlist = async () => {
    if (!newListName.trim()) return;
    setIsSavingList(true);
    setError(null);
    try {
      const created = await createWishlist(newListName);
      if (!created) return;
      setWishlists((prev) => [created, ...prev]);
      setNewListName("");
      setNewListDialogOpen(false);
      await saveProductToWishlist(created.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSavingList(false);
    }
  };

  const removeFromAllWishlists = async () => {
    setError(null);
    try {
      const response = await fetch("/api/products/wishlists/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || t("products.lists.deleteError"));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const tags = useMemo(() => {
    const raw = data?.product.tags ?? "";
    return raw
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }, [data]);

  const activeMarkets = useMemo(() => {
    const markets =
      data?.active_markets && data.active_markets.length > 0
        ? data.active_markets
        : ["SE"];
    return markets.map((market) => market.toUpperCase());
  }, [data]);

  const showDescription = activeMarkets.includes("SE");

  const marketColumns = useMemo(
    () =>
      [
        {
          key: "SE",
          label: "Price SE",
          currency: "SEK",
          getValue: (variant: ProductResponse["variants"][number]) =>
            variant.b2b_dropship_price_se,
        },
        {
          key: "NO",
          label: "Price NO",
          currency: "NOK",
          getValue: (variant: ProductResponse["variants"][number]) =>
            variant.b2b_dropship_price_no,
        },
        {
          key: "DK",
          label: "Price DK",
          currency: "DKK",
          getValue: (variant: ProductResponse["variants"][number]) =>
            variant.b2b_dropship_price_dk,
        },
        {
          key: "FI",
          label: "Price FI",
          currency: "EUR",
          getValue: (variant: ProductResponse["variants"][number]) =>
            variant.b2b_dropship_price_fi,
        },
      ].filter((column) => activeMarkets.includes(column.key)),
    [activeMarkets]
  );

  useEffect(() => {
    if (!showDescription && activeTab === "description") {
      setActiveTab("variants");
    }
  }, [showDescription, activeTab]);

  const images = useMemo(() => {
    if (!data) return [];
    return extractProductImages(data.product, data.variants, data.image_urls);
  }, [data]);
  const originalImages = useMemo(() => {
    if (!data?.original_urls?.length) return images;
    const title = data.product.title ?? data.product.spu ?? "Product";
    return data.original_urls.map((url, index) => ({
      src: url,
      alt: `${title} - Full ${index + 1}`,
    }));
  }, [data, images]);
  const thumbnailImages = useMemo(() => {
    if (!data) return [];
    if (!data.thumbnail_urls?.length) return images;
    const title = data.product.title ?? data.product.spu ?? "Product";
    return data.thumbnail_urls.map((url, index) => ({
      src: url,
      alt: `${title} - Thumbnail ${index + 1}`,
    }));
  }, [data, images]);

  const splitList = (value?: string | null) =>
    value
      ? value
          .split(/\r?\n/)
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];

  const formatList = (items: string[]) =>
    items.length ? items.map((item) => `- ${item}`).join("\n") : "";

  const shortBullets = useMemo(
    () => splitList(data?.bullets_short),
    [data?.bullets_short]
  );
  const normalBullets = useMemo(
    () => splitList(data?.bullets),
    [data?.bullets]
  );
  const longBullets = useMemo(
    () => splitList(data?.bullets_long),
    [data?.bullets_long]
  );
  const specs = useMemo(() => splitList(data?.specs), [data?.specs]);

  const longDescription = data?.product.description_html ?? "";
  const longIsHtml = Boolean(data?.product.description_html);

  const normalizeHtml = (value: string) =>
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const longText =
    typeof longDescription === "string"
      ? longIsHtml
        ? normalizeHtml(longDescription)
        : longDescription
      : "";
  const extendedText = data?.description_extended?.trim() ?? "";

  const CodeField = ({
    label,
    value,
    placeholder,
  }: {
    label: string;
    value: string | null;
    placeholder: string;
  }) => {
    const text = value?.trim() ?? "";
    const display = text || placeholder;
    return (
      <div className={styles.codeField}>
        <Text weight="semibold">{label}</Text>
        <div
          className={mergeClasses(
            styles.codeBlock,
            text ? undefined : styles.codeBlockEmpty
          )}
        >
          {display}
        </div>
      </div>
    );
  };

  const hasVariantImages = useMemo(
    () => data?.variants.some((variant) => Boolean(variant.variant_image_url)),
    [data]
  );

  if (isLoading) {
    return <Spinner label={t("productDetail.loading")} />;
  }

  if (error || !data) {
    return (
      <MessageBar intent="error">
        {error ?? t("productDetail.notFound")}
      </MessageBar>
    );
  }

  const { product, variants, latest_exported_at: latestExport } = data;
  const title = product.title ?? product.spu;

  return (
    <div className={styles.layout}>
        <Card className={mergeClasses(styles.card, styles.galleryCard)}>
          <ProductGallery
            images={images}
            thumbnails={thumbnailImages}
            originals={originalImages}
          />
        </Card>

      <div className={styles.stack}>
        <Card className={styles.card}>
          <div className={styles.sectionTitle}>
            <div className={styles.titleBlock}>
              <Text size={700} weight="semibold" className={styles.titleText}>
                {title}
              </Text>
              {tags.length ? (
                <div className={styles.tagSection}>
                  <TagGroup className={styles.tagGroup}>
                    {tags.map((tag) => (
                      <Tag
                        key={tag}
                        appearance="outline"
                        size="extra-small"
                        className={styles.tagItem}
                      >
                        {tag}
                      </Tag>
                    ))}
                  </TagGroup>
                </div>
              ) : null}
            </div>
            <div className={styles.saveControls}>
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button appearance="outline" className={styles.listSaveButton}>
                    {t("common.save")}
                  </Button>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {wishlistsLoading ? (
                      <MenuItem disabled>{t("products.lists.loading")}</MenuItem>
                    ) : wishlistsError ? (
                      <MenuItem disabled>{wishlistsError}</MenuItem>
                    ) : wishlists.length === 0 ? (
                      <MenuItem disabled>{t("products.lists.empty")}</MenuItem>
                    ) : (
                      wishlists.map((list) => (
                        <MenuItem
                          key={list.id}
                          onClick={() => saveProductToWishlist(list.id)}
                        >
                          {list.name}
                        </MenuItem>
                      ))
                    )}
                    <MenuItem onClick={() => setNewListDialogOpen(true)}>
                      {t("products.lists.new")}
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
              <Button
                appearance="subtle"
                className={styles.removeButton}
                icon={<TrashIcon />}
                aria-label={t("products.removeItem", { title })}
                onClick={removeFromAllWishlists}
              />
            </div>
          </div>

          <Divider />

          <div className={styles.badgeRow}>
            {data.is_exported ? (
              <Badge appearance="tint">
                {t("productDetail.exportedAt", {
                  date: formatDateTime(latestExport),
                })}
              </Badge>
            ) : null}
          </div>

          <div className={styles.infoRow}>
            <div>
              <Text size={200} className={styles.metaLabel}>
                {t("productDetail.meta.sku", { value: product.spu })}
              </Text>
            </div>
            <div>
              <Text size={200} className={styles.metaLabel}>
                {t("productDetail.meta.brand", {
                  value: product.brand ?? t("common.notAvailable"),
                })}
              </Text>
            </div>
            <div>
              <Text size={200} className={styles.metaLabel}>
                {t("productDetail.meta.vendor", {
                  value: product.vendor ?? t("common.notAvailable"),
                })}
              </Text>
            </div>
            <div>
              <Text size={200} className={styles.metaLabel}>
                {t("productDetail.meta.category", {
                  value: product.shopify_category_name ?? t("common.notAvailable"),
                })}
              </Text>
            </div>
            <div>
              <Text size={200} className={styles.metaLabel}>
                {t("productDetail.meta.updated", {
                  value: formatDate(product.updated_at),
                })}
              </Text>
            </div>
          </div>
        </Card>

        <Card className={styles.card}>
          <div className={styles.tabHeader}>
            <TabList
              selectedValue={activeTab}
              onTabSelect={(_, data) => setActiveTab(String(data.value))}
            >
              <Tab value="variants">{t("productDetail.tabs.variants")}</Tab>
              {showDescription ? (
                <Tab value="description">{t("productDetail.tabs.descriptionSe")}</Tab>
              ) : null}
            </TabList>
          </div>
          <Divider />
          {activeTab === "variants" ? (
            <>
              <Table size="small" className={styles.variantTable}>
                <TableHeader>
                  <TableRow>
                  {hasVariantImages ? (
                    <TableHeaderCell
                      aria-label={t("productDetail.table.image")}
                      className={styles.variantImageHeader}
                    />
                  ) : null}
                  <TableHeaderCell>{t("common.sku")}</TableHeaderCell>
                  <TableHeaderCell>{t("common.variant")}</TableHeaderCell>
                  {marketColumns.map((column) => (
                    <TableHeaderCell key={column.key}>
                      {column.label}
                    </TableHeaderCell>
                  ))}
                  <TableHeaderCell>{t("productDetail.table.barcode")}</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {variants.map((variant) => (
                    <TableRow key={variant.id}>
                      {hasVariantImages ? (
                        <TableCell>
                          {variant.variant_image_url ? (
                            <Image
                              src={variant.variant_image_url}
                              alt={variant.sku}
                              className={styles.variantImage}
                            />
                          ) : null}
                        </TableCell>
                      ) : null}
                      <TableCell>{variant.sku}</TableCell>
                      <TableCell>
                        {[
                          variant.variation_color_se,
                          variant.variation_size_se,
                          variant.variation_other_se,
                          variant.variation_amount_se,
                        ]
                          .filter(Boolean)
                          .join(" / ") || t("productDetail.variant.default")}
                      </TableCell>
                      {marketColumns.map((column) => (
                        <TableCell key={`${variant.id}-${column.key}`}>
                          {formatCurrency(
                            column.getValue(variant),
                            column.currency
                          )}
                        </TableCell>
                      ))}
                      <TableCell>{variant.barcode ?? t("common.notAvailable")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {variants.length > 10 ? (
                <Text size={200} className={styles.variantHint}>
                  {t("productDetail.variant.seeAll")}
                </Text>
              ) : null}
            </>
          ) : null}
          {activeTab === "description" && showDescription ? (
            <div className={styles.descriptionPanel}>
              <div className={styles.tripleGrid}>
                <CodeField
                  label={t("productDetail.description.shortTitle")}
                  value={data.short_title}
                  placeholder={t("productDetail.description.shortTitleEmpty")}
                />
                <CodeField
                  label={t("productDetail.description.subtitle")}
                  value={data.subtitle}
                  placeholder={t("productDetail.description.subtitleEmpty")}
                />
              </div>
              <div className={styles.fullRow}>
                <CodeField
                  label={t("productDetail.description.longTitle")}
                  value={data.long_title ?? data.product.title}
                  placeholder={t("productDetail.description.longTitleEmpty")}
                />
              </div>
              <CodeField
                label={t("productDetail.description.shortDescription")}
                value={data.description_short}
                placeholder={t("productDetail.description.shortDescriptionEmpty")}
              />
              <CodeField
                label={t("productDetail.description.longDescription")}
                value={longText || null}
                placeholder={t("productDetail.description.longDescriptionEmpty")}
              />
              <CodeField
                label={t("productDetail.description.extendedDescription")}
                value={extendedText || null}
                placeholder={t("productDetail.description.extendedDescriptionEmpty")}
              />
              <div className={styles.bulletsGrid}>
                <CodeField
                  label={t("productDetail.description.shortBullets")}
                  value={formatList(shortBullets) || null}
                  placeholder={t("productDetail.description.shortBulletsEmpty")}
                />
                <CodeField
                  label={t("productDetail.description.bullets")}
                  value={formatList(normalBullets) || null}
                  placeholder={t("productDetail.description.bulletsEmpty")}
                />
                <CodeField
                  label={t("productDetail.description.longBullets")}
                  value={formatList(longBullets) || null}
                  placeholder={t("productDetail.description.longBulletsEmpty")}
                />
              </div>
              <CodeField
                label={t("productDetail.description.specification")}
                value={formatList(specs) || null}
                placeholder={t("productDetail.description.specificationEmpty")}
              />
            </div>
          ) : null}
        </Card>
      </div>

      <Dialog
        open={newListDialogOpen}
        onOpenChange={(_, data) => setNewListDialogOpen(data.open)}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("products.lists.createTitle")}</DialogTitle>
            <Field label={t("products.lists.nameLabel")}>
              <Input
                value={newListName}
                onChange={(_, data) => setNewListName(data.value)}
                placeholder={t("products.lists.namePlaceholder")}
              />
            </Field>
            <DialogActions>
              <Button appearance="subtle" onClick={() => setNewListDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleCreateWishlist}
                disabled={!newListName.trim() || isSavingList}
              >
                {isSavingList ? t("common.loading") : t("products.lists.new")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
