const uniq = <T>(values: T[]) => Array.from(new Set(values));

export const extractAsinsFromHtml = (html: string) => {
  const text = String(html || "");
  if (!text) return [];

  const out: string[] = [];
  const push = (value: string) => {
    const asin = value.trim().toUpperCase();
    if (/^[A-Z0-9]{10}$/.test(asin)) out.push(asin);
  };

  // Most reliable on listings and carousels.
  for (const match of text.matchAll(/data-asin\s*=\s*"([A-Z0-9]{10})"/gi)) {
    if (match[1]) push(match[1]);
  }

  // Fallback: links.
  for (const match of text.matchAll(/\/dp\/([A-Z0-9]{10})(?:[/?]|$)/gi)) {
    if (match[1]) push(match[1]);
  }
  for (const match of text.matchAll(
    /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/gi
  )) {
    if (match[1]) push(match[1]);
  }

  return uniq(out);
};

