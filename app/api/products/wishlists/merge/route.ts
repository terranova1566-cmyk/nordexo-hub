import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type MergePayload = {
  listIds?: string[];
  name?: string;
};

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: MergePayload;
  try {
    payload = (await request.json()) as MergePayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const listIds =
    payload?.listIds?.map((id) => id.trim()).filter(Boolean) ?? [];
  const name = payload?.name?.trim();

  if (listIds.length < 2) {
    return NextResponse.json(
      { error: "At least two lists are required." },
      { status: 400 }
    );
  }

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const { data: lists, error: listsError } = await supabase
    .from("product_manager_wishlists")
    .select("id, name")
    .eq("user_id", user.id)
    .in("id", listIds);

  if (listsError) {
    return NextResponse.json({ error: listsError.message }, { status: 500 });
  }

  if (!lists || lists.length !== listIds.length) {
    return NextResponse.json({ error: "Wishlist not found." }, { status: 404 });
  }

  const { data: newList, error: createError } = await supabase
    .from("product_manager_wishlists")
    .insert({ user_id: user.id, name })
    .select("id, name, created_at")
    .single();

  if (createError || !newList) {
    return NextResponse.json(
      { error: createError?.message ?? "Unable to create list." },
      { status: 500 }
    );
  }

  const { data: items, error: itemsError } = await supabase
    .from("product_manager_wishlist_items")
    .select("product_id")
    .in("wishlist_id", listIds);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const productIds = Array.from(
    new Set((items ?? []).map((item) => item.product_id).filter(Boolean))
  );

  if (productIds.length > 0) {
    const { error: insertError } = await supabase
      .from("product_manager_wishlist_items")
      .insert(
        productIds.map((productId) => ({
          wishlist_id: newList.id,
          product_id: productId,
        }))
      );

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const { error: deleteItemsError } = await supabase
    .from("product_manager_wishlist_items")
    .delete()
    .in("wishlist_id", listIds);

  if (deleteItemsError) {
    return NextResponse.json(
      { error: deleteItemsError.message },
      { status: 500 }
    );
  }

  const { error: deleteListsError } = await supabase
    .from("product_manager_wishlists")
    .delete()
    .in("id", listIds)
    .eq("user_id", user.id);

  if (deleteListsError) {
    return NextResponse.json(
      { error: deleteListsError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    item: { ...newList, item_count: productIds.length },
  });
}
