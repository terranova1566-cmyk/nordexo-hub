import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceFile = path.join(projectRoot, "i18n", "strings.json");
const translatedFile = path.join(
  projectRoot,
  "i18n",
  "translations.generated.json"
);

const loadEnvFile = async (filePath) => {
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
    // ignore missing env files
  }
};

const loadEnv = async () => {
  await loadEnvFile(path.join(projectRoot, ".env.local"));
  await loadEnvFile(path.join(projectRoot, ".env"));
};

const chunk = (items, size) => {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const buildRows = (entries, translations, locale) =>
  entries
    .map((entry) => ({
      key: entry.key,
      locale,
      value: translations?.[locale]?.[entry.key],
      context: entry.context ?? null,
    }))
    .filter((row) => row.value);

const run = async () => {
  await loadEnv();
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.");
  }

  const source = JSON.parse(await fs.readFile(sourceFile, "utf8"));
  const entries = source.strings ?? [];
  let translations = {};
  try {
    const translationRaw = await fs.readFile(translatedFile, "utf8");
    translations = JSON.parse(translationRaw);
  } catch {
    // allow syncing English only
  }

  const rows = [
    ...entries.map((entry) => ({
      key: entry.key,
      locale: "en",
      value: entry.text,
      context: entry.context ?? null,
    })),
    ...buildRows(entries, translations, "sv"),
    ...buildRows(entries, translations, "zh-Hans"),
  ];

  if (rows.length === 0) {
    console.log("No translations to sync.");
    return;
  }

  const batches = chunk(rows, 200);
  for (const batch of batches) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/portal_ui_translations?on_conflict=key,locale`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(batch),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase error ${response.status}: ${errorText}`);
    }
  }

  console.log(`Synced ${rows.length} translations to Supabase.`);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
