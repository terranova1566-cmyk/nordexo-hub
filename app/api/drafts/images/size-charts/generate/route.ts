import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";
import { refreshDraftImageScoreByAbsolutePath } from "@/lib/draft-image-score";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

const RENDER_SCRIPT_PATH = "/srv/nordexo-hub/scripts/render-sizechart-image.mjs";
const DEFAULT_TRANSLATE_MODEL =
  process.env.DRAFT_SIZE_CHART_TRANSLATE_MODEL ||
  process.env.OPENAI_EDIT_MODEL ||
  "gpt-5.2";

const FILES_DIR_CANDIDATES = ["Files (F)", "files", "Files"];
const SOURCE_JSON_CANDIDATE_NAMES = [
  "sizechart_gpt.json",
  "sizechart.json",
  "size_chart_gpt.json",
  "size-chart.json",
];

const LANGUAGES = [
  { code: "SE", key: "se", targetLabel: "Swedish" },
  { code: "NO", key: "no", targetLabel: "Norwegian Bokmal" },
  { code: "EN", key: "en", targetLabel: "English" },
] as const;

type LanguageKey = (typeof LANGUAGES)[number]["key"];

type SizeChartPayload = {
  tables?: Array<{
    columns?: Array<Record<string, unknown>>;
    rows?: Array<Record<string, unknown>>;
    table_type?: string;
  }>;
  sizing_info_sv?: unknown;
  sizing_info_se?: unknown;
  sizing_info_en?: unknown;
  sizing_info_no?: unknown;
  [key: string]: unknown;
};

type GeneratedChartItem = {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  pixelQualityScore: number | null;
  languageCode: string;
};

const normalizePathValue = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

const toSafeBaseName = (value: string) =>
  String(value || "")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "") || "SPU";

const extractJsonFromText = (text: string) => {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const isInsideDraftRoot = (absolutePath: string) =>
  absolutePath === DRAFT_ROOT || absolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`);

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const };
};

const pickFilesFolder = (mainAbsolutePath: string) => {
  for (const dirName of FILES_DIR_CANDIDATES) {
    const absolute = path.join(mainAbsolutePath, dirName);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
      return absolute;
    }
  }
  return null;
};

const pickSourceSizeChartJson = (filesAbsolutePath: string) => {
  const direct = SOURCE_JSON_CANDIDATE_NAMES.find((name) => {
    const absolute = path.join(filesAbsolutePath, name);
    return fs.existsSync(absolute) && fs.statSync(absolute).isFile();
  });
  if (direct) return path.join(filesAbsolutePath, direct);

  const entries = fs
    .readdirSync(filesAbsolutePath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".json")
    .map((entry) => entry.name)
    .filter((name) => /size[\s_-]*chart/i.test(name))
    .sort((left, right) => left.localeCompare(right));

  if (entries.length === 0) return null;
  return path.join(filesAbsolutePath, entries[0]);
};

const readSizingInfoArray = (payload: SizeChartPayload) => {
  const raw =
    payload.sizing_info_sv ??
    payload.sizing_info_se ??
    payload.sizing_info_en ??
    payload.sizing_info_no ??
    [];
  if (!Array.isArray(raw)) return [] as string[];
  return raw.map((value) => String(value ?? "").trim()).filter(Boolean);
};

const readBaseLabelTexts = (payload: SizeChartPayload) => {
  const out: string[] = [];
  const tables = Array.isArray(payload.tables) ? payload.tables : [];
  tables.forEach((table) => {
    const columns = Array.isArray(table?.columns) ? table.columns : [];
    columns.forEach((column) => {
      const value =
        String(
          column?.label_sv ??
            column?.label_se ??
            column?.label_en ??
            column?.label_no ??
            column?.label ??
            column?.key ??
            ""
        ).trim() || "Column";
      out.push(value);
    });
  });
  return out;
};

const applyTranslatedTexts = (
  payload: SizeChartPayload,
  lang: LanguageKey,
  labels: string[],
  notes: string[]
) => {
  const cloned = JSON.parse(JSON.stringify(payload)) as SizeChartPayload;
  const tables = Array.isArray(cloned.tables) ? cloned.tables : [];
  let labelIndex = 0;
  tables.forEach((table) => {
    const columns = Array.isArray(table?.columns) ? table.columns : [];
    columns.forEach((column) => {
      const nextText = labels[labelIndex] ?? labels.at(-1) ?? "Column";
      labelIndex += 1;
      column.label_sv = nextText;
      column[`label_${lang}`] = nextText;
    });
  });

  cloned[`sizing_info_${lang}`] = notes;
  if (lang === "se") {
    cloned.sizing_info_sv = notes;
  }
  return cloned;
};

const callTranslationModel = async (
  texts: string[],
  targetLabel: string
): Promise<string[] | null> => {
  if (texts.length === 0) return [];
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_TRANSLATE_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You translate e-commerce size chart labels and notes. Keep units and numbers unchanged. Return strict JSON only.",
        },
        {
          role: "user",
          content: [
            `Translate the input texts from Swedish to ${targetLabel}.`,
            "Do not add explanations.",
            "Keep output array order exactly identical to input.",
            'Return JSON with shape: {"translations":["..."]}.',
            "",
            JSON.stringify({ texts }),
          ].join("\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  const content = String(payload?.choices?.[0]?.message?.content || "").trim();
  if (!content) return null;

  const parsed = extractJsonFromText(content);
  const translationsRaw = (parsed as Record<string, unknown> | null)?.translations;
  if (!Array.isArray(translationsRaw)) return null;
  const translations = translationsRaw.map((value) => String(value ?? "").trim());
  if (translations.length !== texts.length) return null;
  return translations;
};

const renderLanguageChart = async (args: {
  localizedPayload: SizeChartPayload;
  outputAbsolutePath: string;
  lang: LanguageKey;
}) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "draft-sizechart-"));
  const tempInputPath = path.join(tempDir, `sizechart-${args.lang}.json`);
  fs.writeFileSync(tempInputPath, JSON.stringify(args.localizedPayload, null, 2), "utf8");
  try {
    await execFileAsync(
      process.execPath,
      [
        RENDER_SCRIPT_PATH,
        "--input",
        tempInputPath,
        "--output",
        args.outputAbsolutePath,
        "--lang",
        args.lang,
      ],
      {
        cwd: "/srv/nordexo-hub",
        maxBuffer: 1024 * 1024 * 2,
      }
    );
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore tmp cleanup failures.
    }
  }
};

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const mainPath = normalizePathValue(body.mainPath);
  const forceRegenerate = Boolean(body.force);
  if (!mainPath) {
    return NextResponse.json({ error: "Missing mainPath." }, { status: 400 });
  }

  const mainAbsolutePath = resolveDraftPath(mainPath);
  if (!mainAbsolutePath || !isInsideDraftRoot(mainAbsolutePath)) {
    return NextResponse.json({ error: "Invalid main path." }, { status: 400 });
  }
  if (!fs.existsSync(mainAbsolutePath) || !fs.statSync(mainAbsolutePath).isDirectory()) {
    return NextResponse.json({ error: "Main folder not found." }, { status: 404 });
  }

  const filesAbsolutePath = pickFilesFolder(mainAbsolutePath);
  if (!filesAbsolutePath) {
    return NextResponse.json(
      { error: "No Files folder found for this product.", generated: [], skipped: [] },
      { status: 404 }
    );
  }

  const sourceJsonAbsolutePath = pickSourceSizeChartJson(filesAbsolutePath);
  if (!sourceJsonAbsolutePath) {
    return NextResponse.json({
      generated: [],
      skipped: [],
      sourceJsonPath: null,
      message: "No size chart JSON found.",
    });
  }

  let sourcePayload: SizeChartPayload;
  try {
    sourcePayload = JSON.parse(fs.readFileSync(sourceJsonAbsolutePath, "utf8")) as SizeChartPayload;
  } catch {
    return NextResponse.json(
      { error: "Unable to parse size chart JSON source." },
      { status: 400 }
    );
  }

  const sourceStat = fs.statSync(sourceJsonAbsolutePath);
  const sourceMtimeMs = sourceStat.mtimeMs;
  const relativeMainPath = toRelativePath(mainAbsolutePath);
  const mainParts = relativeMainPath.split("/").filter(Boolean);
  const spu = String(mainParts[1] || mainParts[0] || "SPU").trim();
  const safeSpu = toSafeBaseName(spu);

  const baseLabels = readBaseLabelTexts(sourcePayload);
  const baseNotes = readSizingInfoArray(sourcePayload);
  const generated: GeneratedChartItem[] = [];
  const skipped: Array<{ path: string; languageCode: string; reason: string }> = [];
  const errors: Array<{ languageCode: string; error: string }> = [];

  const translatedLabelsByLang = new Map<LanguageKey, string[]>();
  const translatedNotesByLang = new Map<LanguageKey, string[]>();

  for (const locale of LANGUAGES) {
    const outputName = `${safeSpu}-size-chart-${locale.code} (SIZE).jpg`;
    const outputAbsolutePath = path.join(mainAbsolutePath, outputName);
    const outputRelativePath = toRelativePath(outputAbsolutePath);

    const outputExists = fs.existsSync(outputAbsolutePath) && fs.statSync(outputAbsolutePath).isFile();
    if (outputExists && !forceRegenerate) {
      const outputStat = fs.statSync(outputAbsolutePath);
      if (outputStat.mtimeMs >= sourceMtimeMs) {
        skipped.push({
          path: outputRelativePath,
          languageCode: locale.code,
          reason: "already_up_to_date",
        });
        continue;
      }
    }

    let labels = baseLabels;
    let notes = baseNotes;
    if (locale.key !== "se") {
      if (!translatedLabelsByLang.has(locale.key)) {
        const translated = await callTranslationModel(baseLabels, locale.targetLabel);
        translatedLabelsByLang.set(locale.key, translated && translated.length ? translated : baseLabels);
      }
      if (!translatedNotesByLang.has(locale.key)) {
        const translated = await callTranslationModel(baseNotes, locale.targetLabel);
        translatedNotesByLang.set(locale.key, translated && translated.length ? translated : baseNotes);
      }
      labels = translatedLabelsByLang.get(locale.key) || baseLabels;
      notes = translatedNotesByLang.get(locale.key) || baseNotes;
    }

    const localizedPayload = applyTranslatedTexts(sourcePayload, locale.key, labels, notes);
    try {
      await renderLanguageChart({
        localizedPayload,
        outputAbsolutePath,
        lang: locale.key,
      });
      const outputStat = fs.statSync(outputAbsolutePath);
      let pixelQualityScore: number | null = null;
      try {
        const refreshed = await refreshDraftImageScoreByAbsolutePath(outputAbsolutePath);
        pixelQualityScore = refreshed.pixelQualityScore;
      } catch {
        pixelQualityScore = null;
      }
      generated.push({
        name: outputName,
        path: outputRelativePath,
        size: outputStat.size,
        modifiedAt: new Date(outputStat.mtimeMs).toISOString(),
        pixelQualityScore,
        languageCode: locale.code,
      });
    } catch (err) {
      errors.push({
        languageCode: locale.code,
        error:
          err instanceof Error ? err.message : `Failed to render ${locale.code} size chart.`,
      });
    }
  }

  return NextResponse.json({
    sourceJsonPath: toRelativePath(sourceJsonAbsolutePath),
    generated,
    skipped,
    errors,
  });
}
