#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_DAYS = 7;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 40;

const htmlEntityMap = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
  "&ouml;": "ö",
  "&aring;": "å",
  "&auml;": "ä",
  "&Ouml;": "Ö",
  "&Aring;": "Å",
  "&Auml;": "Ä",
  "&eacute;": "é",
  "&Eacute;": "É",
};

const getArgValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
};

const hasFlag = (name) => process.argv.includes(name);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    if (!line || line.trim().startsWith("#")) return;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) return;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) return;
    process.env[key] = value;
  });
}

function decodeHtmlEntities(value) {
  let output = String(value ?? "");
  output = output.replace(/&#(\d+);/g, (_, code) => {
    const numeric = Number(code);
    if (!Number.isFinite(numeric)) return _;
    return String.fromCodePoint(numeric);
  });
  Object.entries(htmlEntityMap).forEach(([entity, text]) => {
    output = output.split(entity).join(text);
  });
  return output.replace(/\s+/g, " ").trim();
}

function normalizeEmail(value) {
  const token = String(value ?? "").trim().toLowerCase();
  return token || null;
}

function normalizeText(value) {
  const token = String(value ?? "").trim();
  return token || null;
}

function normalizeMarketplaceOrderNumber(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const divider = raw.indexOf(" - ");
  if (divider === -1) return raw;
  const left = raw.slice(0, divider).trim();
  return left || raw;
}

function normalizeReference(value) {
  const token = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  return token.length >= 4 ? token : null;
}

function parseSendDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }
  const normalized = raw.replace(" ", "T");
  const withZone = normalized.endsWith("Z") ? normalized : `${normalized}Z`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toTimestamp(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

async function fetchSendpulseToken(clientId, clientSecret) {
  const response = await fetch("https://api.sendpulse.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Unable to fetch SendPulse token.");
  }
  const payload = await response.json();
  const token = String(payload?.access_token ?? "").trim();
  if (!token) {
    throw new Error("SendPulse token response was empty.");
  }
  return token;
}

async function fetchSendpulseEmails({ token, pageSize, maxPages, sinceDate }) {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const endpoint = `https://api.sendpulse.com/smtp/emails?limit=${pageSize}&offset=${offset}`;
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Unable to load SendPulse email history.");
    }
    const payload = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) break;

    rows.push(...payload);
    const oldest = payload[payload.length - 1];
    const oldestDate = parseSendDate(oldest?.send_date);
    if (oldestDate && oldestDate < sinceDate) {
      break;
    }
    if (payload.length < pageSize) break;
  }
  return rows;
}

function chunkArray(items, size) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const chunkSize = Math.max(1, Math.floor(size));
  const output = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    output.push(items.slice(index, index + chunkSize));
  }
  return output;
}

function buildOrderMatcher(orders, orderItems) {
  const byId = new Map();
  const byEmail = new Map();

  (orders ?? []).forEach((order) => {
    const id = normalizeText(order.id);
    if (!id) return;
    const email = normalizeEmail(order.customer_email);
    const transactionDate = normalizeText(order.transaction_date);
    const identifiers = new Set();
    const internalOrderId = normalizeReference(id);
    if (internalOrderId) identifiers.add(internalOrderId);
    const orderNumber = normalizeReference(order.order_number);
    if (orderNumber) identifiers.add(orderNumber);
    byId.set(id, {
      id,
      email,
      transactionDate,
      identifiers,
      latestNotificationSentAt: normalizeText(order.latest_notification_sent_at),
    });
  });

  (orderItems ?? []).forEach((item) => {
    const orderId = normalizeText(item.order_id);
    if (!orderId) return;
    const order = byId.get(orderId);
    if (!order) return;
    const salesChannelOrder = normalizeReference(item.sales_channel_order_number);
    if (salesChannelOrder) order.identifiers.add(salesChannelOrder);
    const marketplaceOrder = normalizeReference(
      normalizeMarketplaceOrderNumber(item.marketplace_order_number)
    );
    if (marketplaceOrder) order.identifiers.add(marketplaceOrder);
  });

  byId.forEach((order) => {
    if (!order.email) return;
    const bucket = byEmail.get(order.email) ?? [];
    bucket.push(order);
    byEmail.set(order.email, bucket);
  });

  byEmail.forEach((bucket, email) => {
    bucket.sort((left, right) => {
      const leftDate = left.transactionDate ?? "";
      const rightDate = right.transactionDate ?? "";
      if (leftDate < rightDate) return 1;
      if (leftDate > rightDate) return -1;
      return right.id.localeCompare(left.id);
    });
    byEmail.set(email, bucket);
  });

  return { byId, byEmail };
}

function matchOrderForSendpulseEmail(historyRow, ordersByEmail) {
  const recipientEmail = normalizeEmail(historyRow?.recipient);
  if (!recipientEmail) {
    return { matchedOrderId: null, reason: "missing-recipient" };
  }
  const candidates = ordersByEmail.get(recipientEmail) ?? [];
  if (candidates.length === 0) {
    return { matchedOrderId: null, reason: "no-order-for-recipient" };
  }

  const decodedSubject = decodeHtmlEntities(historyRow?.subject);
  const subjectUpper = decodedSubject.toUpperCase();
  const identifierMatches = [];
  candidates.forEach((order) => {
    let longestMatchLength = 0;
    order.identifiers.forEach((identifier) => {
      if (subjectUpper.includes(identifier) && identifier.length > longestMatchLength) {
        longestMatchLength = identifier.length;
      }
    });
    if (longestMatchLength > 0) {
      identifierMatches.push({ orderId: order.id, longestMatchLength });
    }
  });

  if (identifierMatches.length === 1) {
    return { matchedOrderId: identifierMatches[0].orderId, reason: "identifier-match" };
  }
  if (identifierMatches.length > 1) {
    identifierMatches.sort((left, right) => {
      if (left.longestMatchLength !== right.longestMatchLength) {
        return right.longestMatchLength - left.longestMatchLength;
      }
      return left.orderId.localeCompare(right.orderId);
    });
    const [first, second] = identifierMatches;
    if (!second || first.longestMatchLength > second.longestMatchLength) {
      return { matchedOrderId: first.orderId, reason: "longest-identifier-match" };
    }
    return { matchedOrderId: null, reason: "ambiguous-identifier-match" };
  }

  if (candidates.length === 1) {
    return { matchedOrderId: candidates[0].id, reason: "single-order-for-recipient" };
  }

  return { matchedOrderId: null, reason: "ambiguous-recipient" };
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  loadEnvFile("/srv/shopify-sync/.env");

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  const sendpulseClientId = process.env.SENDPULSE_CLIENT_ID || process.env.SENDPULSE_ID || "";
  const sendpulseClientSecret =
    process.env.SENDPULSE_CLIENT_SECRET || process.env.SENDPULSE_SECRET || "";

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing Supabase credentials.");
  }
  if (!sendpulseClientId || !sendpulseClientSecret) {
    throw new Error("Missing SendPulse credentials.");
  }

  const dryRun = hasFlag("--dry-run");
  const daysRaw = Number(getArgValue("--days", DEFAULT_DAYS));
  const pageSizeRaw = Number(getArgValue("--page-size", DEFAULT_PAGE_SIZE));
  const maxPagesRaw = Number(getArgValue("--max-pages", DEFAULT_MAX_PAGES));
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.floor(daysRaw) : DEFAULT_DAYS;
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(200, pageSizeRaw) : DEFAULT_PAGE_SIZE;
  const maxPages =
    Number.isFinite(maxPagesRaw) && maxPagesRaw > 0 ? Math.floor(maxPagesRaw) : DEFAULT_MAX_PAGES;

  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = await fetchSendpulseToken(sendpulseClientId, sendpulseClientSecret);
  const rawSendpulseRows = await fetchSendpulseEmails({
    token,
    pageSize,
    maxPages,
    sinceDate,
  });

  const relevantSendpulseRows = rawSendpulseRows.filter((entry) => {
    const sendDate = parseSendDate(entry?.send_date);
    if (!sendDate) return false;
    return sendDate >= sinceDate;
  });

  const { data: orders, error: ordersError } = await supabase
    .from("orders_global")
    .select(
      "id,order_number,customer_email,transaction_date,latest_notification_sent_at"
    );
  if (ordersError) throw new Error(ordersError.message || "Unable to load orders.");

  const { data: orderItems, error: orderItemsError } = await supabase
    .from("order_items_global")
    .select("order_id,sales_channel_order_number,marketplace_order_number");
  if (orderItemsError) {
    throw new Error(orderItemsError.message || "Unable to load order identifiers.");
  }

  const { byId: ordersById, byEmail: ordersByEmail } = buildOrderMatcher(
    orders ?? [],
    orderItems ?? []
  );

  const providerIds = Array.from(
    new Set(
      relevantSendpulseRows
        .map((entry) => normalizeText(entry?.id))
        .filter((entry) => Boolean(entry))
    )
  );

  const existingLogByKey = new Map();
  for (const idChunk of chunkArray(providerIds, 400)) {
    const { data: existingRows, error: existingError } = await supabase
      .from("sendpulse_email_logs")
      .select("id,provider_message_id,recipient_email,order_id")
      .in("provider_message_id", idChunk);
    if (existingError) {
      throw new Error(
        existingError.message || "Unable to load existing sendpulse email logs."
      );
    }
    (existingRows ?? []).forEach((row) => {
      const providerId = normalizeText(row.provider_message_id);
      const recipientEmail = normalizeEmail(row.recipient_email);
      if (!providerId || !recipientEmail) return;
      existingLogByKey.set(`${providerId}|${recipientEmail}`, {
        id: normalizeText(row.id),
        orderId: normalizeText(row.order_id),
      });
    });
  }

  const rowsToInsert = [];
  const existingRowsToUpdate = [];
  const latestByOrderId = new Map();
  const matchStats = {
    total: relevantSendpulseRows.length,
    matched: 0,
    unmatched: 0,
    inserted: 0,
    skippedExisting: 0,
    reasons: {},
  };

  relevantSendpulseRows.forEach((row) => {
    const providerMessageId = normalizeText(row?.id);
    const recipientEmail = normalizeEmail(row?.recipient);
    const senderEmail = normalizeText(row?.sender);
    const sendDate = parseSendDate(row?.send_date);
    const subject = decodeHtmlEntities(row?.subject);
    if (!providerMessageId || !recipientEmail || !sendDate) {
      return;
    }

    const { matchedOrderId, reason } = matchOrderForSendpulseEmail(
      row,
      ordersByEmail
    );
    if (matchedOrderId) {
      matchStats.matched += 1;
    } else {
      matchStats.unmatched += 1;
    }
    matchStats.reasons[reason] = (matchStats.reasons[reason] ?? 0) + 1;

    const smtpAnswerCode = Number(row?.smtp_answer_code);
    const status = smtpAnswerCode === 250 ? "sent" : "failed";
    const notificationName = subject || "Notification sent";
    const dedupeKey = `${providerMessageId}|${recipientEmail}`;
    const existingLog = existingLogByKey.get(dedupeKey);
    if (existingLog) {
      matchStats.skippedExisting += 1;
      if (
        existingLog.id &&
        !existingLog.orderId &&
        matchedOrderId &&
        status === "sent"
      ) {
        existingRowsToUpdate.push({
          id: existingLog.id,
          orderId: matchedOrderId,
          notificationName,
          sendDate,
        });
      }
      if (status === "sent" && matchedOrderId) {
        const current = latestByOrderId.get(matchedOrderId);
        const currentStamp = normalizeText(current?.sendDate) ?? "";
        if (!current || currentStamp < sendDate) {
          latestByOrderId.set(matchedOrderId, {
            sendDate,
            notificationName,
          });
        }
      }
      return;
    }

    rowsToInsert.push({
      user_id: null,
      order_id: matchedOrderId,
      sender_email: senderEmail,
      sender_name: null,
      template_id: null,
      subject: subject || null,
      to_emails: [recipientEmail],
      recipient_email: recipientEmail,
      variables: {
        source: "sendpulse_backfill",
      },
      status,
      provider_message_id: providerMessageId,
      send_date: sendDate,
      notification_name: notificationName,
      response: row,
      error:
        status === "failed"
          ? normalizeText(row?.smtp_answer_data) ||
            normalizeText(row?.smtp_answer_code_explain)
          : null,
    });

    if (status === "sent" && matchedOrderId) {
      const current = latestByOrderId.get(matchedOrderId);
      const currentStamp = normalizeText(current?.sendDate) ?? "";
      if (!current || currentStamp < sendDate) {
        latestByOrderId.set(matchedOrderId, {
          sendDate,
          notificationName,
        });
      }
    }
  });

  if (!dryRun && rowsToInsert.length > 0) {
    for (const insertChunk of chunkArray(rowsToInsert, 200)) {
      const { error: insertError } = await supabase
        .from("sendpulse_email_logs")
        .insert(insertChunk);
      if (insertError) {
        throw new Error(insertError.message || "Unable to insert backfill logs.");
      }
      matchStats.inserted += insertChunk.length;
    }
  }

  let existingRowsLinked = 0;
  if (!dryRun && existingRowsToUpdate.length > 0) {
    for (const entry of existingRowsToUpdate) {
      const { error: updateExistingError } = await supabase
        .from("sendpulse_email_logs")
        .update({
          order_id: entry.orderId,
          notification_name: entry.notificationName,
          send_date: entry.sendDate,
        })
        .eq("id", entry.id);
      if (updateExistingError) {
        throw new Error(
          updateExistingError.message ||
            `Unable to link existing sendpulse log ${entry.id}.`
        );
      }
      existingRowsLinked += 1;
    }
  }

  let ordersUpdated = 0;
  if (!dryRun && latestByOrderId.size > 0) {
    for (const [orderId, entry] of latestByOrderId.entries()) {
      const currentOrder = ordersById.get(orderId);
      if (!currentOrder) continue;
      const currentSentAt = normalizeText(currentOrder.latestNotificationSentAt);
      const currentStamp = toTimestamp(currentSentAt);
      const nextStamp = toTimestamp(entry.sendDate);
      if (
        currentStamp !== null &&
        nextStamp !== null &&
        currentStamp >= nextStamp
      ) {
        continue;
      }
      const { error: updateError } = await supabase
        .from("orders_global")
        .update({
          latest_notification_name: entry.notificationName,
          latest_notification_sent_at: entry.sendDate,
        })
        .eq("id", orderId);
      if (updateError) {
        throw new Error(
          updateError.message ||
            `Unable to update latest notification for order ${orderId}.`
        );
      }
      ordersUpdated += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        sinceDate,
        pageSize,
        maxPages,
        sendpulseRowsFetched: rawSendpulseRows.length,
        sendpulseRowsInWindow: relevantSendpulseRows.length,
        rowsPreparedForInsert: rowsToInsert.length,
        rowsInserted: matchStats.inserted,
        existingRowsLinked,
        ordersUpdated,
        matchStats,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
