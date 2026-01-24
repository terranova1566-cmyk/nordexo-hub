import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type SharePayload = {
  wishlistId?: string;
  emails?: string[];
  shareWithAll?: boolean;
};

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: SharePayload;
  try {
    payload = (await request.json()) as SharePayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const wishlistId = payload?.wishlistId;
  if (!wishlistId) {
    return NextResponse.json({ error: "Wishlist ID is required." }, { status: 400 });
  }

  const shareWithAll = Boolean(payload?.shareWithAll);
  const emails = (payload?.emails ?? [])
    .map((email) => String(email).trim())
    .filter((email) => email.length > 0);

  if (!shareWithAll && emails.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one email or select share with all." },
      { status: 400 }
    );
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

  const rows = [];
  if (shareWithAll) {
    rows.push({
      wishlist_id: wishlistId,
      shared_by: user.id,
      shared_by_email: user.email ?? "",
      shared_with_email: "",
      is_public: true,
    });
  }

  emails.forEach((email) => {
    rows.push({
      wishlist_id: wishlistId,
      shared_by: user.id,
      shared_by_email: user.email ?? "",
      shared_with_email: email,
      is_public: false,
    });
  });

  const { error } = await supabase.from("discovery_wishlist_shares").upsert(rows, {
    onConflict: "wishlist_id,shared_with_email,is_public",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: rows.length });
}
