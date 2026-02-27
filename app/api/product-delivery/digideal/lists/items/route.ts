import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getThumbnailUrl } from "@/lib/product-media";
import { isDigiDealDeliveryListName } from "@/lib/product-delivery/digideal";
import { loadImageUrls } from "@/lib/server-images";

type AddDeliveryItemsPayload = {
  listId?: string;
  productIds?: string[];
};

type RemoveDeliveryItemPayload = {
  listId?: string;
  productId?: string;
};

type DeliveryListItemRow = {
  product_id: string;
  created_at: string | null;
};

type ProductRow = {
  id: string;
  spu: string | null;
  title: string | null;
  image_folder: string | null;
  images: unknown;
};

type VariantPriceRow = {
  product_id: string;
  b2b_dropship_price_se: number | string | null;
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

const resolveThumbnail = async (product: ProductRow) => {
  const imageUrls = await loadImageUrls(product.image_folder, { size: "thumb" });
  if (imageUrls.length > 0) return imageUrls[0];
  return getThumbnailUrl({ images: product.images }, null);
};

const parseNumber = (value: number | string | null | undefined) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
};

const resolveOwnedDeliveryList = async (
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  listId: string
) => {
  const { data: listRow, error: listError } = await supabase
    .from("product_manager_wishlists")
    .select("id, name")
    .eq("id", listId)
    .eq("user_id", userId)
    .maybeSingle();

  if (listError) {
    return { ok: false as const, status: 500, error: listError.message };
  }
  if (!listRow) {
    return { ok: false as const, status: 404, error: "List not found." };
  }
  if (!isDigiDealDeliveryListName(listRow.name)) {
    return { ok: false as const, status: 400, error: "Invalid delivery list." };
  }
  return { ok: true as const, listId: listRow.id };
};

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const listId = String(searchParams.get("listId") ?? "").trim();
  if (!listId) {
    return NextResponse.json({ error: "Missing listId." }, { status: 400 });
  }

  const ownedList = await resolveOwnedDeliveryList(supabase, user.id, listId);
  if (!ownedList.ok) {
    return NextResponse.json({ error: ownedList.error }, { status: ownedList.status });
  }

  const { data: itemRowsRaw, error: itemRowsError } = await supabase
    .from("product_manager_wishlist_items")
    .select("product_id, created_at")
    .eq("wishlist_id", listId)
    .order("created_at", { ascending: false });

  if (itemRowsError) {
    return NextResponse.json({ error: itemRowsError.message }, { status: 500 });
  }

  const itemRows = (itemRowsRaw ?? []) as DeliveryListItemRow[];
  const productIds = Array.from(
    new Set(
      itemRows
        .map((row) => String(row.product_id ?? "").trim())
        .filter(Boolean)
    )
  );
  if (productIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const [{ data: productRowsRaw, error: productRowsError }, { data: variantRowsRaw, error: variantRowsError }] =
    await Promise.all([
      supabase
        .from("catalog_products")
        .select("id, spu, title, image_folder, images")
        .in("id", productIds),
      supabase
        .from("catalog_variants")
        .select("product_id, b2b_dropship_price_se")
        .in("product_id", productIds),
    ]);

  if (productRowsError) {
    return NextResponse.json({ error: productRowsError.message }, { status: 500 });
  }
  if (variantRowsError) {
    return NextResponse.json({ error: variantRowsError.message }, { status: 500 });
  }

  const productRows = (productRowsRaw ?? []) as ProductRow[];
  const productMap = new Map(productRows.map((row) => [row.id, row]));

  const priceMap = new Map<string, { min: number | null; max: number | null }>();
  ((variantRowsRaw ?? []) as VariantPriceRow[]).forEach((row) => {
    const productId = String(row.product_id ?? "").trim();
    if (!productId) return;
    const value = parseNumber(row.b2b_dropship_price_se);
    if (value === null) return;
    const entry = priceMap.get(productId) ?? { min: null, max: null };
    entry.min = entry.min === null ? value : Math.min(entry.min, value);
    entry.max = entry.max === null ? value : Math.max(entry.max, value);
    priceMap.set(productId, entry);
  });

  const items = await Promise.all(
    productIds.map(async (productId) => {
      const product = productMap.get(productId);
      const prices = priceMap.get(productId) ?? { min: null, max: null };
      return {
        product_id: productId,
        title: product?.title ?? product?.spu ?? "Unknown product",
        image_url: product ? await resolveThumbnail(product) : null,
        price_min: prices.min,
        price_max: prices.max,
      };
    })
  );

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: AddDeliveryItemsPayload;
  try {
    payload = (await request.json()) as AddDeliveryItemsPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const listId = String(payload?.listId ?? "").trim();
  const productIds = normalizeIds(payload?.productIds);
  if (!listId || productIds.length === 0) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const ownedList = await resolveOwnedDeliveryList(supabase, user.id, listId);
  if (!ownedList.ok) {
    return NextResponse.json({ error: ownedList.error }, { status: ownedList.status });
  }

  const rows = productIds.map((productId) => ({
    wishlist_id: listId,
    product_id: productId,
  }));
  const { error: insertError } = await supabase
    .from("product_manager_wishlist_items")
    .upsert(rows, {
      onConflict: "wishlist_id,product_id",
      ignoreDuplicates: true,
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: rows.length });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: RemoveDeliveryItemPayload;
  try {
    payload = (await request.json()) as RemoveDeliveryItemPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const listId = String(payload?.listId ?? "").trim();
  const productId = String(payload?.productId ?? "").trim();
  if (!listId || !productId) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const ownedList = await resolveOwnedDeliveryList(supabase, user.id, listId);
  if (!ownedList.ok) {
    return NextResponse.json({ error: ownedList.error }, { status: ownedList.status });
  }

  const { error } = await supabase
    .from("product_manager_wishlist_items")
    .delete()
    .eq("wishlist_id", listId)
    .eq("product_id", productId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
