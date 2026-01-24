import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type WishlistItemPayload = {
  wishlistId?: string;
  items?: { product_id: string }[];
};

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: WishlistItemPayload;
  try {
    payload = (await request.json()) as WishlistItemPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const wishlistId = payload?.wishlistId;
  const items = payload?.items ?? [];
  if (!wishlistId || items.length === 0) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const { data: wishlist, error: wishlistError } = await supabase
    .from("product_manager_wishlists")
    .select("id")
    .eq("id", wishlistId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (wishlistError) {
    return NextResponse.json({ error: wishlistError.message }, { status: 500 });
  }

  if (!wishlist) {
    return NextResponse.json({ error: "Wishlist not found." }, { status: 404 });
  }

  const rows = items.map((item) => ({
    wishlist_id: wishlistId,
    product_id: item.product_id,
  }));

  const { error } = await supabase
    .from("product_manager_wishlist_items")
    .upsert(rows, {
      onConflict: "wishlist_id,product_id",
      ignoreDuplicates: true,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  let payload: { wishlistId?: string; product_id?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const wishlistId = payload?.wishlistId?.trim();
  const productId = payload?.product_id?.trim();
  if (!productId) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  if (!wishlistId) {
    const { data: lists, error: listsError } = await supabase
      .from("product_manager_wishlists")
      .select("id")
      .eq("user_id", user.id);

    if (listsError) {
      return NextResponse.json({ error: listsError.message }, { status: 500 });
    }

    const wishlistIds = (lists ?? []).map((list) => list.id);
    if (wishlistIds.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const { error: deleteError } = await supabase
      .from("product_manager_wishlist_items")
      .delete()
      .eq("product_id", productId)
      .in("wishlist_id", wishlistIds);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  const { data: wishlist, error: wishlistError } = await supabase
    .from("product_manager_wishlists")
    .select("id")
    .eq("id", wishlistId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (wishlistError) {
    return NextResponse.json({ error: wishlistError.message }, { status: 500 });
  }

  if (!wishlist) {
    return NextResponse.json({ error: "Wishlist not found." }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("product_manager_wishlist_items")
    .delete()
    .eq("wishlist_id", wishlistId)
    .eq("product_id", productId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
