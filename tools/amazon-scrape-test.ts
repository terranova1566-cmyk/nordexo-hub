import { promises as fs } from "node:fs";
import path from "node:path";
import { scrapeAmazonListingCards, scrapeAmazonProductFull } from "@/lib/amazon/scrape";
import type { AmazonProvider } from "@/lib/amazon/types";
import { AmazonScrapeError } from "@/lib/amazon/errors";
import { OxylabsError } from "@/lib/amazon/oxylabs";
import {
  DEFAULT_AMAZON_DEBUG_PROMPT_TEMPLATE,
  DEFAULT_AMAZON_DEBUG_PROMPT_ID,
  renderPromptTemplate,
} from "@/lib/amazon/debug-ai-prompt";
import { createClient } from "@supabase/supabase-js";

type Mode = "product" | "listing";

let cachedDebugPrompt: { promptId: string; template: string } | null = null;

const createServiceSupabase = () => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
};

const loadPromptTemplateById = async (promptId: string): Promise<string | null> => {
  const id = String(promptId || "").trim();
  if (!id) return null;

  if (cachedDebugPrompt?.promptId === id) {
    return cachedDebugPrompt.template;
  }

  const supabase = createServiceSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("ai_image_edit_prompts")
    .select("template_text,updated_at")
    .eq("prompt_id", id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  const template = typeof data?.template_text === "string" ? data.template_text : "";
  const normalized = template.trim();
  if (!normalized) return null;

  cachedDebugPrompt = { promptId: id, template: normalized };
  return normalized;
};

const getAmazonDebugPromptTemplate = async () => {
  const promptId =
    String(process.env.AMAZON_DEBUG_PROMPT_ID || "").trim() ||
    DEFAULT_AMAZON_DEBUG_PROMPT_ID;
  const fromDb = await loadPromptTemplateById(promptId);
  return fromDb ?? DEFAULT_AMAZON_DEBUG_PROMPT_TEMPLATE;
};

const loadEnvFile = async (filePath: string) => {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    contents.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const index = trimmed.indexOf("=");
      if (index === -1) return;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch {
    // ignore
  }
};

const loadEnv = async () => {
  const root = process.cwd();
  await loadEnvFile(path.join(root, ".env.local"));
  await loadEnvFile(path.join(root, ".env"));
};

const extractJsonFromText = (text: string) => {
  const raw = String(text || "").trim();
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

const maybeDiagnoseWithOpenAi = async (payload: any) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = String(process.env.AMAZON_DEBUG_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
  const detail = payload?.detail ?? null;
  const debug = detail?.debug ?? null;
  if (!debug?.textSnippet && !debug?.htmlSnippet) return null;

  const template = await getAmazonDebugPromptTemplate();
  const prompt = renderPromptTemplate(template, {
    error_type: String(payload?.type || ""),
    provider: String(payload?.provider || payload?.code || ""),
    code: String(payload?.code || ""),
    message: String(payload?.message || ""),
    url: String(payload?.url || ""),
    http_status: String(detail?.status ?? ""),
    final_url: String(detail?.finalUrl ?? payload?.url ?? ""),
    content_type: String(detail?.contentType ?? ""),
    blocked: detail?.blocked ? JSON.stringify(detail.blocked) : "null",
    title: String(debug?.title ?? ""),
    text_snippet: String(debug?.textSnippet ?? ""),
    html_snippet: String(debug?.htmlSnippet ?? ""),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const result = await response.json().catch(() => null);
    const content = result?.choices?.[0]?.message?.content || "";
    return extractJsonFromText(String(content));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const getFlagValue = (name: string) => {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1) return process.argv[idx + 1] || "";
  return "";
};

const hasFlag = (name: string) => process.argv.slice(2).includes(`--${name}`);

const mode = (getFlagValue("mode") || "product").toLowerCase() as Mode;
const url = getFlagValue("url");
const provider = ((getFlagValue("provider") || "direct").toLowerCase() as AmazonProvider) ?? "direct";
const maxRelated = Number(getFlagValue("max-related") || "24");
const maxItems = Number(getFlagValue("max-items") || "40");

const outputArg = getFlagValue("output");

if (!url) {
  console.error("Missing --url");
  process.exit(2);
}

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const writeTxt = async (filePath: string, payload: unknown) => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

async function main() {
  await loadEnv();

  if (mode === "listing") {
    const scraped = await scrapeAmazonListingCards(url, { provider, maxItems });
    const outPath =
      outputArg ||
      path.join(process.cwd(), "output", `amazon_listing_${provider}_${Date.now()}.txt`);
    await writeTxt(outPath, scraped);
    console.log(outPath);
    return;
  }

  const includeVariantImages = !hasFlag("no-variant-images");
  const includeRelatedProducts = !hasFlag("no-related");

  const scraped = await scrapeAmazonProductFull(url, {
    provider,
    includeVariantImages,
    includeRelatedProducts,
    maxRelated: Number.isFinite(maxRelated) ? maxRelated : 24,
  });

  const outPath =
    outputArg || path.join(process.cwd(), "output", `amazon_${provider}_${scraped.asin}.txt`);
  await writeTxt(outPath, scraped);
  console.log(outPath);
}

main().catch((err) => {
  void (async () => {
    await loadEnv();
    const errorOutPath =
      outputArg || path.join(process.cwd(), "output", `amazon_error_${Date.now()}.txt`);

    const payload =
      err instanceof AmazonScrapeError
        ? {
            type: "AmazonScrapeError",
            provider: err.provider,
            code: err.code,
            message: err.message,
            url: err.url ?? url,
            detail: err.detail ?? null,
            stack: err.stack ?? null,
          }
        : err instanceof OxylabsError
          ? {
              type: "OxylabsError",
              code: err.code,
              message: err.message,
              detail: err.detail ?? null,
              stack: err.stack ?? null,
            }
          : err instanceof Error
            ? {
                type: err.name || "Error",
                message: err.message,
                stack: err.stack ?? null,
              }
            : { type: "UnknownError", value: err };

    if (hasFlag("ai")) {
      const ai = await maybeDiagnoseWithOpenAi(payload);
      if (ai) {
        (payload as any).ai = ai;
      }
    }

    try {
      await writeTxt(errorOutPath, payload);
    } catch {
      // ignore
    }

    console.error(JSON.stringify(payload, null, 2));
    console.error(`Wrote error debug file: ${errorOutPath}`);
    process.exit(1);
  })();
});
