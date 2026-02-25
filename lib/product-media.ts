export type ImageAsset = {
  src: string;
  alt: string;
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);
const isImageUrl = (value: string) =>
  isHttpUrl(value) || value.startsWith("/");
const MAIN_TAG_IN_FILE_NAME =
  /(?:\(\s*MAIN\s*\)|(?:^|[-_ ])MAIN(?:[-_ .)]|$))/i;
const VAR_TAG_IN_FILE_NAME =
  /(?:\(\s*VAR\s*\)|(?:^|[-_ ])VAR(?:[-_ .)]|$))/i;

const decodeUrlComponentSafe = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractImageFileName = (src: string) => {
  const trimmed = src.trim();
  if (!trimmed) return "";
  const withoutHash = trimmed.split("#", 1)[0] ?? trimmed;
  const withoutQuery = withoutHash.split("?", 1)[0] ?? withoutHash;
  const parts = withoutQuery.split("/");
  const rawName = parts[parts.length - 1] ?? "";
  return decodeUrlComponentSafe(rawName);
};

const imageFileStem = (name: string) => name.replace(/\.[^/.]+$/u, "");

const extractImageSequence = (name: string) => {
  if (!name) return Number.POSITIVE_INFINITY;
  const matches = [...name.matchAll(/(?:^|[-_ ])(\d+)(?=$|[-_ .])/g)];
  if (matches.length === 0) return Number.POSITIVE_INFINITY;
  const raw = matches[matches.length - 1]?.[1] ?? "";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

const toImageKey = (src: string) => {
  const name = extractImageFileName(src);
  if (name) return imageFileStem(name).toLowerCase();
  return src.trim().toLowerCase();
};

const hasMainTag = (src: string) => {
  const name = extractImageFileName(src);
  return name ? MAIN_TAG_IN_FILE_NAME.test(name) : false;
};

const hasVarTag = (src: string) => {
  const name = extractImageFileName(src);
  return name ? VAR_TAG_IN_FILE_NAME.test(name) : false;
};

const sortAssetsForDisplay = (assets: ImageAsset[]) => {
  const rank = (src: string) => {
    if (hasMainTag(src)) return 0;
    if (hasVarTag(src)) return 1;
    return 2;
  };

  assets.sort((left, right) => {
    const leftRank = rank(left.src);
    const rightRank = rank(right.src);
    if (leftRank !== rightRank) return leftRank - rightRank;

    const leftName = extractImageFileName(left.src);
    const rightName = extractImageFileName(right.src);
    const leftSeq = extractImageSequence(leftName);
    const rightSeq = extractImageSequence(rightName);
    if (leftSeq !== rightSeq) return leftSeq - rightSeq;

    return leftName.toLowerCase().localeCompare(rightName.toLowerCase(), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
};

const readImageSource = (entry: unknown): string | null => {
  if (typeof entry === "string") {
    return isImageUrl(entry) ? entry : null;
  }
  if (entry && typeof entry === "object") {
    const maybe = entry as { src?: string; url?: string; attachment?: string };
    const src = maybe.src ?? maybe.url ?? maybe.attachment ?? null;
    return src && isImageUrl(src) ? src : null;
  }
  return null;
};

export function extractProductImages(
  product: {
    title?: string | null;
    images?: unknown;
  },
  variants?: { variant_image_url?: string | null }[],
  imageUrls?: string[]
) {
  const assets: ImageAsset[] = [];
  const seen = new Set<string>();
  const title = product.title ?? "Product";

  const add = (src: string, altSuffix?: string) => {
    const key = toImageKey(src);
    if (!key || seen.has(key)) return;
    assets.push({ src, alt: `${title}${altSuffix ? ` - ${altSuffix}` : ""}` });
    seen.add(key);
  };

  const hasImageUrls = Boolean(imageUrls?.length);

  if (hasImageUrls) {
    imageUrls?.forEach((url, index) => add(url, `Image ${index + 1}`));
  }

  if (!hasImageUrls && Array.isArray(product.images)) {
    product.images.forEach((entry, index) => {
      const src = readImageSource(entry);
      if (src) add(src, `Image ${index + 1}`);
    });
  }

  variants?.forEach((variant, index) => {
    const raw = variant.variant_image_url;
    if (raw && isImageUrl(raw)) {
      add(raw, `Variant ${index + 1}`);
    }
  });

  sortAssetsForDisplay(assets);
  return assets;
}

export function getThumbnailUrl(
  product: { images?: unknown },
  fallback?: string | null
) {
  const images = product.images;
  if (Array.isArray(images)) {
    const candidates = images
      .map((entry) => readImageSource(entry))
      .filter((src): src is string => Boolean(src));
    const mainCandidate = candidates.find((src) => hasMainTag(src));
    if (mainCandidate) return mainCandidate;
    if (candidates.length > 0) return candidates[0];
  }

  return fallback ?? null;
}
