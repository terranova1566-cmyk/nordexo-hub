import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type CheckResult =
  | { ok: true }
  | { ok: false; error: { message: string; code: string | null; details: unknown; hint: unknown } };

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

const serializeSupabaseError = (err: any) => ({
  message: String(err?.message ?? ""),
  code: typeof err?.code === "string" ? err.code : null,
  details: err?.details ?? null,
  hint: err?.hint ?? null,
});

const checkTable = async (supabase: any, table: string): Promise<CheckResult> => {
  const { error } = await supabase.from(table).select("id").limit(1);
  if (!error) return { ok: true };
  return { ok: false, error: serializeSupabaseError(error) };
};

async function main() {
  await loadEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
  }
  if (!serviceRole) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE.");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const checks: Record<string, CheckResult> = {};
  checks.ai_image_edit_prompts = await checkTable(supabase, "ai_image_edit_prompts");
  checks.amazon_full_scrapes = await checkTable(supabase, "amazon_full_scrapes");
  checks.amazon_product_cards = await checkTable(supabase, "amazon_product_cards");

  const missingAmazonTables = Object.entries(checks)
    .filter(([name, result]) =>
      name.startsWith("amazon_") &&
      !result.ok &&
      result.error.code === "PGRST205" &&
      result.error.message.toLowerCase().includes("could not find the table")
    )
    .map(([name]) => name);

  const recommendations: string[] = [];
  if (missingAmazonTables.length > 0) {
    recommendations.push(
      "Apply migration supabase/migrations/0043_amazon_scrapes.sql to your Supabase database."
    );
    recommendations.push(
      "After applying, reload the PostgREST schema cache in Supabase (or wait a minute and retry)."
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: missingAmazonTables.length === 0,
        supabase: { urlHost: new URL(supabaseUrl).host },
        checks,
        missingAmazonTables,
        recommendations,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(String((err as Error)?.message ?? err));
  process.exit(1);
});

