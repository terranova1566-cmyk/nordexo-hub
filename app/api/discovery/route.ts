import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;
const PRODUCT_SELECT =
  "provider, product_id, title, product_url, image_url, image_local_path, image_local_url, source_url, last_price, last_previous_price, last_reviews, last_delivery_time, taxonomy_l1, taxonomy_l2, taxonomy_l3, taxonomy_path, taxonomy_confidence, taxonomy_updated_at, first_seen_at, last_seen_at, scrape_date, sold_today, sold_7d, sold_all_time, trending_score, price, previous_price, reviews, delivery_time";

type ProviderKey = "cdon" | "fyndiq";
const ALL_PROVIDERS: ProviderKey[] = ["cdon", "fyndiq"];

type DiscoveryItem = {
  provider: ProviderKey;
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

const escapeLikeToken = (value: string) =>
  value.replace(/%/g, "\\%").replace(/_/g, "\\_");

const buildSearchQuery = (query: string) =>
  query
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => escapeLikeToken(token))
    .map((token) => `%${token}%`);

type CategorySelection = {
  level: "l1" | "l2" | "l3";
  value: string;
};

const parseCategorySelections = (value: string | null): CategorySelection[] => {
  if (!value) return [];
  return value
    .split("|")
    .map((entry) => {
      const [levelRaw, ...rest] = entry.split(":");
      const level = levelRaw as CategorySelection["level"];
      const encodedValue = rest.join(":");
      if (level !== "l1" && level !== "l2" && level !== "l3") return null;
      if (!encodedValue) return null;
      return { level, value: decodeURIComponent(encodedValue) };
    })
    .filter((entry): entry is CategorySelection => Boolean(entry));
};

const formatInValues = (values: string[]) =>
  values
    .map((value) => `"${value.replace(/\"/g, '""')}"`)
    .join(",");

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [hiddenCategoryResponse, hiddenKeywordResponse] = await Promise.all([
    supabase
      .from("discovery_hidden_categories")
      .select("level, value")
      .eq("user_id", user.id),
    supabase
      .from("discovery_hidden_keywords")
      .select("keyword")
      .eq("user_id", user.id),
  ]);

  if (hiddenCategoryResponse.error) {
    return NextResponse.json(
      { error: hiddenCategoryResponse.error.message },
      { status: 500 }
    );
  }

  if (hiddenKeywordResponse.error) {
    return NextResponse.json(
      { error: hiddenKeywordResponse.error.message },
      { status: 500 }
    );
  }

  const hiddenCategories =
    (hiddenCategoryResponse.data ?? []) as CategorySelection[];
  const hiddenKeywords = (hiddenKeywordResponse.data ?? [])
    .map((row) => row.keyword)
    .filter(Boolean);

  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q")?.trim();
  const categoryLevel = searchParams.get("categoryLevel")?.trim();
  const categoryValue = searchParams.get("categoryValue")?.trim();
  const categoriesParam = searchParams.get("categories")?.trim() ?? null;
  let categorySelections = parseCategorySelections(categoriesParam);
  if (categorySelections.length === 0 && categoryLevel && categoryValue) {
    if (categoryLevel === "l1" || categoryLevel === "l2" || categoryLevel === "l3") {
      categorySelections = [{ level: categoryLevel, value: categoryValue }];
    }
  }
  const updatedFrom = searchParams.get("updatedFrom");
  const addedFrom = searchParams.get("addedFrom");
  const providerParam = (searchParams.get("provider") ?? "all").toLowerCase();
  const providerTokens = providerParam
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const providerList = providerTokens.some((token) => token === "all")
    ? ALL_PROVIDERS
    : providerTokens.filter(
        (token): token is ProviderKey =>
          token === "cdon" || token === "fyndiq"
      );
  const providers =
    providerList.length > 0 ? providerList : ALL_PROVIDERS;
  const filterProviders = providers.length < ALL_PROVIDERS.length;
  const sort = (searchParams.get("sort") ?? "sold_7d").toLowerCase();
  const priceMinParam = searchParams.get("priceMin");
  const priceMaxParam = searchParams.get("priceMax");
  const priceMin = priceMinParam ? Number(priceMinParam) : null;
  const priceMax = priceMaxParam ? Number(priceMaxParam) : null;
  const wishlistIdParam = searchParams.get("wishlistId")?.trim();
  const wishlistId =
    wishlistIdParam && wishlistIdParam !== "all" ? wishlistIdParam : null;

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE))
  );

  try {
    const hiddenL1 = new Set<string>();
    const hiddenL2 = new Set<string>();
    const hiddenL3 = new Set<string>();
    hiddenCategories.forEach((selection) => {
      if (selection.level === "l1") hiddenL1.add(selection.value);
      if (selection.level === "l2") hiddenL2.add(selection.value);
      if (selection.level === "l3") hiddenL3.add(selection.value);
    });
    const hiddenKeywordLikes = hiddenKeywords.map(
      (keyword) => `%${escapeLikeToken(keyword)}%`
    );

    const applyFilters = (query: any) => {
      if (q) {
        const tokens = buildSearchQuery(q);
        tokens.forEach((like) => {
          query = query.or(
            [
              `product_id.ilike.${like}`,
              `title.ilike.${like}`,
              `taxonomy_path.ilike.${like}`,
              `taxonomy_l1.ilike.${like}`,
              `taxonomy_l2.ilike.${like}`,
              `taxonomy_l3.ilike.${like}`,
            ].join(",")
          );
        });
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
          filters.push(`taxonomy_l1.in.(${formatInValues([...l1Values])})`);
        }
        if (l2Values.size > 0) {
          filters.push(`taxonomy_l2.in.(${formatInValues([...l2Values])})`);
        }
        if (l3Values.size > 0) {
          filters.push(`taxonomy_l3.in.(${formatInValues([...l3Values])})`);
        }
        if (filters.length > 0) {
          query = query.or(filters.join(","));
        }
      } else if (categoryLevel && categoryValue) {
        if (categoryLevel === "l1") {
          query = query.eq("taxonomy_l1", categoryValue);
        } else if (categoryLevel === "l2") {
          query = query.eq("taxonomy_l2", categoryValue);
        } else if (categoryLevel === "l3") {
          query = query.eq("taxonomy_l3", categoryValue);
        }
      }

      if (updatedFrom) {
        query = query.gte("last_seen_at", updatedFrom);
      }

      if (addedFrom) {
        query = query.gte("first_seen_at", addedFrom);
      }

      if (priceMin !== null && Number.isFinite(priceMin)) {
        query = query.gte("price", priceMin);
      }
      if (priceMax !== null && Number.isFinite(priceMax)) {
        query = query.lte("price", priceMax);
      }

      if (hiddenL1.size > 0) {
        query = query.not("taxonomy_l1", "in", `(${formatInValues([...hiddenL1])})`);
      }
      if (hiddenL2.size > 0) {
        query = query.not("taxonomy_l2", "in", `(${formatInValues([...hiddenL2])})`);
      }
      if (hiddenL3.size > 0) {
        query = query.not("taxonomy_l3", "in", `(${formatInValues([...hiddenL3])})`);
      }
      hiddenKeywordLikes.forEach((like) => {
        query = query.not("title", "ilike", like);
      });

      return query;
    };

    const applySort = (query: any) => {
      switch (sort) {
        case "sold_today":
          return query
            .order("sold_today", { ascending: false, nullsFirst: false })
            .order("sold_7d", { ascending: false, nullsFirst: false })
            .order("last_seen_at", { ascending: false, nullsFirst: false });
        case "sold_all_time":
          return query
            .order("sold_all_time", { ascending: false, nullsFirst: false })
            .order("last_seen_at", { ascending: false, nullsFirst: false });
        case "trending":
          return query
            .order("trending_score", { ascending: false, nullsFirst: false })
            .order("last_seen_at", { ascending: false, nullsFirst: false });
        case "sold_7d":
        default:
          return query
            .order("sold_7d", { ascending: false, nullsFirst: false })
            .order("sold_today", { ascending: false, nullsFirst: false })
            .order("last_seen_at", { ascending: false, nullsFirst: false });
      }
    };

    const numberValue = (value: number | null | undefined) =>
      typeof value === "number" && Number.isFinite(value) ? value : 0;
    const dateValue = (value: string | null | undefined) => {
      if (!value) return 0;
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const sortItems = (items: DiscoveryItem[]) => {
      items.sort((a, b) => {
        switch (sort) {
          case "sold_today":
            return (
              numberValue(b.sold_today) - numberValue(a.sold_today) ||
              numberValue(b.sold_7d) - numberValue(a.sold_7d) ||
              dateValue(b.last_seen_at) - dateValue(a.last_seen_at)
            );
          case "sold_all_time":
            return (
              numberValue(b.sold_all_time) - numberValue(a.sold_all_time) ||
              dateValue(b.last_seen_at) - dateValue(a.last_seen_at)
            );
          case "trending":
            return (
              numberValue(b.trending_score) - numberValue(a.trending_score) ||
              numberValue(b.sold_7d) - numberValue(a.sold_7d) ||
              dateValue(b.last_seen_at) - dateValue(a.last_seen_at)
            );
          case "sold_7d":
          default:
            return (
              numberValue(b.sold_7d) - numberValue(a.sold_7d) ||
              numberValue(b.sold_today) - numberValue(a.sold_today) ||
              dateValue(b.last_seen_at) - dateValue(a.last_seen_at)
            );
        }
      });
      return items;
    };

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let products: any[] = [];
    let totalCount: number | null = null;
    const useClientPagination = Boolean(wishlistId);

    if (wishlistId) {
      const { data: wishlistItems, error: wishlistError } = await supabase
        .from("discovery_wishlist_items")
        .select("provider, product_id")
        .eq("wishlist_id", wishlistId);

      if (wishlistError) {
        throw new Error(wishlistError.message);
      }

      const byProvider = new Map<ProviderKey, string[]>();
      wishlistItems?.forEach((row) => {
        const providerKey = row.provider as ProviderKey;
        if (providerKey !== "cdon" && providerKey !== "fyndiq") return;
        if (filterProviders && !providers.includes(providerKey)) return;
        const list = byProvider.get(providerKey) ?? [];
        list.push(row.product_id);
        byProvider.set(providerKey, list);
      });

      for (const [providerKey, productIds] of byProvider.entries()) {
        if (productIds.length === 0) continue;
        let providerQuery = supabase
          .from("discovery_products")
          .select(PRODUCT_SELECT)
          .eq("provider", providerKey)
          .in("product_id", productIds);
        providerQuery = applyFilters(providerQuery);
        const { data: providerItems, error: providerError } = await providerQuery;
        if (providerError) {
          throw new Error(providerError.message);
        }
        products = products.concat(providerItems ?? []);
      }
      totalCount = products.length;
    } else {
      let query = supabase
        .from("discovery_products")
        .select(PRODUCT_SELECT, { count: "exact" });

      if (filterProviders) {
        query = query.in("provider", providers);
      }

      query = applyFilters(query);
      query = applySort(query);
      query = query.range(from, to);

      const { data: productRows, error, count } = await query;
      if (error) {
        throw new Error(error.message);
      }
      products = productRows ?? [];
      totalCount = count ?? products.length;
    }

    let merged: DiscoveryItem[] =
      products?.map((product) => ({
        provider: product.provider as ProviderKey,
        product_id: product.product_id,
        title: product.title ?? null,
        product_url: product.product_url ?? null,
        image_url: product.image_url ?? null,
        image_local_path: product.image_local_path ?? null,
        image_local_url: product.image_local_url ?? null,
        source_url: product.source_url ?? null,
        last_price: product.last_price ?? null,
        last_previous_price: product.last_previous_price ?? null,
        last_reviews: product.last_reviews ?? null,
        last_delivery_time: product.last_delivery_time ?? null,
        taxonomy_l1: product.taxonomy_l1 ?? null,
        taxonomy_l2: product.taxonomy_l2 ?? null,
        taxonomy_l3: product.taxonomy_l3 ?? null,
        taxonomy_path: product.taxonomy_path ?? null,
        taxonomy_confidence: product.taxonomy_confidence ?? null,
        taxonomy_updated_at: product.taxonomy_updated_at ?? null,
        first_seen_at: product.first_seen_at ?? null,
        last_seen_at: product.last_seen_at ?? null,
        scrape_date: product.scrape_date ?? null,
        sold_today: Number(product.sold_today ?? 0),
        sold_7d: Number(product.sold_7d ?? 0),
        sold_all_time: Number(product.sold_all_time ?? 0),
        trending_score: Number(product.trending_score ?? 0),
        liked: false,
        removed: false,
        in_production: false,
        wishlist_names: [],
        price: product.price ?? product.last_price ?? null,
        previous_price: product.previous_price ?? product.last_previous_price ?? null,
        reviews: product.reviews ?? product.last_reviews ?? null,
        delivery_time: product.delivery_time ?? product.last_delivery_time ?? null,
      })) ?? [];

    const actionMap = new Map<string, { liked: boolean; removed: boolean }>();
    const wishlistMap = new Map<string, string[]>();
    const productionSet = new Set<string>();
    if (merged.length > 0) {
      const byProvider = new Map<ProviderKey, string[]>();
      merged.forEach((item) => {
        const list = byProvider.get(item.provider) ?? [];
        list.push(item.product_id);
        byProvider.set(item.provider, list);
      });

      for (const [providerKey, productIds] of byProvider.entries()) {
        const { data: actions } = await supabase
          .from("discovery_product_actions")
          .select("product_id, provider, liked, removed")
          .eq("user_id", user.id)
          .eq("provider", providerKey)
          .in("product_id", productIds);

        actions?.forEach((action) => {
          actionMap.set(`${providerKey}:${action.product_id}`, {
            liked: Boolean(action.liked),
            removed: Boolean(action.removed),
          });
        });

        const { data: productionItems, error: productionError } = await supabase
          .from("discovery_production_items")
          .select("product_id, provider")
          .eq("user_id", user.id)
          .eq("provider", providerKey)
          .in("product_id", productIds);

        if (productionError) {
          throw new Error(productionError.message);
        }

        productionItems?.forEach((row) => {
          productionSet.add(`${providerKey}:${row.product_id}`);
        });
      }

      const { data: userWishlists, error: wishlistError } = await supabase
        .from("discovery_wishlists")
        .select("id, name")
        .eq("user_id", user.id);

      if (wishlistError) {
        throw new Error(wishlistError.message);
      }

      if (userWishlists && userWishlists.length > 0) {
        const wishlistIds = userWishlists.map((list) => list.id);
        const wishlistNameById = new Map<string, string>();
        userWishlists.forEach((list) => {
          wishlistNameById.set(list.id, list.name);
        });

        for (const [providerKey, productIds] of byProvider.entries()) {
          const { data: wishlistItems, error: wishlistItemsError } = await supabase
            .from("discovery_wishlist_items")
            .select("wishlist_id, product_id, provider")
            .eq("provider", providerKey)
            .in("product_id", productIds)
            .in("wishlist_id", wishlistIds);

          if (wishlistItemsError) {
            throw new Error(wishlistItemsError.message);
          }

          wishlistItems?.forEach((row) => {
            const listName = wishlistNameById.get(row.wishlist_id);
            if (!listName) return;
            const key = `${providerKey}:${row.product_id}`;
            const existing = wishlistMap.get(key) ?? [];
            if (!existing.includes(listName)) {
              wishlistMap.set(key, [...existing, listName]);
            }
          });
        }
      }

      merged = merged.filter((item) => {
        const action = actionMap.get(`${item.provider}:${item.product_id}`);
        return !action?.removed;
      });
      merged = merged.map((item) => {
        const action = actionMap.get(`${item.provider}:${item.product_id}`);
        const wishlistNames =
          wishlistMap.get(`${item.provider}:${item.product_id}`) ?? [];
        return {
          ...item,
          liked: Boolean(action?.liked),
          removed: Boolean(action?.removed),
          wishlist_names: wishlistNames,
          in_production: productionSet.has(
            `${item.provider}:${item.product_id}`
          ),
        };
      });
    }

    if (useClientPagination) {
      sortItems(merged);
      const total = merged.length;
      const paged = merged.slice(from, to + 1);
      return NextResponse.json({
        items: paged,
        page,
        pageSize,
        total,
      });
    }

    return NextResponse.json({
      items: merged,
      page,
      pageSize,
      total: totalCount ?? merged.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
