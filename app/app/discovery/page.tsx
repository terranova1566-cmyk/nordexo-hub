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
  Dropdown,
  Field,
  Image,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Spinner,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import { useDebouncedValue } from "@/hooks/use-debounced";
import { useI18n } from "@/components/i18n-provider";

type CategoryNode = {
  name: string;
  children: CategoryNode[];
};

type CategorySelection = {
  level: "l1" | "l2" | "l3";
  value: string;
};

type DiscoveryItem = {
  provider: "cdon" | "fyndiq" | "aliexpress";
  product_id: string;
  title: string | null;
  product_url: string | null;
  image_url: string | null;
  image_local_path: string | null;
  image_local_url: string | null;
  source_url: string | null;
  last_price: number | null;
  last_previous_price: number | null;
  last_reviews: number | null;
  last_delivery_time: string | null;
  taxonomy_l1: string | null;
  taxonomy_l2: string | null;
  taxonomy_l3: string | null;
  taxonomy_path: string | null;
  taxonomy_confidence: number | null;
  taxonomy_updated_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  scrape_date: string | null;
  sold: number | null;
  sold_delta: number | null;
  daily_sales_est: number | null;
  sold_today: number;
  sold_7d: number;
  sold_all_time: number;
  trending_score: number;
  liked: boolean;
  removed: boolean;
  in_production: boolean;
  price: number | null;
  previous_price: number | null;
  reviews: number | null;
  delivery_time: string | null;
  wishlist_names: string[];
};

type Wishlist = {
  id: string;
  name: string;
  created_at?: string | null;
  item_count?: number | null;
};

const useStyles = makeStyles({
  layout: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  controlsCard: {
    padding: "6px 16px 16px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    "& label": {
      marginBottom: "0px",
    },
    "& .fui-Field": {
      rowGap: "0px",
    },
    "& .fui-Label": {
      marginBottom: "0px",
    },
  },
  controlRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: "12px",
  },
  searchInput: {
    width: "320px",
    maxWidth: "100%",
    fontSize: tokens.fontSizeBase300,
    "& input": {
      fontSize: tokens.fontSizeBase300,
    },
  },
  filterLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground4,
    fontWeight: tokens.fontWeightRegular,
    lineHeight: tokens.lineHeightBase100,
  },
  filterLabelLink: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightRegular,
    lineHeight: tokens.lineHeightBase100,
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    border: "none",
    padding: 0,
    background: "transparent",
    cursor: "pointer",
    "&:hover": {
      textDecorationLine: "underline",
    },
  },
  filterLabelIcon: {
    width: "12px",
    height: "12px",
    display: "inline-block",
    color: tokens.colorBrandForeground1,
  },
  filterField: {
    minWidth: "180px",
  },
  dropdownCompact: {
    minWidth: "unset",
    width: "auto",
    maxWidth: "100%",
  },
  priceField: {
    minWidth: "120px",
    flex: "0 0 auto",
  },
  priceInputRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  priceInput: {
    minWidth: "70px",
    maxWidth: "80px",
  },
  selectionActions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px",
  },
  unselectButton: {
    selectors: {
      "&:not(:disabled)": {
        border: `1px solid ${tokens.colorNeutralStroke1}`,
      },
    },
  },
  selectionCount: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  removeSelectedActive: {
    selectors: {
      "&:not(:disabled)": {
        backgroundColor: tokens.colorNeutralBackground3,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        color: tokens.colorNeutralForeground1,
        transition: "background-color 0.15s ease, border-color 0.15s ease",
      },
      "&:not(:disabled):hover": {
        backgroundColor: tokens.colorNeutralBackground4,
      },
    },
  },
  paginationWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    marginTop: "8px",
  },
  paginationButtons: {
    display: "flex",
    gap: "8px",
  },
  dateField: {
    minWidth: "170px",
  },
  categoryTrigger: {
    justifyContent: "space-between",
    width: "100%",
    textAlign: "left",
    fontWeight: tokens.fontWeightRegular,
  },
  categoryPopover: {
    padding: "12px",
    minWidth: "660px",
    maxWidth: "790px",
  },
  categorySearch: {
    marginBottom: "10px",
  },
  categoryColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(200px, 1fr))",
    gap: "12px",
    alignItems: "start",
  },
  categoryColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    maxHeight: "450px",
    overflowY: "auto",
    paddingRight: "12px",
  },
  categoryColumnTitle: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
  categoryItem: {
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
  categoryItemInteractive: {
    cursor: "pointer",
    "&:hover": {
      backgroundColor: "#f1f1f1",
    },
    "&:focus-visible": {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "1px",
    },
  },
  categoryNavButton: {
    border: "none",
    backgroundColor: "transparent",
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  categoryNavActive: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  categoryCheckbox: {
    fontSize: tokens.fontSizeBase200,
    display: "flex",
    alignItems: "center",
  },
  categoryActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "12px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "16px",
    justifyContent: "flex-start",
  },
  card: {
    padding: "13px",
    borderRadius: "var(--app-radius)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minHeight: "330px",
    width: "100%",
    maxWidth: "242px",
    cursor: "pointer",
    transition: "box-shadow 0.15s ease",
    position: "relative",
    overflow: "visible",
  },
  cardSelected: {
    ":before": {
      content: '""',
      position: "absolute",
      inset: "-2px",
      borderRadius: "calc(var(--app-radius) + 2px)",
      border: `2px solid ${tokens.colorBrandStroke1}`,
      boxShadow: "0 0 10px rgba(0, 120, 212, 0.25)",
      pointerEvents: "none",
    },
  },
  cardImageWrap: {
    width: "100%",
    aspectRatio: "1 / 1",
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  imageDivider: {
    height: "1px",
    backgroundColor: tokens.colorNeutralStroke2,
    marginInline: "4px",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  cardTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    minHeight: `calc(${tokens.lineHeightBase200} * 2)`,
  },
  cardMeta: {
    color: tokens.colorNeutralForeground4,
  },
  cardRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  rowBetween: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  rowLeft: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  rowRight: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    justifyContent: "flex-end",
    textAlign: "right",
  },
  salesWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  },
  cardLink: {
    color: tokens.colorNeutralForeground3,
    textDecorationLine: "none",
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase100,
    "&:hover": {
      color: tokens.colorNeutralForeground2,
    },
  },
  cardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  cardActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  },
  providerBadge: {
    textTransform: "uppercase",
  },
  cdonBadge: {
    backgroundColor: tokens.colorPaletteLightGreenBackground1,
    color: tokens.colorPaletteGreenForeground2,
  },
  fyndiqBadge: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground2,
  },
  emptyState: {
    padding: "24px 0",
  },
  salesButton: {
    borderRadius: "999px",
    border: `1px solid ${tokens.colorBrandStroke1}`,
    color: tokens.colorBrandForeground1,
    minWidth: "20px",
    height: "20px",
    paddingInline: "4px",
    paddingBlock: "0px",
    backgroundColor: "transparent",
    fontSize: "11px",
    fontWeight: tokens.fontWeightBold,
    lineHeight: "14px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "default",
    userSelect: "none",
  },
  salesGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
  },
  salesGroupTight: {
    display: "inline-flex",
    alignItems: "center",
    gap: "1px",
  },
  breadcrumbRow: {
    display: "block",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: "1.05",
  },
  breadcrumbLink: {
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    color: tokens.colorNeutralForeground3,
    cursor: "pointer",
    fontSize: tokens.fontSizeBase100,
    "&:hover": {
      textDecorationLine: "underline",
    },
  },
  breadcrumbDivider: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  dateRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "8px",
  },
  dateBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "0px",
  },
  dateBlockRight: {
    display: "flex",
    flexDirection: "column",
    gap: "0px",
    alignItems: "flex-end",
    textAlign: "right",
  },
  dateValue: {
    lineHeight: tokens.lineHeightBase100,
    color: tokens.colorNeutralForeground1,
  },
  dateLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground4,
  },
  priceText: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  pricePrevText: {
    color: tokens.colorNeutralForeground4,
  },
  ratingLabel: {
    color: tokens.colorNeutralForeground4,
  },
  ratingValue: {
    fontWeight: tokens.fontWeightSemibold,
  },
  ratingPositive: {
    color: tokens.colorPaletteGreenForeground2,
  },
  ratingNegative: {
    color: tokens.colorPaletteRedForeground2,
  },
  actionIconButton: {
    border: "1px solid transparent",
    backgroundColor: "transparent",
    borderRadius: "999px",
    width: "28px",
    height: "28px",
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorNeutralForeground3,
    cursor: "pointer",
    transition: "background-color 0.15s ease, color 0.15s ease",
  },
  actionIconLiked: {
    color: "#d9638e",
    backgroundColor: "rgba(217, 99, 142, 0.16)",
  },
  actionIconRemoved: {
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  actionIconProduction: {
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
  },
  actionIcon: {
    width: "16px",
    height: "16px",
    display: "block",
  },
  wishlistWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
  },
  wishlistPopover: {
    position: "absolute",
    left: "calc(100% + 8px)",
    top: "50%",
    transform: "translateY(-50%) translateX(-4px)",
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    padding: "8px 10px",
    boxShadow: tokens.shadow8,
    opacity: 0,
    pointerEvents: "none",
    transition: "opacity 120ms ease, transform 120ms ease",
    width: "max-content",
    zIndex: 5,
  },
  wishlistPopoverOpen: {
    opacity: 1,
    transform: "translateY(-50%) translateX(0)",
    pointerEvents: "auto",
  },
  wishlistList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  wishlistRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  wishlistLink: {
    color: tokens.colorBrandForeground1,
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
    flex: 1,
    textDecorationLine: "none",
    fontSize: tokens.fontSizeBase200,
    whiteSpace: "nowrap",
    "&:hover": {
      textDecorationLine: "underline",
    },
  },
  wishlistRemoveButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    width: "22px",
    height: "22px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    color: tokens.colorNeutralForeground3,
    cursor: "pointer",
    transition: "background-color 0.12s ease, color 0.12s ease",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground3,
      color: tokens.colorPaletteRedForeground2,
    },
  },
  wishlistRemoveIcon: {
    width: "14px",
    height: "14px",
  },
});

const providerOptions = [
  { value: "cdon", label: "CDON" },
  { value: "fyndiq", label: "Fyndiq" },
];
const providerValues = providerOptions.map((option) => option.value);
const pageSizeOptions = [25, 50, 100, 200];

function DiscoveryPageInner() {
  const styles = useStyles();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const [searchInput, setSearchInput] = useState("");
  const [providers, setProviders] = useState<string[]>(providerValues);
  const [sort, setSort] = useState("sold_7d");
  const [wishlistFilterId, setWishlistFilterId] = useState("all");
  const [updatedFrom, setUpdatedFrom] = useState("");
  const [addedFrom, setAddedFrom] = useState("");
  const [priceMinInput, setPriceMinInput] = useState("");
  const [priceMaxInput, setPriceMaxInput] = useState("");
  const [priceMin, setPriceMin] = useState<number | null>(null);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [categorySelections, setCategorySelections] = useState<CategorySelection[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<CategorySelection[]>([]);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [activeL1, setActiveL1] = useState<string | null>(null);
  const [activeL2, setActiveL2] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [sharedWishlists, setSharedWishlists] = useState<Wishlist[]>([]);
  const [wishlistsLoading, setWishlistsLoading] = useState(true);
  const [wishlistsError, setWishlistsError] = useState<string | null>(null);
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [isSavingSelection, setIsSavingSelection] = useState(false);
  const [isRemovingSelection, setIsRemovingSelection] = useState(false);
  const [isProducingSelection, setIsProducingSelection] = useState(false);
  const [openWishlistFor, setOpenWishlistFor] = useState<string | null>(null);
  const wishlistCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRestoringRef = useRef(false);
  const skipUrlSyncRef = useRef(false);
  const searchParams = useSearchParams();
  const urlSearch = searchParams.toString();
  const [isAdmin, setIsAdmin] = useState(false);

  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const sortOptions = useMemo(
    () => [
      { value: "sold_today", label: t("discovery.sort.soldToday") },
      { value: "sold_7d", label: t("discovery.sort.sold7d") },
      { value: "sold_all_time", label: t("discovery.sort.soldAll") },
      { value: "trending", label: t("discovery.sort.trending") },
    ],
    [t]
  );
  const providerParam =
    providers.length === providerValues.length ? "all" : providers.join(",");
  const providerLabel =
    providers.length === providerValues.length
      ? t("discovery.filters.providersAll")
      : providers
          .map(
            (value) =>
              providerOptions.find((option) => option.value === value)?.label ??
              value
          )
          .join(", ");
  const categorySearchNormalized = categorySearch.trim().toLowerCase();
  const categoryTokens = useMemo(
    () => categorySearchNormalized.split(/\s+/).filter(Boolean),
    [categorySearchNormalized]
  );
  const matchCategoryTokens = useCallback(
    (value: string) => {
      if (categoryTokens.length === 0) return true;
      const normalized = value.toLowerCase();
      return categoryTokens.some((token) => normalized.includes(token));
    },
    [categoryTokens]
  );
  const filteredCategories = useMemo(() => {
    if (categoryTokens.length === 0) return categories;
    return categories.filter((l1) => {
      if (matchCategoryTokens(l1.name)) {
        return true;
      }
      return (l1.children ?? []).some((l2) => {
        if (matchCategoryTokens(l2.name)) {
          return true;
        }
        return (l2.children ?? []).some((l3) =>
          matchCategoryTokens(l3.name)
        );
      });
    });
  }, [categories, categoryTokens.length, matchCategoryTokens]);
  const filteredL2Nodes = useMemo(() => {
    const l1Node = filteredCategories.find((node) => node.name === activeL1);
    const nodes = l1Node?.children ?? [];
    if (categoryTokens.length === 0) return nodes;
    return nodes.filter(
      (l2) =>
        matchCategoryTokens(l2.name) ||
        (l2.children ?? []).some((l3) => matchCategoryTokens(l3.name))
    );
  }, [filteredCategories, activeL1, categoryTokens.length, matchCategoryTokens]);
  const filteredL3Nodes = useMemo(() => {
    const l1Node = filteredCategories.find((node) => node.name === activeL1);
    const l2Node = (l1Node?.children ?? []).find((child) => child.name === activeL2);
    const nodes = l2Node?.children ?? [];
    if (categoryTokens.length === 0) return nodes;
    return nodes.filter((l3) => matchCategoryTokens(l3.name));
  }, [filteredCategories, activeL1, activeL2, categoryTokens.length, matchCategoryTokens]);

  useEffect(() => {
    let isActive = true;
    const loadAdmin = async () => {
      try {
        const response = await fetch("/api/settings/profile");
        if (!response.ok) return;
        const payload = await response.json();
        if (isActive) {
          setIsAdmin(Boolean(payload?.is_admin));
        }
      } catch {
        // ignore admin fetch errors
      }
    };

    loadAdmin();

    return () => {
      isActive = false;
    };
  }, []);

  const parseProviderParam = (value: string | null) => {
    if (!value || value === "all") return providerValues;
    const tokens = value
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => providerValues.includes(token));
    return tokens.length > 0 ? tokens : providerValues;
  };

  const safeDecode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const parseCategoryParam = (value: string | null) => {
    if (!value) return [];
    return value
      .split("|")
      .map((entry) => {
        const [levelRaw, ...rest] = entry.split(":");
        const level = levelRaw as CategorySelection["level"];
        const encodedValue = rest.join(":");
        if (level !== "l1" && level !== "l2" && level !== "l3") return null;
        if (!encodedValue) return null;
        return { level, value: safeDecode(encodedValue) };
      })
      .filter((entry): entry is CategorySelection => Boolean(entry));
  };

  const buildCategoryParam = (selections: CategorySelection[]) => {
    if (selections.length === 0) return null;
    return selections
      .map(
        (selection) =>
          `${selection.level}:${encodeURIComponent(selection.value)}`
      )
      .join("|");
  };

  useEffect(() => {
    try {
      const params = new URLSearchParams(urlSearch);
      const nextSearch = params.get("q") ?? "";
      const nextSort = params.get("sort") ?? "sold_7d";
      const nextProviders = parseProviderParam(params.get("provider"));
      const nextWishlist = params.get("wishlistId") ?? "all";
      const nextUpdatedFrom = params.get("updatedFrom") ?? "";
      const nextAddedFrom = params.get("addedFrom") ?? "";
      const nextPriceMinRaw = params.get("priceMin");
      const nextPriceMaxRaw = params.get("priceMax");
      const nextPriceMin =
        nextPriceMinRaw !== null ? Number(nextPriceMinRaw) : null;
      const nextPriceMax =
        nextPriceMaxRaw !== null ? Number(nextPriceMaxRaw) : null;
      let nextCategories = parseCategoryParam(params.get("categories"));
      if (nextCategories.length === 0) {
        const legacyLevel = params.get("categoryLevel") as
          | "l1"
          | "l2"
          | "l3"
          | null;
        const legacyValue = params.get("categoryValue");
        if (legacyLevel && legacyValue) {
          nextCategories = [{ level: legacyLevel, value: legacyValue }];
        }
      }
      const nextPage = Math.max(1, Number(params.get("page") ?? "1"));
      const nextPageSize = Math.min(
        200,
        Math.max(1, Number(params.get("pageSize") ?? "100"))
      );

      skipUrlSyncRef.current = true;
      isRestoringRef.current = true;
      setSearchInput(nextSearch);
      setSort(nextSort);
      setProviders(nextProviders);
      setWishlistFilterId(nextWishlist);
      setUpdatedFrom(nextUpdatedFrom);
      setAddedFrom(nextAddedFrom);
      setPriceMin(Number.isFinite(nextPriceMin) ? nextPriceMin : null);
      setPriceMax(Number.isFinite(nextPriceMax) ? nextPriceMax : null);
      setPriceMinInput(nextPriceMinRaw ?? "");
      setPriceMaxInput(nextPriceMaxRaw ?? "");
      setCategorySelections(nextCategories);
      setPage(nextPage);
      setPageSize(nextPageSize);
    } catch (err) {
      setError(t("discovery.error.load"));
      console.error("Failed to parse query params", err);
    }
  }, [urlSearch]);

  useEffect(() => {
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    setPage(1);
  }, [
    debouncedSearch,
    providerParam,
    sort,
    wishlistFilterId,
    updatedFrom,
    addedFrom,
    categorySelections,
    priceMin,
    priceMax,
    pageSize,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("q", debouncedSearch);
        params.set("provider", providerParam);
        if (sort) params.set("sort", sort);
        if (wishlistFilterId !== "all") {
          params.set("wishlistId", wishlistFilterId);
        }
        if (updatedFrom) params.set("updatedFrom", updatedFrom);
        if (addedFrom) params.set("addedFrom", addedFrom);
        if (priceMin !== null && Number.isFinite(priceMin)) {
          params.set("priceMin", String(priceMin));
        }
        if (priceMax !== null && Number.isFinite(priceMax)) {
          params.set("priceMax", String(priceMax));
        }
        if (categorySelections.length > 0) {
          const encoded = categorySelections
            .map((selection) => `${selection.level}:${encodeURIComponent(selection.value)}`)
            .join("|");
          params.set("categories", encoded);
        }
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));

        const response = await fetch(`/api/discovery?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(t("discovery.error.load"));
        }
        const payload = await response.json();
        setItems(payload.items ?? []);
        setTotal(payload.total ?? 0);
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
  }, [
    debouncedSearch,
    providerParam,
    sort,
    wishlistFilterId,
    updatedFrom,
    addedFrom,
    categorySelections,
    priceMin,
    priceMax,
    page,
    pageSize,
  ]);

  useEffect(() => {
    if (skipUrlSyncRef.current) {
      skipUrlSyncRef.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (providers.length !== providerValues.length) {
      params.set("provider", providerParam);
    }
    if (sort !== "sold_7d") params.set("sort", sort);
    if (wishlistFilterId !== "all") params.set("wishlistId", wishlistFilterId);
    if (updatedFrom) params.set("updatedFrom", updatedFrom);
    if (addedFrom) params.set("addedFrom", addedFrom);
    if (priceMin !== null && Number.isFinite(priceMin)) {
      params.set("priceMin", String(priceMin));
    }
    if (priceMax !== null && Number.isFinite(priceMax)) {
      params.set("priceMax", String(priceMax));
    }
    const categoryParam = buildCategoryParam(categorySelections);
    if (categoryParam) params.set("categories", categoryParam);
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 100) params.set("pageSize", String(pageSize));

    const nextQuery = params.toString();
    const currentQuery = urlSearch;
    if (nextQuery === currentQuery) return;
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.push(nextUrl);
  }, [
    debouncedSearch,
    providers,
    providerParam,
    sort,
    wishlistFilterId,
    updatedFrom,
    addedFrom,
    priceMin,
    priceMax,
    categorySelections,
    page,
    pageSize,
    pathname,
    router,
    urlSearch,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        const response = await fetch(
          `/api/discovery/categories?provider=${providerParam}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(t("discovery.error.categories"));
        }
        const payload = await response.json();
        setCategories(payload.categories ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        setCategoriesLoading(false);
      }
    };
    loadCategories();
    return () => controller.abort();
  }, [providerParam]);

  const fetchWishlists = async (signal?: AbortSignal) => {
    setWishlistsLoading(true);
    setWishlistsError(null);
    try {
      const response = await fetch("/api/discovery/wishlists/overview", { signal });
      if (!response.ok) {
        throw new Error(t("discovery.error.wishlists"));
      }
      const payload = await response.json();
      setWishlists(payload.owned ?? []);
      setSharedWishlists(payload.shared ?? []);
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

  useEffect(() => {
    if (wishlistsLoading || wishlistsError) return;
    if (wishlistFilterId === "all") return;
    const allLists = [...wishlists, ...sharedWishlists];
    if (!allLists.some((list) => list.id === wishlistFilterId)) {
      setWishlistFilterId("all");
    }
  }, [wishlists, sharedWishlists, wishlistFilterId, wishlistsLoading, wishlistsError]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const allWishlists = [...wishlists, ...sharedWishlists];
  const wishlistCountMap = new Map(
    allWishlists.map((list) => [list.name, list.item_count ?? 0])
  );
  const wishlistIdByName = new Map(allWishlists.map((list) => [list.name, list.id]));
  const selectedWishlist = allWishlists.find((list) => list.id === wishlistFilterId);
  const wishlistSelection =
    wishlistFilterId === "all" ||
    allWishlists.some((list) => list.id === wishlistFilterId)
      ? [wishlistFilterId]
      : ["all"];
  const wishlistFilterLabel =
    wishlistFilterId === "all" || !selectedWishlist
      ? t("discovery.lists.all")
      : `${selectedWishlist.name}${
          typeof selectedWishlist.item_count === "number"
            ? ` (${selectedWishlist.item_count})`
            : ""
        }`;
  const openMyLists = useCallback(() => {
    window.open("/app/my-lists", "_blank", "noopener,noreferrer");
  }, []);

  const categorySummary =
    categorySelections.length === 0
      ? t("discovery.categories.all")
      : categorySelections.length <= 2
        ? categorySelections.map((item) => item.value).join(", ")
        : t("discovery.categories.selectedCount", {
            count: categorySelections.length,
          });
  const draftKeys = new Set(
    categoryDraft.map((item) => `${item.level}:${item.value}`)
  );
  const toggleDraftCategory = (level: "l1" | "l2" | "l3", value: string) => {
    setCategoryDraft((prev) => {
      const key = `${level}:${value}`;
      const exists = prev.some(
        (item) => item.level === level && item.value === value
      );
      if (exists) {
        return prev.filter((item) => !(item.level === level && item.value === value));
      }
      return [...prev, { level, value }];
    });
  };
  const clearCategory = () => {
    setCategoryDraft([]);
    setCategorySelections([]);
  };

  useEffect(() => {
    if (categoryPopoverOpen) {
      setCategoryDraft(categorySelections);
    }
  }, [categoryPopoverOpen, categorySelections]);

  useEffect(() => {
    if (filteredCategories.length === 0) {
      setActiveL1(null);
      return;
    }
    if (!activeL1 || !filteredCategories.some((node) => node.name === activeL1)) {
      setActiveL1(filteredCategories[0].name);
    }
  }, [activeL1, filteredCategories]);

  useEffect(() => {
    if (filteredCategories.length === 0 || filteredL2Nodes.length === 0) {
      setActiveL2(null);
      return;
    }
    setActiveL2((prev) =>
      prev && filteredL2Nodes.some((child) => child.name === prev)
        ? prev
        : filteredL2Nodes[0].name
    );
  }, [filteredCategories, filteredL2Nodes]);

  const parsePriceInput = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, numeric);
  };

  const applyPriceFilter = () => {
    const nextMin = parsePriceInput(priceMinInput);
    const nextMax = parsePriceInput(priceMaxInput);
    let finalMin = nextMin;
    let finalMax = nextMax;
    if (nextMin !== null && nextMax !== null && nextMin > nextMax) {
      finalMin = nextMax;
      finalMax = nextMin;
    }
    setPriceMin(finalMin);
    setPriceMax(finalMax);
    setPriceMinInput(finalMin !== null ? String(finalMin) : "");
    setPriceMaxInput(finalMax !== null ? String(finalMax) : "");
  };

  const toggleSelected = (key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const openWishlistPopover = (key: string) => {
    if (wishlistCloseTimer.current) {
      clearTimeout(wishlistCloseTimer.current);
      wishlistCloseTimer.current = null;
    }
    setOpenWishlistFor(key);
  };

  const scheduleWishlistClose = () => {
    if (wishlistCloseTimer.current) {
      clearTimeout(wishlistCloseTimer.current);
    }
    wishlistCloseTimer.current = setTimeout(() => {
      setOpenWishlistFor(null);
    }, 250);
  };

  const updateItemAction = async (
    item: DiscoveryItem,
    action: "like" | "remove",
    valueOverride?: boolean
  ) => {
    const nextValue =
      typeof valueOverride === "boolean"
        ? valueOverride
        : action === "like"
          ? !item.liked
          : !item.removed;
    setItems((prev) =>
      prev.map((entry) =>
        entry.provider === item.provider && entry.product_id === item.product_id
          ? {
              ...entry,
              liked: action === "like" ? nextValue : entry.liked,
              removed: action === "remove" ? nextValue : entry.removed,
            }
          : entry
      )
    );

    try {
      const response = await fetch("/api/discovery/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: item.provider,
          product_id: item.product_id,
          action,
          value: nextValue,
        }),
      });

      if (!response.ok) {
        throw new Error(t("discovery.error.actions"));
      }
      const payload = await response.json();
      setItems((prev) =>
        prev.map((entry) =>
          entry.provider === item.provider && entry.product_id === item.product_id
            ? {
                ...entry,
                liked: Boolean(payload.liked),
                removed: Boolean(payload.removed),
              }
            : entry
        )
      );
    } catch (err) {
      setItems((prev) =>
        prev.map((entry) =>
          entry.provider === item.provider && entry.product_id === item.product_id
            ? {
                ...entry,
                liked: item.liked,
                removed: item.removed,
              }
            : entry
        )
      );
      setError((err as Error).message);
    }
  };

  const toggleProductionItem = async (item: DiscoveryItem) => {
    const nextValue = !item.in_production;
    setItems((prev) =>
      prev.map((entry) =>
        entry.provider === item.provider && entry.product_id === item.product_id
          ? { ...entry, in_production: nextValue }
          : entry
      )
    );

    try {
      const response = await fetch("/api/discovery/production", {
        method: nextValue ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: nextValue
          ? JSON.stringify({
              items: [
                {
                  provider: item.provider,
                  product_id: item.product_id,
                },
              ],
            })
          : JSON.stringify({
              provider: item.provider,
              product_id: item.product_id,
            }),
      });

      if (!response.ok) {
        throw new Error(t("discovery.error.actions"));
      }
    } catch (err) {
      setItems((prev) =>
        prev.map((entry) =>
          entry.provider === item.provider && entry.product_id === item.product_id
            ? { ...entry, in_production: item.in_production }
            : entry
        )
      );
      setError((err as Error).message);
    }
  };

  const adjustWishlistCount = useCallback((wishlistId: string, delta: number) => {
    setWishlists((prev) =>
      prev.map((list) => {
        if (list.id !== wishlistId) return list;
        if (typeof list.item_count !== "number") return list;
        const nextCount = Math.max(0, list.item_count + delta);
        return { ...list, item_count: nextCount };
      })
    );
  }, []);

  const removeFromWishlist = useCallback(
    async (item: DiscoveryItem, listId: string, listName: string) => {
      const previousNames = item.wishlist_names ?? [];
      const nextNames = previousNames.filter((name) => name !== listName);
      const removedLast = nextNames.length === 0;
      const previousLiked = item.liked;

      setItems((prev) =>
        prev.map((entry) =>
          entry.provider === item.provider && entry.product_id === item.product_id
            ? {
                ...entry,
                wishlist_names: nextNames,
                liked: removedLast ? false : entry.liked,
              }
            : entry
        )
      );
      adjustWishlistCount(listId, -1);

      try {
        const response = await fetch("/api/discovery/wishlists/items", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wishlistId: listId,
            provider: item.provider,
            product_id: item.product_id,
          }),
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || t("discovery.error.actions"));
        }
        if (removedLast && item.liked) {
          await updateItemAction(item, "like", false);
        }
      } catch (err) {
        setItems((prev) =>
          prev.map((entry) =>
            entry.provider === item.provider && entry.product_id === item.product_id
              ? {
                  ...entry,
                  wishlist_names: previousNames,
                  liked: previousLiked,
                }
              : entry
          )
        );
        adjustWishlistCount(listId, 1);
        setError((err as Error).message);
      }
    },
    [adjustWishlistCount, t, updateItemAction]
  );

  const selectedItems = items.filter((item) =>
    selectedIds.has(`${item.provider}:${item.product_id}`)
  );

  const saveSelectedToWishlist = async (
    wishlistId: string,
    wishlistName?: string
  ) => {
    if (selectedItems.length === 0) return;
    setIsSavingSelection(true);
    setError(null);
    try {
      const response = await fetch("/api/discovery/wishlists/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wishlistId,
          items: selectedItems.map((item) => ({
            provider: item.provider,
            product_id: item.product_id,
          })),
        }),
      });
      if (!response.ok) {
        let message = "Unable to save selected products.";
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch {
          // ignore parse failures
        }
        throw new Error(message);
      }
      const listName =
        wishlistName ??
        wishlists.find((list) => list.id === wishlistId)?.name ??
        "";
      if (listName) {
        setItems((prev) =>
          prev.map((entry) => {
            const entryKey = `${entry.provider}:${entry.product_id}`;
            if (!selectedIds.has(entryKey)) return entry;
            const existing = entry.wishlist_names ?? [];
            if (existing.includes(listName)) return entry;
            return {
              ...entry,
              wishlist_names: [...existing, listName],
            };
          })
        );
      }
      await fetchWishlists();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSavingSelection(false);
    }
  };

  const createWishlist = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const response = await fetch("/api/discovery/wishlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!response.ok) {
      let message = "Unable to create wishlist.";
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
    setIsSavingSelection(true);
    setError(null);
    try {
      const created = await createWishlist(newListName);
      if (!created) return;
      setWishlists((prev) => [created, ...prev]);
      setNewListName("");
      setNewListDialogOpen(false);
      await saveSelectedToWishlist(created.id, created.name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSavingSelection(false);
    }
  };

  const handleRemoveSelected = async () => {
    if (selectedItems.length === 0) return;
    setIsRemovingSelection(true);
    setError(null);
    try {
      await Promise.all(
        selectedItems.map((item) => updateItemAction(item, "remove", true))
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRemovingSelection(false);
    }
  };

  const handleProduceSelected = async () => {
    if (selectedItems.length === 0) return;
    setIsProducingSelection(true);
    setError(null);
    try {
      const response = await fetch("/api/discovery/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedItems.map((item) => ({
            provider: item.provider,
            product_id: item.product_id,
          })),
        }),
      });
      if (!response.ok) {
        let message = "Unable to produce selected products.";
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch {
          // ignore parse failures
        }
        throw new Error(message);
      }
      const selectedKeys = new Set(
        selectedItems.map((item) => `${item.provider}:${item.product_id}`)
      );
      setItems((prev) =>
        prev.map((entry) =>
          selectedKeys.has(`${entry.provider}:${entry.product_id}`)
            ? { ...entry, in_production: true }
            : entry
        )
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsProducingSelection(false);
    }
  };

  return (
    <div className={styles.layout}>
      <Card className={styles.controlsCard}>
        <div className={styles.controlRow}>
          <Field
            label={
              <span className={styles.filterLabel}>{t("discovery.filters.search")}</span>
            }
            className={styles.filterField}
          >
            <Input
              value={searchInput}
              onChange={(_, data) => setSearchInput(data.value)}
              placeholder={t("discovery.filters.searchPlaceholder")}
              className={styles.searchInput}
            />
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>{t("discovery.filters.provider")}</span>
            }
            className={styles.filterField}
          >
            <Dropdown
              multiselect
              value={providerLabel}
              selectedOptions={providers}
              onOptionSelect={(_, data) => {
                const next = (data.selectedOptions ?? []) as string[];
                if (next.length === 0) {
                  setProviders(providerValues);
                  return;
                }
                setProviders(next);
              }}
              className={styles.dropdownCompact}
            >
              {providerOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>{t("discovery.filters.sortBy")}</span>
            }
            className={styles.filterField}
          >
            <Dropdown
              value={sortOptions.find((option) => option.value === sort)?.label}
              selectedOptions={[sort]}
              onOptionSelect={(_, data) => setSort(String(data.optionValue))}
              className={styles.dropdownCompact}
            >
              {sortOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>{t("discovery.filters.category")}</span>
            }
            className={styles.filterField}
          >
            <Popover
              open={categoryPopoverOpen}
              onOpenChange={(_, data) => setCategoryPopoverOpen(data.open)}
              positioning={{
                position: "below",
                align: "start",
                offset: { mainAxis: 6 },
              }}
            >
              <PopoverTrigger disableButtonEnhancement>
                <Button appearance="outline" className={styles.categoryTrigger}>
                  {categorySummary}
                </Button>
              </PopoverTrigger>
              <PopoverSurface className={styles.categoryPopover}>
                {categoriesLoading ? (
                  <Spinner label={t("discovery.categories.loading")} />
                ) : categories.length === 0 ? (
                  <Text>{t("discovery.categories.empty")}</Text>
                ) : (
                  <>
                    <Input
                      value={categorySearch}
                      onChange={(_, data) => setCategorySearch(data.value)}
                      placeholder={t("discovery.categories.searchPlaceholder")}
                      className={styles.categorySearch}
                    />
                    <div className={styles.categoryColumns}>
                      <div className={styles.categoryColumn}>
                        <Text className={styles.categoryColumnTitle}>
                          {t("discovery.categories.level1")}
                        </Text>
                        {filteredCategories.map((l1) => (
                          <div
                            key={l1.name}
                            className={mergeClasses(
                              styles.categoryItem,
                              styles.categoryItemInteractive
                            )}
                            role="button"
                            tabIndex={0}
                            onClick={() => setActiveL1(l1.name)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setActiveL1(l1.name);
                              }
                            }}
                          >
                            <Checkbox
                              checked={draftKeys.has(`l1:${l1.name}`)}
                              className={styles.categoryCheckbox}
                              aria-label={t("common.selectItem", { item: l1.name })}
                              onChange={() => toggleDraftCategory("l1", l1.name)}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <span
                              className={mergeClasses(
                                styles.categoryNavButton,
                                activeL1 === l1.name ? styles.categoryNavActive : undefined
                              )}
                            >
                              {l1.name}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className={styles.categoryColumn}>
                        <Text className={styles.categoryColumnTitle}>
                          {t("discovery.categories.level2")}
                        </Text>
                      {filteredL2Nodes.map((l2) => (
                          <div
                            key={l2.name}
                            className={mergeClasses(
                              styles.categoryItem,
                              styles.categoryItemInteractive
                            )}
                            role="button"
                            tabIndex={0}
                            onClick={() => setActiveL2(l2.name)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setActiveL2(l2.name);
                              }
                            }}
                          >
                            <Checkbox
                              checked={draftKeys.has(`l2:${l2.name}`)}
                              className={styles.categoryCheckbox}
                              aria-label={t("common.selectItem", { item: l2.name })}
                              onChange={() => toggleDraftCategory("l2", l2.name)}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <span
                              className={mergeClasses(
                                styles.categoryNavButton,
                                activeL2 === l2.name ? styles.categoryNavActive : undefined
                              )}
                            >
                              {l2.name}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className={styles.categoryColumn}>
                        <Text className={styles.categoryColumnTitle}>
                          {t("discovery.categories.level3")}
                        </Text>
                        {filteredL3Nodes.map((l3) => (
                          <div
                            key={l3.name}
                            className={mergeClasses(
                              styles.categoryItem,
                              styles.categoryItemInteractive
                            )}
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleDraftCategory("l3", l3.name)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleDraftCategory("l3", l3.name);
                              }
                            }}
                          >
                            <Checkbox
                              checked={draftKeys.has(`l3:${l3.name}`)}
                              className={styles.categoryCheckbox}
                              aria-label={t("common.selectItem", { item: l3.name })}
                              onChange={() => toggleDraftCategory("l3", l3.name)}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <span className={styles.categoryNavButton}>{l3.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <div className={styles.categoryActions}>
                  {categorySelections.length > 0 ? (
                    <Button appearance="subtle" onClick={clearCategory}>
                      {t("common.clear")}
                    </Button>
                  ) : null}
                  <Button
                    appearance="primary"
                    onClick={() => {
                      setCategorySelections(categoryDraft);
                      setCategoryPopoverOpen(false);
                    }}
                  >
                    {t("common.done")}
                  </Button>
                </div>
              </PopoverSurface>
            </Popover>
          </Field>
          <Field
            label={
              <button
                type="button"
                className={styles.filterLabelLink}
                onClick={openMyLists}
              >
                {t("discovery.lists.label")}
                <svg
                  viewBox="0 0 16 16"
                  className={styles.filterLabelIcon}
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M4 4h6.5l-6.2 6.2 1.4 1.4L12 5.2V11h2V2H4v2z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            }
              className={styles.filterField}
          >
            <Dropdown
              value={wishlistFilterLabel}
              selectedOptions={wishlistSelection}
              onOptionSelect={(_, data) =>
                setWishlistFilterId(String(data.optionValue))
              }
              className={styles.dropdownCompact}
            >
              <Option value="all">{t("discovery.lists.all")}</Option>
              {wishlistsLoading ? (
                <Option value="loading" disabled>
                  {t("discovery.lists.loading")}
                </Option>
              ) : wishlistsError ? (
                <Option value="error" disabled>
                  {wishlistsError}
                </Option>
              ) : allWishlists.length === 0 ? (
                <Option value="empty" disabled>
                  {t("discovery.lists.empty")}
                </Option>
              ) : (
                allWishlists.map((list) => {
                  const label =
                    typeof list.item_count === "number"
                      ? `${list.name} (${list.item_count})`
                      : list.name;
                  return (
                    <Option key={list.id} value={list.id} text={label}>
                      {label}
                    </Option>
                  );
                })
              )}
            </Dropdown>
          </Field>
        </div>
        <div className={styles.controlRow}>
          <Field
            label={
              <span className={styles.filterLabel}>{t("discovery.filters.priceRange")}</span>
            }
            className={styles.priceField}
          >
            <div className={styles.priceInputRow}>
              <Input
                type="number"
                min={0}
                value={priceMinInput}
                onChange={(_, data) => setPriceMinInput(data.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applyPriceFilter();
                  }
                }}
                placeholder=""
                className={styles.priceInput}
              />
              <Text size={200} className={styles.cardMeta}>
                {t("common.to")}
              </Text>
              <Input
                type="number"
                min={0}
                value={priceMaxInput}
                onChange={(_, data) => setPriceMaxInput(data.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applyPriceFilter();
                  }
                }}
                placeholder=""
                className={styles.priceInput}
              />
              <Button appearance="outline" onClick={applyPriceFilter}>
                {t("common.filter")}
              </Button>
            </div>
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>{t("discovery.filters.addedFrom")}</span>
            }
            className={styles.dateField}
          >
            <Input
              type="date"
              value={addedFrom}
              onChange={(_, data) => setAddedFrom(data.value)}
            />
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>{t("discovery.filters.updatedFrom")}</span>
            }
            className={styles.dateField}
          >
            <Input
              type="date"
              value={updatedFrom}
              onChange={(_, data) => setUpdatedFrom(data.value)}
            />
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>{t("discovery.filters.itemsPerPage")}</span>
            }
            className={styles.filterField}
          >
            <Dropdown
              value={t("discovery.filters.pageSizeValue", { size: pageSize })}
              selectedOptions={[String(pageSize)]}
              onOptionSelect={(_, data) => {
                const next = Number(data.optionValue);
                if (!Number.isNaN(next)) {
                  setPageSize(next);
                }
              }}
              className={styles.dropdownCompact}
            >
              {pageSizeOptions.map((size) => (
                <Option
                  key={size}
                  value={String(size)}
                  text={t("discovery.filters.pageSizeValue", { size })}
                >
                  {t("discovery.filters.pageSizeValue", { size })}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field
            label={
              <span className={styles.filterLabel}>{t("discovery.selection.label")}</span>
            }
            className={styles.filterField}
          >
            <div className={styles.selectionActions}>
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button
                    appearance={selectedItems.length > 0 ? "primary" : "outline"}
                    disabled={selectedItems.length === 0 || isSavingSelection}
                  >
                    {t("common.save")}
                  </Button>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {wishlistsLoading ? (
                      <MenuItem disabled>{t("discovery.lists.loading")}</MenuItem>
                    ) : wishlistsError ? (
                      <MenuItem disabled>{wishlistsError}</MenuItem>
                    ) : wishlists.length === 0 ? (
                      <MenuItem disabled>{t("discovery.lists.empty")}</MenuItem>
                    ) : (
                      wishlists.map((list) => (
                        <MenuItem
                          key={list.id}
                          onClick={() => saveSelectedToWishlist(list.id, list.name)}
                        >
                          {list.name}
                        </MenuItem>
                      ))
                    )}
                    <MenuItem onClick={() => setNewListDialogOpen(true)}>
                      {t("discovery.lists.new")}
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
              <Button
                appearance="outline"
                onClick={handleRemoveSelected}
                disabled={selectedItems.length === 0 || isRemovingSelection}
                className={
                  selectedItems.length > 0 ? styles.removeSelectedActive : undefined
                }
              >
                {t("common.hide")}
              </Button>
              {isAdmin && selectedItems.length > 0 ? (
                <Button
                  appearance="outline"
                  onClick={handleProduceSelected}
                  disabled={isProducingSelection}
                >
                  {t("discovery.selection.produce")}
                </Button>
              ) : null}
              <Button
                appearance="outline"
                onClick={() => setSelectedIds(new Set())}
                disabled={selectedItems.length === 0}
                className={styles.unselectButton}
              >
                {t("common.unselect")}
              </Button>
              <Text className={styles.selectionCount}>
                {t("discovery.selection.selectedCount", {
                  count: selectedItems.length,
                })}
              </Text>
            </div>
          </Field>
        </div>
      </Card>

      <Dialog
        open={newListDialogOpen}
        onOpenChange={(_, data) => setNewListDialogOpen(data.open)}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("discovery.lists.createTitle")}</DialogTitle>
            <Field label={t("discovery.lists.nameLabel")}>
              <Input
                value={newListName}
                onChange={(_, data) => setNewListName(data.value)}
                placeholder={t("discovery.lists.namePlaceholder")}
              />
            </Field>
            <DialogActions>
              <Button appearance="subtle" onClick={() => setNewListDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={handleCreateWishlist}
                disabled={!newListName.trim() || isSavingSelection}
              >
                {t("common.ok")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {error ? <MessageBar intent="error">{error}</MessageBar> : null}
      {isLoading ? (
        <Spinner label={t("discovery.loading")} />
      ) : items.length === 0 ? (
        <Text className={styles.emptyState}>
          {t("discovery.empty")}
        </Text>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => {
            const title = item.title ?? item.product_id;
            const price = item.price ?? item.last_price;
            const providerLabel = item.provider.toUpperCase();
            const productUrl = item.product_url ?? item.source_url;
            const reviewLabel =
              item.reviews ?? item.last_reviews ?? null;
            const reviewValue =
              typeof reviewLabel === "number"
                ? reviewLabel
                : reviewLabel
                  ? Number(reviewLabel)
                  : null;
            const soldToday = item.sold_today ?? 0;
            const sold7d = item.sold_7d ?? 0;
            const soldAll = item.sold_all_time ?? 0;
            const itemKey = `${item.provider}:${item.product_id}`;
            const isSelected = selectedIds.has(itemKey);
            const wishlistNames = item.wishlist_names ?? [];
            const isWishlisted = wishlistNames.length > 0;
            const heartActive = isWishlisted || item.liked;
            const localImageUrl =
              item.image_local_url ||
              (item.image_local_path
                ? `/api/discovery/local-image?path=${encodeURIComponent(
                    item.image_local_path
                  )}`
                : null);
            const imageSrc = localImageUrl || item.image_url;
            const categoryClick = (level: "l1" | "l2" | "l3", value: string) =>
              setCategorySelections([{ level, value }]);
            const breadcrumbs = [
              item.taxonomy_l1
                ? { level: "l1" as const, label: item.taxonomy_l1 }
                : null,
              item.taxonomy_l2
                ? { level: "l2" as const, label: item.taxonomy_l2 }
                : null,
              item.taxonomy_l3
                ? { level: "l3" as const, label: item.taxonomy_l3 }
                : null,
            ].filter(
              (entry): entry is { level: "l1" | "l2" | "l3"; label: string } =>
                Boolean(entry && entry.label)
            );
            return (
              <Card
                key={itemKey}
                className={mergeClasses(
                  styles.card,
                  isSelected ? styles.cardSelected : undefined
                )}
                onClick={() => toggleSelected(itemKey)}
              >
                <div className={styles.cardImageWrap}>
                  {imageSrc ? (
                    <Image
                      src={imageSrc}
                      alt={title}
                      className={styles.cardImage}
                    />
                  ) : null}
                </div>
                <div className={styles.imageDivider} />
                <div className={styles.rowBetween}>
                  <div className={styles.rowLeft}>
                    <Badge
                      appearance="outline"
                      className={mergeClasses(
                        styles.providerBadge,
                        item.provider === "cdon"
                          ? styles.cdonBadge
                          : styles.fyndiqBadge
                      )}
                    >
                      {providerLabel}
                    </Badge>
                  </div>
                  <div className={styles.salesWrap}>
                    <span className={styles.salesGroup}>
                      <Text size={200} className={styles.cardMeta}>
                        1d
                      </Text>
                      <span className={styles.salesButton}>{soldToday}</span>
                    </span>
                    <span className={styles.salesGroupTight}>
                      <Text size={200} className={styles.cardMeta}>
                        7d
                      </Text>
                      <span className={styles.salesButton}>{sold7d}</span>
                    </span>
                    <span className={styles.salesGroup}>
                      <Text size={200} className={styles.cardMeta}>
                        {t("discovery.sales.all")}
                      </Text>
                      <span className={styles.salesButton}>{soldAll}</span>
                    </span>
                  </div>
                </div>
                <Tooltip content={title} relationship="label">
                  <span className={styles.cardTitle}>{title}</span>
                </Tooltip>
                <div className={styles.rowBetween} style={{ marginTop: "-2px" }}>
                  <div className={styles.rowLeft}>
                    <Text
                      size={300}
                      className={styles.priceText}
                      style={{ color: tokens.colorBrandForeground1 }}
                    >
                      {formatCurrency(price, "SEK")}
                    </Text>
                    {item.previous_price ? (
                      <Text
                        size={200}
                        className={mergeClasses(
                          styles.cardMeta,
                          styles.pricePrevText
                        )}
                        style={{ color: tokens.colorNeutralForeground4 }}
                      >
                        {t("discovery.price.prev", {
                          value: formatCurrency(item.previous_price, "SEK"),
                        })}
                      </Text>
                    ) : null}
                  </div>
                  {reviewLabel ? (
                    <div className={styles.rowRight}>
                      <Text
                        size={200}
                        className={styles.ratingLabel}
                        style={{ color: tokens.colorNeutralForeground4 }}
                      >
                        {t("discovery.rating.label")}{" "}
                        <span
                          className={mergeClasses(
                            styles.ratingValue,
                            reviewValue !== null && reviewValue >= 3
                              ? styles.ratingPositive
                              : styles.ratingNegative
                          )}
                        >
                          {reviewLabel}
                        </span>
                      </Text>
                    </div>
                  ) : null}
                </div>
                <div className={styles.dateRow}>
                  <div className={styles.dateBlock}>
                    <Text className={styles.dateLabel}>
                      {t("discovery.dates.updated")}
                    </Text>
                    <Text
                      size={200}
                      className={styles.dateValue}
                      style={{ color: tokens.colorNeutralForeground1 }}
                    >
                      {formatDate(item.last_seen_at)}
                    </Text>
                  </div>
                  <div className={styles.dateBlockRight}>
                    <Text className={styles.dateLabel}>
                      {t("discovery.dates.firstSeen")}
                    </Text>
                    <Text
                      size={200}
                      className={styles.dateValue}
                      style={{ color: tokens.colorNeutralForeground1 }}
                    >
                      {formatDate(item.first_seen_at)}
                    </Text>
                  </div>
                </div>
                {breadcrumbs.length > 0 ? (
                  <div className={styles.breadcrumbRow}>
                    {breadcrumbs.map((crumb, index) => (
                      <span key={`${crumb.level}-${crumb.label}`}>
                        <button
                          type="button"
                          className={styles.breadcrumbLink}
                          onClick={(event) => {
                            event.stopPropagation();
                            categoryClick(crumb.level, crumb.label);
                          }}
                        >
                          {crumb.label}
                        </button>
                        {index < breadcrumbs.length - 1 ? (
                          <span className={styles.breadcrumbDivider}> / </span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className={styles.cardFooter}>
                  <div className={styles.cardActions}>
                    <div
                      className={styles.wishlistWrap}
                      onMouseEnter={() => openWishlistPopover(itemKey)}
                      onMouseLeave={scheduleWishlistClose}
                    >
                      <button
                        type="button"
                        className={mergeClasses(
                          styles.actionIconButton,
                          heartActive ? styles.actionIconLiked : undefined
                        )}
                        aria-pressed={heartActive}
                        aria-label={
                          heartActive
                            ? t("discovery.wishlist.savedInList")
                            : t("discovery.wishlist.like")
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          updateItemAction(item, "like");
                        }}
                      >
                        <svg
                          className={styles.actionIcon}
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M12 20.5c-4.6-3.8-7.5-6.7-7.5-10.2 0-2.4 1.8-4.2 4.2-4.2 1.6 0 3.1.8 3.8 2.1.7-1.3 2.2-2.1 3.8-2.1 2.4 0 4.2 1.8 4.2 4.2 0 3.5-2.9 6.4-7.5 10.2z"
                            fill={heartActive ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth="1.6"
                          />
                        </svg>
                      </button>
                      {wishlistNames.length > 0 ? (
                        <div
                          className={mergeClasses(
                            styles.wishlistPopover,
                            openWishlistFor === itemKey
                              ? styles.wishlistPopoverOpen
                              : undefined
                          )}
                          onClick={(event) => event.stopPropagation()}
                          onMouseEnter={() => openWishlistPopover(itemKey)}
                          onMouseLeave={scheduleWishlistClose}
                        >
                          <div className={styles.wishlistList}>
                            {wishlistNames.map((name) => (
                              <div key={`${itemKey}-${name}`} className={styles.wishlistRow}>
                                <button
                                  type="button"
                                  className={styles.wishlistLink}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const listId = wishlistIdByName.get(name);
                                    if (listId) {
                                      setWishlistFilterId(listId);
                                      setOpenWishlistFor(null);
                                    }
                                  }}
                                >
                                  {name}
                                  {typeof wishlistCountMap.get(name) === "number"
                                    ? ` (${wishlistCountMap.get(name)})`
                                    : ""}
                                </button>
                                {wishlistIdByName.has(name) ? (
                                  <button
                                    type="button"
                                    className={styles.wishlistRemoveButton}
                                    aria-label={t("products.removeItem", { title: name })}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      const listId = wishlistIdByName.get(name);
                                      if (listId) {
                                        void removeFromWishlist(item, listId, name);
                                        setOpenWishlistFor(itemKey);
                                      }
                                    }}
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      className={styles.wishlistRemoveIcon}
                                      aria-hidden="true"
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
                                  </button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    {isAdmin ? (
                      <button
                        type="button"
                        className={mergeClasses(
                          styles.actionIconButton,
                          item.in_production ? styles.actionIconProduction : undefined
                        )}
                        aria-pressed={item.in_production}
                        aria-label={t("discovery.selection.produce")}
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleProductionItem(item);
                        }}
                      >
                        <svg
                          className={styles.actionIcon}
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          focusable="false"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path stroke="none" d="M0 0h24v24H0z" />
                          <path d="M3 21h18" />
                          <path d="M5 21v-12l5 4v-4l5 4h4" />
                          <path d="M19 21v-8l-1.436 -9.574a.5 .5 0 0 0 -.495 -.426h-1.145a.5 .5 0 0 0 -.494 .418l-1.43 8.582" />
                          <path d="M9 17h1" />
                          <path d="M14 17h1" />
                        </svg>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={mergeClasses(
                        styles.actionIconButton,
                        item.removed ? styles.actionIconRemoved : undefined
                      )}
                      aria-pressed={item.removed}
                      aria-label={
                        item.removed
                          ? t("discovery.actions.restore")
                          : t("discovery.actions.remove")
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        updateItemAction(item, "remove");
                      }}
                    >
                      <svg
                        className={styles.actionIcon}
                        viewBox="0 0 24 24"
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
                    </button>
                  </div>
                  {productUrl ? (
                    <a
                      href={productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.cardLink}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {t("discovery.actions.viewOn", { provider: providerLabel })}
                    </a>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className={styles.paginationWrap}>
        <Text size={200} className={styles.cardMeta}>
          {t("discovery.pagination.pageOf", { page, pageCount })}
        </Text>
        <div className={styles.paginationButtons}>
          <Button
            appearance="subtle"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
          >
            {t("common.previous")}
          </Button>
          <Button
            appearance="subtle"
            onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
            disabled={page === pageCount}
          >
            {t("common.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DiscoveryPage() {
  return (
    <Suspense fallback={null}>
      <DiscoveryPageInner />
    </Suspense>
  );
}
