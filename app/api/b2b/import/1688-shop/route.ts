import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { createLookbook } from "@/lib/b2b/services/lookbooks";
import { logActivity } from "@/lib/b2b/services/activity-log";

export const runtime = "nodejs";

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const shopUrl = asString(payload?.supplier_shop_url ?? payload?.shop_url ?? payload?.url);
  if (!shopUrl) {
    return NextResponse.json(
      { error: "Missing supplier_shop_url." },
      { status: 400 }
    );
  }

  const title =
    asString(payload?.title) ||
    `1688 Supplier Lookbook (${new Date().toISOString().slice(0, 10)})`;
  const curatedForCustomerId = asString(payload?.curated_for_customer_id) || null;

  // Create or reuse supplier by shop URL (best-effort).
  let supplierId: string | null = null;
  const { data: existingSupplier } = await auth.supabase
    .from("b2b_suppliers")
    .select("id")
    .eq("platform", "1688")
    .eq("platform_store_url", shopUrl)
    .maybeSingle();
  if (existingSupplier?.id) {
    supplierId = existingSupplier.id as string;
  } else {
    const supplierName = asString(payload?.supplier_name) || "1688 supplier";
    const { data: insertedSupplier, error: supplierError } = await auth.supabase
      .from("b2b_suppliers")
      .insert({
        platform: "1688",
        internal_name: supplierName,
        platform_store_url: shopUrl,
        created_by: auth.user.id,
      })
      .select("id")
      .maybeSingle();
    if (supplierError) {
      return NextResponse.json({ error: supplierError.message }, { status: 500 });
    }
    supplierId = insertedSupplier?.id ?? null;
    if (supplierId) {
      await logActivity(auth.supabase, {
        entity_type: "supplier",
        entity_id: supplierId,
        action: "supplier.create_from_shop_scan",
        diff: { platform_store_url: shopUrl },
        created_by: auth.user.id,
      });
    }
  }

  try {
    const lookbookId = await createLookbook(auth.supabase, {
      title,
      description:
        asString(payload?.description) ||
        `Imported from supplier shop URL.\n\nTODO: implement automatic shop scan -> populate items.\n\nInternal URL: ${shopUrl}`,
      supplier_id: supplierId,
      curated_for_customer_id: curatedForCustomerId,
      created_by: auth.user.id,
    });

    const productUrls: string[] = Array.isArray(payload?.product_urls)
      ? payload.product_urls
          .map((u: unknown) => asString(u))
          .filter(Boolean)
          .slice(0, 200)
      : [];

    let createdItemCount = 0;
    if (productUrls.length > 0) {
      const rows = productUrls.map((u, idx) => ({
        lookbook_id: lookbookId,
        title: u,
        source_url: u,
        position: idx,
        raw_preview_json: { source_url: u },
        exposed_to_customer: false,
      }));
      const { error } = await auth.supabase.from("b2b_supplier_lookbook_items").insert(rows);
      if (!error) createdItemCount = rows.length;
    }

    await logActivity(auth.supabase, {
      entity_type: "lookbook",
      entity_id: lookbookId,
      action: "lookbook.shop_scan_import",
      diff: { supplier_shop_url: shopUrl, created_item_count: createdItemCount },
      created_by: auth.user.id,
    });

    return NextResponse.json(
      {
        ok: true,
        id: lookbookId,
        created_item_count: createdItemCount,
        todo: "TODO: replace the placeholder shop scan with the real scraper integration.",
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to create lookbook." },
      { status: 500 }
    );
  }
}

