import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getThumbnailUrl } from "@/lib/product-media";
import {
  DIGIDEAL_DELIVERY_LIST_PREFIX,
  toDisplayDigiDealDeliveryListName,
  toStoredDigiDealDeliveryListName,
} from "@/lib/product-delivery/digideal";
import { loadImageUrls } from "@/lib/server-images";

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
  image_folder: string | null;
  images: unknown;
};

const resolveThumbnail = async (product: ProductImageRow) => {
  const imageUrls = await loadImageUrls(product.image_folder, { size: "thumb" });
  if (imageUrls.length > 0) return imageUrls[0];
  return getThumbnailUrl({ images: product.images }, null);
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
        .flatMap((productIds) => productIds.slice(0, 5))
        .filter(Boolean)
    )
  );
  const previewMap = new Map<string, string | null>();

  if (previewProductIds.length > 0) {
    const { data: productRows, error: productRowsError } = await supabase
      .from("catalog_products")
      .select("id, image_folder, images")
      .in("id", previewProductIds);

    if (productRowsError) {
      return NextResponse.json({ error: productRowsError.message }, { status: 500 });
    }

    await Promise.all(
      ((productRows ?? []) as ProductImageRow[]).map(async (product) => {
        previewMap.set(product.id, await resolveThumbnail(product));
      })
    );
  }

  return NextResponse.json({
    items: lists.map((list) => ({
      ...list,
      item_count: countMap.get(list.id) ?? 0,
      preview_images: (listProductsMap.get(list.id) ?? [])
        .slice(0, 5)
        .map((productId) => previewMap.get(productId))
        .filter((value): value is string => Boolean(value)),
    })),
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
