import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type AddItemsPayload = {
  viewId?: string;
  productIds?: string[];
};

type RemoveItemsPayload = {
  viewId?: string;
  productIds?: string[];
};

const normalizeProductIds = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    )
  );
};

const getOwnedView = async (supabase: any, userId: string, viewId: string) => {
  return supabase
    .from("digideal_views")
    .select("id")
    .eq("id", viewId)
    .eq("user_id", userId)
    .maybeSingle();
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
  const rawProductIds = searchParams.get("productIds") ?? "";
  const productIds = Array.from(
    new Set(
      rawProductIds
        .split(",")
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    )
  );

  if (productIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const { data: views, error: viewsError } = await supabase
    .from("digideal_views")
    .select("id")
    .eq("user_id", user.id);

  if (viewsError) {
    return NextResponse.json({ error: viewsError.message }, { status: 500 });
  }

  const viewIds = (views ?? [])
    .map((row: any) => String(row?.id ?? "").trim())
    .filter(Boolean);

  if (viewIds.length === 0) {
    return NextResponse.json({
      items: productIds.map((productId) => ({
        product_id: productId,
        view_ids: [],
      })),
    });
  }

  const { data: rows, error } = await supabase
    .from("digideal_view_items")
    .select("product_id, view_id")
    .in("view_id", viewIds)
    .in("product_id", productIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const map = new Map<string, Set<string>>();
  productIds.forEach((productId) => map.set(productId, new Set<string>()));

  (rows ?? []).forEach((row: any) => {
    const productId = String(row?.product_id ?? "").trim();
    const viewId = String(row?.view_id ?? "").trim();
    if (!productId || !viewId) return;
    const current = map.get(productId);
    if (!current) return;
    current.add(viewId);
  });

  return NextResponse.json({
    items: productIds.map((productId) => ({
      product_id: productId,
      view_ids: Array.from(map.get(productId) ?? []),
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

  let payload: AddItemsPayload;
  try {
    payload = (await request.json()) as AddItemsPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const viewId = String(payload?.viewId ?? "").trim();
  const productIds = normalizeProductIds(payload?.productIds);

  if (!viewId || productIds.length === 0) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const { data: view, error: viewError } = await getOwnedView(
    supabase,
    user.id,
    viewId
  );

  if (viewError) {
    return NextResponse.json({ error: viewError.message }, { status: 500 });
  }

  if (!view) {
    return NextResponse.json({ error: "View not found." }, { status: 404 });
  }

  const rows = productIds.map((productId) => ({
    view_id: viewId,
    product_id: productId,
  }));

  const { error } = await supabase.from("digideal_view_items").upsert(rows, {
    onConflict: "view_id,product_id",
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

  let payload: RemoveItemsPayload;
  try {
    payload = (await request.json()) as RemoveItemsPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const viewId = String(payload?.viewId ?? "").trim();
  const productIds = normalizeProductIds(payload?.productIds);

  if (!viewId || productIds.length === 0) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const { data: view, error: viewError } = await getOwnedView(
    supabase,
    user.id,
    viewId
  );

  if (viewError) {
    return NextResponse.json({ error: viewError.message }, { status: 500 });
  }

  if (!view) {
    return NextResponse.json({ error: "View not found." }, { status: 404 });
  }

  const { data: removedRows, error } = await supabase
    .from("digideal_view_items")
    .delete()
    .eq("view_id", viewId)
    .in("product_id", productIds)
    .select("product_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    removed: Array.isArray(removedRows) ? removedRows.length : 0,
  });
}
