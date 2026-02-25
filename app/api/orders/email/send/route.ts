import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth-admin";
import { collectMacros, renderTemplate, stripHtml } from "@/lib/email-templates";
import { sanitizeEmailHtml } from "@/lib/email-html";
import {
  listEmailMacroDefinitions,
  resolveTemplateMacros,
} from "@/lib/email-macro-registry";
import { formatOrderContentList } from "@/lib/orders/content-list";
import { buildOrderEmailMacroVariables } from "@/lib/orders/email-macros";
import { appendSendLog, sendRenderedEmail } from "@/lib/sendpulse";

export const runtime = "nodejs";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRODUCT_META_NAMESPACES = ["product_global", "product.global"];

type OrderEmailRow = {
  id: string;
  order_number: string | null;
  transaction_date: string | null;
  date_shipped: string | null;
  customer_name: string | null;
  customer_email: string | null;
  sales_channel_name: string | null;
  sales_channel_id: string | null;
  status: string | null;
};

type OrderEmailItemRow = {
  order_id: string | null;
  quantity: number | null;
  sku: string | null;
  product_title?: string | null;
  raw_row?: unknown;
};

const parseEmailList = (value: unknown) => {
  const values: string[] = Array.isArray(value)
    ? value.map((entry) => String(entry ?? ""))
    : String(value ?? "").split(/[\s,;]+/);
  return Array.from(
    new Set(
      values.map((entry) => entry.trim()).filter((entry) => emailRegex.test(entry))
    )
  );
};

const parseMacroList = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => String(entry ?? "").trim())
            .filter(Boolean)
        )
      )
    : [];

const normalizeSkuKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

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

async function buildSkuToProductTitleMap(
  supabase: SupabaseClient,
  skus: string[]
) {
  const skuTitleMap = new Map<string, string>();
  const uniqueSkus = Array.from(
    new Set(skus.map((sku) => String(sku ?? "").trim()).filter(Boolean))
  );
  if (uniqueSkus.length === 0) return skuTitleMap;

  const { data: variants, error: variantsError } = (await supabase
    .from("catalog_variants")
    .select("sku, product_id")
    .in("sku", uniqueSkus)) as {
    data: Array<{ sku?: string | null; product_id?: string | null }> | null;
    error: { message?: string } | null;
  };
  if (variantsError || !variants?.length) return skuTitleMap;

  const productIds = Array.from(
    new Set(
      variants
        .map((variant) => String(variant.product_id ?? "").trim())
        .filter(Boolean)
    )
  );
  if (productIds.length === 0) return skuTitleMap;

  const shortTitleByProduct = new Map<string, string>();
  const { data: metaDefs, error: metaDefsError } = (await supabase
    .from("metafield_definitions")
    .select("id, namespace, key")
    .eq("resource", "catalog_product")
    .eq("key", "short_title")
    .in("namespace", PRODUCT_META_NAMESPACES)) as {
    data:
      | Array<{ id?: string | null; namespace?: string | null; key?: string | null }>
      | null;
    error: { message?: string } | null;
  };
  if (!metaDefsError && metaDefs?.length) {
    const defMap = new Map(metaDefs.map((def) => [String(def.id ?? ""), def]));
    const defIds = Array.from(defMap.keys()).filter(Boolean);

    if (defIds.length > 0) {
      const { data: metaValues, error: metaValuesError } = (await supabase
        .from("metafield_values")
        .select("definition_id, target_id, value_text, value, value_number, value_json")
        .eq("target_type", "product")
        .in("definition_id", defIds)
        .in("target_id", productIds)) as {
        data:
          | Array<{
              definition_id?: string | null;
              target_id?: string | null;
              value_text?: unknown;
              value?: unknown;
              value_number?: unknown;
              value_json?: unknown;
            }>
          | null;
        error: { message?: string } | null;
      };

      if (!metaValuesError && metaValues?.length) {
        const byProduct = new Map<string, Map<string, string>>();
        metaValues.forEach((row) => {
          const definitionId = String(row.definition_id ?? "");
          const def = defMap.get(definitionId);
          if (!def || !row.target_id) return;
          const text = extractTextValue(row as Record<string, unknown>);
          if (!text) return;
          const productId = String(row.target_id);
          const byNamespace = byProduct.get(productId) ?? new Map<string, string>();
          byNamespace.set(String(def.namespace ?? ""), text);
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
    }
  }

  const { data: products, error: productsError } = (await supabase
    .from("catalog_products")
    .select("id,title")
    .in("id", productIds)) as {
    data: Array<{ id?: string | null; title?: string | null }> | null;
    error: { message?: string } | null;
  };
  if (productsError || !products?.length) return skuTitleMap;

  const productTitleById = new Map<string, string>();
  products.forEach((product) => {
    const productId = String(product.id ?? "").trim();
    if (!productId) return;
    const shortTitle = shortTitleByProduct.get(productId);
    const resolvedTitle = String(shortTitle ?? product.title ?? "").trim();
    if (!resolvedTitle) return;
    productTitleById.set(productId, resolvedTitle);
  });

  variants.forEach((variant) => {
    const sku = normalizeSkuKey(variant.sku);
    const productId = String(variant.product_id ?? "").trim();
    if (!sku || !productId) return;
    const title = productTitleById.get(productId);
    if (!title) return;
    skuTitleMap.set(sku, title);
  });

  return skuTitleMap;
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const ids = Array.isArray(payload.ids)
    ? Array.from(
        new Set(
          payload.ids.map((entry) => String(entry ?? "").trim()).filter(Boolean)
        )
      )
    : [];
  const templateId = String(payload.templateId ?? "").trim();
  const senderEmail = String(payload.senderEmail ?? "").trim();
  const senderName = String(payload.senderName ?? "").trim() || null;
  const bccEmails = parseEmailList(payload.bccEmails);
  const providedMacros = parseMacroList(payload.macros);
  const hasSubjectTemplateOverride =
    Object.prototype.hasOwnProperty.call(payload, "subjectTemplate") ||
    Object.prototype.hasOwnProperty.call(payload, "subject_template");
  const hasBodyTemplateOverride =
    Object.prototype.hasOwnProperty.call(payload, "bodyTemplate") ||
    Object.prototype.hasOwnProperty.call(payload, "body_template");

  if (ids.length === 0) {
    return NextResponse.json({ error: "No orders selected." }, { status: 400 });
  }
  if (!templateId) {
    return NextResponse.json({ error: "Template is required." }, { status: 400 });
  }
  if (!senderEmail || !emailRegex.test(senderEmail)) {
    return NextResponse.json({ error: "A valid sender email is required." }, { status: 400 });
  }

  const { data: template, error: templateError } = await auth.supabase
    .from("partner_email_templates")
    .select("template_id,name,subject_template,body_template,macros")
    .eq("template_id", templateId)
    .maybeSingle();

  if (templateError) {
    return NextResponse.json({ error: templateError.message }, { status: 500 });
  }
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const subjectTemplate = hasSubjectTemplateOverride
    ? String(payload.subjectTemplate ?? payload.subject_template ?? "")
    : String(template.subject_template ?? "");
  const bodyTemplate = hasBodyTemplateOverride
    ? sanitizeEmailHtml(String(payload.bodyTemplate ?? payload.body_template ?? ""))
    : sanitizeEmailHtml(String(template.body_template ?? ""));
  const effectiveMacros = Array.from(
    new Set([
      ...providedMacros,
      ...(Array.isArray(template.macros) ? template.macros : []),
      ...collectMacros(`${subjectTemplate}\n${bodyTemplate}`),
    ])
  );

  const { data: orderRows, error: ordersError } = await auth.supabase
    .from("orders_global")
    .select(
      "id,order_number,transaction_date,date_shipped,customer_name,customer_email,sales_channel_name,sales_channel_id,status"
    )
    .in("id", ids);

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  const { data: itemRows, error: orderItemsError } = await auth.supabase
    .from("order_items_global")
    .select("order_id,quantity,sku,raw_row")
    .in("order_id", ids);

  if (orderItemsError) {
    return NextResponse.json({ error: orderItemsError.message }, { status: 500 });
  }

  const skuToProductTitle = await buildSkuToProductTitleMap(
    auth.supabase,
    (itemRows ?? []).map((row) => String((row as { sku?: unknown }).sku ?? ""))
  );

  const orderMap = new Map<string, OrderEmailRow>();
  (orderRows ?? []).forEach((row) => {
    const typed = row as unknown as OrderEmailRow;
    if (!typed.id) return;
    orderMap.set(typed.id, typed);
  });

  const orderItemMap = new Map<string, OrderEmailItemRow[]>();
  (itemRows ?? []).forEach((row) => {
    const typed = row as unknown as OrderEmailItemRow;
    if (!typed.order_id) return;
    const entries = orderItemMap.get(typed.order_id) ?? [];
    entries.push(typed);
    orderItemMap.set(typed.order_id, entries);
  });

  const { macros: macroDefinitions } = await listEmailMacroDefinitions(auth.supabase, {
    includeInactive: true,
    includeDeprecated: true,
  });

  const results: Array<{
    order_id: string;
    order_number: string | null;
    customer_email: string | null;
    status: "sent" | "failed";
    error?: string;
    unknown_macros?: string[];
    deprecated_macros?: string[];
    missing_macros?: string[];
  }> = [];

  for (const orderId of ids) {
    const order = orderMap.get(orderId);
    if (!order) {
      results.push({
        order_id: orderId,
        order_number: null,
        customer_email: null,
        status: "failed",
        error: "Order not found.",
      });
      continue;
    }

    const recipientEmail = String(order.customer_email ?? "").trim();
    if (!emailRegex.test(recipientEmail)) {
      results.push({
        order_id: order.id,
        order_number: order.order_number ?? null,
        customer_email: order.customer_email ?? null,
        status: "failed",
        error: "Order is missing a valid customer email.",
      });
      continue;
    }

    const orderContentList = formatOrderContentList(
      (orderItemMap.get(order.id) ?? []).map((item) => ({
        quantity: item.quantity,
        product_title:
          String(item.product_title ?? "").trim() ||
          skuToProductTitle.get(normalizeSkuKey(item.sku)) ||
          null,
        sku: item.sku,
        raw_row: item.raw_row,
      }))
    );
    const variables = buildOrderEmailMacroVariables({
      ...order,
      order_content_list: orderContentList,
    });
    const macroResolution = resolveTemplateMacros({
      subjectTemplate,
      bodyTemplate,
      existingMacros: effectiveMacros,
      definitions: macroDefinitions,
      variables,
      context: { order: variables },
    });

    if (macroResolution.missingRequiredMacros.length > 0) {
      results.push({
        order_id: order.id,
        order_number: order.order_number ?? null,
        customer_email: order.customer_email ?? null,
        status: "failed",
        error: "Missing required macro values.",
        unknown_macros: macroResolution.unknownMacros,
        deprecated_macros: macroResolution.deprecatedMacros,
        missing_macros: macroResolution.missingRequiredMacros,
      });
      continue;
    }

    const renderVariables: Record<string, string> = {
      ...variables,
      ...macroResolution.values,
    };
    const renderedSubject = renderTemplate(subjectTemplate, renderVariables).trim();
    const renderedBody = sanitizeEmailHtml(
      renderTemplate(bodyTemplate, renderVariables)
    );

    if (!renderedSubject) {
      results.push({
        order_id: order.id,
        order_number: order.order_number ?? null,
        customer_email: order.customer_email ?? null,
        status: "failed",
        error: "Rendered subject is empty.",
      });
      continue;
    }

    let sendStatus: "sent" | "failed" = "sent";
    let sendError: string | null = null;
    let sendResponse: unknown = null;
    try {
      sendResponse = await sendRenderedEmail({
        subject: renderedSubject,
        senderEmail,
        senderName,
        recipients: [
          {
            email: recipientEmail,
            name: variables.customer_name || undefined,
          },
        ],
        bcc: bccEmails.map((email) => ({ email })),
        html: renderedBody,
        text: stripHtml(renderedBody),
      });
    } catch (error) {
      sendStatus = "failed";
      sendError = (error as Error).message || "Unable to send email via SendPulse.";
    }

    const logEntry = {
      user_id: auth.userId,
      sender_email: senderEmail,
      sender_name: senderName,
      template_id: templateId,
      subject: renderedSubject,
      to_emails: [recipientEmail],
      variables: {
        ...renderVariables,
        bcc_emails: bccEmails,
      },
      status: sendStatus,
      response: sendResponse,
      error: sendError,
    };

    try {
      await auth.supabase.from("sendpulse_email_logs").insert(logEntry);
    } catch {
      await appendSendLog({
        ...logEntry,
        created_at: new Date().toISOString(),
      });
    }

    results.push({
      order_id: order.id,
      order_number: order.order_number ?? null,
      customer_email: order.customer_email ?? null,
      status: sendStatus,
      error: sendError ?? undefined,
      unknown_macros: macroResolution.unknownMacros,
      deprecated_macros: macroResolution.deprecatedMacros,
    });
  }

  const sentCount = results.filter((item) => item.status === "sent").length;
  const failedCount = results.length - sentCount;

  return NextResponse.json({
    ok: failedCount === 0,
    processed_count: results.length,
    sent_count: sentCount,
    failed_count: failedCount,
    results,
  });
}
