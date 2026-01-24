import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

const PRODUCT_META_NAMESPACES = ["product_global", "product.global"];

function getAdminClient() {
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
}

const extractTextValue = (row: Record<string, unknown>) => {
  if (row.value_text) return String(row.value_text);
  if (row.value_number !== null && row.value_number !== undefined) {
    return String(row.value_number);
  }
  if (typeof row.value === "string") return row.value;
  if (row.value_json !== null && row.value_json !== undefined) {
    return JSON.stringify(row.value_json);
  }
  if (row.value != null) return JSON.stringify(row.value);
  return null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  if (!settings?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing order id." }, { status: 400 });
  }

  const { data: order, error: orderError } = await adminClient
    .from("orders_global")
    .select(
      "sales_channel_id,order_number,sales_channel_name,customer_name,customer_address,customer_zip,customer_city,customer_phone,customer_email,transaction_date,date_shipped"
    )
    .eq("id", id)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  const { data: items, error: itemsError } = await adminClient
    .from("order_items_global")
    .select(
      "id,sku,quantity,sales_value_eur,transaction_date,date_shipped,marketplace_order_number,sales_channel_order_number"
    )
    .eq("order_id", id)
    .order("sku", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const { data: trackingRows, error: trackingError } = await adminClient
    .from("order_tracking_numbers_global")
    .select("tracking_number")
    .eq("order_id", id);

  if (trackingError) {
    return NextResponse.json({ error: trackingError.message }, { status: 500 });
  }

  const trackingNumbers = Array.from(
    new Set((trackingRows ?? []).map((row) => row.tracking_number).filter(Boolean))
  );

  const skus = Array.from(
    new Set((items ?? []).map((item) => item.sku).filter(Boolean))
  ) as string[];

  const skuToProduct = new Map<string, { title: string | null; spu: string | null }>();

  if (skus.length > 0) {
    const { data: variants } = await adminClient
      .from("catalog_variants")
      .select("sku, product_id")
      .in("sku", skus);

    const productIds = Array.from(
      new Set((variants ?? []).map((variant) => variant.product_id).filter(Boolean))
    ) as string[];

    if (productIds.length > 0) {
      const shortTitleByProduct = new Map<string, string>();
      const { data: metaDefs } = await adminClient
        .from("metafield_definitions")
        .select("id, namespace, key")
        .eq("resource", "catalog_product")
        .eq("key", "short_title")
        .in("namespace", PRODUCT_META_NAMESPACES);

      const defMap = new Map(metaDefs?.map((def) => [def.id, def]) ?? []);
      const defIds = Array.from(defMap.keys());

      if (defIds.length > 0) {
        const { data: metaValues } = await adminClient
          .from("metafield_values")
          .select("definition_id, target_id, value_text, value, value_number, value_json")
          .eq("target_type", "product")
          .in("definition_id", defIds)
          .in("target_id", productIds);

        const byProduct = new Map<string, Map<string, string>>();
        metaValues?.forEach((row) => {
          const def = defMap.get(row.definition_id);
          if (!def || !row.target_id) return;
          const text = extractTextValue(row);
          if (!text) return;
          const productId = String(row.target_id);
          const byNamespace = byProduct.get(productId) ?? new Map<string, string>();
          byNamespace.set(def.namespace ?? "", text);
          byProduct.set(productId, byNamespace);
        });

        byProduct.forEach((namespaces, productId) => {
          for (const namespace of PRODUCT_META_NAMESPACES) {
            const value = namespaces.get(namespace);
            if (value) {
              shortTitleByProduct.set(productId, value);
              break;
            }
          }
        });
      }

      const { data: products } = await adminClient
        .from("catalog_products")
        .select("id,title,spu")
        .in("id", productIds);

      const productMap = new Map<string, { title: string | null; spu: string | null }>();
      (products ?? []).forEach((product) => {
        if (!product.id) return;
        const shortTitle = shortTitleByProduct.get(String(product.id)) ?? null;
        productMap.set(product.id, {
          title: shortTitle || product.title || null,
          spu: product.spu ?? null,
        });
      });

      (variants ?? []).forEach((variant) => {
        if (!variant.sku || !variant.product_id) return;
        const product = productMap.get(variant.product_id);
        if (product) {
          skuToProduct.set(variant.sku, product);
        }
      });
    }
  }

  const enrichedItems = (items ?? []).map((item) => {
    const product = item.sku ? skuToProduct.get(item.sku) : null;
    return {
      ...item,
      product_title: product?.title ?? null,
      product_spu: product?.spu ?? null,
    };
  });

  return NextResponse.json({
    order,
    items: enrichedItems,
    tracking_numbers: trackingNumbers,
  });
}
