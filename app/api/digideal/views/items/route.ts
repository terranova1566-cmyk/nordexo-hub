import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type AddItemsPayload = {
  viewId?: string;
  productIds?: string[];
};

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
  const productIds = Array.isArray(payload?.productIds)
    ? payload.productIds.map((id) => String(id ?? "").trim()).filter(Boolean)
    : [];

  if (!viewId || productIds.length === 0) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const { data: view, error: viewError } = await supabase
    .from("digideal_views")
    .select("id")
    .eq("id", viewId)
    .eq("user_id", user.id)
    .maybeSingle();

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

