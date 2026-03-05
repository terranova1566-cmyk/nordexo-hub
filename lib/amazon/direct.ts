import { AmazonScrapeError } from "@/lib/amazon/errors";
import crypto from "node:crypto";

export type DirectFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
};

type DirectFetchResult = {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
  contentType: string | null;
  blocked: null | { code: string; message: string; signals?: Record<string, boolean> };
  debug: {
    title: string | null;
    htmlSha1: string;
    htmlSnippet: string;
    textSnippet: string;
  };
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 6_000_000;

const toAscii = (value: string) =>
  value
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const decodeHtmlEntities = (value: string) =>
  String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_m, d) => {
      const code = Number(d);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });

const extractTitle = (html: string) => {
  const match = String(html || "").match(/<title[^>]*>([^<]*)<\/title>/i);
  const raw = match?.[1] ? decodeHtmlEntities(match[1]) : "";
  const t = toAscii(raw);
  return t || null;
};

const htmlToTextSnippet = (html: string, limit = 1200) => {
  const input = String(html || "");
  if (!input) return "";

  const stripped = input
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");

  const decoded = decodeHtmlEntities(stripped);
  const normalized = toAscii(decoded);
  return normalized.slice(0, Math.max(0, limit));
};

const detectBlockSignals = (finalUrl: string, html: string) => {
  const url = String(finalUrl || "");
  const text = String(html || "");
  const head = text.slice(0, 80000).toLowerCase();

  return {
    url_validatecaptcha: /validatecaptcha/i.test(url),
    url_opfcaptcha: /opfcaptcha\.amazon\./i.test(url),
    title_robot_check: /<title>\s*robot check\s*<\/title>/i.test(text),
    has_captcha_input: head.includes("type=\"captcha\"") || head.includes("name=\"captcha\""),
    has_validatecaptcha_path: head.includes("/errors/validatecaptcha"),
    has_sorry_not_a_robot:
      head.includes("sorry") && (head.includes("not a robot") || head.includes("not a robot?")),
    has_enter_chars:
      head.includes("enter the characters you see below") ||
      head.includes("type the characters you see in this image") ||
      head.includes("characters you see below"),
    has_automated_access_notice:
      head.includes("automated access to amazon data") ||
      head.includes("api-services-support@amazon.com"),
    has_service_unavailable: head.includes("service unavailable") && head.includes("amazon"),
  };
};

const detectBlock = (finalUrl: string, html: string): DirectFetchResult["blocked"] => {
  const url = String(finalUrl || "");
  const text = String(html || "");
  const head = text.slice(0, 20000).toLowerCase();
  const signals = detectBlockSignals(url, text);

  if (signals.url_opfcaptcha || signals.url_validatecaptcha) {
    return {
      code: "captcha",
      message: "Amazon returned a CAPTCHA/robot check page.",
      signals,
    };
  }

  if (signals.title_robot_check) {
    return { code: "captcha", message: "Amazon returned a Robot Check page.", signals };
  }

  if (signals.has_captcha_input || signals.has_validatecaptcha_path) {
    return { code: "captcha", message: "Amazon returned a CAPTCHA challenge.", signals };
  }

  if (signals.has_sorry_not_a_robot || signals.has_enter_chars || signals.has_automated_access_notice) {
    return { code: "captcha", message: "Amazon blocked the request as automated traffic.", signals };
  }

  // Some block pages return a bare 503 with short HTML.
  if (signals.has_service_unavailable) {
    return { code: "blocked", message: "Amazon returned a service unavailable block page.", signals };
  }

  return null;
};

const parseHtmlAttribute = (tag: string, attrName: string) => {
  const re = new RegExp(
    `${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  );
  const match = String(tag || "").match(re);
  if (!match) return "";
  return decodeHtmlEntities(String(match[1] ?? match[2] ?? match[3] ?? "")).trim();
};

const extractAmazonContinueForm = (baseUrl: string, html: string) => {
  const formMatch = String(html || "").match(
    /<form\b[^>]*action\s*=\s*(?:"([^"]*validateCaptcha[^"]*)"|'([^']*validateCaptcha[^']*)'|([^>\s]*validateCaptcha[^>\s]*))[^>]*>([\s\S]*?)<\/form>/i
  );
  if (!formMatch) return null;

  const actionRaw = String(formMatch[1] ?? formMatch[2] ?? formMatch[3] ?? "").trim();
  if (!actionRaw) return null;
  const formInnerHtml = String(formMatch[4] || "");

  const params = new URLSearchParams();
  const hiddenInputs = Array.from(formInnerHtml.matchAll(/<input\b[^>]*>/gi));
  hiddenInputs.forEach((match) => {
    const tag = String(match[0] || "");
    const inputType = parseHtmlAttribute(tag, "type").toLowerCase();
    if (inputType && inputType !== "hidden") return;
    const name = parseHtmlAttribute(tag, "name");
    if (!name) return;
    const value = parseHtmlAttribute(tag, "value");
    params.set(name, value);
  });

  const hasCaptchaSignals =
    params.has("amzn") ||
    params.has("amzn-r") ||
    /\/errors\/validatecaptcha/i.test(actionRaw);
  if (!hasCaptchaSignals) return null;

  const actionUrl = (() => {
    try {
      return new URL(actionRaw, baseUrl).toString();
    } catch {
      return "";
    }
  })();
  if (!actionUrl) return null;

  return { actionUrl, params };
};

const extractSetCookieHeaders = (headers: Headers): string[] => {
  const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    const values = anyHeaders.getSetCookie();
    return Array.isArray(values) ? values.filter(Boolean) : [];
  }
  const fallback = headers.get("set-cookie");
  return fallback ? [fallback] : [];
};

const buildCookieHeader = (setCookieHeaders: string[]) => {
  const pairs = setCookieHeaders
    .map((entry) => String(entry || "").split(";")[0]?.trim() ?? "")
    .filter((entry) => entry.includes("="));
  return pairs.join("; ");
};

async function readBodyWithLimit(res: Response, maxBytes: number) {
  // Node fetch/undici supports streaming via res.body.
  if (!res.body) return await res.text();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error(`Response too large (>${maxBytes} bytes).`);
      }
      chunks.push(value);
    }
  }

  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return buf.toString("utf8");
}

export async function fetchAmazonHtmlDirect(
  url: string,
  opts: DirectFetchOptions = {}
): Promise<DirectFetchResult> {
  const trimmed = String(url || "").trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new AmazonScrapeError({
      provider: "direct",
      code: "invalid_url",
      message: "Invalid URL.",
      url: trimmed,
    });
  }

  const timeoutMs = Math.max(1_000, Math.trunc(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const maxBytes = Math.max(50_000, Math.trunc(opts.maxBytes ?? DEFAULT_MAX_BYTES));
  const requestHeaders: Record<string, string> = {
    // Keep headers simple. This is not intended to bypass anti-bot systems.
    "User-Agent": "NordexoHubAmazonScraper/1.0",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
  };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(trimmed, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: requestHeaders,
    });
  } catch (err) {
    clearTimeout(t);
    throw new AmazonScrapeError({
      provider: "direct",
      code: ac.signal.aborted ? "timeout" : "network_error",
      message: ac.signal.aborted ? "Request timed out." : "Network error.",
      url: trimmed,
      detail: err,
    });
  } finally {
    clearTimeout(t);
  }

  const contentType = res.headers.get("content-type");
  const finalUrl = res.url || trimmed;

  let html = "";
  try {
    html = await readBodyWithLimit(res, maxBytes);
  } catch (err) {
    throw new AmazonScrapeError({
      provider: "direct",
      code: "read_error",
      message: "Failed reading HTML response.",
      url: trimmed,
      detail: err,
    });
  }

  // Some Amazon locales show a one-click interstitial form before the product page.
  // If present, submit it once and continue with the resulting document.
  const continueForm = extractAmazonContinueForm(finalUrl, html);
  if (continueForm) {
    try {
      const continueUrl = new URL(continueForm.actionUrl);
      continueForm.params.forEach((value, key) => {
        continueUrl.searchParams.set(key, value);
      });
      const cookieHeader = buildCookieHeader(extractSetCookieHeaders(res.headers));
      const continueHeaders: Record<string, string> = {
        ...requestHeaders,
        Referer: finalUrl,
      };
      if (cookieHeader) {
        continueHeaders.Cookie = cookieHeader;
      }

      const continueResponse = await fetch(continueUrl.toString(), {
        method: "GET",
        redirect: "follow",
        signal: ac.signal,
        headers: continueHeaders,
      });
      const continuedHtml = await readBodyWithLimit(continueResponse, maxBytes);
      res = continueResponse;
      html = continuedHtml;
    } catch {
      // Continue with original response body if form submit fails.
    }
  }

  const htmlSha1 = crypto.createHash("sha1").update(html).digest("hex");
  const title = extractTitle(html);
  const headForSnippets = String(html || "").slice(0, 120000);
  const htmlSnippet = toAscii(headForSnippets).slice(0, 1600);
  const textSnippet = htmlToTextSnippet(headForSnippets, 1600);
  const debug = { title, htmlSha1, htmlSnippet, textSnippet };

  const blocked = detectBlock(finalUrl, html);

  return {
    url: trimmed,
    finalUrl: res.url || finalUrl,
    status: Number.isFinite(res.status) ? res.status : 0,
    html,
    contentType: res.headers.get("content-type")
      ? toAscii(String(res.headers.get("content-type") || ""))
      : contentType
        ? toAscii(contentType)
        : null,
    blocked,
    debug,
  };
}
