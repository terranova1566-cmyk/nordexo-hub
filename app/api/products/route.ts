import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadImageUrls, preferImageUrlFilenameFirst } from "@/lib/server-images";
import { loadLegacyHeroWhiteBySpu } from "@/lib/legacy-product-image-data";
import { getProductsIndex } from "@/lib/meili";
import { isDigiDealDeliveryListName } from "@/lib/product-delivery/digideal";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

type CategorySelection = {
  level: "l1" | "l2" | "l3";
  value: string;
};

type ProductRow = {
  id: string;
  spu: string | null;
  title: string | null;
  subtitle: string | null;
  description_html: string | null;
  legacy_title_sv?: string | null;
  legacy_description_sv?: string | null;
  legacy_bullets_sv?: string | null;
  tags: string | null;
  product_type: string | null;
  shopify_category_name: string | null;
  google_taxonomy_l1: string | null;
  google_taxonomy_l2: string | null;
  google_taxonomy_l3: string | null;
  image_folder: string | null;
  images: unknown;
  supplier_1688_url: string | null;
  updated_at: string | null;
  created_at: string | null;
  brand: string | null;
  vendor: string | null;
  nordic_partner_enabled: boolean | null;
};

type DraftWorkflowRow = {
  draft_spu: string | null;
  draft_source: string | null;
  draft_image_folder: string | null;
  draft_updated_at: string | null;
};

type ShopRow = {
  id: string;
  code: string | null;
  name: string | null;
  platform: string | null;
  shop_domain: string | null;
  shopify_domain: string | null;
  is_active: boolean | null;
};

type VariantInShopRow = {
  catalog_variant_id: string | null;
  shop_id: string | null;
  is_active: boolean | null;
  deleted_at: string | null;
};

const SHOPIFY_PUBLISHED_STORE_CODES = [
  "shopify_tingelo",
  "shopify_sparklar",
  "shopify_sparkler",
  "shopify_wellando",
] as const;

const PUBLISHED_CHANNEL_ORDER = ["tingelo", "sparkler", "wellando"] as const;

const normalizePublishedChannel = (shop: {
  code?: string | null;
  name?: string | null;
  shop_domain?: string | null;
  shopify_domain?: string | null;
}) => {
  const haystack = [
    shop.code,
    shop.name,
    shop.shop_domain,
    shop.shopify_domain,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  if (haystack.includes("tingelo")) return "tingelo";
  if (haystack.includes("sparklar") || haystack.includes("sparkler")) {
    return "sparkler";
  }
  if (haystack.includes("wellando")) return "wellando";
  return null;
};

const sortPublishedChannels = (channels: string[]) => {
  const rank: Record<string, number> = {
    tingelo: 0,
    sparkler: 1,
    wellando: 2,
  };
  return channels
    .slice()
    .sort((left, right) => (rank[left] ?? 99) - (rank[right] ?? 99));
};

const chunk = <T,>(items: T[], size: number) => {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
};

const normalizeHtml = (value: string) =>
  value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parseCategorySelections = (value: string | null) => {
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

const formatInValues = (values: string[]) =>
  values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",");

const formatFilterValues = (values: string[]) =>
  `[${values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",")}]`;

const toTimestamp = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
};

const extractRunFromDraftFolder = (value: string | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\\/g, "/");
  const marker = "images/draft_products/";
  const markerIndex = normalized.toLowerCase().indexOf(marker);
  if (markerIndex >= 0) {
    const rest = normalized.slice(markerIndex + marker.length);
    return rest.split("/").filter(Boolean)[0] ?? null;
  }
  const parts = normalized.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "draft_products") {
    return parts[1] ?? null;
  }
  return parts[0] ?? null;
};

const isReEditWorkflowRow = (row: DraftWorkflowRow) => {
  const source = String(row.draft_source ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (source === "reedit" || source === "reediting") return true;
  const run = extractRunFromDraftFolder(row.draft_image_folder);
  if (!run) return false;
  const normalizedRun = run
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  return (
    /^re\s*edit(?:ing)?\b/.test(normalizedRun) ||
    /\bre\s*edit(?:ing)?\b/.test(normalizedRun)
  );
};

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userSettings } = await supabase
    .from("partner_user_settings")
    .select("active_markets, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const activeMarkets =
    userSettings?.active_markets && userSettings.active_markets.length > 0
      ? userSettings.active_markets
      : ["SE"];
  const isAdmin = Boolean(userSettings?.is_admin);

  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category")?.trim();
  const categoriesParam = searchParams.get("categories")?.trim() ?? null;
  const categorySelections = parseCategorySelections(categoriesParam);
  const tag = searchParams.get("tag")?.trim();
  const exactSpuQuery = q.length > 0 && q.includes("-") && !/\s/.test(q);
  const searchTerms = [exactSpuQuery ? null : q, category, tag]
    .filter(Boolean)
    .join(" ")
    .trim();
  const useMeili = searchTerms.length > 0 || exactSpuQuery;
  const brandFilters = searchParams
    .getAll("brand")
    .map((value) => value.trim())
    .filter(Boolean);
  const vendorFilters = searchParams
    .getAll("vendor")
    .map((value) => value.trim())
    .filter(Boolean);
  const updatedFrom = searchParams.get("updatedFrom");
  const updatedTo = searchParams.get("updatedTo");
  const addedFrom = searchParams.get("addedFrom");
  const addedTo = searchParams.get("addedTo");
  const wishlistIdParam = searchParams.get("wishlistId")?.trim();
  const wishlistId =
    wishlistIdParam && wishlistIdParam !== "all" ? wishlistIdParam : null;
  const sort = searchParams.get("sort") ?? "updated_desc";
  const hasVariants = searchParams.get("hasVariants") === "true";
  const savedFilter = searchParams.get("saved") ?? "all";
  const includeLegacyText =
    (searchParams.get("includeLegacyText") ?? "").toLowerCase() === "true";
  const coreTermsParam = searchParams.get("coreTerms")?.trim();
  const coreTerms =
    coreTermsParam
      ?.split(/[|,]/)
      .map((term) => term.trim())
      .filter(Boolean) ?? [];

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE))
  );

  let products: ProductRow[] = [];
  let totalCount = 0;

const PRODUCT_SELECT_COLUMNS: string = includeLegacyText
    ? "id, spu, title, subtitle, description_html, legacy_title_sv, legacy_description_sv, legacy_bullets_sv, tags, product_type, shopify_category_name, google_taxonomy_l1, google_taxonomy_l2, google_taxonomy_l3, image_folder, images, supplier_1688_url, updated_at, created_at, brand, vendor, nordic_partner_enabled"
    : "id, spu, title, subtitle, description_html, tags, product_type, shopify_category_name, google_taxonomy_l1, google_taxonomy_l2, google_taxonomy_l3, image_folder, images, supplier_1688_url, updated_at, created_at, brand, vendor, nordic_partner_enabled";

  if (useMeili) {
    const filters: string[] = [];
    filters.push("is_blocked = false");
    if (!isAdmin) {
      filters.push("nordic_partner_enabled = true");
    }
    if (hasVariants) {
      filters.push("variant_count > 0");
    }

    const addOrGroup = (items: string[]) => {
      if (items.length === 0) return;
      if (items.length === 1) {
        filters.push(items[0]);
        return;
      }
      filters.push(`(${items.join(" OR ")})`);
    };

    if (categorySelections.length > 0) {
      const l1Values = new Set<string>();
      const l2Values = new Set<string>();
      const l3Values = new Set<string>();
      categorySelections.forEach((selection) => {
        if (selection.level === "l1") l1Values.add(selection.value);
        if (selection.level === "l2") l2Values.add(selection.value);
        if (selection.level === "l3") l3Values.add(selection.value);
      });
      const categoryFilters: string[] = [];
      if (l1Values.size > 0) {
        categoryFilters.push(
          `google_taxonomy_l1 IN ${formatFilterValues([...l1Values])}`
        );
      }
      if (l2Values.size > 0) {
        categoryFilters.push(
          `google_taxonomy_l2 IN ${formatFilterValues([...l2Values])}`
        );
      }
      if (l3Values.size > 0) {
        categoryFilters.push(
          `google_taxonomy_l3 IN ${formatFilterValues([...l3Values])}`
        );
      }
      addOrGroup(categoryFilters);
    }

    const wantsEmptyBrand = brandFilters.includes("__no_brand__");
    const selectedBrands = brandFilters.filter((value) => value !== "__no_brand__");
    if (selectedBrands.length > 0 || wantsEmptyBrand) {
      const brandParts: string[] = [];
      if (selectedBrands.length > 0) {
        brandParts.push(`brand IN ${formatFilterValues(selectedBrands)}`);
      }
      if (wantsEmptyBrand) {
        brandParts.push("brand_is_empty = true");
      }
      addOrGroup(brandParts);
    }

    if (exactSpuQuery && q) {
      filters.push(`spu = "${q.replace(/"/g, '\\"')}"`);
    }

    const wantsEmptyVendor = vendorFilters.includes("__no_vendor__");
    const selectedVendors = vendorFilters.filter(
      (value) => value !== "__no_vendor__"
    );
    if (selectedVendors.length > 0 || wantsEmptyVendor) {
      const vendorParts: string[] = [];
      if (selectedVendors.length > 0) {
        vendorParts.push(`vendor IN ${formatFilterValues(selectedVendors)}`);
      }
      if (wantsEmptyVendor) {
        vendorParts.push("vendor_is_empty = true");
      }
      addOrGroup(vendorParts);
    }

    const updatedFromTs = toTimestamp(updatedFrom);
    if (updatedFromTs !== null) {
      filters.push(`updated_at >= ${updatedFromTs}`);
    }
    const updatedToTs = toTimestamp(updatedTo);
    if (updatedToTs !== null) {
      filters.push(`updated_at <= ${updatedToTs}`);
    }
    const addedFromTs = toTimestamp(addedFrom);
    if (addedFromTs !== null) {
      filters.push(`updated_at >= ${addedFromTs}`);
    }
    const addedToTs = toTimestamp(addedTo);
    if (addedToTs !== null) {
      filters.push(`updated_at <= ${addedToTs}`);
    }

    if (wishlistId) {
      const { data: wishlist, error: wishlistError } = await supabase
        .from("product_manager_wishlists")
        .select("id")
        .eq("id", wishlistId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (wishlistError) {
        return NextResponse.json(
          { error: wishlistError.message },
          { status: 500 }
        );
      }

      if (!wishlist) {
        return NextResponse.json({ items: [], page, pageSize, total: 0 });
      }

      const { data: wishlistItems, error: itemsError } = await supabase
        .from("product_manager_wishlist_items")
        .select("product_id")
        .eq("wishlist_id", wishlistId);

      if (itemsError) {
        return NextResponse.json({ error: itemsError.message }, { status: 500 });
      }

      const wishlistProductIds =
        wishlistItems?.map((row) => row.product_id).filter(Boolean) ?? [];

      if (wishlistProductIds.length === 0) {
        return NextResponse.json({ items: [], page, pageSize, total: 0 });
      }

      filters.push(`id IN ${formatFilterValues(wishlistProductIds)}`);
    }

    if (savedFilter === "saved" || savedFilter === "unsaved") {
      const { data: savedRows, error: savedError } = await supabase
        .from("partner_saved_products")
        .select("product_id")
        .eq("user_id", user.id);

      if (savedError) {
        return NextResponse.json({ error: savedError.message }, { status: 500 });
      }

      const savedIds = savedRows?.map((row) => row.product_id) ?? [];

      if (savedFilter === "saved") {
        if (savedIds.length === 0) {
          return NextResponse.json({ items: [], page, pageSize, total: 0 });
        }
        filters.push(`id IN ${formatFilterValues(savedIds)}`);
      } else if (savedIds.length > 0) {
        filters.push(`id NOT IN ${formatFilterValues(savedIds)}`);
      }
    }

    const index = getProductsIndex();
    const offset = (page - 1) * pageSize;
    const sortRules =
      sort === "title_asc"
        ? ["title:asc"]
        : sort === "added_desc" || sort === "updated_desc"
          ? ["updated_at:desc"]
          : undefined;

    const maxHits = page * pageSize;
    const searchConfig = {
      filter: filters.length ? filters.join(" AND ") : undefined,
      sort: sortRules,
      limit: maxHits,
      offset: 0,
      attributesToRetrieve: ["id"],
    };

    const expandedResult = await index.search(searchTerms, searchConfig);
    const expandedIds =
      expandedResult.hits
        ?.map((hit) => String((hit as { id?: string }).id ?? ""))
        .filter(Boolean) ?? [];

    let mergedIds = expandedIds;
    if (coreTerms.length > 0) {
      const coreQuery = coreTerms.join(" ").trim();
      const coreResult = coreQuery
        ? await index.search(coreQuery, searchConfig)
        : null;
      const coreIds =
        coreResult?.hits
          ?.map((hit) => String((hit as { id?: string }).id ?? ""))
          .filter(Boolean) ?? [];
      const seen = new Set<string>();
      mergedIds = [];
      coreIds.forEach((id) => {
        if (!seen.has(id)) {
          seen.add(id);
          mergedIds.push(id);
        }
      });
      expandedIds.forEach((id) => {
        if (!seen.has(id)) {
          seen.add(id);
          mergedIds.push(id);
        }
      });
    }

    totalCount =
      expandedResult.estimatedTotalHits ??
      (expandedResult as { totalHits?: number }).totalHits ??
      mergedIds.length;

    const ids = mergedIds.slice(offset, offset + pageSize);

    if (ids.length === 0) {
      return NextResponse.json({ items: [], page, pageSize, total: totalCount });
    }

    let productQuery = supabase
      .from("catalog_products")
      .select(PRODUCT_SELECT_COLUMNS)
      .in("id", ids)
      .neq("is_blocked", true);

    if (!isAdmin) {
      productQuery = productQuery.eq("nordic_partner_enabled", true);
    }

    const { data, error } = await productQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const orderMap = new Map(ids.map((id, index) => [id, index]));
    const rows = (data ?? []) as unknown as ProductRow[];
    products = rows.slice().sort((a, b) => {
      const left = orderMap.get(a.id) ?? 0;
      const right = orderMap.get(b.id) ?? 0;
      return left - right;
    });
  } else {
    let query = supabase
      .from("catalog_products")
      .select(PRODUCT_SELECT_COLUMNS, { count: "exact" })
      .neq("is_blocked", true);

    if (!isAdmin) {
      query = query.eq("nordic_partner_enabled", true);
    }

    if (savedFilter === "saved" || savedFilter === "unsaved") {
      const { data: savedRows, error: savedError } = await supabase
        .from("partner_saved_products")
        .select("product_id")
        .eq("user_id", user.id);

      if (savedError) {
        return NextResponse.json({ error: savedError.message }, { status: 500 });
      }

      const savedIds = savedRows?.map((row) => row.product_id) ?? [];

      if (savedFilter === "saved") {
        if (savedIds.length === 0) {
          return NextResponse.json({
            items: [],
            page,
            pageSize,
            total: 0,
          });
        }
        query = query.in("id", savedIds);
      } else if (savedIds.length > 0) {
        query = query.not("id", "in", `(${savedIds.join(",")})`);
      }
    }

    if (wishlistId) {
      const { data: wishlist, error: wishlistError } = await supabase
        .from("product_manager_wishlists")
        .select("id")
        .eq("id", wishlistId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (wishlistError) {
        return NextResponse.json(
          { error: wishlistError.message },
          { status: 500 }
        );
      }

      if (!wishlist) {
        return NextResponse.json({
          items: [],
          page,
          pageSize,
          total: 0,
        });
      }

      const { data: wishlistItems, error: itemsError } = await supabase
        .from("product_manager_wishlist_items")
        .select("product_id")
        .eq("wishlist_id", wishlistId);

      if (itemsError) {
        return NextResponse.json({ error: itemsError.message }, { status: 500 });
      }

      const wishlistProductIds =
        wishlistItems?.map((row) => row.product_id).filter(Boolean) ?? [];

      if (wishlistProductIds.length === 0) {
        return NextResponse.json({
          items: [],
          page,
          pageSize,
          total: 0,
        });
      }

      query = query.in("id", wishlistProductIds);
    }

    if (categorySelections.length > 0) {
      const l1Values = new Set<string>();
      const l2Values = new Set<string>();
      const l3Values = new Set<string>();
      categorySelections.forEach((selection) => {
        if (selection.level === "l1") l1Values.add(selection.value);
        if (selection.level === "l2") l2Values.add(selection.value);
        if (selection.level === "l3") l3Values.add(selection.value);
      });
      const filters: string[] = [];
      if (l1Values.size > 0) {
        filters.push(
          `google_taxonomy_l1.in.(${formatInValues([...l1Values])})`
        );
      }
      if (l2Values.size > 0) {
        filters.push(
          `google_taxonomy_l2.in.(${formatInValues([...l2Values])})`
        );
      }
      if (l3Values.size > 0) {
        filters.push(
          `google_taxonomy_l3.in.(${formatInValues([...l3Values])})`
        );
      }
      if (filters.length > 0) {
        query = query.or(filters.join(","));
      }
    } else if (category) {
      const escaped = category.replace(/%/g, "\\%").replace(/_/g, "\\_");
      const like = `%${escaped}%`;
      query = query.or(
        [
          `google_taxonomy_l1.ilike.${like}`,
          `google_taxonomy_l2.ilike.${like}`,
          `google_taxonomy_l3.ilike.${like}`,
          `shopify_category_name.ilike.${like}`,
          `product_type.ilike.${like}`,
        ].join(",")
      );
    }

    if (tag) {
      query = query.ilike("tags", `%${tag}%`);
    }

    const filterWithEmpty = (
      column: "brand" | "vendor",
      values: string[],
      noneToken: string
    ) => {
      const wantsEmpty = values.includes(noneToken);
      const selected = values.filter((value) => value !== noneToken);
      if (!wantsEmpty) {
        if (selected.length > 0) {
          query = query.in(column, selected);
        }
        return;
      }
      const filters: string[] = [];
      if (selected.length > 0) {
        const encoded = selected
          .map((value) => `"${value.replace(/"/g, '\\"')}"`)
          .join(",");
        filters.push(`${column}.in.(${encoded})`);
      }
      filters.push(`${column}.is.null`, `${column}.eq.`);
      query = query.or(filters.join(","));
    };

    if (brandFilters.length > 0) {
      filterWithEmpty("brand", brandFilters, "__no_brand__");
    }

    if (vendorFilters.length > 0) {
      filterWithEmpty("vendor", vendorFilters, "__no_vendor__");
    }

    if (updatedFrom) {
      query = query.gte("updated_at", updatedFrom);
    }

    if (updatedTo) {
      query = query.lte("updated_at", updatedTo);
    }

    // catalog_products does not store created_at; use updated_at as a proxy for now.
    if (addedFrom) {
      query = query.gte("updated_at", addedFrom);
    }

    if (addedTo) {
      query = query.lte("updated_at", addedTo);
    }

    switch (sort) {
      case "title_asc":
        query = query.order("title", { ascending: true, nullsFirst: false });
        break;
      case "added_desc":
      case "updated_desc":
      default:
        query = query.order("updated_at", { ascending: false });
        break;
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    products = (data ?? []) as unknown as ProductRow[];
    totalCount = count ?? 0;
  }

  const fallbackBySpu = new Map<
    string,
    { effective_long_title?: string | null }
  >();
  const spus = products?.map((product) => product.spu).filter(Boolean) ?? [];
  if (spus.length > 0) {
    const { data: fallbackRows } = await supabase
      .from("catalog_products_fallback")
      .select("spu, effective_long_title")
      .in("spu", spus);
    fallbackRows?.forEach((row) => {
      if (row.spu) {
        fallbackBySpu.set(row.spu, row);
      }
    });
  }

  const productIds = products?.map((product) => product.id) ?? [];

  const workflowBySpu = new Map<
    string,
    { status: "re_editing"; run: string | null; updatedAt: string | null }
  >();
  if (spus.length > 0) {
    const { data: workflowRows, error: workflowError } = await supabase
      .from("draft_products")
      .select("draft_spu,draft_source,draft_image_folder,draft_updated_at")
      .eq("draft_status", "draft")
      .in("draft_spu", spus);
    if (workflowError) {
      return NextResponse.json({ error: workflowError.message }, { status: 500 });
    }
    (workflowRows ?? []).forEach((row) => {
      const typed = row as DraftWorkflowRow;
      const spu = String(typed.draft_spu ?? "").trim();
      if (!spu || !isReEditWorkflowRow(typed)) return;
      const current = workflowBySpu.get(spu);
      const currentTs = current?.updatedAt ? Date.parse(current.updatedAt) : 0;
      const nextTs = typed.draft_updated_at ? Date.parse(typed.draft_updated_at) : 0;
      if (!current || nextTs >= currentTs) {
        workflowBySpu.set(spu, {
          status: "re_editing",
          run: extractRunFromDraftFolder(typed.draft_image_folder),
          updatedAt: typed.draft_updated_at ?? null,
        });
      }
    });
  }

  const legacyTextByProductId = new Map<string, boolean>();
  if (includeLegacyText && productIds.length > 0) {
    const PRODUCT_META_NAMESPACES = ["product_global", "product.global"];
    // Treat any of these metafields as an indicator that the product has been converted.
    const CONVERTED_KEYS = [
      "short_title",
      "long_title",
      "subtitle",
      "bullets_short",
      "bullets",
      "bullets_long",
      "description_short",
      "description_extended",
      "specs",
    ];

    const { data: metaDefs } = await supabase
      .from("metafield_definitions")
      .select("id, key, namespace")
      .eq("resource", "catalog_product")
      .in("key", CONVERTED_KEYS)
      .in("namespace", PRODUCT_META_NAMESPACES);

    const defMap = new Map<string, { key: string; namespace: string | null }>();
    (metaDefs ?? []).forEach((def) => {
      if (!def?.id) return;
      defMap.set(String(def.id), {
        key: String(def.key ?? ""),
        namespace: def.namespace ?? null,
      });
    });
    const defIds = Array.from(defMap.keys());

    const convertedSet = new Set<string>();
    if (defIds.length > 0) {
      const { data: metaValues } = await supabase
        .from("metafield_values")
        .select("definition_id, target_id, value_text, value, value_number, value_json")
        .eq("target_type", "product")
        .in("definition_id", defIds)
        .in("target_id", productIds);

      metaValues?.forEach((row) => {
        const productId = row.target_id ? String(row.target_id) : "";
        if (!productId) return;
        const text =
          (typeof row.value_text === "string" && row.value_text.trim()
            ? row.value_text
            : null) ??
          (row.value_number !== null && row.value_number !== undefined
            ? String(row.value_number)
            : null) ??
          (typeof row.value === "string" && row.value.trim() ? row.value : null) ??
          (row.value_json !== null && row.value_json !== undefined
            ? JSON.stringify(row.value_json)
            : null);
        if (text && text.trim()) {
          convertedSet.add(productId);
        }
      });
    }

    (products ?? []).forEach((product) => {
      const legacyTitle = String(product.legacy_title_sv ?? "").trim();
      const legacyDesc = String(product.legacy_description_sv ?? "").trim();
      const legacyBullets = String(product.legacy_bullets_sv ?? "").trim();
      const hasLegacy = Boolean(legacyTitle || legacyDesc || legacyBullets);
      const hasConverted = convertedSet.has(product.id);
      const normalizedDescription = normalizeHtml(product.description_html ?? "");
      const legacyPointerActive =
        Boolean(legacyDesc) &&
        Boolean(normalizedDescription) &&
        normalizedDescription === legacyDesc;
      legacyTextByProductId.set(
        product.id,
        hasLegacy && (!hasConverted || legacyPointerActive)
      );
    });
  }

  const variantCountMap = new Map<string, number>();
  const variantPriceMap = new Map<string, { min: number; max: number }>();
  const variantB2CPriceMap = new Map<string, { min: number; max: number }>();
  const variantIdToProductId = new Map<string, string>();
  const variantPriceRows = new Map<
    string,
    Map<string, Map<string, number | null>>
  >();
  const variantPreviewMap = new Map<
    string,
    Array<{
      sku: string | null;
      option1: string | null;
      option2: string | null;
      option3: string | null;
      option4: string | null;
      variation_color_se: string | null;
      variation_size_se: string | null;
      variation_other_se: string | null;
      variation_amount_se: string | null;
      b2b_dropship_price_se: number | null;
      b2b_dropship_price_no: number | null;
      b2b_dropship_price_dk: number | null;
      b2b_dropship_price_fi: number | null;
    }>
  >();

  if (productIds.length > 0) {
    const { data: variants } = await supabase
      .from("catalog_variants")
      .select(
        "id, product_id, sku, price, option1, option2, option3, option4, variation_color_se, variation_size_se, variation_other_se, variation_amount_se, b2b_dropship_price_se, b2b_dropship_price_no, b2b_dropship_price_dk, b2b_dropship_price_fi"
      )
      .in("product_id", productIds);

    const variantIds = variants?.map((variant) => variant.id).filter(Boolean) ?? [];

    if (variantIds.length > 0) {
      const { data: priceRows } = await supabase
        .from("catalog_variant_prices")
        .select("catalog_variant_id, market, currency, price, price_type")
        .in("catalog_variant_id", variantIds)
        .in("price_type", ["b2b_fixed", "b2b_calc", "b2b_dropship"])
        .is("deleted_at", null);

      priceRows?.forEach((row) => {
        const variantId = row.catalog_variant_id;
        if (!variantId) return;
        const type = String(row.price_type || "b2b_dropship");
        const entry = variantPriceRows.get(variantId) ?? new Map();
        const typeEntry = entry.get(type) ?? new Map<string, number | null>();
        const market = row.market?.toUpperCase();
        if (market) {
          let priceValue: number | null = null;
          if (row.price !== null && row.price !== undefined) {
            const numeric = Number(row.price);
            if (Number.isFinite(numeric)) {
              priceValue = numeric;
            }
          }
          typeEntry.set(market, priceValue);
        }
        entry.set(type, typeEntry);
        variantPriceRows.set(variantId, entry);
      });
    }

    variants?.forEach((variant) => {
      const variantId = String(variant.id ?? "").trim();
      const productId = String(variant.product_id ?? "").trim();
      if (variantId && productId) {
        variantIdToProductId.set(variantId, productId);
      }
      const priceEntry = variantPriceRows.get(variant.id);
      const resolveMarketPrice = (
        market: "SE" | "NO" | "DK" | "FI",
        fallback: number | null | undefined
      ) => {
        if (!priceEntry) {
          return fallback ?? null;
        }
        const readPrice = (type: string) => priceEntry.get(type)?.get(market);
        const fixed = readPrice("b2b_fixed") ?? readPrice("b2b_dropship");
        if (fixed !== undefined && fixed !== null) return fixed;
        const calc = readPrice("b2b_calc");
        if (calc !== undefined && calc !== null) return calc;
        return fallback ?? null;
      };

      const priceSe = resolveMarketPrice("SE", variant.b2b_dropship_price_se);
      const priceNo = resolveMarketPrice("NO", variant.b2b_dropship_price_no);
      const priceDk = resolveMarketPrice("DK", variant.b2b_dropship_price_dk);
      const priceFi = resolveMarketPrice("FI", variant.b2b_dropship_price_fi);

      variantCountMap.set(
        variant.product_id,
        (variantCountMap.get(variant.product_id) ?? 0) + 1
      );

      const preview = variantPreviewMap.get(variant.product_id) ?? [];
      if (preview.length < 10) {
        preview.push({
          sku: variant.sku ?? null,
          option1: variant.option1 ?? null,
          option2: variant.option2 ?? null,
          option3: variant.option3 ?? null,
          option4: variant.option4 ?? null,
          variation_color_se: variant.variation_color_se ?? null,
          variation_size_se: variant.variation_size_se ?? null,
          variation_other_se: variant.variation_other_se ?? null,
          variation_amount_se: variant.variation_amount_se ?? null,
          b2b_dropship_price_se: priceSe,
          b2b_dropship_price_no: priceNo,
          b2b_dropship_price_dk: priceDk,
          b2b_dropship_price_fi: priceFi,
        });
        variantPreviewMap.set(variant.product_id, preview);
      }

      const rawPrice = priceSe;
      if (rawPrice !== null && rawPrice !== undefined) {
        const price = Number(rawPrice);
        if (Number.isFinite(price)) {
          const current = variantPriceMap.get(variant.product_id);
          if (!current) {
            variantPriceMap.set(variant.product_id, { min: price, max: price });
          } else {
            const nextMin = price < current.min ? price : current.min;
            const nextMax = price > current.max ? price : current.max;
            variantPriceMap.set(variant.product_id, {
              min: nextMin,
              max: nextMax,
            });
          }
        }
      }

      const rawB2C = variant.price;
      if (rawB2C !== null && rawB2C !== undefined) {
        const price = Number(rawB2C);
        if (Number.isFinite(price)) {
          const current = variantB2CPriceMap.get(variant.product_id);
          if (!current) {
            variantB2CPriceMap.set(variant.product_id, { min: price, max: price });
          } else {
            const nextMin = price < current.min ? price : current.min;
            const nextMax = price > current.max ? price : current.max;
            variantB2CPriceMap.set(variant.product_id, {
              min: nextMin,
              max: nextMax,
            });
          }
        }
      }
    });
  }

  const publishedChannelMap = new Map<string, Set<string>>();
  if (productIds.length > 0 && variantIdToProductId.size > 0) {
    const { data: shopRows, error: shopError } = await supabase
      .from("shops")
      .select("id,code,name,platform,shop_domain,shopify_domain,is_active")
      .in("code", [...SHOPIFY_PUBLISHED_STORE_CODES]);

    if (!shopError) {
      const shopChannelById = new Map<string, string>();
      (shopRows ?? []).forEach((shop) => {
        const row = shop as ShopRow;
        const shopId = String(row.id ?? "").trim();
        if (!shopId || row.is_active === false) return;
        const channel = normalizePublishedChannel(row);
        if (!channel) return;
        shopChannelById.set(shopId, channel);
      });

      if (shopChannelById.size > 0) {
        const variantIds = Array.from(variantIdToProductId.keys());
        const shopIds = Array.from(shopChannelById.keys());

        for (const variantChunk of chunk(variantIds, 500)) {
          const { data: variantInShopRows, error: variantInShopError } = await supabase
            .from("variant_in_shop")
            .select("catalog_variant_id,shop_id,is_active,deleted_at")
            .in("catalog_variant_id", variantChunk)
            .in("shop_id", shopIds);

          if (variantInShopError) {
            break;
          }

          (variantInShopRows ?? []).forEach((row) => {
            const typed = row as VariantInShopRow;
            if (typed.is_active !== true || typed.deleted_at !== null) return;
            const variantId = String(typed.catalog_variant_id ?? "").trim();
            const shopId = String(typed.shop_id ?? "").trim();
            const productId = variantIdToProductId.get(variantId);
            const channel = shopChannelById.get(shopId);
            if (!productId || !channel) return;
            const set = publishedChannelMap.get(productId) ?? new Set<string>();
            set.add(channel);
            publishedChannelMap.set(productId, set);
          });
        }
      }
    }
  }

  const savedSet = new Set<string>();
  if (productIds.length > 0) {
    const { data: savedRows } = await supabase
      .from("partner_saved_products")
      .select("product_id")
      .in("product_id", productIds);

    savedRows?.forEach((row) => savedSet.add(row.product_id));
  }

  const exportMap = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: exportRows } = await supabase
      .from("partner_export_items")
      .select("product_id, partner_exports(created_at, user_id)")
      .eq("partner_exports.user_id", user.id)
      .in("product_id", productIds);

    exportRows?.forEach((row) => {
      const exportData = row.partner_exports as
        | { created_at?: string }
        | Array<{ created_at?: string }>
        | undefined;
      const createdAt = Array.isArray(exportData)
        ? exportData[0]?.created_at
        : exportData?.created_at;
      if (!createdAt) return;
      const current = exportMap.get(row.product_id);
      if (!current || new Date(createdAt) > new Date(current)) {
        exportMap.set(row.product_id, createdAt);
      }
    });
  }

  const deliveryPartnerMap = new Map<string, Set<string>>();
  if (productIds.length > 0) {
    const { data: deliveryRows, error: deliveryError } = await supabase
      .from("product_manager_wishlist_items")
      .select("product_id, product_manager_wishlists(name)")
      .in("product_id", productIds);

    if (deliveryError) {
      return NextResponse.json({ error: deliveryError.message }, { status: 500 });
    }

    (deliveryRows ?? []).forEach((row) => {
      const productId = String(row.product_id ?? "").trim();
      if (!productId) return;
      const wishlistData = row.product_manager_wishlists as
        | { name?: string | null }
        | Array<{ name?: string | null }>
        | null
        | undefined;
      const wishlistName = Array.isArray(wishlistData)
        ? wishlistData[0]?.name
        : wishlistData?.name;
      if (!isDigiDealDeliveryListName(wishlistName)) return;
      const partners = deliveryPartnerMap.get(productId) ?? new Set<string>();
      partners.add("digideal");
      deliveryPartnerMap.set(productId, partners);
    });
  }

  const heroWhiteBySpu = await loadLegacyHeroWhiteBySpu(spus);

  const items = await Promise.all(
    (products ?? []).map(async (product) => {
      const variantCount = variantCountMap.get(product.id) ?? 0;
      if (hasVariants && variantCount === 0) {
        return null;
      }

      const fallback = product.spu ? fallbackBySpu.get(product.spu) : null;
      const resolvedTitle =
        product.title ?? fallback?.effective_long_title ?? null;

      const preferredMain =
        product.spu && heroWhiteBySpu.size > 0
          ? heroWhiteBySpu.get(product.spu) ?? null
          : null;

      const [thumbUrls, smallUrls] = await Promise.all([
        loadImageUrls(product.image_folder, { size: "thumb" }),
        loadImageUrls(product.image_folder, { size: "small" }),
      ]);
      const preferredThumbs = preferImageUrlFilenameFirst(thumbUrls, preferredMain);
      const preferredSmalls = preferImageUrlFilenameFirst(smallUrls, preferredMain);
      const thumbnailUrl = preferredThumbs[0] ?? null;
      const smallUrl = preferredSmalls[0] ?? thumbnailUrl;

      return {
        ...product,
        title: resolvedTitle,
        workflow_status: product.spu
          ? (workflowBySpu.get(product.spu)?.status ?? "active")
          : "active",
        workflow_run: product.spu ? (workflowBySpu.get(product.spu)?.run ?? null) : null,
        variant_count: variantCount,
        legacy_text: includeLegacyText
          ? legacyTextByProductId.get(product.id) ?? false
          : undefined,
        price_min: variantPriceMap.get(product.id)?.min ?? null,
        price_max: variantPriceMap.get(product.id)?.max ?? null,
        b2c_price_min: variantB2CPriceMap.get(product.id)?.min ?? null,
        b2c_price_max: variantB2CPriceMap.get(product.id)?.max ?? null,
        variant_preview: variantPreviewMap.get(product.id) ?? [],
        is_saved: savedSet.has(product.id),
        is_exported: exportMap.has(product.id),
        latest_exported_at: exportMap.get(product.id) ?? null,
        published_channels: sortPublishedChannels(
          Array.from(publishedChannelMap.get(product.id) ?? new Set<string>())
        ),
        delivery_partners: Array.from(
          deliveryPartnerMap.get(product.id) ?? new Set<string>()
        ),
        thumbnail_url: thumbnailUrl,
        small_image_url: smallUrl ?? null,
      };
    })
  );

  const filteredItems = items.filter(
    (item): item is NonNullable<typeof item> => Boolean(item)
  );

  return NextResponse.json({
    items: filteredItems,
    page,
    pageSize,
    total: totalCount ?? filteredItems.length,
    active_markets: activeMarkets,
  });
}
