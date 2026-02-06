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
  Textarea,
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
import { useCallback, useEffect, useMemo, useState } from "react";
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
  dataPanel: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  dataSection: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  dataSectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  dataGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  },
  dataTableWrap: {
    overflowX: "auto",
  },
  dataInput: {
    minWidth: "140px",
  },
  dataMetaRow: {
    display: "grid",
    gridTemplateColumns: "220px minmax(0, 1fr)",
    gap: "12px",
    alignItems: "start",
  },
  dataMetaKey: {
    color: tokens.colorNeutralForeground2,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
  },
  dataMetaValue: {
    minHeight: "60px",
  },
  dataReadOnly: {
    opacity: 0.6,
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
    shopify_category_id: string | null;
    shopify_category_path: string | null;
    product_type: string | null;
    image_folder: string | null;
    images: unknown;
    video_files: string[] | null;
    updated_at: string | null;
    created_at: string | null;
    visible_updated_at: string | null;
    brand: string | null;
    vendor: string | null;
    supplier_1688_url: string | null;
    google_taxonomy_l1: string | null;
    google_taxonomy_l2: string | null;
    google_taxonomy_l3: string | null;
    product_categorizer_keywords: string | null;
    option1_name: string | null;
    option2_name: string | null;
    option3_name: string | null;
    option4_name: string | null;
    shopify_tingelo_sync: boolean | null;
    shopify_collection_handles: string | null;
    shopify_collection_ids: string | null;
    shopify_tingelo_category_keys: string | null;
    nordic_partner_enabled: boolean | null;
    is_blocked: boolean | null;
    blocked_at: string | null;
    blocked_by: string | null;
    legacy_title_sv: string | null;
    legacy_description_sv: string | null;
    legacy_bullets_sv: string | null;
  };
  variants: Array<{
    id: string;
    sku: string;
    sku_norm: string | null;
    sku_bak: string | null;
    inventory_quantity: number | null;
    option1: string | null;
    option2: string | null;
    option3: string | null;
    option4: string | null;
    option_combined_zh: string | null;
    option1_zh: string | null;
    option2_zh: string | null;
    option3_zh: string | null;
    option4_zh: string | null;
    short_title_zh: string | null;
    variation_color_se: string | null;
    variation_size_se: string | null;
    variation_other_se: string | null;
    variation_amount_se: string | null;
    price: number | null;
    compare_at_price: number | null;
    cost: number | null;
    variant_image_url: string | null;
    barcode: string | null;
    b2b_dropship_price_se: number | null;
    b2b_dropship_price_no: number | null;
    b2b_dropship_price_dk: number | null;
    b2b_dropship_price_fi: number | null;
    shipping_name_en: string | null;
    shipping_name_zh: string | null;
    shipping_class: string | null;
    weight: number | null;
    purchase_price_cny: number | null;
    supplier_name: string | null;
    supplier_location: string | null;
    tax_code: string | null;
    hs_code: string | null;
    country_of_origin: string | null;
    category_code_fq: string | null;
    category_code_ld: string | null;
    taxable: boolean | null;
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
  internal_metafields?: Array<{
    id: string;
    key: string;
    namespace: string;
    value: string | null;
  }>;
};

type Wishlist = {
  id: string;
  name: string;
};

type InternalProductForm = {
  supplier_1688_url: string;
  product_type: string;
  brand: string;
  vendor: string;
  tags: string;
  shopify_category_name: string;
  shopify_category_path: string;
  shopify_category_id: string;
  google_taxonomy_l1: string;
  google_taxonomy_l2: string;
  google_taxonomy_l3: string;
  product_categorizer_keywords: string;
  option1_name: string;
  option2_name: string;
  option3_name: string;
  option4_name: string;
  image_folder: string;
  images: string;
  video_files: string;
  shopify_tingelo_sync: string;
  shopify_collection_handles: string;
  shopify_collection_ids: string;
  shopify_tingelo_category_keys: string;
  nordic_partner_enabled: string;
  is_blocked: string;
  blocked_at: string;
  blocked_by: string;
  legacy_title_sv: string;
  legacy_description_sv: string;
  legacy_bullets_sv: string;
};

type InternalVariantForm = {
  id: string;
  sku: string;
  sku_norm: string;
  sku_bak: string;
  inventory_quantity: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  option_combined_zh: string;
  option1_zh: string;
  option2_zh: string;
  option3_zh: string;
  option4_zh: string;
  short_title_zh: string;
  variation_color_se: string;
  variation_size_se: string;
  variation_other_se: string;
  variation_amount_se: string;
  variant_image_url: string;
  barcode: string;
  price: string;
  compare_at_price: string;
  cost: string;
  b2b_dropship_price_se: string;
  b2b_dropship_price_no: string;
  b2b_dropship_price_dk: string;
  b2b_dropship_price_fi: string;
  supplier_name: string;
  supplier_location: string;
  shipping_name_en: string;
  shipping_name_zh: string;
  shipping_class: string;
  weight: string;
  purchase_price_cny: string;
  tax_code: string;
  hs_code: string;
  country_of_origin: string;
  category_code_fq: string;
  category_code_ld: string;
  taxable: string;
};

type InternalMetafieldForm = {
  id: string;
  key: string;
  namespace: string;
  value: string;
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
  const [internalProduct, setInternalProduct] = useState<InternalProductForm>({
    supplier_1688_url: "",
    product_type: "",
    brand: "",
    vendor: "",
    tags: "",
    shopify_category_name: "",
    shopify_category_path: "",
    shopify_category_id: "",
    google_taxonomy_l1: "",
    google_taxonomy_l2: "",
    google_taxonomy_l3: "",
    product_categorizer_keywords: "",
    option1_name: "",
    option2_name: "",
    option3_name: "",
    option4_name: "",
    image_folder: "",
    images: "",
    video_files: "",
    shopify_tingelo_sync: "",
    shopify_collection_handles: "",
    shopify_collection_ids: "",
    shopify_tingelo_category_keys: "",
    nordic_partner_enabled: "",
    is_blocked: "",
    blocked_at: "",
    blocked_by: "",
    legacy_title_sv: "",
    legacy_description_sv: "",
    legacy_bullets_sv: "",
  });
  const [internalVariants, setInternalVariants] = useState<
    InternalVariantForm[]
  >([]);
  const [internalMetafields, setInternalMetafields] = useState<
    InternalMetafieldForm[]
  >([]);
  const [isSavingInternal, setIsSavingInternal] = useState(false);
  const [internalSaveError, setInternalSaveError] = useState<string | null>(null);
  const [internalSaveSuccess, setInternalSaveSuccess] = useState(false);

  const loadProduct = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/products/${productId}`, {
          signal,
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
    },
    [productId, t]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadProduct(controller.signal);
    return () => controller.abort();
  }, [loadProduct]);

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

  const toText = (value: unknown) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  useEffect(() => {
    if (!data) return;
    const product = data.product;
    setInternalProduct({
      supplier_1688_url: toText(product.supplier_1688_url),
      product_type: toText(product.product_type),
      brand: toText(product.brand),
      vendor: toText(product.vendor),
      tags: toText(product.tags),
      shopify_category_name: toText(product.shopify_category_name),
      shopify_category_path: toText(product.shopify_category_path),
      shopify_category_id: toText(product.shopify_category_id),
      google_taxonomy_l1: toText(product.google_taxonomy_l1),
      google_taxonomy_l2: toText(product.google_taxonomy_l2),
      google_taxonomy_l3: toText(product.google_taxonomy_l3),
      product_categorizer_keywords: toText(product.product_categorizer_keywords),
      option1_name: toText(product.option1_name),
      option2_name: toText(product.option2_name),
      option3_name: toText(product.option3_name),
      option4_name: toText(product.option4_name),
      image_folder: toText(product.image_folder),
      images: toText(product.images),
      video_files: toText(product.video_files),
      shopify_tingelo_sync: toText(product.shopify_tingelo_sync),
      shopify_collection_handles: toText(product.shopify_collection_handles),
      shopify_collection_ids: toText(product.shopify_collection_ids),
      shopify_tingelo_category_keys: toText(product.shopify_tingelo_category_keys),
      nordic_partner_enabled: toText(product.nordic_partner_enabled),
      is_blocked: toText(product.is_blocked),
      blocked_at: toText(product.blocked_at),
      blocked_by: toText(product.blocked_by),
      legacy_title_sv: toText(product.legacy_title_sv),
      legacy_description_sv: toText(product.legacy_description_sv),
      legacy_bullets_sv: toText(product.legacy_bullets_sv),
    });

    setInternalVariants(
      data.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        sku_norm: toText(variant.sku_norm),
        sku_bak: toText(variant.sku_bak),
        inventory_quantity: toText(variant.inventory_quantity),
        option1: toText(variant.option1),
        option2: toText(variant.option2),
        option3: toText(variant.option3),
        option4: toText(variant.option4),
        option_combined_zh: toText(variant.option_combined_zh),
        option1_zh: toText(variant.option1_zh),
        option2_zh: toText(variant.option2_zh),
        option3_zh: toText(variant.option3_zh),
        option4_zh: toText(variant.option4_zh),
        short_title_zh: toText(variant.short_title_zh),
        variation_color_se: toText(variant.variation_color_se),
        variation_size_se: toText(variant.variation_size_se),
        variation_other_se: toText(variant.variation_other_se),
        variation_amount_se: toText(variant.variation_amount_se),
        variant_image_url: toText(variant.variant_image_url),
        barcode: toText(variant.barcode),
        price: toText(variant.price),
        compare_at_price: toText(variant.compare_at_price),
        cost: toText(variant.cost),
        b2b_dropship_price_se: toText(variant.b2b_dropship_price_se),
        b2b_dropship_price_no: toText(variant.b2b_dropship_price_no),
        b2b_dropship_price_dk: toText(variant.b2b_dropship_price_dk),
        b2b_dropship_price_fi: toText(variant.b2b_dropship_price_fi),
        supplier_name: toText(variant.supplier_name),
        supplier_location: toText(variant.supplier_location),
        shipping_name_en: toText(variant.shipping_name_en),
        shipping_name_zh: toText(variant.shipping_name_zh),
        shipping_class: toText(variant.shipping_class),
        weight: toText(variant.weight),
        purchase_price_cny: toText(variant.purchase_price_cny),
        tax_code: toText(variant.tax_code),
        hs_code: toText(variant.hs_code),
        country_of_origin: toText(variant.country_of_origin),
        category_code_fq: toText(variant.category_code_fq),
        category_code_ld: toText(variant.category_code_ld),
        taxable: toText(variant.taxable),
      }))
    );

    setInternalMetafields(
      (data.internal_metafields ?? []).map((field) => ({
        id: field.id,
        key: field.key,
        namespace: field.namespace,
        value: toText(field.value),
      }))
    );
  }, [data]);

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

  const updateInternalProduct = (
    field: keyof InternalProductForm,
    value: string
  ) => {
    setInternalProduct((prev) => ({ ...prev, [field]: value }));
  };

  const updateInternalVariant = (
    id: string,
    field: keyof InternalVariantForm,
    value: string
  ) => {
    setInternalVariants((prev) =>
      prev.map((variant) =>
        variant.id === id ? { ...variant, [field]: value } : variant
      )
    );
  };

  const updateInternalMetafield = (id: string, value: string) => {
    setInternalMetafields((prev) =>
      prev.map((field) => (field.id === id ? { ...field, value } : field))
    );
  };

  const saveInternalData = async () => {
    setIsSavingInternal(true);
    setInternalSaveError(null);
    setInternalSaveSuccess(false);
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: {
            supplier_1688_url: internalProduct.supplier_1688_url,
            product_type: internalProduct.product_type,
            brand: internalProduct.brand,
            vendor: internalProduct.vendor,
            tags: internalProduct.tags,
            shopify_category_name: internalProduct.shopify_category_name,
            shopify_category_path: internalProduct.shopify_category_path,
            shopify_category_id: internalProduct.shopify_category_id,
            google_taxonomy_l1: internalProduct.google_taxonomy_l1,
            google_taxonomy_l2: internalProduct.google_taxonomy_l2,
            google_taxonomy_l3: internalProduct.google_taxonomy_l3,
            product_categorizer_keywords:
              internalProduct.product_categorizer_keywords,
            option1_name: internalProduct.option1_name,
            option2_name: internalProduct.option2_name,
            option3_name: internalProduct.option3_name,
            option4_name: internalProduct.option4_name,
            image_folder: internalProduct.image_folder,
            images: internalProduct.images,
            video_files: internalProduct.video_files,
            shopify_tingelo_sync: internalProduct.shopify_tingelo_sync,
            shopify_collection_handles:
              internalProduct.shopify_collection_handles,
            shopify_collection_ids: internalProduct.shopify_collection_ids,
            shopify_tingelo_category_keys:
              internalProduct.shopify_tingelo_category_keys,
            nordic_partner_enabled: internalProduct.nordic_partner_enabled,
            is_blocked: internalProduct.is_blocked,
            blocked_at: internalProduct.blocked_at,
            blocked_by: internalProduct.blocked_by,
            legacy_title_sv: internalProduct.legacy_title_sv,
            legacy_description_sv: internalProduct.legacy_description_sv,
            legacy_bullets_sv: internalProduct.legacy_bullets_sv,
          },
          variants: internalVariants.map((variant) => ({
            id: variant.id,
            sku_norm: variant.sku_norm,
            sku_bak: variant.sku_bak,
            inventory_quantity: variant.inventory_quantity,
            option1: variant.option1,
            option2: variant.option2,
            option3: variant.option3,
            option4: variant.option4,
            option_combined_zh: variant.option_combined_zh,
            option1_zh: variant.option1_zh,
            option2_zh: variant.option2_zh,
            option3_zh: variant.option3_zh,
            option4_zh: variant.option4_zh,
            short_title_zh: variant.short_title_zh,
            variation_color_se: variant.variation_color_se,
            variation_size_se: variant.variation_size_se,
            variation_other_se: variant.variation_other_se,
            variation_amount_se: variant.variation_amount_se,
            variant_image_url: variant.variant_image_url,
            barcode: variant.barcode,
            price: variant.price,
            compare_at_price: variant.compare_at_price,
            cost: variant.cost,
            b2b_dropship_price_se: variant.b2b_dropship_price_se,
            b2b_dropship_price_no: variant.b2b_dropship_price_no,
            b2b_dropship_price_dk: variant.b2b_dropship_price_dk,
            b2b_dropship_price_fi: variant.b2b_dropship_price_fi,
            supplier_name: variant.supplier_name,
            supplier_location: variant.supplier_location,
            shipping_name_en: variant.shipping_name_en,
            shipping_name_zh: variant.shipping_name_zh,
            shipping_class: variant.shipping_class,
            weight: variant.weight,
            purchase_price_cny: variant.purchase_price_cny,
            tax_code: variant.tax_code,
            hs_code: variant.hs_code,
            country_of_origin: variant.country_of_origin,
            category_code_fq: variant.category_code_fq,
            category_code_ld: variant.category_code_ld,
            taxable: variant.taxable,
          })),
          metafields: internalMetafields.map((field) => ({
            definition_id: field.id,
            value: field.value,
          })),
        }),
      });

      if (!response.ok) {
        let message = t("productDetail.data.saveError");
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch {
          // ignore parse failures
        }
        throw new Error(message);
      }

      setInternalSaveSuccess(true);
      await loadProduct();
    } catch (err) {
      setInternalSaveError((err as Error).message);
    } finally {
      setIsSavingInternal(false);
    }
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
              <Tab value="product-data">{t("productDetail.tabs.productData")}</Tab>
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
          {activeTab === "product-data" ? (
            <div className={styles.dataPanel}>
              <div className={styles.dataSectionHeader}>
                <Text weight="semibold">{t("productDetail.data.title")}</Text>
                <Button
                  appearance="primary"
                  onClick={saveInternalData}
                  disabled={isSavingInternal}
                >
                  {isSavingInternal
                    ? t("common.loading")
                    : t("productDetail.data.save")}
                </Button>
              </div>
              {internalSaveError ? (
                <MessageBar intent="error">{internalSaveError}</MessageBar>
              ) : null}
              {internalSaveSuccess ? (
                <MessageBar intent="success">
                  {t("productDetail.data.saveSuccess")}
                </MessageBar>
              ) : null}
              <div className={styles.dataSection}>
                <Text weight="semibold">
                  {t("productDetail.data.section.supplier")}
                </Text>
                <div className={styles.dataGrid}>
                  <Field label={t("productDetail.data.supplier1688")}>
                    <Input
                      value={internalProduct.supplier_1688_url}
                      onChange={(_, data) =>
                        updateInternalProduct("supplier_1688_url", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.brand")}>
                    <Input
                      value={internalProduct.brand}
                      onChange={(_, data) =>
                        updateInternalProduct("brand", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.vendor")}>
                    <Input
                      value={internalProduct.vendor}
                      onChange={(_, data) =>
                        updateInternalProduct("vendor", data.value)
                      }
                    />
                  </Field>
                </div>
              </div>

              <Divider />

              <div className={styles.dataSection}>
                <Text weight="semibold">
                  {t("productDetail.data.section.catalog")}
                </Text>
                <div className={styles.dataGrid}>
                  <Field label={t("productDetail.data.productType")}>
                    <Input
                      value={internalProduct.product_type}
                      onChange={(_, data) =>
                        updateInternalProduct("product_type", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.tags")}>
                    <Input
                      value={internalProduct.tags}
                      onChange={(_, data) =>
                        updateInternalProduct("tags", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.shopifyCategoryName")}>
                    <Input
                      value={internalProduct.shopify_category_name}
                      onChange={(_, data) =>
                        updateInternalProduct(
                          "shopify_category_name",
                          data.value
                        )
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.shopifyCategoryPath")}>
                    <Input
                      value={internalProduct.shopify_category_path}
                      onChange={(_, data) =>
                        updateInternalProduct(
                          "shopify_category_path",
                          data.value
                        )
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.shopifyCategoryId")}>
                    <Input
                      value={internalProduct.shopify_category_id}
                      onChange={(_, data) =>
                        updateInternalProduct(
                          "shopify_category_id",
                          data.value
                        )
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.googleTaxonomyL1")}>
                    <Input
                      value={internalProduct.google_taxonomy_l1}
                      onChange={(_, data) =>
                        updateInternalProduct("google_taxonomy_l1", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.googleTaxonomyL2")}>
                    <Input
                      value={internalProduct.google_taxonomy_l2}
                      onChange={(_, data) =>
                        updateInternalProduct("google_taxonomy_l2", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.googleTaxonomyL3")}>
                    <Input
                      value={internalProduct.google_taxonomy_l3}
                      onChange={(_, data) =>
                        updateInternalProduct("google_taxonomy_l3", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.categorizerKeywords")}>
                    <Textarea
                      value={internalProduct.product_categorizer_keywords}
                      onChange={(_, data) =>
                        updateInternalProduct(
                          "product_categorizer_keywords",
                          data.value
                        )
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.option1Name")}>
                    <Input
                      value={internalProduct.option1_name}
                      onChange={(_, data) =>
                        updateInternalProduct("option1_name", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.option2Name")}>
                    <Input
                      value={internalProduct.option2_name}
                      onChange={(_, data) =>
                        updateInternalProduct("option2_name", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.option3Name")}>
                    <Input
                      value={internalProduct.option3_name}
                      onChange={(_, data) =>
                        updateInternalProduct("option3_name", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.option4Name")}>
                    <Input
                      value={internalProduct.option4_name}
                      onChange={(_, data) =>
                        updateInternalProduct("option4_name", data.value)
                      }
                    />
                  </Field>
                </div>
              </div>

              <Divider />

              <div className={styles.dataSection}>
                <Text weight="semibold">
                  {t("productDetail.data.section.collections")}
                </Text>
                <div className={styles.dataGrid}>
                  <Field label={t("productDetail.data.shopifyCollectionHandles")}>
                    <Textarea
                      value={internalProduct.shopify_collection_handles}
                      onChange={(_, data) =>
                        updateInternalProduct(
                          "shopify_collection_handles",
                          data.value
                        )
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.shopifyCollectionIds")}>
                    <Textarea
                      value={internalProduct.shopify_collection_ids}
                      onChange={(_, data) =>
                        updateInternalProduct(
                          "shopify_collection_ids",
                          data.value
                        )
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.shopifyCategoryKeys")}>
                    <Textarea
                      value={internalProduct.shopify_tingelo_category_keys}
                      onChange={(_, data) =>
                        updateInternalProduct(
                          "shopify_tingelo_category_keys",
                          data.value
                        )
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.shopifySync")}>
                    <Input
                      value={internalProduct.shopify_tingelo_sync}
                      onChange={(_, data) =>
                        updateInternalProduct(
                          "shopify_tingelo_sync",
                          data.value
                        )
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.nordicPartnerEnabled")}>
                    <Input
                      value={internalProduct.nordic_partner_enabled}
                      onChange={(_, data) =>
                        updateInternalProduct(
                          "nordic_partner_enabled",
                          data.value
                        )
                      }
                    />
                  </Field>
                </div>
              </div>

              <Divider />

              <div className={styles.dataSection}>
                <Text weight="semibold">
                  {t("productDetail.data.section.media")}
                </Text>
                <div className={styles.dataGrid}>
                  <Field label={t("productDetail.data.imageFolder")}>
                    <Input
                      value={internalProduct.image_folder}
                      onChange={(_, data) =>
                        updateInternalProduct("image_folder", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.images")}>
                    <Textarea
                      value={internalProduct.images}
                      onChange={(_, data) =>
                        updateInternalProduct("images", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.videoFiles")}>
                    <Textarea
                      value={internalProduct.video_files}
                      onChange={(_, data) =>
                        updateInternalProduct("video_files", data.value)
                      }
                    />
                  </Field>
                </div>
              </div>

              <Divider />

              <div className={styles.dataSection}>
                <Text weight="semibold">
                  {t("productDetail.data.section.status")}
                </Text>
                <div className={styles.dataGrid}>
                  <Field label={t("productDetail.data.isBlocked")}>
                    <Input
                      value={internalProduct.is_blocked}
                      onChange={(_, data) =>
                        updateInternalProduct("is_blocked", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.blockedAt")}>
                    <Input
                      value={internalProduct.blocked_at}
                      onChange={(_, data) =>
                        updateInternalProduct("blocked_at", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.blockedBy")}>
                    <Input
                      value={internalProduct.blocked_by}
                      onChange={(_, data) =>
                        updateInternalProduct("blocked_by", data.value)
                      }
                    />
                  </Field>
                </div>
              </div>

              <Divider />

              <div className={styles.dataSection}>
                <Text weight="semibold">
                  {t("productDetail.data.section.legacy")}
                </Text>
                <div className={styles.dataGrid}>
                  <Field label={t("productDetail.data.legacyTitleSv")}>
                    <Textarea
                      value={internalProduct.legacy_title_sv}
                      onChange={(_, data) =>
                        updateInternalProduct("legacy_title_sv", data.value)
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.legacyDescriptionSv")}>
                    <Textarea
                      value={internalProduct.legacy_description_sv}
                      onChange={(_, data) =>
                        updateInternalProduct(
                          "legacy_description_sv",
                          data.value
                        )
                      }
                    />
                  </Field>
                  <Field label={t("productDetail.data.legacyBulletsSv")}>
                    <Textarea
                      value={internalProduct.legacy_bullets_sv}
                      onChange={(_, data) =>
                        updateInternalProduct(
                          "legacy_bullets_sv",
                          data.value
                        )
                      }
                    />
                  </Field>
                </div>
              </div>

              <Divider />

              <div className={styles.dataSection}>
                <Text weight="semibold">
                  {t("productDetail.data.section.variantIdentity")}
                </Text>
                <div className={styles.dataTableWrap}>
                  <Table size="small" className={styles.variantTable}>
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>{t("productDetail.data.variantSku")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.variantSkuNorm")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.variantSkuBak")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.option1")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.option2")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.option3")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.option4")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.optionCombinedZh")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.option1Zh")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.option2Zh")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.option3Zh")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.option4Zh")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.variationColorSe")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.variationSizeSe")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.variationOtherSe")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.variationAmountSe")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.shortTitleZh")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.barcode")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.variantImage")}</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {internalVariants.map((variant) => (
                        <TableRow key={variant.id}>
                          <TableCell>{variant.sku}</TableCell>
                          <TableCell>
                            <Input
                              value={variant.sku_norm}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "sku_norm",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.sku_bak}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "sku_bak",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.option1}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "option1",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.option2}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "option2",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.option3}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "option3",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.option4}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "option4",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.option_combined_zh}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "option_combined_zh",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.option1_zh}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "option1_zh",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.option2_zh}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "option2_zh",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.option3_zh}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "option3_zh",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.option4_zh}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "option4_zh",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.variation_color_se}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "variation_color_se",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.variation_size_se}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "variation_size_se",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.variation_other_se}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "variation_other_se",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.variation_amount_se}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "variation_amount_se",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.short_title_zh}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "short_title_zh",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.barcode}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "barcode",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.variant_image_url}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "variant_image_url",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Divider />

              <div className={styles.dataSection}>
                <Text weight="semibold">
                  {t("productDetail.data.section.pricing")}
                </Text>
                <div className={styles.dataTableWrap}>
                  <Table size="small" className={styles.variantTable}>
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>{t("productDetail.data.variantSku")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.variantSupplier")}</TableHeaderCell>
                        <TableHeaderCell>
                          {t("productDetail.data.variantSupplierLocation")}
                        </TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.shippingName")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.shippingNameZh")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.shippingClass")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.weight")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.purchasePriceCny")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.cost")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.price")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.compareAtPrice")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.b2bSe")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.b2bNo")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.b2bDk")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.b2bFi")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.taxable")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.taxCode")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.hsCode")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.countryOfOrigin")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.categoryCodeFq")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.categoryCodeLd")}</TableHeaderCell>
                        <TableHeaderCell>{t("productDetail.data.inventoryQty")}</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {internalVariants.map((variant) => (
                        <TableRow key={variant.id}>
                          <TableCell>{variant.sku}</TableCell>
                          <TableCell>
                            <Input
                              value={variant.supplier_name}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "supplier_name",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.supplier_location}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "supplier_location",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.shipping_name_en}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "shipping_name_en",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.shipping_name_zh}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "shipping_name_zh",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.shipping_class}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "shipping_class",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.weight}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "weight",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.purchase_price_cny}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "purchase_price_cny",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.cost}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "cost",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.price}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "price",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.compare_at_price}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "compare_at_price",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.b2b_dropship_price_se}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "b2b_dropship_price_se",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.b2b_dropship_price_no}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "b2b_dropship_price_no",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.b2b_dropship_price_dk}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "b2b_dropship_price_dk",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.b2b_dropship_price_fi}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "b2b_dropship_price_fi",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.taxable}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "taxable",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.tax_code}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "tax_code",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.hs_code}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "hs_code",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.country_of_origin}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "country_of_origin",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.category_code_fq}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "category_code_fq",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.category_code_ld}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "category_code_ld",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.inventory_quantity}
                              className={styles.dataInput}
                              size="small"
                              onChange={(_, data) =>
                                updateInternalVariant(
                                  variant.id,
                                  "inventory_quantity",
                                  data.value
                                )
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Divider />

              <div className={styles.dataSection}>
                <Text weight="semibold">
                  {t("productDetail.data.section.metafields")}
                </Text>
                {internalMetafields.length === 0 ? (
                  <Text size={200}>
                    {t("productDetail.data.metafieldsEmpty")}
                  </Text>
                ) : (
                  internalMetafields.map((field) => (
                    <div key={field.id} className={styles.dataMetaRow}>
                      <Text className={styles.dataMetaKey} size={200}>
                        {field.namespace
                          ? `${field.namespace}.${field.key}`
                          : field.key}
                      </Text>
                      <Textarea
                        value={field.value}
                        className={styles.dataMetaValue}
                        onChange={(_, data) =>
                          updateInternalMetafield(field.id, data.value)
                        }
                      />
                    </div>
                  ))
                )}
              </div>

              <div className={styles.dataSectionHeader}>
                <Text size={200} className={styles.metaLabel}>
                  {t("productDetail.data.saveHint")}
                </Text>
                <Button
                  appearance="primary"
                  onClick={saveInternalData}
                  disabled={isSavingInternal}
                >
                  {isSavingInternal
                    ? t("common.loading")
                    : t("productDetail.data.save")}
                </Button>
              </div>
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
