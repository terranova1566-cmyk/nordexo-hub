import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type ViewRow = {
  id: string;
  name: string;
  created_at: string | null;
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
    .from("digideal_views")
    .select("id, name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const views = (data ?? []) as ViewRow[];
  if (views.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const viewIds = views.map((view) => view.id);
  const { data: items, error: itemsError } = await supabase
    .from("digideal_view_items")
    .select("view_id")
    .in("view_id", viewIds);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const countMap = new Map<string, number>();
  items?.forEach((item: any) => {
    const id = String(item?.view_id ?? "").trim();
    if (!id) return;
    countMap.set(id, (countMap.get(id) ?? 0) + 1);
  });

  return NextResponse.json({
    items: views.map((view) => ({
      ...view,
      item_count: countMap.get(view.id) ?? 0,
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

  const name = payload?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("digideal_views")
    .insert({ user_id: user.id, name })
    .select("id, name, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: { ...data, item_count: 0 } });
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
    .from("digideal_views")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "View not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

