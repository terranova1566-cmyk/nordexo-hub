const DANGEROUS_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "meta",
  "link",
  "base",
];

export function sanitizeEmailHtml(input: string): string {
  let html = String(input ?? "");

  for (const tag of DANGEROUS_TAGS) {
    const blockTag = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    html = html.replace(blockTag, "");
    const selfClosingTag = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
    html = html.replace(selfClosingTag, "");
  }

  // Remove inline event handlers (onclick, onload, ...)
  html = html.replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");

  // Neutralize javascript: URLs
  html = html.replace(
    /\b(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi,
    '$1="#"'
  );

  // Neutralize data:text/html URLs
  html = html.replace(
    /\b(href|src)\s*=\s*(["'])\s*data:text\/html[\s\S]*?\2/gi,
    '$1="#"'
  );

  return html;
}
