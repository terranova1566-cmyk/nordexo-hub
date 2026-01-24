import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type ActionPayload = {
  provider: string;
  product_id: string;
  action: "like" | "remove";
  value: boolean;
};

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ActionPayload;
  try {
    payload = (await request.json()) as ActionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (!payload?.provider || !payload?.product_id || !payload?.action) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const update = {
    user_id: user.id,
    provider: payload.provider,
    product_id: payload.product_id,
    liked: payload.action === "like" ? payload.value : undefined,
    removed: payload.action === "remove" ? payload.value : undefined,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("discovery_product_actions")
    .upsert(update, { onConflict: "user_id,provider,product_id" })
    .select("liked, removed")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    liked: Boolean(data?.liked),
    removed: Boolean(data?.removed),
  });
}
