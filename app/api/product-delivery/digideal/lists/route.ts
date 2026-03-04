import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getThumbnailUrl } from "@/lib/product-media";
import {
  DIGIDEAL_DELIVERY_LIST_PREFIX,
  isDigiDealDeliveryListName,
  toDisplayDigiDealDeliveryListName,
  toStoredDigiDealDeliveryListName,
} from "@/lib/product-delivery/digideal";
import { loadImageUrls } from "@/lib/server-images";

const PRODUCT_META_NAMESPACES = ["product_global", "product.global"];

type DeliveryListRow = {
  id: string;
  name: string;
  created_at: string | null;
};

type DeliveryListItemRow = {
  wishlist_id: string;
  product_id: string;
  created_at: string | null;
};

type ProductImageRow = {
  id: string;
  spu: string | null;
  title: string | null;
  image_folder: string | null;
  images: unknown;
};

type ProductPreviewMedia = {
  title: string | null;
  image_url: string | null;
  hover_image_url: string | null;
};

const extractTextValue = (row: Record<string, unknown>) => {
  if (row.value_text) return String(row.value_text);
  if (row.value_number !== null && row.value_number !== undefined) {
    return String(row.value_number);
  }
  if (typeof row.value === "string") return row.value;
  if (row.value_json !== null && row.value_json !== undefined) {
    return JSON.stringify(row.value_json);
  }
  if (row.value != null) return JSON.stringify(row.value);
  return null;
};

const resolvePreviewMedia = async (
  product: ProductImageRow
): Promise<ProductPreviewMedia> => {
  const thumbUrls = await loadImageUrls(product.image_folder, { size: "thumb" });
  const smallUrls = await loadImageUrls(product.image_folder, { size: "small" });
  const standardUrls =
    smallUrls.length > 0 ? smallUrls : await loadImageUrls(product.image_folder, { size: "standard" });

  const thumbFallback = getThumbnailUrl({ images: product.images }, null);
  const imageUrl = thumbUrls[0] ?? thumbFallback ?? null;
  const hoverImageUrl = standardUrls[0] ?? imageUrl;

  return {
    title: product.title ?? product.spu ?? null,
    image_url: imageUrl,
    hover_image_url: hoverImageUrl,
  };
};

const normalizeIds = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    )
  );
};

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("product_manager_wishlists")
    .select("id, name, created_at")
    .eq("user_id", user.id)
    .like("name", `${DIGIDEAL_DELIVERY_LIST_PREFIX}%`)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lists = ((data ?? []) as DeliveryListRow[]).map((list) => ({
    ...list,
    name: toDisplayDigiDealDeliveryListName(list.name),
  }));

  if (lists.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const listIds = lists.map((list) => list.id);
  const { data: itemRowsRaw, error: itemRowsError } = await supabase
    .from("product_manager_wishlist_items")
    .select("wishlist_id, product_id, created_at")
    .in("wishlist_id", listIds)
    .order("created_at", { ascending: false });

  if (itemRowsError) {
    return NextResponse.json({ error: itemRowsError.message }, { status: 500 });
  }

  const itemRows = (itemRowsRaw ?? []) as DeliveryListItemRow[];
  const countMap = new Map<string, number>();
  const listProductsMap = new Map<string, string[]>();
  const deckPreviewLimit = 5;
  const batchContentLimit = 8;
  const maxPreviewProducts = Math.max(deckPreviewLimit, batchContentLimit);
  itemRows.forEach((row) => {
    const listId = String(row.wishlist_id ?? "").trim();
    const productId = String(row.product_id ?? "").trim();
    if (!listId) return;
    countMap.set(listId, (countMap.get(listId) ?? 0) + 1);
    if (!productId) return;
    const existing = listProductsMap.get(listId) ?? [];
    if (!existing.includes(productId)) {
      existing.push(productId);
      listProductsMap.set(listId, existing);
    }
  });

  const previewProductIds = Array.from(
    new Set(
      Array.from(listProductsMap.values())
        .flatMap((productIds) => productIds.slice(0, maxPreviewProducts))
        .filter(Boolean)
    )
  );
  const previewMap = new Map<string, ProductPreviewMedia>();
  const shortTitleByProduct = new Map<string, string>();

  if (previewProductIds.length > 0) {
    const { data: metaDefinitionRows, error: metaDefinitionError } = await supabase
      .from("metafield_definitions")
      .select("id, namespace")
      .eq("resource", "catalog_product")
      .eq("key", "short_title")
      .in("namespace", PRODUCT_META_NAMESPACES);

    if (metaDefinitionError) {
      return NextResponse.json({ error: metaDefinitionError.message }, { status: 500 });
    }

    const definitionIds = (metaDefinitionRows ?? [])
      .map((row) => String((row as { id?: unknown }).id ?? "").trim())
      .filter(Boolean);
    const namespaceByDefinitionId = new Map<string, string>(
      (metaDefinitionRows ?? [])
        .map((row) => {
          const parsed = row as { id?: unknown; namespace?: unknown };
          const id = String(parsed.id ?? "").trim();
          if (!id) return null;
          return [id, String(parsed.namespace ?? "")] as const;
        })
        .filter((entry): entry is readonly [string, string] => Boolean(entry))
    );

    if (definitionIds.length > 0) {
      const { data: metaValueRows, error: metaValueError } = await supabase
        .from("metafield_values")
        .select("definition_id, target_id, value_text, value, value_number, value_json")
        .eq("target_type", "product")
        .in("definition_id", definitionIds)
        .in("target_id", previewProductIds);

      if (metaValueError) {
        return NextResponse.json({ error: metaValueError.message }, { status: 500 });
      }

      const byProduct = new Map<string, Map<string, string>>();
      (metaValueRows ?? []).forEach((row) => {
        const raw = row as Record<string, unknown>;
        const targetId = String(raw.target_id ?? "").trim();
        const definitionId = String(raw.definition_id ?? "").trim();
        const namespace = namespaceByDefinitionId.get(definitionId);
        if (!targetId || !namespace) return;
        const text = extractTextValue(raw)?.trim();
        if (!text) return;
        const byNamespace = byProduct.get(targetId) ?? new Map<string, string>();
        byNamespace.set(namespace, text);
        byProduct.set(targetId, byNamespace);
      });

      byProduct.forEach((namespaces, productId) => {
        for (const namespace of PRODUCT_META_NAMESPACES) {
          const shortTitle = namespaces.get(namespace);
          if (shortTitle) {
            shortTitleByProduct.set(productId, shortTitle);
            break;
          }
        }
      });
    }

    const { data: productRows, error: productRowsError } = await supabase
      .from("catalog_products")
      .select("id, spu, title, image_folder, images")
      .in("id", previewProductIds);

    if (productRowsError) {
      return NextResponse.json({ error: productRowsError.message }, { status: 500 });
    }

    await Promise.all(
      ((productRows ?? []) as ProductImageRow[]).map(async (product) => {
        const media = await resolvePreviewMedia(product);
        previewMap.set(product.id, {
          ...media,
          title: shortTitleByProduct.get(product.id) ?? media.title,
        });
      })
    );
  }

  return NextResponse.json({
    items: lists.map((list) => {
      const listProductIds = listProductsMap.get(list.id) ?? [];

      const previewItems = listProductIds
        .slice(0, deckPreviewLimit)
        .map((productId) => {
          const media = previewMap.get(productId);
          return {
            product_id: productId,
            title: media?.title ?? null,
            image_url: media?.image_url ?? null,
            hover_image_url: media?.hover_image_url ?? media?.image_url ?? null,
          };
        })
        .filter((item) => Boolean(item.image_url));

      const batchContent = listProductIds
        .slice(0, batchContentLimit)
        .map((productId) => {
          const media = previewMap.get(productId);
          return {
            product_id: productId,
            title: media?.title ?? "Unknown product",
            image_url: media?.image_url ?? null,
            hover_image_url: media?.hover_image_url ?? media?.image_url ?? null,
          };
        })
        .filter((item) => Boolean(item.title));

      return {
        ...list,
        item_count: countMap.get(list.id) ?? 0,
        preview_images: previewItems
          .map((item) => item.image_url)
          .filter((value): value is string => Boolean(value)),
        preview_items: previewItems,
        batch_content: batchContent,
      };
    }),
  });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { name?: string };
  try {
    payload = (await request.json()) as { name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const displayName = String(payload?.name ?? "").trim();
  if (!displayName) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const storedName = toStoredDigiDealDeliveryListName(displayName);
  const { data, error } = await supabase
    .from("product_manager_wishlists")
    .insert({ user_id: user.id, name: storedName })
    .select("id, name, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    item: {
      id: data.id,
      name: toDisplayDigiDealDeliveryListName(data.name),
      created_at: data.created_at,
      item_count: 0,
    },
  });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { listId?: string; listIds?: unknown };
  try {
    payload = (await request.json()) as { listId?: string; listIds?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const explicitListId = String(payload?.listId ?? "").trim();
  const listIds = normalizeIds(payload?.listIds);
  if (explicitListId) {
    listIds.unshift(explicitListId);
  }
  const requestedIds = Array.from(new Set(listIds.filter(Boolean)));
  if (requestedIds.length === 0) {
    return NextResponse.json({ error: "Missing listIds." }, { status: 400 });
  }

  const { data: ownedRowsRaw, error: ownedRowsError } = await supabase
    .from("product_manager_wishlists")
    .select("id, name")
    .eq("user_id", user.id)
    .in("id", requestedIds);

  if (ownedRowsError) {
    return NextResponse.json({ error: ownedRowsError.message }, { status: 500 });
  }

  const ownedRows = (ownedRowsRaw ?? []) as Pick<DeliveryListRow, "id" | "name">[];
  const validDeleteIds = ownedRows
    .filter((row) => isDigiDealDeliveryListName(String(row.name ?? "")))
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);

  if (validDeleteIds.length === 0) {
    return NextResponse.json({ error: "No matching delivery lists found." }, { status: 404 });
  }

  const { error: deleteItemsError } = await supabase
    .from("product_manager_wishlist_items")
    .delete()
    .in("wishlist_id", validDeleteIds);

  if (deleteItemsError) {
    return NextResponse.json({ error: deleteItemsError.message }, { status: 500 });
  }

  const { data: deletedRows, error: deleteListsError } = await supabase
    .from("product_manager_wishlists")
    .delete()
    .eq("user_id", user.id)
    .in("id", validDeleteIds)
    .select("id");

  if (deleteListsError) {
    return NextResponse.json({ error: deleteListsError.message }, { status: 500 });
  }

  const deletedIds = (deletedRows ?? [])
    .map((row) => String((row as { id?: unknown }).id ?? "").trim())
    .filter(Boolean);
  const deletedIdSet = new Set(deletedIds);
  const failedIds = requestedIds.filter((id) => !deletedIdSet.has(id));

  return NextResponse.json({
    ok: true,
    deletedIds,
    failedIds,
  });
}
