export const asText = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

export const firstString = (...values) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

export const isHttpUrl = (value) => /^https?:\/\//i.test(asText(value));

export const decodeEntities = (value) =>
  String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

export const stripHtml = (value) =>
  decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

export const toAbsoluteUrl = (baseUrl, maybeRelative) => {
  const raw = asText(maybeRelative);
  if (!raw) return "";
  if (isHttpUrl(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (!baseUrl) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
};

export const uniqueUrls = (values, maxCount = 80) => {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = asText(value);
    if (!text || !isHttpUrl(text)) continue;
    const key = text.split("#")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxCount) break;
  }
  return out;
};

export const matchAttributeValues = (html, attrName) => {
  const out = [];
  const re = new RegExp(`${attrName}=["']([^"']+)["']`, "gi");
  let match;
  while ((match = re.exec(String(html || ""))) !== null) {
    out.push(match[1]);
  }
  return out;
};

export const estimateImageScore = (url) => {
  const text = asText(url);
  if (!text) return 0;

  // CDON-style transform: .../cdn-cgi/image/width=600/https://...
  const widthMatch = text.match(/\/cdn-cgi\/image\/[^/]*width=(\d+)/i);
  if (widthMatch?.[1]) return Number(widthMatch[1]) || 0;

  // Fyndiq-style transform: .../images/f_auto/t_600x600/prod/...
  const sizeMatch = text.match(/\/t_(\d+)x(\d+)\//i);
  if (sizeMatch?.[1] && sizeMatch?.[2]) {
    return Math.max(Number(sizeMatch[1]) || 0, Number(sizeMatch[2]) || 0);
  }

  // Assume plain source URL is at least medium quality.
  return 700;
};

export const reorderByLargestImage = (urls) => {
  const unique = uniqueUrls(urls, 120);
  if (unique.length <= 1) return unique;
  const sorted = [...unique].sort(
    (a, b) => estimateImageScore(b) - estimateImageScore(a)
  );
  return sorted;
};

export const collectParagraphText = (html) => {
  const out = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = re.exec(String(html || ""))) !== null) {
    const text = stripHtml(match[1]);
    if (!text) continue;
    out.push(text);
  }
  return out;
};

export const keepUsefulDescriptionLine = (line) => {
  const text = asText(line);
  if (!text) return false;
  if (text.length < 2) return false;
  if (/^Artikel\.nr\.?$/i.test(text)) return false;
  if (/^Produktsäkerhetsinformation$/i.test(text)) return false;
  if (/^Färg$/i.test(text)) return false;
  if (/^Vikt[,\s]/i.test(text)) return false;
  return true;
};
