import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type WishlistItemPayload = {
  wishlistId?: string;
  items?: { provider: string; product_id: string }[];
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
    .from("discovery_wishlists")
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
    provider: item.provider,
    product_id: item.product_id,
  }));

  const { error } = await supabase
    .from("discovery_wishlist_items")
    .upsert(rows, {
      onConflict: "wishlist_id,provider,product_id",
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

  let payload: {
    wishlistId?: string;
    provider?: string;
    product_id?: string;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const wishlistId = payload?.wishlistId;
  const provider = payload?.provider;
  const productId = payload?.product_id;
  if (!wishlistId || !provider || !productId) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const { data: wishlist, error: wishlistError } = await supabase
    .from("discovery_wishlists")
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
    .from("discovery_wishlist_items")
    .delete()
    .eq("wishlist_id", wishlistId)
    .eq("provider", provider)
    .eq("product_id", productId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
