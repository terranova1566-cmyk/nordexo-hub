import { NextResponse } from "next/server";
import fs from "fs/promises";
import { execFile } from "child_process";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SETTINGS_PATH =
  "/srv/shopify-sync/themes/stores/tingelo/theme.settings.json";
const STORE_CODE = "tingelo";

const COLOR_KEYS = [
  "color_body_bg",
  "color_body",
  "color_heading",
  "color_accent",
  "color_overlay",
  "color_announcement_bar_text",
  "color_announcement_bar_bg",
  "color_header_bg",
  "color_header_text",
  "color_price",
  "color_price_discounted",
  "color_footer_text",
  "color_footer_bg",
] as const;

type ColorKey = (typeof COLOR_KEYS)[number];

type CustomColorOverride = {
  id: string;
  label: string;
  value: string;
  source_type: string;
  source_file: string;
  source_line: number | null;
  selector: string;
  source_line_text: string;
  other_refs: string[];
  csv_key: string;
  notes: string;
};

const isValidHex = (value: string) => /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value);

const runSyncScript = () => {
  const syncScript = process.env.SHOPIFY_SYNC_SCRIPT;
  if (!syncScript) {
    return Promise.reject(new Error("SHOPIFY_SYNC_SCRIPT is not set."));
  }

  return (
    new Promise<void>((resolve, reject) => {
      execFile(
        process.execPath,
        [syncScript, `--store=${STORE_CODE}`],
        { timeout: 120000 },
        (error, stdout, stderr) => {
          if (error) {
            const detail =
              stderr?.toString().trim() || stdout?.toString().trim();
            reject(new Error(detail || "Sync script failed."));
            return;
          }
          resolve();
        }
      );
    })
  );
};

const loadSettings = async () => {
  const raw = await fs.readFile(SETTINGS_PATH, "utf8");
  return JSON.parse(raw);
};

const ensureAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { allowed: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: settings, error } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { allowed: false, response: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!settings?.is_admin) {
    return { allowed: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { allowed: true, response: null };
};

export async function GET() {
  const auth = await ensureAdmin();
  if (!auth.allowed) {
    return (
      auth.response ??
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );
  }

  try {
    const settings = await loadSettings();
    const colors = settings?.colors ?? {};
    const payload = COLOR_KEYS.reduce<Record<ColorKey, string>>((acc, key) => {
      acc[key] = colors[key] ?? "";
      return acc;
    }, {} as Record<ColorKey, string>);
    const overrides = Array.isArray(settings?.custom_color_overrides)
      ? settings.custom_color_overrides
      : [];

    return NextResponse.json({
      colors: payload,
      custom_color_overrides: overrides,
      store: settings?.store ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Unable to load store settings." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await ensureAdmin();
  if (!auth.allowed) {
    return (
      auth.response ??
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );
  }

  try {
    const body = (await request.json()) as {
      colors?: Record<string, string>;
      custom_color_overrides?: CustomColorOverride[];
    };
    if (!body?.colors) {
      return NextResponse.json({ error: "Missing colors payload." }, { status: 400 });
    }

    const settings = await loadSettings();
    const currentColors = settings?.colors ?? {};
    const nextColors: Record<string, string> = { ...currentColors };

    for (const key of COLOR_KEYS) {
      const rawValue = body.colors[key];
      if (rawValue === undefined) continue;
      const value = String(rawValue).trim();
      if (!isValidHex(value)) {
        return NextResponse.json(
          { error: `Invalid hex color for ${key}.` },
          { status: 400 }
        );
      }
      nextColors[key] = value;
    }

    const currentOverrides = Array.isArray(settings?.custom_color_overrides)
      ? settings.custom_color_overrides
      : [];
    const nextOverrides = Array.isArray(body.custom_color_overrides)
      ? body.custom_color_overrides.map((entry) => ({
          id: String(entry.id ?? ""),
          label: String(entry.label ?? ""),
          value: String(entry.value ?? ""),
          source_type: String(entry.source_type ?? ""),
          source_file: String(entry.source_file ?? ""),
          source_line:
            entry.source_line === null || entry.source_line === undefined
              ? null
              : Number(entry.source_line),
          selector: String(entry.selector ?? ""),
          source_line_text: String(entry.source_line_text ?? ""),
          other_refs: Array.isArray(entry.other_refs)
            ? entry.other_refs.map((ref) => String(ref))
            : [],
          csv_key: String(entry.csv_key ?? ""),
          notes: String(entry.notes ?? ""),
        }))
      : currentOverrides;

    const { store, colors, custom_color_overrides, ...rest } = settings ?? {};
    const nextSettings = {
      ...(store ? { store } : {}),
      colors: nextColors,
      custom_color_overrides: nextOverrides,
      ...rest,
    };
    await fs.writeFile(SETTINGS_PATH, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");

    await runSyncScript();

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Unable to save store settings." },
      { status: 500 }
    );
  }
}
