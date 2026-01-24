import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadImageUrls } from "@/lib/server-images";
import { getProductsIndex } from "@/lib/meili";

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
  tags: string | null;
  product_type: string | null;
  shopify_category_name: string | null;
  google_taxonomy_l1: string | null;
  google_taxonomy_l2: string | null;
  google_taxonomy_l3: string | null;
  image_folder: string | null;
  images: unknown;
  updated_at: string | null;
  created_at: string | null;
  brand: string | null;
  vendor: string | null;
  nordic_partner_enabled: boolean | null;
};

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
  const q = searchParams.get("q")?.trim();
  const category = searchParams.get("category")?.trim();
  const categoriesParam = searchParams.get("categories")?.trim() ?? null;
  const categorySelections = parseCategorySelections(categoriesParam);
  const tag = searchParams.get("tag")?.trim();
  const searchTerms = [q, category, tag].filter(Boolean).join(" ").trim();
  const useMeili = searchTerms.length > 0;
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

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE))
  );

  let products: ProductRow[] = [];
  let totalCount = 0;

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

    const searchResult = await index.search(searchTerms, {
      filter: filters.length ? filters.join(" AND ") : undefined,
      sort: sortRules,
      limit: pageSize,
      offset,
      attributesToRetrieve: ["id"],
    });

    const ids =
      searchResult.hits
        ?.map((hit) => String((hit as { id?: string }).id ?? ""))
        .filter(Boolean) ?? [];
    totalCount =
      searchResult.estimatedTotalHits ??
      (searchResult as { totalHits?: number }).totalHits ??
      0;

    if (ids.length === 0) {
      return NextResponse.json({ items: [], page, pageSize, total: totalCount });
    }

    let productQuery = supabase
      .from("catalog_products")
      .select(
        "id, spu, title, subtitle, description_html, tags, product_type, shopify_category_name, google_taxonomy_l1, google_taxonomy_l2, google_taxonomy_l3, image_folder, images, updated_at, created_at, brand, vendor, nordic_partner_enabled"
      )
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
    products =
      (data ?? []).slice().sort((a, b) => {
        const left = orderMap.get(a.id) ?? 0;
        const right = orderMap.get(b.id) ?? 0;
        return left - right;
      }) as ProductRow[];
  } else {
    let query = supabase
      .from("catalog_products")
      .select(
        "id, spu, title, subtitle, description_html, tags, product_type, shopify_category_name, google_taxonomy_l1, google_taxonomy_l2, google_taxonomy_l3, image_folder, images, updated_at, created_at, brand, vendor, nordic_partner_enabled",
        { count: "exact" }
      )
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

    products = (data ?? []) as ProductRow[];
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
  const variantCountMap = new Map<string, number>();
  const variantPriceMap = new Map<string, { min: number; max: number }>();
  const variantB2CPriceMap = new Map<string, { min: number; max: number }>();
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

  const items = await Promise.all(
    (products ?? []).map(async (product) => {
      const variantCount = variantCountMap.get(product.id) ?? 0;
      if (hasVariants && variantCount === 0) {
        return null;
      }

      const fallback = product.spu ? fallbackBySpu.get(product.spu) : null;
      const resolvedTitle =
        product.title ?? fallback?.effective_long_title ?? null;

      const [thumbUrls, smallUrls] = await Promise.all([
        loadImageUrls(product.image_folder, { size: "thumb" }),
        loadImageUrls(product.image_folder, { size: "small" }),
      ]);
      const thumbnailUrl = thumbUrls[0] ?? null;
      const smallUrl = smallUrls[0] ?? thumbnailUrl;

      return {
        ...product,
        title: resolvedTitle,
        variant_count: variantCount,
        price_min: variantPriceMap.get(product.id)?.min ?? null,
        price_max: variantPriceMap.get(product.id)?.max ?? null,
        b2c_price_min: variantB2CPriceMap.get(product.id)?.min ?? null,
        b2c_price_max: variantB2CPriceMap.get(product.id)?.max ?? null,
        variant_preview: variantPreviewMap.get(product.id) ?? [],
        is_saved: savedSet.has(product.id),
        is_exported: exportMap.has(product.id),
        latest_exported_at: exportMap.get(product.id) ?? null,
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
