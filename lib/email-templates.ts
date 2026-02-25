export type TemplateVars = Record<string, string>;

const MACRO_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export function collectMacros(input: string): string[] {
  const set = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = MACRO_PATTERN.exec(input))) {
    const key = match[1]?.trim();
    if (key) set.add(key);
  }
  return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
}

export function renderTemplate(input: string, vars: TemplateVars): string {
  return input.replace(MACRO_PATTERN, (_whole, keyRaw: string) => {
    const key = String(keyRaw || "").trim();
    if (!key) return "";

    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return String(vars[key] ?? "");
    }

    const normalized = key.toLowerCase();
    for (const [varKey, value] of Object.entries(vars)) {
      if (varKey.toLowerCase() === normalized) return String(value ?? "");
    }

    return "";
  });
}

export function stripHtml(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
