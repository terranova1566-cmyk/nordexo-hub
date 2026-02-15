import { promises as fs } from "node:fs";
import path from "node:path";
import { scrapeAmazonListingCards, scrapeAmazonProductFull } from "@/lib/amazon/scrape";
import type { AmazonProvider } from "@/lib/amazon/types";
import { AmazonScrapeError } from "@/lib/amazon/errors";
import { OxylabsError } from "@/lib/amazon/oxylabs";

type Mode = "product" | "listing";

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

  const prompt = [
    "You are debugging an Amazon scraping failure.",
    "Analyze the provided metadata and page snippets.",
    "Important: Do NOT suggest CAPTCHA bypassing/solving, fingerprinting, proxy/residential IP tactics, user-agent spoofing, or any other evasion methods.",
    "Only suggest compliant next steps (e.g. use official APIs, obtain permission, reduce/stop scraping when blocked, or use an authorized scraping provider).",
    "Return JSON only with keys:",
    'page_type (one of: "product_page","captcha_or_robot_check","blocked_or_rate_limited","blank_or_error_page","unknown"),',
    "likely_issue, confidence (0-1), key_signals (array), next_steps (array), hypotheses (array of 5 short items).",
    "",
    `Error type: ${String(payload?.type || "")}`,
    `Provider: ${String(payload?.provider || payload?.code || "")}`,
    `Code: ${String(payload?.code || "")}`,
    `Message: ${String(payload?.message || "")}`,
    `URL: ${String(payload?.url || "")}`,
    "",
    `HTTP status: ${String(detail?.status ?? "")}`,
    `Final URL: ${String(detail?.finalUrl ?? payload?.url ?? "")}`,
    `Content-Type: ${String(detail?.contentType ?? "")}`,
    `Detected block: ${detail?.blocked ? JSON.stringify(detail.blocked) : "null"}`,
    `Title: ${String(debug?.title ?? "")}`,
    `Text snippet: ${String(debug?.textSnippet ?? "")}`,
    `HTML snippet: ${String(debug?.htmlSnippet ?? "")}`,
  ].join("\n");

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
