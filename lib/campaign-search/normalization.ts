const HTML_TAG_RE = /<[^>]+>/g;
const DIACRITIC_RE = /\p{M}+/gu;
const SEPARATOR_RE = /[\/_\-]+/g;
const NON_ALNUM_RE = /[^a-z0-9\s]+/g;
const WHITESPACE_RE = /\s+/g;

export function stripHtmlToText(input: string): string {
  return String(input || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(HTML_TAG_RE, " ")
    .replace(WHITESPACE_RE, " ")
    .trim();
}

export function normalizeSearchText(input: string): string {
  return stripHtmlToText(input)
    .normalize("NFD")
    .replace(DIACRITIC_RE, "")
    .toLowerCase()
    .replace(SEPARATOR_RE, " ")
    .replace(NON_ALNUM_RE, " ")
    .replace(WHITESPACE_RE, " ")
    .trim();
}

export function tokenizeSearchText(input: string): string[] {
  return normalizeSearchText(input)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function dedupeStrings(values: string[], maxItems?: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    output.push(trimmed);
  });
  return typeof maxItems === "number" ? output.slice(0, maxItems) : output;
}

export function normalizeTermList(
  values: Array<string | null | undefined>,
  maxItems: number
): string[] {
  return dedupeStrings(
    values
      .map((value) => normalizeSearchText(String(value || "")))
      .filter(Boolean),
    maxItems
  );
}

export function extractSearchTermsFromText(input: string, maxItems = 12): string[] {
  return dedupeStrings(
    tokenizeSearchText(input).filter((token) => token.length >= 3),
    maxItems
  );
}

export function splitLooseQueryText(input: string): string[] {
  return dedupeStrings(
    String(input || "")
      .split(/[\n,;|]+/g)
      .map((entry) => normalizeSearchText(entry))
      .filter(Boolean)
  );
}

export function escapeTsQueryToken(token: string): string {
  return tokenizeSearchText(token)[0] ?? "";
}

export function buildAndTsQuery(terms: string[]): string {
  const expressions = terms
    .map((term) => {
      const tokens = tokenizeSearchText(term);
      if (tokens.length === 0) return null;
      if (tokens.length === 1) return tokens[0];
      return `(${tokens.join(" <-> ")})`;
    })
    .filter((value): value is string => Boolean(value));

  return expressions.join(" & ");
}

export function buildOrTsQuery(terms: string[]): string {
  const expressions = terms
    .map((term) => {
      const tokens = tokenizeSearchText(term);
      if (tokens.length === 0) return null;
      if (tokens.length === 1) return tokens[0];
      return `(${tokens.join(" <-> ")})`;
    })
    .filter((value): value is string => Boolean(value));

  return expressions.join(" | ");
}

export function titleCaseLabel(input: string): string {
  return String(input || "")
    .trim()
    .split(/\s+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
