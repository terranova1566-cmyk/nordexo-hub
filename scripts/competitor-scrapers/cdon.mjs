import {
  asText,
  decodeEntities,
  firstString,
  keepUsefulDescriptionLine,
  matchAttributeValues,
  reorderByLargestImage,
  stripHtml,
  toAbsoluteUrl,
  uniqueUrls,
} from "./utils.mjs";

const unwrapCdonImage = (url) => {
  const raw = asText(url);
  if (!raw) return "";

  // Example:
  // https://cdn.cdon.com/cdn-cgi/image/width=600/https://images.sello.io/...
  const transformed = raw.match(/\/cdn-cgi\/image\/[^/]+\/(https?:\/\/.+)$/i);
  if (transformed?.[1]) {
    try {
      return decodeURIComponent(transformed[1]);
    } catch {
      return transformed[1];
    }
  }

  return raw;
};

const extractTitle = (html) => {
  const h1 = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) return stripHtml(h1[1]);

  const ogTitle = String(html || "").match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i
  );
  return decodeEntities(ogTitle?.[1] || "").replace(/\s+/g, " ").trim();
};

const pickNested = (root, path) => {
  let node = root;
  for (const key of path) {
    if (!node || typeof node !== "object") return null;
    node = node[key];
  }
  return node;
};

const normalizeDescriptionHtml = (value) => {
  const text = decodeEntities(String(value || ""))
    .replace(/\u00a0/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
    .replace(/<\/?(strong|em|b|i)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const seen = new Set();
  const lines = [];
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line || line === "•") continue;
    if (!keepUsefulDescriptionLine(line)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }

  return lines.join("\n").trim();
};

const extractDescriptionFromNextData = (html) => {
  const src = String(html || "");
  const match = src.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match?.[1]) return "";

  try {
    const parsed = JSON.parse(match[1]);
    const candidates = [
      pickNested(parsed, ["props", "pageProps", "data", "article", "description"]),
      pickNested(parsed, ["props", "pageProps", "article", "description"]),
      pickNested(parsed, ["props", "pageProps", "data", "product", "description"]),
      pickNested(parsed, ["props", "pageProps", "product", "description"]),
    ];

    for (const candidate of candidates) {
      const normalized = normalizeDescriptionHtml(candidate);
      if (normalized) return normalized;
    }
  } catch {
    // Fallback below.
  }

  return "";
};

const extractDescription = (html) => {
  const src = String(html || "");
  const nextDataDescription = extractDescriptionFromNextData(src);
  if (nextDataDescription) return nextDataDescription;

  const startIdx = src.search(/data-cy=["']product-description["']/i);
  let slice = startIdx >= 0 ? src.slice(startIdx) : src;
  // Cut before known non-description sections.
  const stopMarkers = [
    /data-testid=["']testfreaks-reviews["']/i,
    /id=["']testfreaks-reviews["']/i,
    /data-cy=["']static-reviews["']/i,
    />\s*Rekommendationer för dig\s*</i,
    /data-cy=["']similar-products["']/i,
    /aria-label=["']Visa alla kundbetyg["']/i,
  ];
  for (const re of stopMarkers) {
    const m = slice.search(re);
    if (m >= 0) {
      slice = slice.slice(0, m);
    }
  }

  const paragraphTexts = [];
  const paraRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let paraMatch;
  while ((paraMatch = paraRe.exec(slice)) !== null) {
    const body = String(paraMatch[1] || "");
    const withBreaks = body
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ");
    const text = decodeEntities(withBreaks.replace(/<[^>]+>/g, " "))
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    if (text) paragraphTexts.push(text);
  }
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liRe.exec(slice)) !== null) {
    const liText = stripHtml(liMatch[1] || "");
    if (!liText) continue;
    paragraphTexts.push(`• ${liText}`);
  }

  const noiseLine = (line) => {
    const text = asText(line);
    if (!text) return true;
    if (
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
        text
      )
    ) {
      return true;
    }
    if (
      /^(Köp|Säker betalning|14-dagars öppet köp|Säljs och levereras av|Rapportera ett juridiskt problem)$/i.test(
        text
      )
    ) {
      return true;
    }
    if (/^(Tidigare lägsta pris|Rekommendationer för dig|Hoppa över produktlistan)/i.test(text)) {
      return true;
    }
    if (/^\d+,\d+\s*\(\d+\)/.test(text)) return true;
    if (/^\(\d+\)$/.test(text)) return true;
    if (/^för \d+/.test(text)) return true;
    return false;
  };

  const lines = paragraphTexts
    .flatMap((block) => block.split(/\n+/))
    .map((line) => line.trim())
    .filter((line) => keepUsefulDescriptionLine(line))
    .filter((line) => !noiseLine(line));

  if (lines.length > 0) return Array.from(new Set(lines)).join("\n");

  const metaDesc = src.match(
    /<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]+content=["']([\s\S]*?)["'][^>]*>/i
  );
  return stripHtml(metaDesc?.[1] || "");
};

const extractGalleryImages = (html, baseUrl) => {
  const src = String(html || "");

  // Prioritize gallery panels.
  const panelUrls = [];
  const panelRe =
    /<div[^>]+id=["']image-panel-\d+["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = panelRe.exec(src)) !== null) {
    panelUrls.push(toAbsoluteUrl(baseUrl, match[1]));
  }

  // Fallback: any image URL in slideshow track.
  const trackMatch = src.match(
    /<div[^>]+(?:data-cy|data-testid)=["']SlideshowTrack["'][^>]*>([\s\S]*?)<\/div>/i
  );
  const trackUrls = trackMatch
    ? matchAttributeValues(trackMatch[1], "src").map((url) =>
        toAbsoluteUrl(baseUrl, url)
      )
    : [];

  const all = [...panelUrls, ...trackUrls]
    .map(unwrapCdonImage)
    .filter(Boolean);

  return reorderByLargestImage(uniqueUrls(all, 60)).slice(0, 30);
};

export const scrapeCdonFromHtml = ({ html, url }) => {
  const title = extractTitle(html);
  const description = extractDescription(html);
  const imageUrls = extractGalleryImages(html, url);
  return {
    title: firstString(title),
    description: firstString(description),
    imageUrls,
  };
};
