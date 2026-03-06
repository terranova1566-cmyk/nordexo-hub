import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  deliveryPartnerLabel,
  normalizeDeliveryPartner,
  resolveDeliveryPartnerFromListName,
  toDisplayDeliveryListName,
} from "@/lib/product-delivery/digideal";

type NoticePartner = "digideal" | "letsdeal" | "nordexo";

type DeliveryListRow = {
  id: string;
  name: string | null;
  created_at: string | null;
};

type DeliveryListItemRow = {
  wishlist_id: string | null;
  product_id: string | null;
};

type UserSettingsRow = {
  is_admin: boolean | null;
  company_name: string | null;
};

const resolveViewerPartner = (
  companyName: unknown,
  userMetadata: Record<string, unknown> | null | undefined
) => {
  const candidates = [
    companyName,
    userMetadata?.company_name,
    userMetadata?.organization_name,
    userMetadata?.organization,
    userMetadata?.company,
  ];
  for (const candidate of candidates) {
    const raw = String(candidate ?? "")
      .trim()
      .toLowerCase();
    if (!raw) continue;
    const compact = raw.replace(/[\s._-]+/g, "");
    if (compact.includes("nordexo") || compact.includes("nodexo")) {
      return "nordexo" as const;
    }
    const partner = normalizeDeliveryPartner(raw);
    if (partner) return partner as NoticePartner;
  }
  return null;
};

const resolveListPartner = (value: string | null | undefined): NoticePartner | null => {
  const known = resolveDeliveryPartnerFromListName(value);
  if (known) return known;
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  const compact = raw.replace(/[\s._-]+/g, "");
  if (compact.includes("nordexo") || compact.includes("nodexo")) {
    return "nordexo";
  }
  return null;
};

const labelForPartner = (partner: NoticePartner) => {
  if (partner === "nordexo") return "Nodexo";
  return deliveryPartnerLabel(partner);
};

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin, company_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  const typedSettings = (settings ?? null) as UserSettingsRow | null;
  const isAdmin = Boolean(typedSettings?.is_admin);
  const viewerPartner = resolveViewerPartner(
    typedSettings?.company_name,
    (user.user_metadata ?? null) as Record<string, unknown> | null
  );

  if (!isAdmin && !viewerPartner) {
    return NextResponse.json({
      partner: null,
      items: [],
    });
  }

  const { data: listsRaw, error: listsError } = await supabase
    .from("product_manager_wishlists")
    .select("id, name, created_at")
    .order("created_at", { ascending: false })
    .limit(80);

  if (listsError) {
    return NextResponse.json({ error: listsError.message }, { status: 500 });
  }

  const lists = ((listsRaw ?? []) as DeliveryListRow[])
    .map((row) => {
      const partner = resolveListPartner(row.name);
      if (!partner) return null;
      return {
        id: row.id,
        partner,
        title: toDisplayDeliveryListName(row.name),
        created_at: row.created_at ?? null,
      };
    })
    .filter(
      (
        row
      ): row is {
        id: string;
        partner: NoticePartner;
        title: string;
        created_at: string | null;
      } => Boolean(row)
    );

  const filteredLists = isAdmin
    ? lists
    : viewerPartner
      ? lists.filter((row) => row.partner === viewerPartner)
      : [];

  if (filteredLists.length === 0) {
    return NextResponse.json({
      partner: viewerPartner,
      items: [],
    });
  }

  const listIds = filteredLists.slice(0, 20).map((row) => row.id);
  const { data: listItemsRaw, error: listItemsError } = await supabase
    .from("product_manager_wishlist_items")
    .select("wishlist_id, product_id")
    .in("wishlist_id", listIds);

  if (listItemsError) {
    return NextResponse.json({ error: listItemsError.message }, { status: 500 });
  }

  const countByListId = new Map<string, number>();
  ((listItemsRaw ?? []) as DeliveryListItemRow[]).forEach((row) => {
    const listId = String(row.wishlist_id ?? "").trim();
    if (!listId) return;
    countByListId.set(listId, (countByListId.get(listId) ?? 0) + 1);
  });

  const items = filteredLists.slice(0, 10).map((row) => ({
    id: row.id,
    partner: labelForPartner(row.partner),
    title: row.title,
    created_at: row.created_at,
    item_count: countByListId.get(row.id) ?? 0,
  }));

  return NextResponse.json({
    partner: viewerPartner,
    items,
  });
}
