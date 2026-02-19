import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  classifyDigidealShippingClass,
  type DigidealShippingClass,
} from "../lib/digideal-shipping-class";

type DigidealRow = {
  product_id: string;
  seller_name: string | null;
  listing_title: string | null;
  title_h1: string | null;
  description_html: string | null;
  bullet_points: unknown;
  first_seen_at: string | null;
  last_seen_at: string | null;
  shipping_class: string | null;
};

type SellerGroup = {
  display: string;
  variants: string[];
};

const SELLER_GROUPS: SellerGroup[] = [
  {
    display: "GadgetBay",
    variants: ["GadgetBay Limited", "Gadget Bay Limited", "GadgetBay", "Gadget Bay"],
  },
  {
    display: "Nordexo",
    variants: [
      "Nordexo",
      "Nordexo Limited",
      "Nordexo Limited77795751",
      "Blank Space Limited",
    ],
  },
];

const PAGE_SIZE = 500;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_GADGETBAY_OLD_DAYS = 180;

const toText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const stripHtml = (value: string) =>
  value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const bulletPointsToText = (value: unknown) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => toText(entry)).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((entry) => toText(entry))
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const loadEnvFile = async (filePath: string) => {
  try {
    const content = await fs.readFile(filePath, "utf8");
    content.split(/\r?\n/).forEach((line) => {
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
    // ignore missing env files
  }
};

const loadEnv = async () => {
  const cwd = process.cwd();
  const envFiles = [
    path.join(cwd, ".env.local"),
    path.join(cwd, ".env"),
    "/srv/nordexo-hub/.env.local",
    "/srv/nordexo-hub/.env",
    "/srv/node-tools/digideal-tracker/.env",
  ];
  for (const file of envFiles) {
    await loadEnvFile(file);
  }
};

const parseNumericArg = (name: string, fallback: number) => {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  const value = direct ? direct.slice(name.length + 1) : null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
};

const hasFlag = (flag: string) => process.argv.includes(flag);

const parseStringArg = (name: string) => {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return direct ? direct.slice(name.length + 1).trim() : "";
};

const resolveSellerGroup = (value?: string | null) => {
  const normalized = toText(value).toLowerCase();
  if (!normalized) return null;
  return (
    SELLER_GROUPS.find((group) =>
      group.variants.some((variant) => {
        const variantValue = variant.toLowerCase();
        if (variantValue === normalized) return true;
        if (normalized.startsWith(variantValue)) {
          const suffix = normalized.slice(variantValue.length);
          return suffix.length > 0 && /^[\s\d-]+$/.test(suffix);
        }
        return false;
      })
    )?.display ?? null
  );
};

const parseIsoTime = (value: string | null) => {
  if (!value) return NaN;
  return Date.parse(value);
};

const daysSince = (value: string | null) => {
  const time = parseIsoTime(value);
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
};

const normalizeExistingClass = (value: unknown): DigidealShippingClass | null => {
  const classCode = toText(value).toUpperCase();
  if (classCode === "NOR" || classCode === "BAT" || classCode === "PBA" || classCode === "LIQ") {
    return classCode;
  }
  return null;
};

const classifyWithRetry = async (
  row: DigidealRow,
  apiKey: string,
  model: string,
  retries: number
) => {
  const title = toText(row.title_h1);
  const longTitle = toText(row.listing_title);
  const description = stripHtml(
    [bulletPointsToText(row.bullet_points), toText(row.description_html)]
      .filter(Boolean)
      .join("\n")
  );

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await classifyDigidealShippingClass({
        apiKey,
        model,
        title,
        longTitle,
        description,
        timeoutMs: 25_000,
      });
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(attempt * 1200);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unknown classification error.");
};

async function main() {
  await loadEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  const apiKey = process.env.OPENAI_API_KEY || "";
  const model =
    parseStringArg("--model") ||
    process.env.DIGIDEAL_SHIPPING_MODEL ||
    process.env.OPENAI_EDIT_MODEL ||
    "gpt-5.2";

  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL.");
  if (!serviceRole) throw new Error("Missing SUPABASE service role key.");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY.");

  const dryRun = hasFlag("--dry-run");
  const force = hasFlag("--force");
  const limit = parseNumericArg("--limit", Number.POSITIVE_INFINITY);
  const concurrency = parseNumericArg("--concurrency", DEFAULT_CONCURRENCY);
  const gadgetBayOldDays = parseNumericArg(
    "--gadgetbay-old-days",
    DEFAULT_GADGETBAY_OLD_DAYS
  );
  const retries = parseNumericArg("--retries", 3);

  const includeProductIds = parseStringArg("--product-ids")
    .split(/[,\s]+/g)
    .map((value) => value.trim())
    .filter(Boolean);
  const includeSet = includeProductIds.length > 0 ? new Set(includeProductIds) : null;

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows: DigidealRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("digideal_products")
      .select(
        "product_id, seller_name, listing_title, title_h1, description_html, bullet_points, first_seen_at, last_seen_at, shipping_class"
      )
      .order("product_id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const chunk = (data ?? []) as DigidealRow[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }

  const candidates = rows
    .filter((row) => {
      if (!row.product_id) return false;
      if (includeSet && !includeSet.has(String(row.product_id))) return false;

      const sellerGroup = resolveSellerGroup(row.seller_name);
      if (sellerGroup === "Nordexo") return false;

      const lastActivity = row.last_seen_at ?? row.first_seen_at;
      const isOldGadgetBay =
        sellerGroup === "GadgetBay" && daysSince(lastActivity) >= gadgetBayOldDays;
      if (isOldGadgetBay) return false;

      if (force) return true;
      return normalizeExistingClass(row.shipping_class) === null;
    })
    .slice(0, Number.isFinite(limit) ? limit : rows.length);

  console.log(
    `[digideal shipping-class] Loaded ${rows.length} rows, ${candidates.length} candidate(s). ` +
      `dryRun=${dryRun} force=${force} model=${model} concurrency=${concurrency}`
  );

  let processed = 0;
  let updated = 0;
  let failed = 0;
  const classCount: Record<DigidealShippingClass, number> = {
    NOR: 0,
    BAT: 0,
    PBA: 0,
    LIQ: 0,
  };

  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }).map((_, workerIdx) =>
    (async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= candidates.length) return;

        const row = candidates[index];
        try {
          const result = await classifyWithRetry(row, apiKey, model, retries);
          classCount[result.shipping_class] += 1;
          processed += 1;

          if (!dryRun) {
            const { error } = await supabase
              .from("digideal_products")
              .update({
                shipping_class: result.shipping_class,
                shipping_class_confidence: result.confidence,
                shipping_class_reason: result.reason,
                shipping_class_source: "ai_backfill",
                shipping_class_model: result.model,
                shipping_class_classified_at: new Date().toISOString(),
              })
              .eq("product_id", row.product_id);

            if (error) {
              failed += 1;
              console.error(
                `[w${workerIdx + 1}] ${row.product_id} update failed: ${error.message}`
              );
              continue;
            }
            updated += 1;
          } else {
            updated += 1;
          }

          if (processed % 25 === 0 || processed === candidates.length) {
            console.log(
              `[digideal shipping-class] progress ${processed}/${candidates.length} (updated=${updated}, failed=${failed})`
            );
          }
        } catch (error) {
          processed += 1;
          failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[w${workerIdx + 1}] ${row.product_id} classify failed: ${message}`);
        }
      }
    })()
  );

  await Promise.all(workers);

  console.log("[digideal shipping-class] done");
  console.log(
    JSON.stringify(
      {
        dryRun,
        force,
        model,
        totals: {
          loaded: rows.length,
          candidates: candidates.length,
          processed,
          updated,
          failed,
        },
        classCount,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[digideal shipping-class] fatal: ${message}`);
  process.exit(1);
});
