import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  PARTNER_SUGGESTION_PROVIDER,
  loadSuggestionRecord,
} from "@/lib/product-suggestions";
import {
  getDealsProviderConfig,
  resolveDealsProvider,
} from "@/lib/deals/provider";

export const runtime = "nodejs";

// Keep this in sync with what the production UI needs.
const PRODUCT_SELECT =
  "provider, product_id, title, product_url, image_url, image_local_path, image_local_url, source_url, taxonomy_l1, taxonomy_l2, taxonomy_l3, taxonomy_path, first_seen_at, last_seen_at, sold_today, sold_7d, sold_all_time, price, previous_price, last_price, last_previous_price, reviews, last_reviews, delivery_time, last_delivery_time, identical_spu";

const SUPPLIER_PAYLOAD_WORKER_PATH =
  "/srv/nordexo-hub/scripts/production-supplier-fetch-worker.mjs";

type ProductionItemInput = {
  provider: string;
  product_id: string;
};

type ProductionRow = {
  provider: string;
  product_id: string;
  created_at: string;
};

type SupplierSearchRow = {
  provider: string;
  product_id: string;
  offers: unknown;
};

type DigidealManualSupplierRow = {
  product_id: string;
  "1688_URL"?: string | null;
  "1688_url"?: string | null;
};

const canonical1688Url = (value: string | null) => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const match = raw.match(
    /(?:detail\.1688\.com\/offer\/|\/offer\/)(\d{6,})\.html/i
  );
  if (match?.[1]) {
    return `https://detail.1688.com/offer/${match[1]}.html`;
  }
  return raw;
};

const spawnSupplierPayloadWorkerBestEffort = (
  provider: string,
  productId: string
) => {
  try {
    const child = spawn(
      process.execPath,
      [SUPPLIER_PAYLOAD_WORKER_PATH, "--provider", provider, "--product-id", productId],
      {
        detached: true,
        stdio: "ignore",
        env: { ...process.env },
      }
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
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

type ProductionStatusSnapshot = {
  status: string | null;
  updated_at: string | null;
  spu_assigned_at: string | null;
  production_started_at: string | null;
  production_done_at: string | null;
  last_file_name: string | null;
  last_job_id: string | null;
};

const keyOf = (provider: string, productId: string) =>
  `${provider}:${productId}`;

const parseRefKey = (key: string) => {
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  const provider = key.slice(0, idx).trim();
  const product_id = key.slice(idx + 1).trim();
  if (!provider || !product_id) return null;
  return { provider, product_id };
};

const shouldReconcileSpuAssignedStatus = (row: ProductionStatusSnapshot | null | undefined) => {
  if (!row) return false;
  const status = (firstString(row.status) || "").toLowerCase();
  if (status !== "spu_assigned") return false;
  if (firstString(row.production_started_at) || firstString(row.production_done_at)) return false;
  return true;
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

      const manualSupplierMap = new Map<string, string>();
      // Manual supplier links live on digideal_products (not the search view).
      const { data: manualRows, error: manualError } = await readClient
        .from("digideal_products")
        .select('product_id, "1688_URL", 1688_url')
        .in("product_id", ids);
      if (manualError) {
        return NextResponse.json({ error: manualError.message }, { status: 500 });
      }
      (manualRows as DigidealManualSupplierRow[] | null)?.forEach((row) => {
        const url =
          firstString((row as any)["1688_URL"]) || firstString((row as any)["1688_url"]);
        if (url) manualSupplierMap.set(String(row.product_id), url);
      });

      // DigiDeal: if a supplier URL was manually set (EST rerun price), it should behave like a
      // selected supplier in the production queue. Historically those items didn't create a
      // selection row, which left the UI showing "Fetching 1688 data" forever.
      if (isAdmin && adminClient && manualSupplierMap.size > 0) {
        const manualIds = Array.from(manualSupplierMap.keys());
        const { data: existingSelections, error: existingError } = await adminClient
          .from("discovery_production_supplier_selection")
          .select("product_id")
          .eq("provider", "digideal")
          .in("product_id", manualIds);
        if (existingError) {
          return NextResponse.json({ error: existingError.message }, { status: 500 });
        }

        const existingSet = new Set(
          (existingSelections ?? []).map((row: any) => String(row.product_id))
        );
        const missing = manualIds.filter((id) => !existingSet.has(id));
        if (missing.length > 0) {
          const now = new Date().toISOString();
          const rowsToUpsert = missing
            .map((id) => {
              const raw = manualSupplierMap.get(id) ?? null;
              const url = canonical1688Url(raw);
              if (!url) return null;
              return {
                provider: "digideal",
                product_id: id,
                selected_offer_id: null,
                selected_detail_url: url,
                selected_offer: {
                  detailUrl: url,
                  source: "digideal_manual",
                  _production_payload_status: "fetching",
                  _production_payload_source: "auto",
                  _production_payload_error: null,
                  _production_payload_file_name: null,
                  _production_payload_file_path: null,
                  _production_payload_updated_at: now,
                  _production_payload_saved_at: null,
                  _production_payload_competitor_error: null,
                },
                selected_at: now,
                selected_by: user.id,
                updated_at: now,
              };
            })
            .filter(Boolean);

          if (rowsToUpsert.length > 0) {
            const { error: upsertError } = await adminClient
              .from("discovery_production_supplier_selection")
              .upsert(rowsToUpsert, { onConflict: "provider,product_id" });
            if (upsertError) {
              return NextResponse.json({ error: upsertError.message }, { status: 500 });
            }

            // Kick off the background payload fetch for each newly created selection.
            for (const row of rowsToUpsert) {
              const started = spawnSupplierPayloadWorkerBestEffort(
                "digideal",
                String((row as any).product_id)
              );
              if (!started) {
                const failedAt = new Date().toISOString();
                await adminClient
                  .from("discovery_production_supplier_selection")
                  .update({
                    selected_offer: {
                      ...(row as any).selected_offer,
                      _production_payload_status: "failed",
                      _production_payload_error:
                        "Unable to start background 1688 fetch job.",
                      _production_payload_updated_at: failedAt,
                    },
                    updated_at: failedAt,
                  })
                  .eq("provider", "digideal")
                  .eq("product_id", String((row as any).product_id));
              }
            }
          }
        }
      }

      const digidealItems = (rows ?? []).map((row) => {
        const listingTitle = firstString((row as any).listing_title);
        const titleH1 = firstString((row as any).title_h1);
        const productSlug = firstString((row as any).product_slug);
        const productId = String((row as any).product_id ?? "").trim();
        const primaryImage = firstString((row as any).primary_image_url);
        const imageUrls = (row as any).image_urls;
        const imageUrl = primaryImage || pickFirstImage(imageUrls);
        const googleTaxonomyPath = firstString((row as any).google_taxonomy_path);
        const googleParts = googleTaxonomyPath
          ? googleTaxonomyPath.split(" > ").map((p: string) => p.trim()).filter(Boolean)
          : [];
        const taxonomyL1 = firstString((row as any).taxonomy_l1) ?? (googleParts[0] ?? null);
        const taxonomyL2 = firstString((row as any).taxonomy_l2) ?? (googleParts[1] ?? null);
        const taxonomyL3 = firstString((row as any).taxonomy_l3) ?? (googleParts[2] ?? null);
        const supplier1688Url = manualSupplierMap.get(productId) ?? null;
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
          taxonomy_l1: taxonomyL1,
          taxonomy_l2: taxonomyL2,
          taxonomy_l3: taxonomyL3,
          taxonomy_path: googleTaxonomyPath ?? null,
          first_seen_at: (row as any).first_seen_at ?? null,
          last_seen_at: (row as any).last_seen_at ?? null,
          sold_today: soldToday,
          sold_7d: sold7d,
          sold_all_time: soldAllTime,
          // DigiDeal deals table fields (for consistent formatting).
          last_price: toNumber((row as any).last_price),
          last_original_price: toNumber((row as any).last_original_price),
          last_discount_percent: toNumber((row as any).last_discount_percent),
          last_you_save_kr: toNumber((row as any).last_you_save_kr),
          shipping_cost_kr: toNumber((row as any).shipping_cost_kr),
          status: firstString((row as any).status),
          seller_name: firstString((row as any).seller_name),
          identical_spu: firstString((row as any).identical_spu),
          supplier_1688_url: supplier1688Url,
          supplier_locked: Boolean(supplier1688Url),
        };
      });
      items = items.concat(digidealItems);
      continue;
    }

    if (provider === PARTNER_SUGGESTION_PROVIDER) {
      const suggestionRows = await Promise.all(
        ids.map(async (id) => {
          const record = await loadSuggestionRecord(id);
          const external =
            record?.externalData && typeof record.externalData === "object"
              ? (record.externalData as Record<string, unknown>)
              : null;
          const taxonomy =
            record?.googleTaxonomy && typeof record.googleTaxonomy === "object"
              ? (record.googleTaxonomy as Record<string, unknown>)
              : null;

          const title =
            firstString((record as any)?.title) ||
            firstString((external as any)?.title) ||
            firstString((external as any)?.rawTitle) ||
            id;
          const productUrl =
            firstString((record as any)?.crawlFinalUrl) ||
            firstString((external as any)?.finalUrl) ||
            firstString((external as any)?.inputUrl) ||
            firstString((record as any)?.sourceUrl);
          const sourceUrl =
            firstString((record as any)?.sourceUrl) ||
            firstString((external as any)?.inputUrl) ||
            firstString((external as any)?.finalUrl) ||
            firstString((record as any)?.crawlFinalUrl);
          const imageUrl =
            firstString((record as any)?.mainImageUrl) ||
            firstString((external as any)?.mainImageUrl) ||
            firstString((external as any)?.rawMainImageUrl);
          const createdAt =
            firstString((record as any)?.createdAt) ??
            createdAtMap.get(`${provider}:${id}`) ??
            null;
          const taxonomyPath =
            firstString((taxonomy as any)?.path) ||
            [firstString((taxonomy as any)?.l1), firstString((taxonomy as any)?.l2), firstString((taxonomy as any)?.l3)]
              .filter(Boolean)
              .join(" > ") ||
            null;

          return {
            provider: PARTNER_SUGGESTION_PROVIDER,
            product_id: id,
            title: title ?? null,
            product_url: productUrl,
            image_url: imageUrl,
            image_local_path: null,
            image_local_url: null,
            source_url: sourceUrl,
            taxonomy_l1: firstString((taxonomy as any)?.l1),
            taxonomy_l2: firstString((taxonomy as any)?.l2),
            taxonomy_l3: firstString((taxonomy as any)?.l3),
            taxonomy_path: taxonomyPath,
            first_seen_at: createdAt,
            last_seen_at: createdAt,
            sold_today: null,
            sold_7d: null,
            sold_all_time: null,
            price: null,
            previous_price: null,
            last_price: null,
            last_previous_price: null,
            reviews: null,
            last_reviews: null,
            delivery_time: null,
            last_delivery_time: null,
            identical_spu: null,
          };
        })
      );
      items = items.concat(suggestionRows);
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

  // Supplier suggestions are admin-only (same as /app/production).
  const supplierCountMap = new Map<string, number>();
  const supplierSelectedSet = new Set<string>();
  const productionStatusMap = new Map<
    string,
    ProductionStatusSnapshot
  >();
  const productionSpuMap = new Map<
    string,
    {
      spu: string | null;
      assigned_at: string | null;
    }
  >();
  const productionSpuLinksMap = new Map<string, Set<string>>();
  const supplierSelectedOfferMap = new Map<
    string,
    {
      image_url: string | null;
      title: string | null;
      detail_url: string | null;
      payload_status: string | null;
      payload_source: string | null;
      payload_error: string | null;
      payload_saved_at: string | null;
      payload_file_name: string | null;
      payload_file_path: string | null;
      payload_competitor_url: string | null;
      payload_competitor_title: string | null;
      payload_competitor_images: number | null;
      payload_competitor_error: string | null;
      variant_available_count: number | null;
      variant_selected_count: number | null;
      variant_packs_text: string | null;
    }
  >();
  if (isAdmin && adminClient && withComments.length > 0) {
    const providers = Array.from(new Set(withComments.map((item) => item.provider)));
    const productIds = Array.from(new Set(withComments.map((item) => item.product_id)));

    const [{ data: supplierRows }, { data: selectionRows }, { data: statusRows }, { data: spuRows }] =
      await Promise.all([
      adminClient
        .from("discovery_production_supplier_searches")
        .select("provider, product_id, offers")
        .in("provider", providers)
        .in("product_id", productIds),
      adminClient
        .from("discovery_production_supplier_selection")
        .select("provider, product_id, selected_offer")
        .in("provider", providers)
        .in("product_id", productIds),
      adminClient
        .from("discovery_production_status")
        .select(
          "provider, product_id, status, updated_at, spu_assigned_at, production_started_at, production_done_at, last_file_name, last_job_id"
        )
        .in("provider", providers)
        .in("product_id", productIds),
      adminClient
        .from("discovery_production_item_spus")
        .select("provider, product_id, spu, assigned_at")
        .in("provider", providers)
        .in("product_id", productIds),
      ]);

    (supplierRows as SupplierSearchRow[] | null)?.forEach((row) => {
      const offers = Array.isArray(row.offers) ? row.offers : [];
      supplierCountMap.set(`${row.provider}:${row.product_id}`, offers.length);
    });

    (selectionRows as Array<{ provider: string; product_id: string; selected_offer?: unknown }> | null)?.forEach(
      (row) => {
        const key = `${row.provider}:${row.product_id}`;
        supplierSelectedSet.add(key);
        const offer = (row as any)?.selected_offer;
        if (offer && typeof offer === "object") {
          const imageUrl =
            firstString((offer as any).imageUrl) || firstString((offer as any).image_url);
          const title =
            firstString((offer as any).subject_en) ||
            firstString((offer as any).subject) ||
            firstString((offer as any).title);
          const detailUrl =
            firstString((offer as any).detailUrl) || firstString((offer as any).detail_url);
          const payloadStatus = firstString((offer as any)._production_payload_status);
          const payloadSource = firstString((offer as any)._production_payload_source);
          const payloadError = firstString((offer as any)._production_payload_error);
          const payloadSavedAt = firstString((offer as any)._production_payload_saved_at);
          const payloadFileName = firstString((offer as any)._production_payload_file_name);
          const payloadFilePath = firstString((offer as any)._production_payload_file_path);
          const payloadCompetitorUrl = firstString((offer as any)._production_payload_competitor_url);
          const payloadCompetitorTitle = firstString((offer as any)._production_payload_competitor_title);
          const payloadCompetitorImagesRaw = Number((offer as any)._production_payload_competitor_images);
          const payloadCompetitorImages = Number.isFinite(payloadCompetitorImagesRaw)
            ? payloadCompetitorImagesRaw
            : null;
          const payloadCompetitorError = firstString((offer as any)._production_payload_competitor_error);
          const variantAvailableCountRaw = Number((offer as any)._production_variant_available_count);
          const variantAvailableCount = Number.isFinite(variantAvailableCountRaw)
            ? variantAvailableCountRaw
            : null;
          const variantSelectedCountRaw = Number((offer as any)._production_variant_selected_count);
          const variantSelectedCount = Number.isFinite(variantSelectedCountRaw)
            ? variantSelectedCountRaw
            : null;
          const variantPacksText = firstString((offer as any)._production_variant_packs_text);
          supplierSelectedOfferMap.set(key, {
            image_url: imageUrl,
            title,
            detail_url: detailUrl,
            payload_status: payloadStatus,
            payload_source: payloadSource,
            payload_error: payloadError,
            payload_saved_at: payloadSavedAt,
            payload_file_name: payloadFileName,
            payload_file_path: payloadFilePath,
            payload_competitor_url: payloadCompetitorUrl,
            payload_competitor_title: payloadCompetitorTitle,
            payload_competitor_images: payloadCompetitorImages,
            payload_competitor_error: payloadCompetitorError,
            variant_available_count: variantAvailableCount,
            variant_selected_count: variantSelectedCount,
            variant_packs_text: variantPacksText,
          });
        }
      }
    );

    (
      statusRows as
        | Array<{
            provider: string;
            product_id: string;
            status?: string | null;
            updated_at?: string | null;
            spu_assigned_at?: string | null;
            production_started_at?: string | null;
            production_done_at?: string | null;
            last_file_name?: string | null;
            last_job_id?: string | null;
          }>
        | null
    )?.forEach((row) => {
      productionStatusMap.set(`${row.provider}:${row.product_id}`, {
        status: firstString(row.status) ?? null,
        updated_at: firstString(row.updated_at) ?? null,
        spu_assigned_at: firstString(row.spu_assigned_at) ?? null,
        production_started_at: firstString(row.production_started_at) ?? null,
        production_done_at: firstString(row.production_done_at) ?? null,
        last_file_name: firstString(row.last_file_name) ?? null,
        last_job_id: firstString(row.last_job_id) ?? null,
      });
    });

    (
      spuRows as
        | Array<{
            provider: string;
            product_id: string;
            spu?: string | null;
            assigned_at?: string | null;
          }>
        | null
    )?.forEach((row) => {
      const key = keyOf(row.provider, row.product_id);
      const existing = productionSpuMap.get(key);
      const nextAssignedAt = firstString(row.assigned_at) ?? null;
      const nextSpu = firstString(row.spu) ?? null;
      if (!nextSpu) return;
      const links = productionSpuLinksMap.get(key) ?? new Set<string>();
      links.add(nextSpu.toUpperCase());
      productionSpuLinksMap.set(key, links);
      if (!existing) {
        productionSpuMap.set(key, { spu: nextSpu, assigned_at: nextAssignedAt });
        return;
      }
      const existingTs = existing.assigned_at ? Date.parse(existing.assigned_at) : 0;
      const nextTs = nextAssignedAt ? Date.parse(nextAssignedAt) : 0;
      if (nextTs >= existingTs) {
        productionSpuMap.set(key, { spu: nextSpu, assigned_at: nextAssignedAt });
      }
    });

    // Reconcile stale "SPU assigned" statuses if the linked draft SPU no longer exists.
    // This catches manual filesystem/database cleanup that bypasses the normal delete APIs.
    try {
      const candidateKeys: string[] = [];
      const candidateSpus = new Set<string>();
      for (const [key, statusRow] of productionStatusMap.entries()) {
        if (!shouldReconcileSpuAssignedStatus(statusRow)) continue;
        candidateKeys.push(key);
        const linkedSpus = productionSpuLinksMap.get(key);
        linkedSpus?.forEach((spu) => candidateSpus.add(spu.toUpperCase()));
      }

      if (candidateKeys.length > 0) {
        const existingDraftSpus = new Set<string>();
        if (candidateSpus.size > 0) {
          const { data: draftSpuRows, error: draftSpuError } = await adminClient
            .from("draft_products")
            .select("draft_spu")
            .in("draft_spu", Array.from(candidateSpus));
          if (draftSpuError) {
            throw new Error(draftSpuError.message);
          }
          (draftSpuRows as Array<{ draft_spu?: string | null }> | null)?.forEach((row) => {
            const spu = firstString(row.draft_spu);
            if (spu) existingDraftSpus.add(spu.toUpperCase());
          });
        }

        const staleRefs: Array<{ provider: string; product_id: string; key: string }> = [];
        candidateKeys.forEach((key) => {
          const parsed = parseRefKey(key);
          if (!parsed) return;
          const linkedSpus = Array.from(productionSpuLinksMap.get(key) ?? []);
          const hasAnyDraft =
            linkedSpus.length > 0
              ? linkedSpus.some((spu) => existingDraftSpus.has(spu.toUpperCase()))
              : false;
          if (linkedSpus.length === 0 || !hasAnyDraft) {
            staleRefs.push({ ...parsed, key });
          }
        });

        if (staleRefs.length > 0) {
          const nowIso = new Date().toISOString();
          for (const ref of staleRefs) {
            const { error: statusResetError } = await adminClient
              .from("discovery_production_status")
              .update({
                status: null,
                spu_assigned_at: null,
                production_started_at: null,
                production_done_at: null,
                last_file_name: null,
                last_job_id: null,
                updated_at: nowIso,
              })
              .eq("provider", ref.provider)
              .eq("product_id", ref.product_id);
            if (statusResetError) {
              throw new Error(statusResetError.message);
            }

            const { error: linkDeleteError } = await adminClient
              .from("discovery_production_item_spus")
              .delete()
              .eq("provider", ref.provider)
              .eq("product_id", ref.product_id);
            if (linkDeleteError) {
              throw new Error(linkDeleteError.message);
            }

            productionStatusMap.delete(ref.key);
            productionSpuMap.delete(ref.key);
            productionSpuLinksMap.delete(ref.key);
          }
        }
      }
    } catch (error) {
      console.error("Unable to reconcile stale production queue SPU status:", error);
    }
  }

  const withSuppliers = withComments.map((item) => {
    const key = `${item.provider}:${item.product_id}`;
    const locked =
      (item as any).supplier_locked === true ||
      (typeof (item as any).supplier_1688_url === "string" &&
        Boolean((item as any).supplier_1688_url.trim()));
    return {
      ...item,
      supplier_count: supplierCountMap.has(key) ? supplierCountMap.get(key) : null,
      supplier_selected: locked ? true : supplierSelectedSet.has(key),
      supplier_selected_offer_image_url: supplierSelectedOfferMap.get(key)?.image_url ?? null,
      supplier_selected_offer_title: supplierSelectedOfferMap.get(key)?.title ?? null,
      supplier_selected_offer_detail_url: supplierSelectedOfferMap.get(key)?.detail_url ?? null,
      supplier_payload_status: supplierSelectedOfferMap.get(key)?.payload_status ?? null,
      supplier_payload_source: supplierSelectedOfferMap.get(key)?.payload_source ?? null,
      supplier_payload_error: supplierSelectedOfferMap.get(key)?.payload_error ?? null,
      supplier_payload_saved_at: supplierSelectedOfferMap.get(key)?.payload_saved_at ?? null,
      supplier_payload_file_name: supplierSelectedOfferMap.get(key)?.payload_file_name ?? null,
      supplier_payload_file_path: supplierSelectedOfferMap.get(key)?.payload_file_path ?? null,
      supplier_payload_competitor_url:
        supplierSelectedOfferMap.get(key)?.payload_competitor_url ?? null,
      supplier_payload_competitor_title:
        supplierSelectedOfferMap.get(key)?.payload_competitor_title ?? null,
      supplier_payload_competitor_images:
        supplierSelectedOfferMap.get(key)?.payload_competitor_images ?? null,
      supplier_payload_competitor_error:
        supplierSelectedOfferMap.get(key)?.payload_competitor_error ?? null,
      supplier_variant_available_count:
        supplierSelectedOfferMap.get(key)?.variant_available_count ?? null,
      supplier_variant_selected_count:
        supplierSelectedOfferMap.get(key)?.variant_selected_count ?? null,
      supplier_variant_packs_text:
        supplierSelectedOfferMap.get(key)?.variant_packs_text ?? null,
      production_status: productionStatusMap.get(key)?.status ?? null,
      production_status_updated_at: productionStatusMap.get(key)?.updated_at ?? null,
      production_status_spu_assigned_at:
        productionStatusMap.get(key)?.spu_assigned_at ?? null,
      production_status_started_at:
        productionStatusMap.get(key)?.production_started_at ?? null,
      production_status_done_at: productionStatusMap.get(key)?.production_done_at ?? null,
      production_status_last_file_name:
        productionStatusMap.get(key)?.last_file_name ?? null,
      production_status_last_job_id:
        productionStatusMap.get(key)?.last_job_id ?? null,
      production_assigned_spu: productionSpuMap.get(key)?.spu ?? null,
    };
  });

  const visibleItems = withSuppliers.filter((item) => {
    if (item.provider !== PARTNER_SUGGESTION_PROVIDER) return true;
    const hasProductionLifecycle = Boolean(
      firstString((item as any).production_status) ||
        firstString((item as any).production_status_updated_at) ||
        firstString((item as any).production_status_spu_assigned_at) ||
        firstString((item as any).production_status_started_at) ||
        firstString((item as any).production_status_done_at)
    );
    return hasProductionLifecycle;
  });

  return NextResponse.json({ items: visibleItems });
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
  const normalizedProvider = provider.toLowerCase();
  const productId = String(payload?.product_id ?? "").trim();
  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  if (normalizedProvider === PARTNER_SUGGESTION_PROVIDER) {
    const statusClient = adminClient ?? supabase;
    const [{ error: statusError }, { error: spuError }] = await Promise.all([
      statusClient
        .from("discovery_production_status")
        .delete()
        .eq("provider", normalizedProvider)
        .eq("product_id", productId),
      statusClient
        .from("discovery_production_item_spus")
        .delete()
        .eq("provider", normalizedProvider)
        .eq("product_id", productId),
    ]);

    if (statusError || spuError) {
      return NextResponse.json(
        { error: statusError?.message || spuError?.message || "Failed to clear production status." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  const deleteClient = adminClient ?? supabase;
  let deleteQuery = deleteClient
    .from("discovery_production_items")
    .delete()
    .eq("provider", normalizedProvider)
    .eq("product_id", productId);

  if (!isAdmin) {
    deleteQuery = deleteQuery.eq("user_id", user.id);
  }

  const { error } = await deleteQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (
    normalizedProvider === "digideal" ||
    normalizedProvider === "letsdeal" ||
    normalizedProvider === "offerilla"
  ) {
    const dealsProvider = resolveDealsProvider(normalizedProvider);
    const providerConfig = getDealsProviderConfig(dealsProvider);
    const updateClient = adminClient ?? supabase;
    const { error: updateError } = await updateClient
      .from(providerConfig.productsTable)
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
