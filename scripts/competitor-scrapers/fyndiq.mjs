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

const normalizeFyndiqImage = (url) => {
  const raw = asText(url);
  if (!raw) return "";

  // Prefer largest practical source over tiny thumbs.
  // e.g. /images/f_auto/t_120x120/prod/... -> /images/f_auto/t_600x600/prod/...
  const upgraded = raw.replace(/\/t_(\d+)x(\d+)\//i, (_m, w, h) => {
    const width = Number(w) || 0;
    const height = Number(h) || 0;
    if (Math.max(width, height) >= 600) return `/t_${w}x${h}/`;
    return "/t_600x600/";
  });
  return upgraded;
};

const extractTitle = (html) => {
  const h1 = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) return stripHtml(h1[1]);

  const ogTitle = String(html || "").match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i
  );
  return decodeEntities(ogTitle?.[1] || "").replace(/\s+/g, " ").trim();
};

const extractDescription = (html) => {
  const src = String(html || "");
  const startIdx = src.search(/id=["']product-description-[^"']+["']/i);
  let slice = startIdx >= 0 ? src.slice(startIdx) : src;

  // Cut before known marketplace/fulfillment/recommendation sections.
  const stopMarkers = [
    />\s*Klimatkompenserad till 110%\s*</i,
    />\s*Leveranspolicy\s*</i,
    />\s*Fynd för dig\s*</i,
    />\s*Toppsäljare i kategorin\s*</i,
    />\s*Hoppa över produktlistan\s*</i,
    />\s*Lägg i varukorgen\s*</i,
    />\s*Säker betalning\s*</i,
    />\s*Nöjd kund-löfte\s*</i,
    />\s*30 dagars öppet köp\s*</i,
    />\s*Rapportera ett juridiskt problem\s*</i,
    /data-testid=["']recommendations["']/i,
    /data-cy=["']recommendations["']/i,
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
      /^(Köp|Säker betalning|Nöjd kund-löfte|30 dagars öppet köp|Rapportera ett juridiskt problem)$/i.test(
        text
      )
    ) {
      return true;
    }
    if (/^(Fynd för dig|Toppsäljare i kategorin|Hoppa över produktlistan|Leveranspolicy)/i.test(text)) {
      return true;
    }
    if (/^Klimatkompenserad till 110%$/i.test(text)) return true;
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

  if (lines.length > 0) {
    return Array.from(new Set(lines)).join("\n");
  }

  const metaDesc = src.match(
    /<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]+content=["']([\s\S]*?)["'][^>]*>/i
  );
  return stripHtml(metaDesc?.[1] || "");
};

const extractGalleryImages = (html, baseUrl) => {
  const src = String(html || "");

  const panelUrls = [];
  const panelRe =
    /<div[^>]+id=["']image-panel-\d+["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = panelRe.exec(src)) !== null) {
    panelUrls.push(toAbsoluteUrl(baseUrl, match[1]));
  }

  const trackMatch = src.match(
    /<div[^>]+(?:data-cy|data-testid)=["']SlideshowTrack["'][^>]*>([\s\S]*?)<\/div>/i
  );
  const trackUrls = trackMatch
    ? matchAttributeValues(trackMatch[1], "src").map((url) =>
        toAbsoluteUrl(baseUrl, url)
      )
    : [];

  const all = [...panelUrls, ...trackUrls]
    .map(normalizeFyndiqImage)
    .filter(Boolean);

  return reorderByLargestImage(uniqueUrls(all, 60)).slice(0, 30);
};

export const scrapeFyndiqFromHtml = ({ html, url }) => {
  const title = extractTitle(html);
  const description = extractDescription(html);
  const imageUrls = extractGalleryImages(html, url);
  return {
    title: firstString(title),
    description: firstString(description),
    imageUrls,
  };
};
