import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

const PRODUCT_SELECT =
  "provider, product_id, title, product_url, image_url, image_local_path, image_local_url, source_url, taxonomy_l1, taxonomy_l2, taxonomy_l3, first_seen_at, last_seen_at, sold_today, sold_7d, sold_all_time";

type ProductionItemInput = {
  provider: string;
  product_id: string;
};

type ProductionRow = {
  provider: string;
  product_id: string;
  created_at: string;
};

const getAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(numeric) ? numeric : null;
};

const firstString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

const pickFirstImage = (value: unknown) => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = firstString(entry);
      if (text) return text;
    }
  }
  return firstString(value);
};

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(settings?.is_admin);
  const adminClient = isAdmin ? getAdminClient() : null;
  if (isAdmin && !adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const readClient = adminClient ?? supabase;
  let productionQuery = readClient
    .from("discovery_production_items")
    .select("provider, product_id, created_at")
    .order("created_at", { ascending: false });

  if (!isAdmin) {
    productionQuery = productionQuery.eq("user_id", user.id);
  }

  const { data: productionRows, error } = await productionQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!productionRows || productionRows.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const rawRows = productionRows as ProductionRow[];
  const dedupedRows = isAdmin
    ? Array.from(
        rawRows.reduce((map, row) => {
          const key = `${row.provider}:${row.product_id}`;
          const existing = map.get(key);
          if (!existing || Date.parse(row.created_at) > Date.parse(existing.created_at)) {
            map.set(key, row);
          }
          return map;
        }, new Map<string, ProductionRow>()).values()
      )
    : rawRows;

  const createdAtMap = new Map<string, string>();
  const providerMap = new Map<string, string[]>();
  dedupedRows.forEach((row) => {
    createdAtMap.set(`${row.provider}:${row.product_id}`, row.created_at);
    const list = providerMap.get(row.provider) ?? [];
    list.push(row.product_id);
    providerMap.set(row.provider, list);
  });

  let items: any[] = [];
  for (const [provider, ids] of providerMap.entries()) {
    if (provider === "digideal") {
      const { data: rows, error: rowsError } = await readClient
        .from("digideal_products_search")
        .select("*")
        .in("product_id", ids);
      if (rowsError) {
        return NextResponse.json({ error: rowsError.message }, { status: 500 });
      }

      const digidealItems = (rows ?? []).map((row) => {
        const listingTitle = firstString((row as any).listing_title);
        const titleH1 = firstString((row as any).title_h1);
        const productSlug = firstString((row as any).product_slug);
        const productId = String((row as any).product_id ?? "").trim();
        const primaryImage = firstString((row as any).primary_image_url);
        const imageUrls = (row as any).image_urls;
        const imageUrl = primaryImage || pickFirstImage(imageUrls);
        const soldToday = Math.max(
          0,
          (toNumber((row as any).sold_today) ?? 0) - 30
        );
        const sold7d = Math.max(0, (toNumber((row as any).sold_7d) ?? 0) - 30);
        const soldAllTime = Math.max(
          0,
          (toNumber((row as any).sold_all_time) ??
            toNumber((row as any).last_purchased_count) ??
            0) - 30
        );
        return {
          provider: "digideal",
          product_id: productId,
          title: listingTitle || titleH1 || productSlug || productId || null,
          product_url: firstString((row as any).product_url),
          image_url: imageUrl,
          image_local_path: (row as any).image_local_path ?? null,
          image_local_url: (row as any).image_local_url ?? null,
          source_url: firstString((row as any).source_url),
          taxonomy_l1: (row as any).taxonomy_l1 ?? null,
          taxonomy_l2: (row as any).taxonomy_l2 ?? null,
          taxonomy_l3: (row as any).taxonomy_l3 ?? null,
          first_seen_at: (row as any).first_seen_at ?? null,
          last_seen_at: (row as any).last_seen_at ?? null,
          sold_today: soldToday,
          sold_7d: sold7d,
          sold_all_time: soldAllTime,
        };
      });
      items = items.concat(digidealItems);
      continue;
    }

    const { data: rows, error: rowsError } = await readClient
      .from("discovery_products")
      .select(PRODUCT_SELECT)
      .eq("provider", provider)
      .in("product_id", ids);
    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }
    items = items.concat(rows ?? []);
  }

  const merged = items
    .map((item) => ({
      ...item,
      created_at: createdAtMap.get(`${item.provider}:${item.product_id}`) ?? null,
    }))
    .sort((a, b) => {
      const aTime = a.created_at ? Date.parse(a.created_at) : 0;
      const bTime = b.created_at ? Date.parse(b.created_at) : 0;
      return bTime - aTime;
    });

  const commentCountMap = new Map<string, number>();
  if (isAdmin && adminClient && merged.length > 0) {
    const providers = Array.from(new Set(merged.map((item) => item.provider)));
    const productIds = Array.from(new Set(merged.map((item) => item.product_id)));
    const { data: commentRows, error: commentError } = await adminClient
      .from("discovery_production_comments")
      .select("provider, product_id")
      .in("provider", providers)
      .in("product_id", productIds);
    if (!commentError && commentRows) {
      commentRows.forEach((row) => {
        const key = `${row.provider}:${row.product_id}`;
        commentCountMap.set(key, (commentCountMap.get(key) ?? 0) + 1);
      });
    }
  }

  const withComments = merged.map((item) => ({
    ...item,
    comment_count: commentCountMap.get(`${item.provider}:${item.product_id}`) ?? 0,
  }));

  return NextResponse.json({ items: withComments });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { items?: ProductionItemInput[] };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const items = Array.isArray(payload?.items)
    ? payload.items
        .map((item) => ({
          provider: String(item.provider ?? "").trim(),
          product_id: String(item.product_id ?? "").trim(),
        }))
        .filter((item) => item.provider && item.product_id)
    : [];

  if (items.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const rows = items.map((item) => ({
    user_id: user.id,
    provider: item.provider,
    product_id: item.product_id,
  }));

  const { error } = await supabase
    .from("discovery_production_items")
    .upsert(rows, { onConflict: "user_id,provider,product_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(settings?.is_admin);
  const adminClient = isAdmin ? getAdminClient() : null;
  if (isAdmin && !adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  let payload: { provider?: string; product_id?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const provider = String(payload?.provider ?? "").trim();
  const productId = String(payload?.product_id ?? "").trim();
  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  const deleteClient = adminClient ?? supabase;
  let deleteQuery = deleteClient
    .from("discovery_production_items")
    .delete()
    .eq("provider", provider)
    .eq("product_id", productId);

  if (!isAdmin) {
    deleteQuery = deleteQuery.eq("user_id", user.id);
  }

  const { error } = await deleteQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (provider === "digideal") {
    const updateClient = adminClient ?? supabase;
    const { error: updateError } = await updateClient
      .from("digideal_products")
      .update({
        digideal_add_rerun: false,
        digideal_add_rerun_at: null,
        digideal_add_rerun_comment: null,
        digideal_rerun_status: null,
      })
      .eq("product_id", productId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
