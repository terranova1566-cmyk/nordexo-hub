"use client";

import {
  Badge,
  Button,
  Card,
  Checkbox,
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
  MenuPopover,
  MenuTrigger,
  MessageBar,
  Popover,
  PopoverSurface,
  PopoverTrigger,
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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
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
  infoSecondaryRow: {
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  infoValue: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    overflowWrap: "anywhere",
  },
  supplierLink: {
    color: tokens.colorBrandForeground1,
    textDecorationLine: "none",
    overflowWrap: "anywhere",
    wordBreak: "break-all",
    "&:hover": {
      textDecorationLine: "underline",
    },
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
  descriptionToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "8px",
    flexWrap: "wrap",
  },
  descriptionActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  descriptionContentWrap: {
    position: "relative",
  },
  descriptionContent: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  descriptionContentBusy: {
    filter: "blur(1px)",
    opacity: 0.6,
  },
  descriptionOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    backdropFilter: "blur(2px)",
    zIndex: 2,
  },
  descriptionTextarea: {
    minHeight: "120px",
    resize: "vertical",
  },
  descriptionSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  aiPreviewNotice: {
    backgroundColor: "#fffce5",
    border: "1px solid #ffd12a",
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
    gap: "24px",
  },
  dataSection: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    padding: "16px",
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  dataSectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  dataSectionToggle: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    border: "none",
    backgroundColor: "transparent",
    padding: 0,
    margin: 0,
    textAlign: "left",
    cursor: "pointer",
  },
  dataSectionToggleCompact: {
    width: "auto",
    flex: "1 1 auto",
    minWidth: 0,
  },
  dataSectionToggleRight: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  dataSectionEmptyBadge: {
    color: tokens.colorNeutralForeground3,
  },
  dataSectionChevron: {
    fontFamily: tokens.fontFamilyMonospace,
    color: tokens.colorNeutralForeground2,
    minWidth: "10px",
    textAlign: "center",
  },
  dataTableHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    flexWrap: "nowrap",
    marginBottom: "4px",
  },
  dataScrollControls: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  },
  dataTableActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    marginLeft: "auto",
    flexShrink: 0,
  },
  dataScrollButton: {
    minWidth: "24px",
    width: "24px",
    height: "24px",
    paddingInline: 0,
    borderRadius: "6px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    fontSize: tokens.fontSizeBase100,
    lineHeight: 1,
  },
  columnMenuButton: {
    minHeight: "24px",
    height: "24px",
    paddingInline: "8px",
    whiteSpace: "nowrap",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    fontSize: tokens.fontSizeBase100,
  },
  columnMenuList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "10px 12px",
    maxHeight: "340px",
    overflowY: "auto",
    minWidth: "240px",
  },
  columnMenuCheckbox: {
    "& .fui-Checkbox__label": {
      fontSize: tokens.fontSizeBase200,
    },
  },
  dataGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "16px",
  },
  dataWideField: {
    gridColumn: "1 / -1",
  },
  taxonomyTrigger: {
    justifyContent: "space-between",
    width: "100%",
    textAlign: "left",
    fontWeight: tokens.fontWeightRegular,
  },
  taxonomyPopover: {
    padding: "12px",
    width: "min(840px, calc(100vw - 48px))",
    maxWidth: "100%",
  },
  taxonomySearch: {
    marginBottom: "10px",
  },
  taxonomyColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "12px",
    alignItems: "start",
    "@media (max-width: 960px)": {
      gridTemplateColumns: "1fr",
    },
  },
  taxonomyColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    maxHeight: "360px",
    overflowY: "auto",
    paddingRight: "8px",
  },
  taxonomyColumnTitle: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
  taxonomyItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 6px",
    borderRadius: "6px",
    width: "100%",
    boxSizing: "border-box",
    backgroundColor: "transparent",
    transition: "background-color 0.12s ease",
  },
  taxonomyItemInteractive: {
    cursor: "pointer",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
    "&:focus-visible": {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "1px",
    },
  },
  taxonomyItemSelected: {
    backgroundColor: tokens.colorNeutralBackground3,
  },
  taxonomyItemText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
  },
  taxonomyActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "12px",
  },
  dataTableWrap: {
    overflowX: "auto",
    maxWidth: "100%",
    padding: "8px",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    scrollbarGutter: "stable both-edges",
  },
  dataInput: {
    minWidth: "180px",
  },
  dataMetaRow: {
    display: "grid",
    gridTemplateColumns: "260px minmax(0, 1fr)",
    gap: "16px",
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
  dataWideTable: {
    width: "max-content",
    minWidth: "100%",
    "& .fui-TableCell": {
      verticalAlign: "top",
    },
  },
  dataStickyLeftCell: {
    position: "sticky",
    left: 0,
    zIndex: 2,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: `1px 0 0 ${tokens.colorNeutralStroke2}`,
  },
  dataStickyLeftHeaderCell: {
    position: "sticky",
    left: 0,
    zIndex: 3,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: `1px 0 0 ${tokens.colorNeutralStroke2}`,
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
    google_taxonomy_id: number | null;
    google_taxonomy_id_secondary: number | null;
    google_taxonomy_path: string | null;
    google_taxonomy_path_secondary: string | null;
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

type CategoryNode = {
  name: string;
  children: CategoryNode[];
};

type TaxonomySelection = {
  l1: string | null;
  l2: string | null;
  l3: string | null;
};

type ProductDataSectionKey =
  | "supplier"
  | "catalog"
  | "collections"
  | "media"
  | "status"
  | "legacy"
  | "variantIdentity"
  | "pricing"
  | "metafields";

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

type VariantIdentityColumnKey =
  | "sku_norm"
  | "sku_bak"
  | "option1"
  | "option2"
  | "option3"
  | "option4"
  | "option_combined_zh"
  | "option1_zh"
  | "option2_zh"
  | "option3_zh"
  | "option4_zh"
  | "variation_color_se"
  | "variation_size_se"
  | "variation_other_se"
  | "variation_amount_se"
  | "short_title_zh"
  | "barcode"
  | "variant_image_url";

type VariantPricingColumnKey =
  | "supplier_name"
  | "supplier_location"
  | "shipping_name_en"
  | "shipping_name_zh"
  | "shipping_class"
  | "weight"
  | "purchase_price_cny"
  | "cost"
  | "price"
  | "compare_at_price"
  | "b2b_dropship_price_se"
  | "b2b_dropship_price_no"
  | "b2b_dropship_price_dk"
  | "b2b_dropship_price_fi"
  | "taxable"
  | "tax_code"
  | "hs_code"
  | "country_of_origin"
  | "category_code_fq"
  | "category_code_ld"
  | "inventory_quantity";

type VariantColumnConfig<K extends string> = {
  key: K;
  label: string;
  readOnly?: boolean;
};

type DescriptionForm = {
  short_title: string;
  subtitle: string;
  long_title: string;
  description_short: string;
  description_main: string;
  description_extended: string;
  bullets_short: string;
  bullets: string;
  bullets_long: string;
  specs: string;
};

const CJK_CHAR_PATTERN = /[\u3400-\u9FFF\uF900-\uFAFF]/g;

const sanitizeSwedishVariantPart = (value: string | null) => {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const cleaned = raw
    .replace(CJK_CHAR_PATTERN, "")
    .replace(/[，。；：、]/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*[/|]\s*$/g, "")
    .replace(/^\s*[/|]\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || raw;
};

const buildSwedishVariantLabel = (variant: ProductResponse["variants"][number]) =>
  [
    variant.variation_color_se,
    variant.variation_size_se,
    variant.variation_other_se,
    variant.variation_amount_se,
  ]
    .map(sanitizeSwedishVariantPart)
    .filter(Boolean)
    .join(" / ");

const buildGoogleTaxonomyLabel = (product: ProductResponse["product"]) => {
  const levels = [
    product.google_taxonomy_l1,
    product.google_taxonomy_l2,
    product.google_taxonomy_l3,
  ]
    .map((entry) => entry?.trim())
    .filter(Boolean) as string[];
  if (levels.length) return levels.join(" / ");
  const primaryPath = product.google_taxonomy_path?.trim();
  if (primaryPath) return primaryPath;
  const secondaryPath = product.google_taxonomy_path_secondary?.trim();
  return secondaryPath || null;
};

export default function ProductDetailPage() {
  const styles = useStyles();
  const params = useParams<{ id?: string | string[]; spu?: string | string[] }>();
  const routeProductParamRaw = (() => {
    const idValue = params.id;
    if (typeof idValue === "string") return idValue;
    if (Array.isArray(idValue) && idValue.length > 0) return idValue[0];
    const spuValue = params.spu;
    if (typeof spuValue === "string") return spuValue;
    if (Array.isArray(spuValue) && spuValue.length > 0) return spuValue[0];
    return "";
  })();
  const routeProductParam = (() => {
    try {
      return decodeURIComponent(routeProductParamRaw).trim();
    } catch {
      return routeProductParamRaw.trim();
    }
  })();
  const { t } = useI18n();

  const variantIdentityTableRef = useRef<HTMLDivElement | null>(null);
  const variantPricingTableRef = useRef<HTMLDivElement | null>(null);

  const [data, setData] = useState<ProductResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("variants");
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
  const [visibleIdentityEmptyColumns, setVisibleIdentityEmptyColumns] = useState<
    Set<VariantIdentityColumnKey>
  >(new Set());
  const [visiblePricingEmptyColumns, setVisiblePricingEmptyColumns] = useState<
    Set<VariantPricingColumnKey>
  >(new Set());
  const [isSavingInternal, setIsSavingInternal] = useState(false);
  const [internalSaveError, setInternalSaveError] = useState<string | null>(null);
  const [internalSaveSuccess, setInternalSaveSuccess] = useState(false);
  const [taxonomyPopoverOpen, setTaxonomyPopoverOpen] = useState(false);
  const [taxonomySearch, setTaxonomySearch] = useState("");
  const [taxonomyCategories, setTaxonomyCategories] = useState<CategoryNode[]>([]);
  const [taxonomyCategoriesLoading, setTaxonomyCategoriesLoading] = useState(true);
  const [taxonomyCategoriesError, setTaxonomyCategoriesError] = useState<string | null>(
    null
  );
  const [taxonomyDraft, setTaxonomyDraft] = useState<TaxonomySelection>({
    l1: null,
    l2: null,
    l3: null,
  });
  const [taxonomyActiveL1, setTaxonomyActiveL1] = useState<string | null>(null);
  const [taxonomyActiveL2, setTaxonomyActiveL2] = useState<string | null>(null);
  const [collapsedDataSections, setCollapsedDataSections] = useState<
    Record<ProductDataSectionKey, boolean>
  >({
    supplier: false,
    catalog: false,
    collections: false,
    media: false,
    status: false,
    legacy: false,
    variantIdentity: false,
    pricing: false,
    metafields: false,
  });
  const [descriptionDraft, setDescriptionDraft] = useState<DescriptionForm | null>(
    null
  );
  const [descriptionBaseline, setDescriptionBaseline] =
    useState<DescriptionForm | null>(null);
  const [descriptionSaveError, setDescriptionSaveError] = useState<string | null>(
    null
  );
  const [descriptionSaveSuccess, setDescriptionSaveSuccess] =
    useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false);
  const [regenerateInstruction, setRegenerateInstruction] = useState("");
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [aiPreviewActive, setAiPreviewActive] = useState(false);
  const [aiSnapshot, setAiSnapshot] = useState<DescriptionForm | null>(null);
  const resolvedProductId = data?.product?.id ?? routeProductParam;

  const variantIdentityColumns = useMemo<
    VariantColumnConfig<VariantIdentityColumnKey>[]
  >(
    () => [
      {
        key: "sku_norm",
        label: t("productDetail.data.variantSkuNorm"),
        readOnly: true,
      },
      { key: "sku_bak", label: t("productDetail.data.variantSkuBak") },
      { key: "option1", label: t("productDetail.data.option1") },
      { key: "option2", label: t("productDetail.data.option2") },
      { key: "option3", label: t("productDetail.data.option3") },
      { key: "option4", label: t("productDetail.data.option4") },
      {
        key: "option_combined_zh",
        label: t("productDetail.data.optionCombinedZh"),
      },
      { key: "option1_zh", label: t("productDetail.data.option1Zh") },
      { key: "option2_zh", label: t("productDetail.data.option2Zh") },
      { key: "option3_zh", label: t("productDetail.data.option3Zh") },
      { key: "option4_zh", label: t("productDetail.data.option4Zh") },
      {
        key: "variation_color_se",
        label: t("productDetail.data.variationColorSe"),
      },
      {
        key: "variation_size_se",
        label: t("productDetail.data.variationSizeSe"),
      },
      {
        key: "variation_other_se",
        label: t("productDetail.data.variationOtherSe"),
      },
      {
        key: "variation_amount_se",
        label: t("productDetail.data.variationAmountSe"),
      },
      { key: "short_title_zh", label: t("productDetail.data.shortTitleZh") },
      { key: "barcode", label: t("productDetail.data.barcode") },
      { key: "variant_image_url", label: t("productDetail.data.variantImage") },
    ],
    [t]
  );

  const variantPricingColumns = useMemo<
    VariantColumnConfig<VariantPricingColumnKey>[]
  >(
    () => [
      { key: "supplier_name", label: t("productDetail.data.variantSupplier") },
      {
        key: "supplier_location",
        label: t("productDetail.data.variantSupplierLocation"),
      },
      { key: "shipping_name_en", label: t("productDetail.data.shippingName") },
      { key: "shipping_name_zh", label: t("productDetail.data.shippingNameZh") },
      { key: "shipping_class", label: t("productDetail.data.shippingClass") },
      { key: "weight", label: t("productDetail.data.weight") },
      {
        key: "purchase_price_cny",
        label: t("productDetail.data.purchasePriceCny"),
      },
      { key: "cost", label: t("productDetail.data.cost") },
      { key: "price", label: t("productDetail.data.price") },
      { key: "compare_at_price", label: t("productDetail.data.compareAtPrice") },
      { key: "b2b_dropship_price_se", label: t("productDetail.data.b2bSe") },
      { key: "b2b_dropship_price_no", label: t("productDetail.data.b2bNo") },
      { key: "b2b_dropship_price_dk", label: t("productDetail.data.b2bDk") },
      { key: "b2b_dropship_price_fi", label: t("productDetail.data.b2bFi") },
      { key: "taxable", label: t("productDetail.data.taxable") },
      { key: "tax_code", label: t("productDetail.data.taxCode") },
      { key: "hs_code", label: t("productDetail.data.hsCode") },
      {
        key: "country_of_origin",
        label: t("productDetail.data.countryOfOrigin"),
      },
      { key: "category_code_fq", label: t("productDetail.data.categoryCodeFq") },
      { key: "category_code_ld", label: t("productDetail.data.categoryCodeLd") },
      { key: "inventory_quantity", label: t("productDetail.data.inventoryQty") },
    ],
    [t]
  );

  const identityColumnsWithData = useMemo(() => {
    const out = new Set<VariantIdentityColumnKey>();
    variantIdentityColumns.forEach((column) => {
      const hasData = internalVariants.some(
        (variant) => variant[column.key].trim().length > 0
      );
      if (hasData) out.add(column.key);
    });
    return out;
  }, [internalVariants, variantIdentityColumns]);

  const pricingColumnsWithData = useMemo(() => {
    const out = new Set<VariantPricingColumnKey>();
    variantPricingColumns.forEach((column) => {
      const hasData = internalVariants.some(
        (variant) => variant[column.key].trim().length > 0
      );
      if (hasData) out.add(column.key);
    });
    return out;
  }, [internalVariants, variantPricingColumns]);

  const visibleIdentityColumns = useMemo(
    () =>
      variantIdentityColumns.filter(
        (column) =>
          identityColumnsWithData.has(column.key) ||
          visibleIdentityEmptyColumns.has(column.key)
      ),
    [variantIdentityColumns, identityColumnsWithData, visibleIdentityEmptyColumns]
  );

  const visiblePricingColumns = useMemo(
    () =>
      variantPricingColumns.filter(
        (column) =>
          pricingColumnsWithData.has(column.key) ||
          visiblePricingEmptyColumns.has(column.key)
      ),
    [variantPricingColumns, pricingColumnsWithData, visiblePricingEmptyColumns]
  );

  const taxonomySummary = useMemo(() => {
    const parts = [
      internalProduct.google_taxonomy_l1,
      internalProduct.google_taxonomy_l2,
      internalProduct.google_taxonomy_l3,
    ]
      .map((entry) => entry.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts.join(" > ") : t("discovery.categories.all");
  }, [
    internalProduct.google_taxonomy_l1,
    internalProduct.google_taxonomy_l2,
    internalProduct.google_taxonomy_l3,
    t,
  ]);

  const taxonomySearchNormalized = taxonomySearch.trim().toLowerCase();
  const taxonomyTokens = useMemo(
    () => taxonomySearchNormalized.split(/\s+/).filter(Boolean),
    [taxonomySearchNormalized]
  );
  const taxonomyMatchesSearch = useCallback(
    (value: string) => {
      if (taxonomyTokens.length === 0) return true;
      const normalized = value.toLowerCase();
      return taxonomyTokens.some((token) => normalized.includes(token));
    },
    [taxonomyTokens]
  );

  const filteredTaxonomyCategories = useMemo(() => {
    if (taxonomyTokens.length === 0) return taxonomyCategories;
    return taxonomyCategories.filter((l1) => {
      if (taxonomyMatchesSearch(l1.name)) return true;
      return (l1.children ?? []).some((l2) => {
        if (taxonomyMatchesSearch(l2.name)) return true;
        return (l2.children ?? []).some((l3) => taxonomyMatchesSearch(l3.name));
      });
    });
  }, [taxonomyCategories, taxonomyTokens.length, taxonomyMatchesSearch]);

  const filteredTaxonomyL2Nodes = useMemo(() => {
    const l1Node = filteredTaxonomyCategories.find(
      (node) => node.name === taxonomyActiveL1
    );
    const nodes = l1Node?.children ?? [];
    if (taxonomyTokens.length === 0) return nodes;
    return nodes.filter(
      (l2) =>
        taxonomyMatchesSearch(l2.name) ||
        (l2.children ?? []).some((l3) => taxonomyMatchesSearch(l3.name))
    );
  }, [
    filteredTaxonomyCategories,
    taxonomyActiveL1,
    taxonomyTokens.length,
    taxonomyMatchesSearch,
  ]);

  const filteredTaxonomyL3Nodes = useMemo(() => {
    const l1Node = filteredTaxonomyCategories.find(
      (node) => node.name === taxonomyActiveL1
    );
    const l2Node = (l1Node?.children ?? []).find(
      (child) => child.name === taxonomyActiveL2
    );
    const nodes = l2Node?.children ?? [];
    if (taxonomyTokens.length === 0) return nodes;
    return nodes.filter((l3) => taxonomyMatchesSearch(l3.name));
  }, [
    filteredTaxonomyCategories,
    taxonomyActiveL1,
    taxonomyActiveL2,
    taxonomyTokens.length,
    taxonomyMatchesSearch,
  ]);

  const hasTextValue = useCallback((value: string) => value.trim().length > 0, []);

  const hasSupplierSectionData = useMemo(
    () =>
      [
        internalProduct.supplier_1688_url,
        internalProduct.brand,
        internalProduct.vendor,
      ].some(hasTextValue),
    [internalProduct.supplier_1688_url, internalProduct.brand, internalProduct.vendor, hasTextValue]
  );
  const hasCatalogSectionData = useMemo(
    () =>
      [
        internalProduct.product_type,
        internalProduct.tags,
        internalProduct.shopify_category_name,
        internalProduct.shopify_category_path,
        internalProduct.shopify_category_id,
        internalProduct.google_taxonomy_l1,
        internalProduct.google_taxonomy_l2,
        internalProduct.google_taxonomy_l3,
        internalProduct.product_categorizer_keywords,
      ].some(hasTextValue),
    [
      internalProduct.product_type,
      internalProduct.tags,
      internalProduct.shopify_category_name,
      internalProduct.shopify_category_path,
      internalProduct.shopify_category_id,
      internalProduct.google_taxonomy_l1,
      internalProduct.google_taxonomy_l2,
      internalProduct.google_taxonomy_l3,
      internalProduct.product_categorizer_keywords,
      hasTextValue,
    ]
  );
  const hasCollectionsSectionData = useMemo(
    () =>
      [
        internalProduct.shopify_collection_handles,
        internalProduct.shopify_collection_ids,
        internalProduct.shopify_tingelo_category_keys,
        internalProduct.shopify_tingelo_sync,
        internalProduct.nordic_partner_enabled,
      ].some(hasTextValue),
    [
      internalProduct.shopify_collection_handles,
      internalProduct.shopify_collection_ids,
      internalProduct.shopify_tingelo_category_keys,
      internalProduct.shopify_tingelo_sync,
      internalProduct.nordic_partner_enabled,
      hasTextValue,
    ]
  );
  const hasMediaSectionData = useMemo(
    () =>
      [
        internalProduct.image_folder,
        internalProduct.images,
        internalProduct.video_files,
      ].some(hasTextValue),
    [
      internalProduct.image_folder,
      internalProduct.images,
      internalProduct.video_files,
      hasTextValue,
    ]
  );
  const hasStatusSectionData = useMemo(
    () =>
      [
        internalProduct.is_blocked,
        internalProduct.blocked_at,
        internalProduct.blocked_by,
      ].some(hasTextValue),
    [
      internalProduct.is_blocked,
      internalProduct.blocked_at,
      internalProduct.blocked_by,
      hasTextValue,
    ]
  );
  const hasLegacySectionData = useMemo(
    () =>
      [
        internalProduct.legacy_title_sv,
        internalProduct.legacy_description_sv,
        internalProduct.legacy_bullets_sv,
      ].some(hasTextValue),
    [
      internalProduct.legacy_title_sv,
      internalProduct.legacy_description_sv,
      internalProduct.legacy_bullets_sv,
      hasTextValue,
    ]
  );
  const hasMetafieldsSectionData = useMemo(
    () => internalMetafields.some((field) => hasTextValue(field.value)),
    [internalMetafields, hasTextValue]
  );
  const hasVariantIdentitySectionData = useMemo(
    () => internalVariants.length > 0,
    [internalVariants]
  );
  const hasVariantPricingSectionData = useMemo(
    () => internalVariants.length > 0,
    [internalVariants]
  );

  const supplierLinkHref = useMemo(() => {
    const raw = internalProduct.supplier_1688_url.trim();
    if (!raw) return null;
    try {
      const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const parsed = new URL(href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }, [internalProduct.supplier_1688_url]);

  useEffect(() => {
    setVisibleIdentityEmptyColumns(new Set());
    setVisiblePricingEmptyColumns(new Set());
  }, [resolvedProductId]);

  const loadProduct = useCallback(
    async (signal?: AbortSignal) => {
      if (!routeProductParam) {
        setError(t("productDetail.error.load"));
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/products/${routeProductParam}`, {
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
    [routeProductParam, t]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadProduct(controller.signal);
    return () => controller.abort();
  }, [loadProduct]);

  useEffect(() => {
    const controller = new AbortController();
    const loadTaxonomyCategories = async () => {
      setTaxonomyCategoriesLoading(true);
      setTaxonomyCategoriesError(null);
      try {
        const response = await fetch("/api/digideal/categories?provider=digideal", {
          signal: controller.signal,
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to load categories.");
        }
        const payload = (await response.json()) as { categories?: CategoryNode[] };
        setTaxonomyCategories(payload.categories ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setTaxonomyCategoriesError(
          err instanceof Error ? err.message : "Failed to load categories."
        );
        setTaxonomyCategories([]);
      } finally {
        setTaxonomyCategoriesLoading(false);
      }
    };

    loadTaxonomyCategories();

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

  const normalizeHtml = (value: string) =>
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const normalizeListText = (value: unknown) => {
    const raw = toText(value).trim();
    if (!raw) return "";
    if (raw.startsWith("[") || raw.startsWith("{")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .map((entry) => toText(entry).trim())
            .filter(Boolean)
            .join("\n");
        }
      } catch {
        // fall through
      }
    }
    return raw;
  };

  // Bullets are stored as newline-separated strings. Treat blank lines as noise.
  const normalizeBulletLines = (value: string) => {
    const normalized = value.replace(/\r\n/g, "\n");
    return normalized
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
  };

  const toHtmlFromText = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed.replace(/\n/g, "<br/>");
  };

  useEffect(() => {
    if (!data) return;
    const product = data.product;
    const nextInternalProduct: InternalProductForm = {
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
    };
    setInternalProduct(nextInternalProduct);

    const nextInternalVariants = data.variants.map((variant) => ({
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
      }));
    setInternalVariants(nextInternalVariants);

    const nextInternalMetafields = (data.internal_metafields ?? []).map((field) => ({
        id: field.id,
        key: field.key,
        namespace: field.namespace,
        value: toText(field.value),
      }));
    setInternalMetafields(nextInternalMetafields);

    const hasAny = (values: string[]) => values.some((value) => value.trim().length > 0);
    setCollapsedDataSections({
      supplier: !hasAny([
        nextInternalProduct.supplier_1688_url,
        nextInternalProduct.brand,
        nextInternalProduct.vendor,
      ]),
      catalog: !hasAny([
        nextInternalProduct.product_type,
        nextInternalProduct.tags,
        nextInternalProduct.shopify_category_name,
        nextInternalProduct.shopify_category_path,
        nextInternalProduct.shopify_category_id,
        nextInternalProduct.google_taxonomy_l1,
        nextInternalProduct.google_taxonomy_l2,
        nextInternalProduct.google_taxonomy_l3,
        nextInternalProduct.product_categorizer_keywords,
      ]),
      collections: !hasAny([
        nextInternalProduct.shopify_collection_handles,
        nextInternalProduct.shopify_collection_ids,
        nextInternalProduct.shopify_tingelo_category_keys,
        nextInternalProduct.shopify_tingelo_sync,
        nextInternalProduct.nordic_partner_enabled,
      ]),
      media: !hasAny([
        nextInternalProduct.image_folder,
        nextInternalProduct.images,
        nextInternalProduct.video_files,
      ]),
      status: !hasAny([
        nextInternalProduct.is_blocked,
        nextInternalProduct.blocked_at,
        nextInternalProduct.blocked_by,
      ]),
      legacy: !hasAny([
        nextInternalProduct.legacy_title_sv,
        nextInternalProduct.legacy_description_sv,
        nextInternalProduct.legacy_bullets_sv,
      ]),
      variantIdentity: nextInternalVariants.length === 0,
      pricing: nextInternalVariants.length === 0,
      metafields: !nextInternalMetafields.some((field) => field.value.trim().length > 0),
    });

    const descriptionHtml = data.product.description_html ?? "";
    const normalizedMain = descriptionHtml ? normalizeHtml(descriptionHtml) : "";
    const nextDescription: DescriptionForm = {
      short_title: normalizeListText(data.short_title),
      subtitle: normalizeListText(data.subtitle),
      long_title: normalizeListText(data.long_title ?? data.product.title),
      description_short: normalizeListText(data.description_short),
      description_main: normalizeListText(normalizedMain),
      description_extended: normalizeListText(data.description_extended),
      bullets_short: normalizeBulletLines(normalizeListText(data.bullets_short)),
      bullets: normalizeBulletLines(normalizeListText(data.bullets)),
      bullets_long: normalizeBulletLines(normalizeListText(data.bullets_long)),
      specs: normalizeListText(data.specs),
    };
    setDescriptionDraft(nextDescription);
    setDescriptionBaseline(nextDescription);
    setDescriptionSaveError(null);
    setDescriptionSaveSuccess(false);
    setAiPreviewActive(false);
    setAiSnapshot(null);
  }, [data]);

  const updateInternalProduct = (
    field: keyof InternalProductForm,
    value: string
  ) => {
    setInternalProduct((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDataSection = (section: ProductDataSectionKey) => {
    setCollapsedDataSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const selectTaxonomyL1 = (value: string) => {
    setTaxonomyActiveL1(value);
    setTaxonomyActiveL2(null);
    setTaxonomyDraft({ l1: value, l2: null, l3: null });
  };

  const selectTaxonomyL2 = (value: string) => {
    if (!taxonomyActiveL1) return;
    setTaxonomyActiveL2(value);
    setTaxonomyDraft({ l1: taxonomyActiveL1, l2: value, l3: null });
  };

  const selectTaxonomyL3 = (value: string) => {
    if (!taxonomyActiveL1 || !taxonomyActiveL2) return;
    setTaxonomyDraft({
      l1: taxonomyActiveL1,
      l2: taxonomyActiveL2,
      l3: value,
    });
  };

  const clearTaxonomySelection = () => {
    setTaxonomyDraft({ l1: null, l2: null, l3: null });
    updateInternalProduct("google_taxonomy_l1", "");
    updateInternalProduct("google_taxonomy_l2", "");
    updateInternalProduct("google_taxonomy_l3", "");
    setTaxonomyPopoverOpen(false);
  };

  const applyTaxonomyDraft = () => {
    updateInternalProduct("google_taxonomy_l1", taxonomyDraft.l1 ?? "");
    updateInternalProduct("google_taxonomy_l2", taxonomyDraft.l2 ?? "");
    updateInternalProduct("google_taxonomy_l3", taxonomyDraft.l3 ?? "");
    setTaxonomyPopoverOpen(false);
  };

  useEffect(() => {
    if (!taxonomyPopoverOpen) return;
    const l1 = internalProduct.google_taxonomy_l1.trim() || null;
    const l2 = internalProduct.google_taxonomy_l2.trim() || null;
    const l3 = internalProduct.google_taxonomy_l3.trim() || null;
    setTaxonomySearch("");
    setTaxonomyDraft({ l1, l2, l3 });
    setTaxonomyActiveL1(l1);
    setTaxonomyActiveL2(l2);
  }, [
    taxonomyPopoverOpen,
    internalProduct.google_taxonomy_l1,
    internalProduct.google_taxonomy_l2,
    internalProduct.google_taxonomy_l3,
  ]);

  useEffect(() => {
    if (filteredTaxonomyCategories.length === 0) {
      setTaxonomyActiveL1(null);
      return;
    }
    setTaxonomyActiveL1((prev) => {
      if (
        taxonomyDraft.l1 &&
        filteredTaxonomyCategories.some((node) => node.name === taxonomyDraft.l1)
      ) {
        return taxonomyDraft.l1;
      }
      if (prev && filteredTaxonomyCategories.some((node) => node.name === prev)) {
        return prev;
      }
      return filteredTaxonomyCategories[0].name;
    });
  }, [filteredTaxonomyCategories, taxonomyDraft.l1]);

  useEffect(() => {
    if (filteredTaxonomyL2Nodes.length === 0) {
      setTaxonomyActiveL2(null);
      return;
    }
    setTaxonomyActiveL2((prev) => {
      if (
        taxonomyDraft.l1 === taxonomyActiveL1 &&
        taxonomyDraft.l2 &&
        filteredTaxonomyL2Nodes.some((node) => node.name === taxonomyDraft.l2)
      ) {
        return taxonomyDraft.l2;
      }
      if (prev && filteredTaxonomyL2Nodes.some((node) => node.name === prev)) {
        return prev;
      }
      return filteredTaxonomyL2Nodes[0].name;
    });
  }, [filteredTaxonomyL2Nodes, taxonomyActiveL1, taxonomyDraft.l1, taxonomyDraft.l2]);

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

  const toggleIdentityEmptyColumn = (
    key: VariantIdentityColumnKey,
    checked: boolean
  ) => {
    setVisibleIdentityEmptyColumns((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const togglePricingEmptyColumn = (
    key: VariantPricingColumnKey,
    checked: boolean
  ) => {
    setVisiblePricingEmptyColumns((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const updateInternalMetafield = (id: string, value: string) => {
    setInternalMetafields((prev) =>
      prev.map((field) => (field.id === id ? { ...field, value } : field))
    );
  };

  const updateDescriptionField = (
    field: keyof DescriptionForm,
    value: string
  ) => {
    setDescriptionDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const scrollTable = (
    ref: RefObject<HTMLDivElement | null>,
    direction: "left" | "right"
  ) => {
    const node = ref.current;
    if (!node) return;
    const delta = Math.max(280, Math.floor(node.clientWidth * 0.75));
    node.scrollBy({
      left: direction === "left" ? -delta : delta,
      behavior: "smooth",
    });
  };

  const descriptionDirty = useMemo(() => {
    if (!descriptionDraft || !descriptionBaseline) return false;
    return (Object.keys(descriptionDraft) as Array<keyof DescriptionForm>).some(
      (key) => descriptionDraft[key] !== descriptionBaseline[key]
    );
  }, [descriptionDraft, descriptionBaseline]);

  const saveDescription = async () => {
    if (!descriptionDraft || !resolvedProductId) return;
    setIsSavingDescription(true);
    setDescriptionSaveError(null);
    setDescriptionSaveSuccess(false);
    try {
      const normalizedBulletsShort = normalizeBulletLines(
        descriptionDraft.bullets_short
      );
      const normalizedBullets = normalizeBulletLines(descriptionDraft.bullets);
      const normalizedBulletsLong = normalizeBulletLines(
        descriptionDraft.bullets_long
      );

      const response = await fetch(`/api/products/${resolvedProductId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: {
            description_html: toHtmlFromText(descriptionDraft.description_main),
          },
          metafields: [
            { key: "short_title", value: descriptionDraft.short_title },
            { key: "long_title", value: descriptionDraft.long_title },
            { key: "subtitle", value: descriptionDraft.subtitle },
            { key: "description_short", value: descriptionDraft.description_short },
            { key: "description_extended", value: descriptionDraft.description_extended },
            { key: "bullets_short", value: normalizedBulletsShort },
            { key: "bullets", value: normalizedBullets },
            { key: "bullets_long", value: normalizedBulletsLong },
            { key: "specs", value: descriptionDraft.specs },
          ],
        }),
      });

      if (!response.ok) {
        let message = t("productDetail.description.saveError");
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch {
          // ignore parse failures
        }
        throw new Error(message);
      }

      setDescriptionSaveSuccess(true);
      setAiPreviewActive(false);
      setAiSnapshot(null);
      setDescriptionBaseline(descriptionDraft);
      await loadProduct();
    } catch (err) {
      setDescriptionSaveError((err as Error).message);
    } finally {
      setIsSavingDescription(false);
    }
  };

  const runRegenerate = async () => {
    if (!descriptionDraft || !resolvedProductId) return;
    setIsRegenerating(true);
    setRegenerateError(null);
    try {
      const response = await fetch(
        `/api/products/${resolvedProductId}/description/rewrite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instruction: regenerateInstruction,
            current: descriptionDraft,
          }),
        }
      );

      if (!response.ok) {
        let message = t("productDetail.description.regenerateError");
        try {
          const text = await response.text();
          try {
            const payload = JSON.parse(text);
            if (payload?.error) message = payload.error;
          } catch {
            if (text?.trim()) {
              message = `${message} (${response.status}): ${text
                .trim()
                .slice(0, 200)}`;
            } else {
              message = `${message} (${response.status})`;
            }
          }
        } catch {
          // ignore parse failures
        }
        throw new Error(message);
      }

      const payload = await response.json();
      const updates = payload?.updates as Partial<DescriptionForm> | undefined;
      if (!updates) {
        throw new Error(t("productDetail.description.regenerateError"));
      }

      setAiSnapshot(descriptionDraft);
      setDescriptionDraft((prev) =>
        prev
          ? {
              ...prev,
              short_title: updates.short_title ?? prev.short_title,
              subtitle: updates.subtitle ?? prev.subtitle,
              long_title: updates.long_title ?? prev.long_title,
              description_short:
                updates.description_short ?? prev.description_short,
              description_main: updates.description_main ?? prev.description_main,
              description_extended:
                updates.description_extended ?? prev.description_extended,
              bullets_short: normalizeBulletLines(
                updates.bullets_short ?? prev.bullets_short
              ),
              bullets: normalizeBulletLines(updates.bullets ?? prev.bullets),
              bullets_long: normalizeBulletLines(
                updates.bullets_long ?? prev.bullets_long
              ),
              specs: updates.specs ?? prev.specs,
            }
          : prev
      );
      setAiPreviewActive(true);
      setIsRegenerateDialogOpen(false);
      setRegenerateInstruction("");
    } catch (err) {
      setRegenerateError((err as Error).message);
    } finally {
      setIsRegenerating(false);
    }
  };

  const revertDescription = () => {
    if (!aiSnapshot) return;
    setDescriptionDraft(aiSnapshot);
    setAiSnapshot(null);
    setAiPreviewActive(false);
  };

  const saveInternalData = async () => {
    if (!resolvedProductId) return;
    setIsSavingInternal(true);
    setInternalSaveError(null);
    setInternalSaveSuccess(false);
    try {
      const response = await fetch(`/api/products/${resolvedProductId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recalculate_b2c: true,
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

  const descriptionForm =
    descriptionDraft ??
    ({
      short_title: "",
      subtitle: "",
      long_title: "",
      description_short: "",
      description_main: "",
      description_extended: "",
      bullets_short: "",
      bullets: "",
      bullets_long: "",
      specs: "",
    } as DescriptionForm);

  const descriptionBusy = isSavingDescription || isRegenerating;

  const EditableField = ({
    label,
    value,
    placeholder,
    multiline,
    rows,
    onChange,
  }: {
    label: string;
    value: string;
    placeholder: string;
    multiline?: boolean;
    rows?: number;
    onChange: (next: string) => void;
  }) => {
    return (
      <Field label={label}>
        {multiline ? (
          <Textarea
            value={value}
            onChange={(_, data) => onChange(data.value)}
            placeholder={placeholder}
            rows={rows}
            className={styles.descriptionTextarea}
          />
        ) : (
          <Input
            value={value}
            onChange={(_, data) => onChange(data.value)}
            placeholder={placeholder}
          />
        )}
      </Field>
    );
  };

  const hasVariantImages = useMemo(
    () => data?.variants.some((variant) => Boolean(variant.variant_image_url)),
    [data]
  );

  if (isLoading || (!data && !error)) {
    return <Spinner label={t("productDetail.loading")} />;
  }

  if (error) {
    return (
      <MessageBar intent="error">
        {error}
      </MessageBar>
    );
  }

  if (!data) {
    return <Spinner label={t("productDetail.loading")} />;
  }

  const { product, variants, latest_exported_at: latestExport } = data;
  const title = product.title ?? product.spu;
  const taxonomyCategory = buildGoogleTaxonomyLabel(product);
  const headerTaxonomyValue = [
    internalProduct.google_taxonomy_l1.trim(),
    internalProduct.google_taxonomy_l2.trim(),
    internalProduct.google_taxonomy_l3.trim(),
  ]
    .filter(Boolean)
    .join(" > ");

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
                {t("common.sku")}
              </Text>
              <Text className={styles.infoValue}>
                {product.spu || t("common.notAvailable")}
              </Text>
            </div>
            <div>
              <Text size={200} className={styles.metaLabel}>
                {t("productDetail.data.brand")}
              </Text>
              <Text className={styles.infoValue}>
                {internalProduct.brand.trim() || t("common.notAvailable")}
              </Text>
            </div>
            <div>
              <Text size={200} className={styles.metaLabel}>
                {t("productDetail.data.vendor")}
              </Text>
              <Text className={styles.infoValue}>
                {internalProduct.vendor.trim() || t("common.notAvailable")}
              </Text>
            </div>
            <div>
              <Text size={200} className={styles.metaLabel}>
                Category
              </Text>
              <Text className={styles.infoValue}>
                {headerTaxonomyValue || taxonomyCategory || t("common.notAvailable")}
              </Text>
            </div>
            <div>
              <Text size={200} className={styles.metaLabel}>
                Updated
              </Text>
              <Text className={styles.infoValue}>
                {formatDate(product.updated_at)}
              </Text>
            </div>
          </div>
          <div className={styles.infoSecondaryRow}>
            <Text size={200} className={styles.metaLabel}>
              Supplier
            </Text>
            {supplierLinkHref ? (
              <a
                href={supplierLinkHref}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.supplierLink}
              >
                {internalProduct.supplier_1688_url.trim()}
              </a>
            ) : (
              <Text className={styles.infoValue}>
                {internalProduct.supplier_1688_url.trim() || t("common.notAvailable")}
              </Text>
            )}
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
            {activeTab === "description" && showDescription ? (
              <div className={styles.descriptionActions}>
                {aiPreviewActive ? (
                  <>
                    <Button
                      appearance="primary"
                      onClick={saveDescription}
                      disabled={isSavingDescription}
                    >
                      {isSavingDescription
                        ? t("common.loading")
                        : t("productDetail.description.actions.confirmSave")}
                    </Button>
                    <Button
                      appearance="outline"
                      onClick={revertDescription}
                      disabled={isSavingDescription || isRegenerating}
                    >
                      {t("productDetail.description.actions.revert")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      appearance="outline"
                      onClick={() => setIsRegenerateDialogOpen(true)}
                      disabled={isRegenerating || isSavingDescription}
                    >
                      {t("productDetail.description.actions.regenerate")}
                    </Button>
                    <Button
                      appearance="primary"
                      onClick={saveDescription}
                      disabled={!descriptionDirty || isSavingDescription}
                    >
                      {isSavingDescription
                        ? t("common.loading")
                        : t("productDetail.description.actions.save")}
                    </Button>
                  </>
                )}
              </div>
            ) : null}
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
                        {buildSwedishVariantLabel(variant) ||
                          t("productDetail.variant.default")}
                      </TableCell>
                      {marketColumns.map((column) => (
                        <TableCell key={`${variant.id}-${column.key}`}>
                          {formatCurrency(
                            column.getValue(variant),
                            column.currency
                          )}
                        </TableCell>
                      ))}
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
              {descriptionSaveError ? (
                <MessageBar intent="error">{descriptionSaveError}</MessageBar>
              ) : null}
              {descriptionSaveSuccess ? (
                <MessageBar intent="success">
                  {t("productDetail.description.saveSuccess")}
                </MessageBar>
              ) : null}
              {aiPreviewActive ? (
                <MessageBar intent="info" className={styles.aiPreviewNotice}>
                  {t("productDetail.description.previewNotice")}
                </MessageBar>
              ) : null}
              <div className={styles.descriptionContentWrap}>
                <div
                  className={mergeClasses(
                    styles.descriptionContent,
                    descriptionBusy ? styles.descriptionContentBusy : undefined
                  )}
                >
                  <div className={styles.tripleGrid}>
                    <EditableField
                      label={t("productDetail.description.shortTitle")}
                      value={descriptionForm.short_title}
                      placeholder={t("productDetail.description.shortTitleEmpty")}
                      onChange={(value) =>
                        updateDescriptionField("short_title", value)
                      }
                    />
                    <EditableField
                      label={t("productDetail.description.subtitle")}
                      value={descriptionForm.subtitle}
                      placeholder={t("productDetail.description.subtitleEmpty")}
                      onChange={(value) =>
                        updateDescriptionField("subtitle", value)
                      }
                    />
                  </div>
                  <div className={styles.fullRow}>
                    <EditableField
                      label={t("productDetail.description.longTitle")}
                      value={descriptionForm.long_title}
                      placeholder={t("productDetail.description.longTitleEmpty")}
                      onChange={(value) =>
                        updateDescriptionField("long_title", value)
                      }
                    />
                  </div>
                  <EditableField
                    label={t("productDetail.description.shortDescription")}
                    value={descriptionForm.description_short}
                    placeholder={t("productDetail.description.shortDescriptionEmpty")}
                    multiline
                    rows={2}
                    onChange={(value) =>
                      updateDescriptionField("description_short", value)
                    }
                  />
                  <EditableField
                    label={t("productDetail.description.longDescription")}
                    value={descriptionForm.description_main}
                    placeholder={t("productDetail.description.longDescriptionEmpty")}
                    multiline
                    rows={6}
                    onChange={(value) =>
                      updateDescriptionField("description_main", value)
                    }
                  />
                  <EditableField
                    label={t("productDetail.description.extendedDescription")}
                    value={descriptionForm.description_extended}
                    placeholder={t("productDetail.description.extendedDescriptionEmpty")}
                    multiline
                    rows={6}
                    onChange={(value) =>
                      updateDescriptionField("description_extended", value)
                    }
                  />
                  <div className={styles.bulletsGrid}>
                    <EditableField
                      label={t("productDetail.description.shortBullets")}
                      value={descriptionForm.bullets_short}
                      placeholder={t("productDetail.description.shortBulletsEmpty")}
                      multiline
                      rows={4}
                      onChange={(value) =>
                        updateDescriptionField("bullets_short", value)
                      }
                    />
                    <EditableField
                      label={t("productDetail.description.bullets")}
                      value={descriptionForm.bullets}
                      placeholder={t("productDetail.description.bulletsEmpty")}
                      multiline
                      rows={5}
                      onChange={(value) =>
                        updateDescriptionField("bullets", value)
                      }
                    />
                    <EditableField
                      label={t("productDetail.description.longBullets")}
                      value={descriptionForm.bullets_long}
                      placeholder={t("productDetail.description.longBulletsEmpty")}
                      multiline
                      rows={6}
                      onChange={(value) =>
                        updateDescriptionField("bullets_long", value)
                      }
                    />
                  </div>
                  <EditableField
                    label={t("productDetail.description.specification")}
                    value={descriptionForm.specs}
                    placeholder={t("productDetail.description.specificationEmpty")}
                    multiline
                    rows={4}
                    onChange={(value) =>
                      updateDescriptionField("specs", value)
                    }
                  />
                </div>
                {descriptionBusy ? (
                  <div className={styles.descriptionOverlay}>
                    <Spinner label={t("common.loading")} />
                  </div>
                ) : null}
              </div>
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
                <button
                  type="button"
                  className={styles.dataSectionToggle}
                  onClick={() => toggleDataSection("supplier")}
                >
                  <Text weight="semibold">{t("productDetail.data.section.supplier")}</Text>
                  <div className={styles.dataSectionToggleRight}>
                    {!hasSupplierSectionData ? (
                      <Text size={200} className={styles.dataSectionEmptyBadge}>
                        Empty
                      </Text>
                    ) : null}
                    <Text size={200} className={styles.dataSectionChevron}>
                      {collapsedDataSections.supplier ? ">" : "v"}
                    </Text>
                  </div>
                </button>
                {!collapsedDataSections.supplier ? (
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
                ) : null}
              </div>

              <div className={styles.dataSection}>
                <button
                  type="button"
                  className={styles.dataSectionToggle}
                  onClick={() => toggleDataSection("catalog")}
                >
                  <Text weight="semibold">{t("productDetail.data.section.catalog")}</Text>
                  <div className={styles.dataSectionToggleRight}>
                    {!hasCatalogSectionData ? (
                      <Text size={200} className={styles.dataSectionEmptyBadge}>
                        Empty
                      </Text>
                    ) : null}
                    <Text size={200} className={styles.dataSectionChevron}>
                      {collapsedDataSections.catalog ? ">" : "v"}
                    </Text>
                  </div>
                </button>
                {!collapsedDataSections.catalog ? (
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
                  <Field
                    label={t("productDetail.data.googleTaxonomyL1")}
                    className={styles.dataWideField}
                  >
                    <Popover
                      open={taxonomyPopoverOpen}
                      onOpenChange={(_, data) => setTaxonomyPopoverOpen(data.open)}
                      positioning={{
                        position: "below",
                        align: "start",
                        offset: { mainAxis: 6 },
                      }}
                    >
                      <PopoverTrigger disableButtonEnhancement>
                        <Button appearance="outline" className={styles.taxonomyTrigger}>
                          {taxonomySummary}
                        </Button>
                      </PopoverTrigger>
                      <PopoverSurface className={styles.taxonomyPopover}>
                        {taxonomyCategoriesLoading ? (
                          <Spinner label={t("discovery.categories.loading")} />
                        ) : taxonomyCategoriesError ? (
                          <MessageBar intent="error">{taxonomyCategoriesError}</MessageBar>
                        ) : taxonomyCategories.length === 0 ? (
                          <Text>{t("discovery.categories.empty")}</Text>
                        ) : (
                          <>
                            <Input
                              value={taxonomySearch}
                              onChange={(_, data) => setTaxonomySearch(data.value)}
                              placeholder={t("discovery.categories.searchPlaceholder")}
                              className={styles.taxonomySearch}
                            />
                            <div className={styles.taxonomyColumns}>
                              <div className={styles.taxonomyColumn}>
                                <Text className={styles.taxonomyColumnTitle}>
                                  {t("discovery.categories.level1")}
                                </Text>
                                {filteredTaxonomyCategories.map((l1) => {
                                  const selected = taxonomyDraft.l1 === l1.name;
                                  return (
                                    <div
                                      key={l1.name}
                                      className={mergeClasses(
                                        styles.taxonomyItem,
                                        styles.taxonomyItemInteractive,
                                        selected ? styles.taxonomyItemSelected : undefined
                                      )}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => selectTaxonomyL1(l1.name)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          selectTaxonomyL1(l1.name);
                                        }
                                      }}
                                    >
                                      <Checkbox
                                        checked={selected}
                                        aria-label={t("common.selectItem", { item: l1.name })}
                                        onChange={() => selectTaxonomyL1(l1.name)}
                                        onClick={(event) => event.stopPropagation()}
                                      />
                                      <span className={styles.taxonomyItemText}>{l1.name}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className={styles.taxonomyColumn}>
                                <Text className={styles.taxonomyColumnTitle}>
                                  {t("discovery.categories.level2")}
                                </Text>
                                {filteredTaxonomyL2Nodes.map((l2) => {
                                  const selected =
                                    taxonomyDraft.l1 === taxonomyActiveL1 &&
                                    taxonomyDraft.l2 === l2.name;
                                  return (
                                    <div
                                      key={l2.name}
                                      className={mergeClasses(
                                        styles.taxonomyItem,
                                        styles.taxonomyItemInteractive,
                                        selected ? styles.taxonomyItemSelected : undefined
                                      )}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => selectTaxonomyL2(l2.name)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          selectTaxonomyL2(l2.name);
                                        }
                                      }}
                                    >
                                      <Checkbox
                                        checked={selected}
                                        aria-label={t("common.selectItem", { item: l2.name })}
                                        onChange={() => selectTaxonomyL2(l2.name)}
                                        onClick={(event) => event.stopPropagation()}
                                      />
                                      <span className={styles.taxonomyItemText}>{l2.name}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className={styles.taxonomyColumn}>
                                <Text className={styles.taxonomyColumnTitle}>
                                  {t("discovery.categories.level3")}
                                </Text>
                                {filteredTaxonomyL3Nodes.map((l3) => {
                                  const selected =
                                    taxonomyDraft.l1 === taxonomyActiveL1 &&
                                    taxonomyDraft.l2 === taxonomyActiveL2 &&
                                    taxonomyDraft.l3 === l3.name;
                                  return (
                                    <div
                                      key={l3.name}
                                      className={mergeClasses(
                                        styles.taxonomyItem,
                                        styles.taxonomyItemInteractive,
                                        selected ? styles.taxonomyItemSelected : undefined
                                      )}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => selectTaxonomyL3(l3.name)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          selectTaxonomyL3(l3.name);
                                        }
                                      }}
                                    >
                                      <Checkbox
                                        checked={selected}
                                        aria-label={t("common.selectItem", { item: l3.name })}
                                        onChange={() => selectTaxonomyL3(l3.name)}
                                        onClick={(event) => event.stopPropagation()}
                                      />
                                      <span className={styles.taxonomyItemText}>{l3.name}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        )}
                        <div className={styles.taxonomyActions}>
                          {internalProduct.google_taxonomy_l1 ||
                          internalProduct.google_taxonomy_l2 ||
                          internalProduct.google_taxonomy_l3 ? (
                            <Button appearance="subtle" onClick={clearTaxonomySelection}>
                              {t("common.clear")}
                            </Button>
                          ) : null}
                          <Button appearance="primary" onClick={applyTaxonomyDraft}>
                            {t("common.done")}
                          </Button>
                        </div>
                      </PopoverSurface>
                    </Popover>
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
                  </div>
                ) : null}
              </div>

              <div className={styles.dataSection}>
                <button
                  type="button"
                  className={styles.dataSectionToggle}
                  onClick={() => toggleDataSection("collections")}
                >
                  <Text weight="semibold">{t("productDetail.data.section.collections")}</Text>
                  <div className={styles.dataSectionToggleRight}>
                    {!hasCollectionsSectionData ? (
                      <Text size={200} className={styles.dataSectionEmptyBadge}>
                        Empty
                      </Text>
                    ) : null}
                    <Text size={200} className={styles.dataSectionChevron}>
                      {collapsedDataSections.collections ? ">" : "v"}
                    </Text>
                  </div>
                </button>
                {!collapsedDataSections.collections ? (
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
                ) : null}
              </div>

              <div className={styles.dataSection}>
                <button
                  type="button"
                  className={styles.dataSectionToggle}
                  onClick={() => toggleDataSection("media")}
                >
                  <Text weight="semibold">{t("productDetail.data.section.media")}</Text>
                  <div className={styles.dataSectionToggleRight}>
                    {!hasMediaSectionData ? (
                      <Text size={200} className={styles.dataSectionEmptyBadge}>
                        Empty
                      </Text>
                    ) : null}
                    <Text size={200} className={styles.dataSectionChevron}>
                      {collapsedDataSections.media ? ">" : "v"}
                    </Text>
                  </div>
                </button>
                {!collapsedDataSections.media ? (
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
                ) : null}
              </div>

              <div className={styles.dataSection}>
                <button
                  type="button"
                  className={styles.dataSectionToggle}
                  onClick={() => toggleDataSection("status")}
                >
                  <Text weight="semibold">{t("productDetail.data.section.status")}</Text>
                  <div className={styles.dataSectionToggleRight}>
                    {!hasStatusSectionData ? (
                      <Text size={200} className={styles.dataSectionEmptyBadge}>
                        Empty
                      </Text>
                    ) : null}
                    <Text size={200} className={styles.dataSectionChevron}>
                      {collapsedDataSections.status ? ">" : "v"}
                    </Text>
                  </div>
                </button>
                {!collapsedDataSections.status ? (
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
                ) : null}
              </div>

              <div className={styles.dataSection}>
                <button
                  type="button"
                  className={styles.dataSectionToggle}
                  onClick={() => toggleDataSection("legacy")}
                >
                  <Text weight="semibold">{t("productDetail.data.section.legacy")}</Text>
                  <div className={styles.dataSectionToggleRight}>
                    {!hasLegacySectionData ? (
                      <Text size={200} className={styles.dataSectionEmptyBadge}>
                        Empty
                      </Text>
                    ) : null}
                    <Text size={200} className={styles.dataSectionChevron}>
                      {collapsedDataSections.legacy ? ">" : "v"}
                    </Text>
                  </div>
                </button>
                {!collapsedDataSections.legacy ? (
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
                ) : null}
              </div>

              <div className={styles.dataSection}>
                <div className={styles.dataTableHeader}>
                  <button
                    type="button"
                    className={mergeClasses(
                      styles.dataSectionToggle,
                      styles.dataSectionToggleCompact
                    )}
                    onClick={() => toggleDataSection("variantIdentity")}
                  >
                    <Text weight="semibold">{t("productDetail.data.section.variantIdentity")}</Text>
                    <div className={styles.dataSectionToggleRight}>
                      {!hasVariantIdentitySectionData ? (
                        <Text size={200} className={styles.dataSectionEmptyBadge}>
                          Empty
                        </Text>
                      ) : null}
                      <Text size={200} className={styles.dataSectionChevron}>
                        {collapsedDataSections.variantIdentity ? ">" : "v"}
                      </Text>
                    </div>
                  </button>
                  {!collapsedDataSections.variantIdentity ? (
                    <div className={styles.dataTableActions}>
                      <Menu>
                        <MenuTrigger disableButtonEnhancement>
                          <Button
                            appearance="outline"
                            size="small"
                            className={styles.columnMenuButton}
                          >
                            Select Columns
                          </Button>
                        </MenuTrigger>
                        <MenuPopover>
                          <div className={styles.columnMenuList}>
                            <Checkbox
                              label={t("productDetail.data.variantSku")}
                              checked
                              disabled
                              className={styles.columnMenuCheckbox}
                            />
                            {variantIdentityColumns.map((column) => {
                              const autoVisible = identityColumnsWithData.has(column.key);
                              const checked =
                                autoVisible || visibleIdentityEmptyColumns.has(column.key);
                              return (
                                <Checkbox
                                  key={column.key}
                                  label={column.label}
                                  checked={checked}
                                  className={styles.columnMenuCheckbox}
                                  onChange={(_, data) => {
                                    if (autoVisible) return;
                                    toggleIdentityEmptyColumn(
                                      column.key,
                                      Boolean(data.checked)
                                    );
                                  }}
                                />
                              );
                            })}
                          </div>
                        </MenuPopover>
                      </Menu>
                      <div className={styles.dataScrollControls}>
                        <Button
                          appearance="outline"
                          className={styles.dataScrollButton}
                          onClick={() => scrollTable(variantIdentityTableRef, "left")}
                          aria-label="Scroll left"
                        >
                          {"<"}
                        </Button>
                        <Button
                          appearance="outline"
                          className={styles.dataScrollButton}
                          onClick={() => scrollTable(variantIdentityTableRef, "right")}
                          aria-label="Scroll right"
                        >
                          {">"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
                {!collapsedDataSections.variantIdentity ? (
                <div className={styles.dataTableWrap} ref={variantIdentityTableRef}>
                  <Table
                    size="small"
                    className={mergeClasses(styles.variantTable, styles.dataWideTable)}
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell className={styles.dataStickyLeftHeaderCell}>
                          {t("productDetail.data.variantSku")}
                        </TableHeaderCell>
                        {visibleIdentityColumns.map((column) => (
                          <TableHeaderCell key={`identity-header-${column.key}`}>
                            {column.label}
                          </TableHeaderCell>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {internalVariants.map((variant) => (
                        <TableRow key={variant.id}>
                          <TableCell className={styles.dataStickyLeftCell}>
                            {variant.sku}
                          </TableCell>
                          {visibleIdentityColumns.map((column) => (
                            <TableCell key={`identity-cell-${variant.id}-${column.key}`}>
                              <Input
                                value={variant[column.key]}
                                size="small"
                                className={styles.dataInput}
                                readOnly={column.readOnly}
                                onChange={
                                  column.readOnly
                                    ? undefined
                                    : (_, data) =>
                                        updateInternalVariant(
                                          variant.id,
                                          column.key,
                                          data.value
                                        )
                                }
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                ) : null}
              </div>

              <div className={styles.dataSection}>
                <div className={styles.dataTableHeader}>
                  <button
                    type="button"
                    className={mergeClasses(
                      styles.dataSectionToggle,
                      styles.dataSectionToggleCompact
                    )}
                    onClick={() => toggleDataSection("pricing")}
                  >
                    <Text weight="semibold">{t("productDetail.data.section.pricing")}</Text>
                    <div className={styles.dataSectionToggleRight}>
                      {!hasVariantPricingSectionData ? (
                        <Text size={200} className={styles.dataSectionEmptyBadge}>
                          Empty
                        </Text>
                      ) : null}
                      <Text size={200} className={styles.dataSectionChevron}>
                        {collapsedDataSections.pricing ? ">" : "v"}
                      </Text>
                    </div>
                  </button>
                  {!collapsedDataSections.pricing ? (
                    <div className={styles.dataTableActions}>
                      <Menu>
                        <MenuTrigger disableButtonEnhancement>
                          <Button
                            appearance="outline"
                            size="small"
                            className={styles.columnMenuButton}
                          >
                            Select Columns
                          </Button>
                        </MenuTrigger>
                        <MenuPopover>
                          <div className={styles.columnMenuList}>
                            <Checkbox
                              label={t("productDetail.data.variantSku")}
                              checked
                              disabled
                              className={styles.columnMenuCheckbox}
                            />
                            {variantPricingColumns.map((column) => {
                              const autoVisible = pricingColumnsWithData.has(column.key);
                              const checked =
                                autoVisible || visiblePricingEmptyColumns.has(column.key);
                              return (
                                <Checkbox
                                  key={column.key}
                                  label={column.label}
                                  checked={checked}
                                  className={styles.columnMenuCheckbox}
                                  onChange={(_, data) => {
                                    if (autoVisible) return;
                                    togglePricingEmptyColumn(
                                      column.key,
                                      Boolean(data.checked)
                                    );
                                  }}
                                />
                              );
                            })}
                          </div>
                        </MenuPopover>
                      </Menu>
                      <div className={styles.dataScrollControls}>
                        <Button
                          appearance="outline"
                          className={styles.dataScrollButton}
                          onClick={() => scrollTable(variantPricingTableRef, "left")}
                          aria-label="Scroll left"
                        >
                          {"<"}
                        </Button>
                        <Button
                          appearance="outline"
                          className={styles.dataScrollButton}
                          onClick={() => scrollTable(variantPricingTableRef, "right")}
                          aria-label="Scroll right"
                        >
                          {">"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
                {!collapsedDataSections.pricing ? (
                <div className={styles.dataTableWrap} ref={variantPricingTableRef}>
                  <Table
                    size="small"
                    className={mergeClasses(styles.variantTable, styles.dataWideTable)}
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell className={styles.dataStickyLeftHeaderCell}>
                          {t("productDetail.data.variantSku")}
                        </TableHeaderCell>
                        {visiblePricingColumns.map((column) => (
                          <TableHeaderCell key={`pricing-header-${column.key}`}>
                            {column.label}
                          </TableHeaderCell>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {internalVariants.map((variant) => (
                        <TableRow key={variant.id}>
                          <TableCell className={styles.dataStickyLeftCell}>
                            {variant.sku}
                          </TableCell>
                          {visiblePricingColumns.map((column) => (
                            <TableCell key={`pricing-cell-${variant.id}-${column.key}`}>
                              <Input
                                value={variant[column.key]}
                                className={styles.dataInput}
                                size="small"
                                onChange={(_, data) =>
                                  updateInternalVariant(
                                    variant.id,
                                    column.key,
                                    data.value
                                  )
                                }
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                ) : null}
              </div>

              <div className={styles.dataSection}>
                <button
                  type="button"
                  className={styles.dataSectionToggle}
                  onClick={() => toggleDataSection("metafields")}
                >
                  <Text weight="semibold">{t("productDetail.data.section.metafields")}</Text>
                  <div className={styles.dataSectionToggleRight}>
                    {!hasMetafieldsSectionData ? (
                      <Text size={200} className={styles.dataSectionEmptyBadge}>
                        Empty
                      </Text>
                    ) : null}
                    <Text size={200} className={styles.dataSectionChevron}>
                      {collapsedDataSections.metafields ? ">" : "v"}
                    </Text>
                  </div>
                </button>
                {!collapsedDataSections.metafields ? (
                  internalMetafields.length === 0 ? (
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
                  )
                ) : null}
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
        open={isRegenerateDialogOpen}
        onOpenChange={(_, data) => {
          setIsRegenerateDialogOpen(data.open);
          if (data.open) setRegenerateError(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("productDetail.description.regenerateTitle")}</DialogTitle>
            <Text size={200} className={styles.metaLabel}>
              {t("productDetail.description.regenerateHint")}
            </Text>
            <Field label={t("productDetail.description.regenerateLabel")}>
              <Textarea
                value={regenerateInstruction}
                onChange={(_, data) => setRegenerateInstruction(data.value)}
                placeholder={t("productDetail.description.regeneratePlaceholder")}
                rows={6}
              />
            </Field>
            {regenerateError ? (
              <MessageBar intent="error">{regenerateError}</MessageBar>
            ) : null}
            <DialogActions>
              <Button
                appearance="subtle"
                onClick={() => setIsRegenerateDialogOpen(false)}
                disabled={isRegenerating}
              >
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={runRegenerate}
                disabled={!regenerateInstruction.trim() || isRegenerating}
              >
                {isRegenerating
                  ? t("common.loading")
                  : t("productDetail.description.regenerateRun")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
