export const CHATWOOT_TEMPLATE_LANGUAGES = ["sv", "no", "fi", "en"] as const;

export type ChatwootTemplateLanguage = (typeof CHATWOOT_TEMPLATE_LANGUAGES)[number];

const CURLY_MACRO_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const BRACKET_MACRO_PATTERN = /\[\s*([A-Za-z0-9_]+)\s*\]/g;

export function isChatwootTemplateLanguage(value: unknown): value is ChatwootTemplateLanguage {
  return CHATWOOT_TEMPLATE_LANGUAGES.includes(String(value ?? "") as ChatwootTemplateLanguage);
}

export function normalizeTemplateId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "_");
}

export function validateTemplateId(value: string): string | null {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{1,63}$/.test(value)) {
    return "Template handle must be 2-64 chars and use letters, numbers, _ or -.";
  }
  return null;
}

export function collectChatwootMacros(input: string): string[] {
  const set = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = CURLY_MACRO_PATTERN.exec(String(input || "")))) {
    const key = String(match[1] ?? "").trim();
    if (key) set.add(key);
  }

  while ((match = BRACKET_MACRO_PATTERN.exec(String(input || "")))) {
    const key = String(match[1] ?? "").trim();
    if (key) set.add(key);
  }

  return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}

  return null;
}
