import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("discovery_wishlists")
    .select("id, name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lists = data ?? [];
  if (lists.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const wishlistIds = lists.map((list) => list.id);
  const { data: items, error: itemsError } = await supabase
    .from("discovery_wishlist_items")
    .select("wishlist_id")
    .in("wishlist_id", wishlistIds);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const countMap = new Map<string, number>();
  items?.forEach((item) => {
    countMap.set(
      item.wishlist_id,
      (countMap.get(item.wishlist_id) ?? 0) + 1
    );
  });

  const payload = lists.map((list) => ({
    ...list,
    item_count: countMap.get(list.id) ?? 0,
  }));

  return NextResponse.json({ items: payload });
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

  const name = payload?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("discovery_wishlists")
    .insert({ user_id: user.id, name })
    .select("id, name, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: { ...data, item_count: 0 } });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { id?: string; name?: string };
  try {
    payload = (await request.json()) as { id?: string; name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const id = payload?.id?.trim();
  const name = payload?.name?.trim();
  if (!id || !name) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("discovery_wishlists")
    .update({ name })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Wishlist not found." }, { status: 404 });
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { id?: string };
  try {
    payload = (await request.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const id = payload?.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("discovery_wishlists")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Wishlist not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
