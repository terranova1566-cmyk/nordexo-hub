export type ImageAsset = {
  src: string;
  alt: string;
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

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
    if (!src || seen.has(src)) return;
    assets.push({ src, alt: `${title}${altSuffix ? ` - ${altSuffix}` : ""}` });
    seen.add(src);
  };

  const hasImageUrls = Boolean(imageUrls?.length);

  if (hasImageUrls) {
    imageUrls?.forEach((url, index) => add(url, `Image ${index + 1}`));
  }

  if (!hasImageUrls && Array.isArray(product.images)) {
    product.images.forEach((entry, index) => {
      if (typeof entry === "string" && isHttpUrl(entry)) {
        add(entry, `Image ${index + 1}`);
        return;
      }

      if (entry && typeof entry === "object") {
        const maybe = entry as { src?: string; url?: string; attachment?: string };
        const src = maybe.src ?? maybe.url ?? null;
        if (src && isHttpUrl(src)) {
          add(src, `Image ${index + 1}`);
        }
      }
    });
  }

  if (!hasImageUrls) {
    variants?.forEach((variant, index) => {
      const raw = variant.variant_image_url;
      if (raw && isHttpUrl(raw)) {
        add(raw, `Variant ${index + 1}`);
      }
    });
  }

  return assets;
}

export function getThumbnailUrl(
  product: { images?: unknown },
  fallback?: string | null
) {
  const images = product.images;
  if (Array.isArray(images)) {
    const first = images[0];
    if (typeof first === "string" && isHttpUrl(first)) return first;
    if (first && typeof first === "object") {
      const maybe = first as { src?: string; url?: string };
      const src = maybe.src ?? maybe.url;
      if (src && isHttpUrl(src)) return src;
    }
  }

  return fallback ?? null;
}
