import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type ShareRow = {
  wishlist_id: string;
  shared_by: string;
  shared_by_email: string;
  shared_with_email: string;
  is_public: boolean;
  created_at: string;
};

type PreviewRow = {
  provider: string;
  product_id: string;
  sold_all_time: number | null;
  sold_7d: number | null;
  image_url: string | null;
  image_local_path: string | null;
  image_local_url: string | null;
};

type PreviewImage = Pick<
  PreviewRow,
  "image_url" | "image_local_path" | "image_local_url"
>;

type WishlistItemRow = {
  wishlist_id: string;
  provider: string;
  product_id: string;
};

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: ownedLists, error: ownedError } = await supabase
    .from("discovery_wishlists")
    .select("id, name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (ownedError) {
    return NextResponse.json({ error: ownedError.message }, { status: 500 });
  }

  const { data: shareRows, error: shareError } = await supabase
    .from("discovery_wishlist_shares")
    .select(
      "wishlist_id, shared_by, shared_by_email, shared_with_email, is_public, created_at"
    );

  if (shareError) {
    return NextResponse.json({ error: shareError.message }, { status: 500 });
  }

  const ownedListIds = (ownedLists ?? []).map((list) => list.id);
  const ownedShares = (shareRows ?? []).filter(
    (row) => row.shared_by === user.id
  );
  const sharedShares = (shareRows ?? []).filter(
    (row) => row.shared_by !== user.id
  );

  const sharedListIds = Array.from(
    new Set(sharedShares.map((row) => row.wishlist_id))
  );

  const { data: sharedLists, error: sharedError } = sharedListIds.length
    ? await supabase
        .from("discovery_wishlists")
        .select("id, name, created_at")
        .in("id", sharedListIds)
    : { data: [], error: null };

  if (sharedError) {
    return NextResponse.json({ error: sharedError.message }, { status: 500 });
  }

  const countListIds = Array.from(new Set([...ownedListIds, ...sharedListIds]));
  const { data: itemRows, error: itemError } = countListIds.length
    ? await supabase
        .from("discovery_wishlist_items")
        .select("wishlist_id, provider, product_id")
        .in("wishlist_id", countListIds)
    : { data: [], error: null };

  if (itemError) {
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  const countMap = new Map<string, number>();
  const itemsByList = new Map<string, WishlistItemRow[]>();
  const idsByProvider = new Map<string, Set<string>>();
  (itemRows ?? []).forEach((row) => {
    const wishlistId = row.wishlist_id;
    countMap.set(wishlistId, (countMap.get(wishlistId) ?? 0) + 1);
    const listItems = itemsByList.get(wishlistId) ?? [];
    listItems.push(row as WishlistItemRow);
    itemsByList.set(wishlistId, listItems);
    const providerKey = row.provider;
    const idSet = idsByProvider.get(providerKey) ?? new Set<string>();
    idSet.add(row.product_id);
    idsByProvider.set(providerKey, idSet);
  });

  const previewRows: PreviewRow[] = [];
  for (const [provider, idSet] of idsByProvider.entries()) {
    const ids = Array.from(idSet);
    if (ids.length === 0) continue;
    const { data: products, error: productError } = await supabase
      .from("discovery_products")
      .select(
        "provider, product_id, sold_all_time, sold_7d, image_url, image_local_path, image_local_url"
      )
      .eq("provider", provider)
      .in("product_id", ids);

    if (productError) {
      return NextResponse.json({ error: productError.message }, { status: 500 });
    }

    previewRows.push(...((products ?? []) as PreviewRow[]));
  }

  const previewMap = new Map<string, PreviewRow>();
  previewRows.forEach((row) => {
    previewMap.set(`${row.provider}:${row.product_id}`, row);
  });

  const buildPreviewImages = (listId: string) => {
    const items = itemsByList.get(listId) ?? [];
    const ranked = items
      .map((item) => previewMap.get(`${item.provider}:${item.product_id}`))
      .filter((row): row is PreviewRow => Boolean(row))
      .map((row) => ({
        score: row.sold_all_time ?? row.sold_7d ?? 0,
        image_url: row.image_url,
        image_local_path: row.image_local_path,
        image_local_url: row.image_local_url,
      }))
      .sort((a, b) => b.score - a.score);

    const seen = new Set<string>();
    const previewImages: PreviewImage[] = [];
    ranked.forEach((row) => {
      if (previewImages.length >= 4) return;
      const key = `${row.image_local_url ?? ""}|${row.image_local_path ?? ""}|${
        row.image_url ?? ""
      }`;
      if (seen.has(key)) return;
      seen.add(key);
      previewImages.push({
        image_url: row.image_url,
        image_local_path: row.image_local_path,
        image_local_url: row.image_local_url,
      });
    });
    return previewImages;
  };

  const shareMap = new Map<string, ShareRow[]>();
  ownedShares.forEach((row) => {
    const list = shareMap.get(row.wishlist_id) ?? [];
    list.push(row as ShareRow);
    shareMap.set(row.wishlist_id, list);
  });

  const ownedPayload = (ownedLists ?? []).map((list) => ({
    ...list,
    item_count: countMap.get(list.id) ?? 0,
    shared_with: shareMap.get(list.id) ?? [],
    preview_images: buildPreviewImages(list.id),
  }));

  const sharedPayload = (sharedLists ?? []).map((list) => {
    const shareEntries = sharedShares.filter(
      (row) => row.wishlist_id === list.id
    );
    const latestShare = shareEntries.sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1
    )[0];
    return {
      ...list,
      item_count: countMap.get(list.id) ?? 0,
      shared_by_email: latestShare?.shared_by_email ?? "",
      shared_at: latestShare?.created_at ?? null,
      preview_images: buildPreviewImages(list.id),
    };
  });

  return NextResponse.json({
    owned: ownedPayload,
    shared: sharedPayload,
  });
}
