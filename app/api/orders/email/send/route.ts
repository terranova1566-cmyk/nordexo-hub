import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth-admin";
import { collectMacros, renderTemplate, stripHtml } from "@/lib/email-templates";
import { sanitizeEmailHtml } from "@/lib/email-html";
import {
  appendSignatureToEmailHtml,
  appendSignatureToEmailText,
  listEmailSenderSignatures,
} from "@/lib/email-sender-signatures";
import {
  listEmailMacroDefinitions,
  resolveTemplateMacros,
} from "@/lib/email-macro-registry";
import { formatOrderContentList } from "@/lib/orders/content-list";
import {
  buildOrderEmailMacroVariables,
  resolvePreferredOrderIdFromItems,
} from "@/lib/orders/email-macros";
import { appendSendLog, sendRenderedEmail } from "@/lib/sendpulse";

export const runtime = "nodejs";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRODUCT_META_NAMESPACES = ["product_global", "product.global"];
const BATCH_PREVIEW_BCC_EMAIL = "terranova_sh@hotmail.com";
const ORDER_EMAIL_PARTNER_RECEIVERS = {
  letsdeal_se: {
    name: "LetsDeal SE",
    email: "support@letsdeal.se",
  },
  letsdeal_no: {
    name: "LetsDeal NO",
    email: "support@letsdeal.no",
  },
  letsdeal_sc: {
    name: "LetsDeal SE",
    email: "support@letsdeal.se",
  },
  letsdeal_nordexo: {
    name: "LetsDeal NO",
    email: "support@letsdeal.no",
  },
} as const;

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
  sales_channel_order_number?: string | null;
  marketplace_order_number?: string | null;
  product_title?: string | null;
  raw_row?: unknown;
};

type OrderTrackingRow = {
  order_id: string | null;
  tracking_number: string | null;
  sent_date?: string | null;
  created_at?: string | null;
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

const normalizeOrderIdKey = (value: unknown) => String(value ?? "").trim();

const compareIsoDateTimeDesc = (leftRaw: unknown, rightRaw: unknown) => {
  const left = String(leftRaw ?? "").trim();
  const right = String(rightRaw ?? "").trim();
  if (left && right) {
    if (left > right) return -1;
    if (left < right) return 1;
    return 0;
  }
  if (left) return -1;
  if (right) return 1;
  return 0;
};

const extractProviderMessageId = (value: unknown): string | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const directId = String(record.id ?? "").trim();
  if (directId) return directId;
  const resultValue = record.result;
  if (resultValue && typeof resultValue === "object") {
    const nestedId = String((resultValue as Record<string, unknown>).id ?? "").trim();
    if (nestedId) return nestedId;
  }
  return null;
};

type OrdersNotificationColumnFlags = {
  latestNotificationName: boolean;
  latestNotificationSentAt: boolean;
};

async function getOrdersNotificationColumnFlags(
  supabase: SupabaseClient
): Promise<OrdersNotificationColumnFlags> {
  const { data, error } = await supabase
    .from("_introspect_columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "orders_global")
    .in("column_name", [
      "latest_notification_name",
      "latest_notification_sent_at",
    ]);

  if (error) {
    return {
      latestNotificationName: false,
      latestNotificationSentAt: false,
    };
  }

  const columnNames = new Set(
    ((data ?? []) as Array<{ column_name?: unknown }>)
      .map((row) => String(row.column_name ?? "").trim())
      .filter(Boolean)
  );

  return {
    latestNotificationName: columnNames.has("latest_notification_name"),
    latestNotificationSentAt: columnNames.has("latest_notification_sent_at"),
  };
}

async function hasTrackingSentDateColumn(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("_introspect_columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "order_tracking_numbers_global")
    .eq("column_name", "sent_date")
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
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
    .select("id,title,legacy_title_sv")
    .in("id", productIds)) as {
    data: Array<{
      id?: string | null;
      title?: string | null;
      legacy_title_sv?: string | null;
    }> | null;
    error: { message?: string } | null;
  };
  if (productsError || !products?.length) return skuTitleMap;

  const productTitleById = new Map<string, string>();
  products.forEach((product) => {
    const productId = String(product.id ?? "").trim();
    if (!productId) return;
    const shortTitle = shortTitleByProduct.get(productId);
    const resolvedTitle = String(
      shortTitle ?? product.legacy_title_sv ?? product.title ?? ""
    ).trim();
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
  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

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
  const partnerReceiverKey = String(
    payload.partnerReceiverKey ?? payload.partner_receiver_key ?? ""
  )
    .trim()
    .toLowerCase();
  const partnerReceiver =
    ORDER_EMAIL_PARTNER_RECEIVERS[
      partnerReceiverKey as keyof typeof ORDER_EMAIL_PARTNER_RECEIVERS
    ] ?? null;
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
  if (!partnerReceiver) {
    return NextResponse.json(
      { error: "A partner receiver is required." },
      { status: 400 }
    );
  }
  if (!emailRegex.test(String(partnerReceiver.email ?? "").trim())) {
    return NextResponse.json(
      { error: "Configured partner receiver email is invalid." },
      { status: 500 }
    );
  }

  const { data: template, error: templateError } = await adminClient
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

  const { data: orderRows, error: ordersError } = await adminClient
    .from("orders_global")
    .select(
      "id,order_number,transaction_date,date_shipped,customer_name,customer_email,sales_channel_name,sales_channel_id,status"
    )
    .in("id", ids);

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  const { data: itemRows, error: orderItemsError } = await adminClient
    .from("order_items_global")
    .select(
      "order_id,quantity,sku,raw_row,sales_channel_order_number,marketplace_order_number"
    )
    .in("order_id", ids);

  if (orderItemsError) {
    return NextResponse.json({ error: orderItemsError.message }, { status: 500 });
  }

  const includeTrackingSentDate = await hasTrackingSentDateColumn(adminClient);
  let trackingRows: OrderTrackingRow[] = [];
  if (includeTrackingSentDate) {
    const { data, error } = await adminClient
      .from("order_tracking_numbers_global")
      .select("order_id,tracking_number,sent_date,created_at")
      .in("order_id", ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    trackingRows = (data ?? []) as OrderTrackingRow[];
  } else {
    const { data, error } = await adminClient
      .from("order_tracking_numbers_global")
      .select("order_id,tracking_number,created_at")
      .in("order_id", ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    trackingRows = (data ?? []) as OrderTrackingRow[];
  }

  const skuToProductTitle = await buildSkuToProductTitleMap(
    adminClient,
    (itemRows ?? []).map((row) => String((row as { sku?: unknown }).sku ?? ""))
  );

  const orderMap = new Map<string, OrderEmailRow>();
  (orderRows ?? []).forEach((row) => {
    const typed = row as unknown as OrderEmailRow;
    const orderId = normalizeOrderIdKey((row as { id?: unknown }).id);
    if (!orderId) return;
    orderMap.set(orderId, { ...typed, id: orderId });
  });

  const orderItemMap = new Map<string, OrderEmailItemRow[]>();
  (itemRows ?? []).forEach((row) => {
    const typed = row as unknown as OrderEmailItemRow;
    const orderId = normalizeOrderIdKey((row as { order_id?: unknown }).order_id);
    if (!orderId) return;
    const entries = orderItemMap.get(orderId) ?? [];
    entries.push({ ...typed, order_id: orderId });
    orderItemMap.set(orderId, entries);
  });

  const groupedTrackingRows = new Map<string, OrderTrackingRow[]>();
  (trackingRows ?? []).forEach((row) => {
    const orderId = normalizeOrderIdKey(row.order_id);
    const trackingNumber = String(row.tracking_number ?? "").trim();
    if (!orderId || !trackingNumber) return;
    const entries = groupedTrackingRows.get(orderId) ?? [];
    entries.push({
      ...row,
      order_id: orderId,
      tracking_number: trackingNumber,
    });
    groupedTrackingRows.set(orderId, entries);
  });

  const trackingNumberByOrderId = new Map<string, string>();
  groupedTrackingRows.forEach((entries, orderId) => {
    if (entries.length === 0) return;
    const sorted = [...entries].sort((left, right) => {
      const sentDateCompare = compareIsoDateTimeDesc(
        left.sent_date,
        right.sent_date
      );
      if (sentDateCompare !== 0) return sentDateCompare;
      const createdAtCompare = compareIsoDateTimeDesc(
        left.created_at,
        right.created_at
      );
      if (createdAtCompare !== 0) return createdAtCompare;
      return String(left.tracking_number ?? "").localeCompare(
        String(right.tracking_number ?? "")
      );
    });
    const primary = String(sorted[0]?.tracking_number ?? "").trim();
    if (!primary) return;
    trackingNumberByOrderId.set(orderId, primary);
  });

  const { macros: macroDefinitions } = await listEmailMacroDefinitions(adminClient, {
    includeInactive: true,
    includeDeprecated: true,
  });
  let senderSignatureText = "";
  try {
    const { signatures: senderSignatures } = await listEmailSenderSignatures(
      adminClient,
      { emails: [senderEmail] }
    );
    senderSignatureText = senderSignatures[0]?.signatureText ?? "";
  } catch {
    senderSignatureText = "";
  }
  const notificationColumns = await getOrdersNotificationColumnFlags(adminClient);
  const notificationName =
    String(template.name ?? "").trim() || "Notification sent";
  const notificationSentAt = new Date().toISOString();

  const results: Array<{
    order_id: string;
    order_number: string | null;
    customer_email: string | null;
    receiver_email: string | null;
    status: "sent" | "failed";
    latest_notification_name?: string | null;
    latest_notification_sent_at?: string | null;
    error?: string;
    unknown_macros?: string[];
    deprecated_macros?: string[];
    missing_macros?: string[];
  }> = [];
  let previewBccPending = true;

  for (const orderId of ids) {
    const order = orderMap.get(orderId);
    if (!order) {
      results.push({
        order_id: orderId,
        order_number: null,
        customer_email: null,
        receiver_email: String(partnerReceiver.email ?? "").trim() || null,
        status: "failed",
        error: "Order not found.",
      });
      continue;
    }

    const recipientEmail = String(partnerReceiver.email ?? "").trim();

    const orderItems = orderItemMap.get(order.id) ?? [];
    const preferredOrderId = resolvePreferredOrderIdFromItems(orderItems);
    const trackingNumber = trackingNumberByOrderId.get(order.id) ?? "";
    const orderContentList = formatOrderContentList(
      orderItems.map((item) => ({
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
      preferred_order_id: preferredOrderId,
      order_content_list: orderContentList,
      tracking_number: trackingNumber,
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
        receiver_email: recipientEmail,
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
    const renderedBodyWithSignature = sanitizeEmailHtml(
      appendSignatureToEmailHtml(renderedBody, senderSignatureText)
    );
    const renderedTextWithSignature = appendSignatureToEmailText(
      stripHtml(renderedBody),
      senderSignatureText
    );

    if (!renderedSubject) {
      results.push({
        order_id: order.id,
        order_number: order.order_number ?? null,
        customer_email: order.customer_email ?? null,
        receiver_email: recipientEmail,
        status: "failed",
        error: "Rendered subject is empty.",
      });
      continue;
    }

    let sendStatus: "sent" | "failed" = "sent";
    let sendError: string | null = null;
    let sendResponse: unknown = null;
    const resolvedBccEmails = Array.from(
      new Set(
        previewBccPending
          ? [...bccEmails, BATCH_PREVIEW_BCC_EMAIL]
          : [...bccEmails]
      )
    );
    try {
      sendResponse = await sendRenderedEmail({
        subject: renderedSubject,
        senderEmail,
        senderName,
        recipients: [
          {
            email: recipientEmail,
            name: partnerReceiver.name || undefined,
          },
        ],
        bcc: resolvedBccEmails.map((email) => ({ email })),
        html: renderedBodyWithSignature,
        text: renderedTextWithSignature,
      });
    } catch (error) {
      sendStatus = "failed";
      sendError = (error as Error).message || "Unable to send email via SendPulse.";
    }
    if (sendStatus === "sent") {
      previewBccPending = false;
    }

    const providerMessageId = extractProviderMessageId(sendResponse);
    const logEntry = {
      user_id: auth.userId,
      order_id: order.id,
      sender_email: senderEmail,
      sender_name: senderName,
      template_id: templateId,
      subject: renderedSubject,
      to_emails: [recipientEmail],
      recipient_email: recipientEmail,
      variables: {
        ...renderVariables,
        partner_receiver_key: partnerReceiverKey,
        partner_receiver_name: partnerReceiver.name,
        partner_receiver_email: recipientEmail,
        bcc_emails: resolvedBccEmails,
      },
      status: sendStatus,
      provider_message_id: providerMessageId,
      send_date: sendStatus === "sent" ? notificationSentAt : null,
      notification_name: sendStatus === "sent" ? notificationName : null,
      response: sendResponse,
      error: sendError,
    };

    try {
      await adminClient.from("sendpulse_email_logs").insert(logEntry);
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
      receiver_email: recipientEmail,
      status: sendStatus,
      latest_notification_name:
        sendStatus === "sent" ? notificationName : null,
      latest_notification_sent_at:
        sendStatus === "sent" ? notificationSentAt : null,
      error: sendError ?? undefined,
      unknown_macros: macroResolution.unknownMacros,
      deprecated_macros: macroResolution.deprecatedMacros,
    });
  }

  const sentOrderIds = results
    .filter((item) => item.status === "sent")
    .map((item) => normalizeOrderIdKey(item.order_id))
    .filter(Boolean);

  const notificationUpdatePayload: Record<string, unknown> = {};
  if (notificationColumns.latestNotificationName) {
    notificationUpdatePayload.latest_notification_name = notificationName;
  }
  if (notificationColumns.latestNotificationSentAt) {
    notificationUpdatePayload.latest_notification_sent_at = notificationSentAt;
  }

  let notificationUpdatedOrderIds: string[] = [];
  let notificationUpdateErrorMessage: string | null = null;
  if (sentOrderIds.length > 0 && Object.keys(notificationUpdatePayload).length > 0) {
    const { data: updatedRows, error: updateNotificationError } = await adminClient
      .from("orders_global")
      .update(notificationUpdatePayload)
      .in("id", sentOrderIds)
      .select("id");

    if (updateNotificationError) {
      notificationUpdateErrorMessage =
        updateNotificationError.message || "Unable to update latest notification columns.";
    } else {
      notificationUpdatedOrderIds = ((updatedRows ?? []) as Array<{ id?: unknown }>)
        .map((row) => normalizeOrderIdKey(row.id))
        .filter(Boolean);
      if (notificationUpdatedOrderIds.length > 0) {
        const updatedIdSet = new Set(notificationUpdatedOrderIds);
        for (const item of results) {
          if (item.status !== "sent" || !updatedIdSet.has(item.order_id)) continue;
          item.latest_notification_name = notificationColumns.latestNotificationName
            ? notificationName
            : null;
          item.latest_notification_sent_at = notificationColumns.latestNotificationSentAt
            ? notificationSentAt
            : null;
        }
      }
    }
  }

  const sentCount = results.filter((item) => item.status === "sent").length;
  const failedCount = results.length - sentCount;

  return NextResponse.json({
    ok: failedCount === 0,
    processed_count: results.length,
    sent_count: sentCount,
    failed_count: failedCount,
    notification_name: notificationName,
    notification_sent_at: notificationSentAt,
    partner_receiver_key: partnerReceiverKey,
    partner_receiver_email: partnerReceiver.email,
    notification_updated_ids: notificationUpdatedOrderIds,
    notification_update_error: notificationUpdateErrorMessage,
    results,
  });
}
