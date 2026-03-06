import fs from "node:fs";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DEFAULT_ALLOWED_VARIATIONS_FILE =
  process.env.ALLOWED_VARIATIONS_FILE ||
  "/srv/shopify-sync/api/data/allowed-variations.xlsx";
const AMOUNT_SUFFIX = (process.env.SKU_AMOUNT_SUFFIX || "P").trim() || "P";

type InputVariant = {
  key: string;
  id: string | null;
  draft_option1: string;
  draft_option2: string;
  draft_option3: string;
  draft_option4: string;
  draft_option_combined_zh: string;
  variation_color_se: string;
  variation_size_se: string;
  variation_other_se: string;
  variation_amount_se: string;
  draft_raw_row: Record<string, unknown>;
};

type AllowedEntry = { name: string; suffix: string };
type AllowedMaps = {
  colors: AllowedEntry[];
  sizes: AllowedEntry[];
  colorMap: Map<string, AllowedEntry>;
  sizeMap: Map<string, AllowedEntry>;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();
const normalizeKey = (value: unknown) => normalizeText(value).toLowerCase();

const buildCombinedOption = (input: {
  draft_option1: string;
  draft_option2: string;
  draft_option3: string;
  draft_option4: string;
  fallback: string;
}) =>
  [
    input.draft_option1,
    input.draft_option2,
    input.draft_option3,
    input.draft_option4,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" / ") || input.fallback.trim();

const normalizeAmount = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value) && value > 0) return String(value);
    return "";
  }
  const text = normalizeText(value);
  if (!text) return "";
  const strictNumeric = text.match(/^(\d+)$/);
  if (strictNumeric) return strictNumeric[1];
  const withUnit = text.match(/^(\d+)\s*(?:pack|p|st|pcs?)$/i);
  if (withUnit) return withUnit[1];
  return "";
};

const buildOtherMap = (values: string[]) => {
  const map = new Map<string, string>();
  let index = 1;
  values.forEach((value) => {
    const key = normalizeKey(value);
    if (!key || map.has(key)) return;
    map.set(key, String(index));
    index += 1;
  });
  return map;
};

const buildAllowedMaps = (
  colors: AllowedEntry[],
  sizes: AllowedEntry[]
): AllowedMaps => {
  const colorMap = new Map<string, AllowedEntry>();
  const sizeMap = new Map<string, AllowedEntry>();
  colors.forEach((entry) => {
    colorMap.set(normalizeKey(entry.name), entry);
  });
  sizes.forEach((entry) => {
    sizeMap.set(normalizeKey(entry.name), entry);
  });
  return { colors, sizes, colorMap, sizeMap };
};

const getAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const loadAllowedMapsFromDb = async (): Promise<AllowedMaps | null> => {
  const admin = getAdminClient();
  if (!admin) return null;
  try {
    const [{ data: colorRows, error: colorError }, { data: sizeRows, error: sizeError }] =
      await Promise.all([
        admin
          .from("allowed_variation_colors")
          .select("color_name,sku_suffix")
          .eq("is_active", true),
        admin
          .from("allowed_variation_sizes")
          .select("size_name,sku_suffix")
          .eq("is_active", true),
      ]);
    if (colorError || sizeError) return null;
    const colors =
      (colorRows || [])
        .map((row) => ({
          name: normalizeText(row.color_name),
          suffix: normalizeText(row.sku_suffix),
        }))
        .filter((entry) => entry.name && entry.suffix) || [];
    const sizes =
      (sizeRows || [])
        .map((row) => ({
          name: normalizeText(row.size_name),
          suffix: normalizeText(row.sku_suffix),
        }))
        .filter((entry) => entry.name && entry.suffix) || [];
    if (colors.length === 0 && sizes.length === 0) return null;
    return buildAllowedMaps(colors, sizes);
  } catch {
    return null;
  }
};

const loadAllowedMapsFromFile = (filePath: string): AllowedMaps => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return buildAllowedMaps([], []);
    }
    fs.accessSync(filePath, fs.constants.R_OK);
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
    if (!sheet) {
      return buildAllowedMaps([], []);
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Array<
      Array<unknown>
    >;
    const colors: AllowedEntry[] = [];
    const sizes: AllowedEntry[] = [];
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index] || [];
      const colorName = normalizeText(row[0]);
      const colorSuffix = normalizeText(row[1]);
      const sizeName = normalizeText(row[3]);
      const sizeSuffix = normalizeText(row[4]);
      if (colorName && colorSuffix) {
        colors.push({ name: colorName, suffix: colorSuffix });
      }
      if (sizeName && sizeSuffix) {
        sizes.push({ name: sizeName, suffix: sizeSuffix });
      }
    }
    return buildAllowedMaps(colors, sizes);
  } catch {
    return buildAllowedMaps([], []);
  }
};

const sanitizeVariant = (value: unknown, index: number): InputVariant | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rawRow =
    raw.draft_raw_row && typeof raw.draft_raw_row === "object" && !Array.isArray(raw.draft_raw_row)
      ? (raw.draft_raw_row as Record<string, unknown>)
      : {};
  return {
    key: normalizeText(raw.key) || `row-${index + 1}`,
    id: normalizeText(raw.id) || null,
    draft_option1: normalizeText(raw.draft_option1),
    draft_option2: normalizeText(raw.draft_option2),
    draft_option3: normalizeText(raw.draft_option3),
    draft_option4: normalizeText(raw.draft_option4),
    draft_option_combined_zh: normalizeText(raw.draft_option_combined_zh),
    variation_color_se: normalizeText(raw.variation_color_se),
    variation_size_se: normalizeText(raw.variation_size_se),
    variation_other_se: normalizeText(raw.variation_other_se),
    variation_amount_se: normalizeText(raw.variation_amount_se),
    draft_raw_row: { ...rawRow },
  };
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const spu = normalizeText(body?.spu).toUpperCase();
  const variantsRaw = Array.isArray(body?.variants) ? body.variants : [];
  if (!spu) {
    return NextResponse.json({ error: "Missing spu." }, { status: 400 });
  }
  const variants = variantsRaw
    .map((value: unknown, index: number) => sanitizeVariant(value, index))
    .filter((value: InputVariant | null): value is InputVariant => Boolean(value));
  if (variants.length === 0) {
    return NextResponse.json({ error: "No variants provided." }, { status: 400 });
  }

  const allowedFromDb = await loadAllowedMapsFromDb();
  const allowed =
    allowedFromDb || loadAllowedMapsFromFile(DEFAULT_ALLOWED_VARIATIONS_FILE);

  const otherMap = buildOtherMap(
    variants.map((row: InputVariant) => row.variation_other_se)
  );
  const usedSkus = new Set<string>();
  const warnings = new Set<string>();
  if (!allowedFromDb && allowed.colors.length === 0 && allowed.sizes.length === 0) {
    warnings.add(
      "Allowed color/size SKU mapping could not be loaded; generated fallback SKUs."
    );
  }

  const toUniqueSku = (rawSku: string) => {
    const base = normalizeText(rawSku) || spu;
    const baseKey = base.toLowerCase();
    if (!usedSkus.has(baseKey)) {
      usedSkus.add(baseKey);
      return base;
    }
    let index = 2;
    while (true) {
      const candidate = `${base}-${index}`;
      const key = candidate.toLowerCase();
      if (!usedSkus.has(key)) {
        usedSkus.add(key);
        return candidate;
      }
      index += 1;
    }
  };

  const regenerated = variants.map((row: InputVariant) => {
    const color = row.variation_color_se;
    const size = row.variation_size_se;
    const other = row.variation_other_se;
    const amount = normalizeAmount(row.variation_amount_se);

    const colorSuffix = color
      ? normalizeText(allowed.colorMap.get(normalizeKey(color))?.suffix)
      : "";
    const sizeSuffix = size
      ? normalizeText(allowed.sizeMap.get(normalizeKey(size))?.suffix)
      : "";
    const otherToken = other ? normalizeText(otherMap.get(normalizeKey(other))) : "";
    const amountToken = amount ? `${amount}${AMOUNT_SUFFIX}` : "";

    if (color && !colorSuffix) {
      warnings.add(`Unmapped color (no SKU suffix): "${color}"`);
    }
    if (size && !sizeSuffix) {
      warnings.add(`Unmapped size (no SKU suffix): "${size}"`);
    }
    if (row.variation_amount_se && !amount) {
      warnings.add(`Invalid amount (expected integer): "${row.variation_amount_se}"`);
    }

    const skuParts = [spu, otherToken, colorSuffix, sizeSuffix, amountToken].filter(Boolean);
    const draftSku = toUniqueSku(skuParts.join("-"));
    const combinedZh = buildCombinedOption({
      draft_option1: row.draft_option1,
      draft_option2: row.draft_option2,
      draft_option3: row.draft_option3,
      draft_option4: row.draft_option4,
      fallback: row.draft_option_combined_zh,
    });

    return {
      key: row.key,
      id: row.id,
      draft_sku: draftSku,
      draft_option_combined_zh: combinedZh,
      draft_raw_row: {
        ...row.draft_raw_row,
        variation_color_se: row.variation_color_se,
        variation_size_se: row.variation_size_se,
        variation_other_se: row.variation_other_se,
        variation_amount_se: row.variation_amount_se,
        draft_sku: draftSku,
      },
    };
  });

  return NextResponse.json({
    variants: regenerated,
    warnings: Array.from(warnings).slice(0, 24),
  });
}
