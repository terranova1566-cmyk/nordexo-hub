export const DIGIDEAL_SHIPPING_CLASSES = ["NOR", "BAT", "PBA", "LIQ"] as const;
export type DigidealShippingClass = (typeof DIGIDEAL_SHIPPING_CLASSES)[number];

export type DigidealShippingClassification = {
  shipping_class: DigidealShippingClass;
  confidence: number;
  reason: string;
  model: string;
};

type ClassifyArgs = {
  apiKey: string;
  model?: string;
  title?: string | null;
  longTitle?: string | null;
  description?: string | null;
  timeoutMs?: number;
};

const DEFAULT_MODEL = process.env.DIGIDEAL_SHIPPING_MODEL || process.env.OPENAI_EDIT_MODEL || "gpt-5.2";

const toText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const clamp01 = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const normalizeClass = (value: unknown): DigidealShippingClass | null => {
  const normalized = toText(value).toUpperCase();
  if (normalized === "NOR" || normalized === "BAT" || normalized === "PBA" || normalized === "LIQ") {
    return normalized;
  }
  return null;
};

const extractJsonFromText = (text: string) => {
  const raw = toText(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const asNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const sanitizeReason = (value: unknown) => {
  const text = toText(value);
  if (!text) return "";
  return text.replace(/\s+/g, " ").slice(0, 240);
};

const buildPrompt = (title: string, longTitle: string, description: string) => {
  const safeTitle = title.slice(0, 600);
  const safeLongTitle = longTitle.slice(0, 1200);
  const safeDescription = description.slice(0, 8000);

  return [
    "You classify products for shipping class.",
    "Return JSON only.",
    "",
    "Allowed classes:",
    'NOR = normal product, no special battery/liquid handling.',
    "BAT = contains battery OR battery-powered device (not pure battery).",
    "PBA = pure battery or primary electricity source (battery pack, power bank, standalone battery cells).",
    "LIQ = liquid/cream/powder/gel/aerosol/cosmetic/chemical where liquid-like handling is needed.",
    "",
    "Decision priority:",
    "1) If LIQ applies => LIQ",
    "2) Else if PBA applies => PBA",
    "3) Else if BAT applies => BAT",
    "4) Else => NOR",
    "",
    'Output format: {"shipping_class":"NOR|BAT|PBA|LIQ","confidence":0..1,"reason":"short reason"}',
    "",
    "Input product:",
    `Title: ${safeTitle || "(empty)"}`,
    `Long title: ${safeLongTitle || "(empty)"}`,
    `Description: ${safeDescription || "(empty)"}`,
  ].join("\n");
};

export const classifyDigidealShippingClass = async (
  args: ClassifyArgs
): Promise<DigidealShippingClassification> => {
  const apiKey = toText(args.apiKey);
  if (!apiKey) {
    throw new Error("Missing OpenAI API key.");
  }

  const model = toText(args.model) || DEFAULT_MODEL;
  const title = toText(args.title);
  const longTitle = toText(args.longTitle);
  const description = toText(args.description);
  const prompt = buildPrompt(title, longTitle, description);

  const controller = new AbortController();
  const timeoutMs = Math.max(4_000, Number(args.timeoutMs ?? 25_000));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI error (${response.status}): ${body.slice(0, 260)}`);
    }

    const payload = await response.json();
    const content = String(payload?.choices?.[0]?.message?.content ?? "");
    const parsed = extractJsonFromText(content);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid model response JSON.");
    }

    const shippingClass = normalizeClass((parsed as any).shipping_class) || "NOR";
    const confidenceRaw = asNumber((parsed as any).confidence);
    const confidence =
      confidenceRaw === null ? 0.5 : clamp01(confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw);
    const reason = sanitizeReason((parsed as any).reason) || "classified";

    return {
      shipping_class: shippingClass,
      confidence,
      reason,
      model,
    };
  } finally {
    clearTimeout(timeout);
  }
};
