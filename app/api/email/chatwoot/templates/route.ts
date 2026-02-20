import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import {
  CHATWOOT_TEMPLATE_LANGUAGES,
  collectChatwootMacros,
  extractJsonObject,
  isChatwootTemplateLanguage,
  normalizeTemplateId,
  type ChatwootTemplateLanguage,
  validateTemplateId,
} from "@/lib/chatwoot-templates";

export const runtime = "nodejs";

const TABLE_TEMPLATES = "chatwoot_reply_templates";
const TABLE_LOCALIZATIONS = "chatwoot_reply_template_localizations";
const TABLE_VERSIONS = "chatwoot_reply_template_versions";
const DEFAULT_LANGUAGE: ChatwootTemplateLanguage = "sv";
const TRANSLATED_LANGUAGES: ChatwootTemplateLanguage[] = ["no", "fi", "en"];

type LocalizationDraft = {
  languageCode: ChatwootTemplateLanguage;
  subjectTemplate: string;
  bodyTemplate: string;
};

type TranslatedPayload = Record<
  ChatwootTemplateLanguage,
  { subject_template: string; body_template: string }
>;

const uniqueMacros = (values: unknown[]) =>
  Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

const normalizeLanguage = (value: unknown): ChatwootTemplateLanguage => {
  if (isChatwootTemplateLanguage(value)) return value;
  return DEFAULT_LANGUAGE;
};

const parseProvidedMacros = (payload: Record<string, unknown>) => {
  return Array.isArray(payload.macros)
    ? payload.macros.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
};

const buildTranslationsPrompt = (subjectTemplate: string, bodyTemplate: string) => {
  return [
    "You translate customer support email templates from Swedish.",
    "Translate the Swedish template to Norwegian, Finnish, and English.",
    "Rules:",
    "- Keep placeholders EXACT and unchanged (case-sensitive).",
    "- Preserve tokens in [UPPER_SNAKE_CASE] exactly.",
    "- Preserve tokens in {{snake_case}} exactly.",
    "- Preserve line breaks and paragraph structure.",
    "- Return JSON only with this exact shape:",
    '{ "translations": { "no": { "subject_template": "...", "body_template": "..." }, "fi": { "subject_template": "...", "body_template": "..." }, "en": { "subject_template": "...", "body_template": "..." } } }',
    "",
    "Swedish template input:",
    `SUBJECT:\n${subjectTemplate || ""}`,
    "",
    `BODY:\n${bodyTemplate || ""}`,
  ].join("\n");
};

const translateFromSwedish = async (input: {
  subjectTemplate: string;
  bodyTemplate: string;
}): Promise<{ translations: Partial<TranslatedPayload>; warning?: string }> => {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return {
      translations: {},
      warning: "OPENAI_API_KEY is missing. Auto-translation skipped.",
    };
  }

  const model = String(process.env.CHATWOOT_TEMPLATE_TRANSLATE_MODEL || "gpt-5.2").trim();
  const prompt = buildTranslationsPrompt(input.subjectTemplate, input.bodyTemplate);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

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
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        translations: {},
        warning: `Auto-translation failed (${response.status}): ${text || "request failed"}`,
      };
    }

    const payload = await response.json().catch(() => null);
    const content = String(payload?.choices?.[0]?.message?.content ?? "");
    const parsed = extractJsonObject(content);
    if (!parsed) {
      return { translations: {}, warning: "Auto-translation failed: invalid JSON output." };
    }

    const translationsNode =
      parsed.translations && typeof parsed.translations === "object"
        ? (parsed.translations as Record<string, unknown>)
        : {};

    const translations: Partial<TranslatedPayload> = {};
    for (const language of TRANSLATED_LANGUAGES) {
      const node = translationsNode[language];
      if (!node || typeof node !== "object") continue;
      const row = node as Record<string, unknown>;
      translations[language] = {
        subject_template: String(row.subject_template ?? ""),
        body_template: String(row.body_template ?? ""),
      };
    }

    return { translations };
  } catch (error) {
    return {
      translations: {},
      warning: `Auto-translation failed: ${(error as Error).message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchTemplatesWithLocalizations = async (
  auth: Extract<Awaited<ReturnType<typeof requireAdmin>>, { ok: true }>
) => {
  const { supabase } = auth;

  const { data: templates, error: templateError } = await supabase
    .from(TABLE_TEMPLATES)
    .select("template_id,name,description,macros,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (templateError) {
    throw new Error(templateError.message);
  }

  const templateIds = (templates ?? []).map((item) => String(item.template_id ?? "")).filter(Boolean);
  if (templateIds.length === 0) {
    return [];
  }

  const { data: localizations, error: localizationError } = await supabase
    .from(TABLE_LOCALIZATIONS)
    .select(
      "template_id,language_code,subject_template,body_template,created_at,updated_at"
    )
    .in("template_id", templateIds)
    .order("updated_at", { ascending: false });

  if (localizationError) {
    throw new Error(localizationError.message);
  }

  const grouped = new Map<string, Record<string, unknown>[]>();
  (localizations ?? []).forEach((item) => {
    const templateId = String(item.template_id ?? "");
    if (!templateId) return;
    if (!grouped.has(templateId)) grouped.set(templateId, []);
    grouped.get(templateId)?.push(item as Record<string, unknown>);
  });

  return (templates ?? []).map((template) => ({
    ...template,
    localizations: grouped.get(String(template.template_id ?? "")) ?? [],
  }));
};

const insertVersion = async (
  auth: Extract<Awaited<ReturnType<typeof requireAdmin>>, { ok: true }>,
  row: LocalizationDraft & { templateId: string; macros: string[] }
) => {
  const { error } = await auth.supabase.from(TABLE_VERSIONS).insert({
    template_id: row.templateId,
    language_code: row.languageCode,
    subject_template: row.subjectTemplate,
    body_template: row.bodyTemplate,
    macros: row.macros,
    created_by: auth.userId,
  });
  if (error) throw new Error(error.message);
};

const upsertLocalization = async (
  auth: Extract<Awaited<ReturnType<typeof requireAdmin>>, { ok: true }>,
  row: LocalizationDraft & { templateId: string }
) => {
  const { error } = await auth.supabase.from(TABLE_LOCALIZATIONS).upsert(
    {
      template_id: row.templateId,
      language_code: row.languageCode,
      subject_template: row.subjectTemplate,
      body_template: row.bodyTemplate,
      updated_by: auth.userId,
      created_by: auth.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "template_id,language_code" }
  );
  if (error) throw new Error(error.message);
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const templates = await fetchTemplatesWithLocalizations(auth);
    return NextResponse.json({
      templates,
      languages: CHATWOOT_TEMPLATE_LANGUAGES,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const templateId = normalizeTemplateId(payload.template_id);
  const templateIdError = validateTemplateId(templateId);
  if (templateIdError) {
    return NextResponse.json({ error: templateIdError }, { status: 400 });
  }

  const name = String(payload.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const descriptionRaw = String(payload.description ?? "").trim();
  const description = descriptionRaw || null;
  const languageCode = normalizeLanguage(payload.language_code);
  const subjectTemplate = String(payload.subject_template ?? "");
  const bodyTemplate = String(payload.body_template ?? "");
  const autoTranslate = Boolean(payload.auto_translate);

  const suppliedMacros = parseProvidedMacros(payload);
  const inferredMacros = collectChatwootMacros(`${subjectTemplate}\n${bodyTemplate}`);
  const macros = uniqueMacros([...suppliedMacros, ...inferredMacros]);

  const { data: inserted, error: insertError } = await auth.supabase
    .from(TABLE_TEMPLATES)
    .insert({
      template_id: templateId,
      name,
      description,
      macros,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("template_id,name,description,macros,created_at,updated_at")
    .maybeSingle();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  if (!inserted) {
    return NextResponse.json({ error: "Unable to create template." }, { status: 500 });
  }

  try {
    await upsertLocalization(auth, {
      templateId,
      languageCode,
      subjectTemplate,
      bodyTemplate,
    });
    await insertVersion(auth, {
      templateId,
      languageCode,
      subjectTemplate,
      bodyTemplate,
      macros,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  let translationWarning: string | null = null;
  if (languageCode === "sv" && autoTranslate) {
    const { translations, warning } = await translateFromSwedish({
      subjectTemplate,
      bodyTemplate,
    });
    if (warning) translationWarning = warning;

    for (const language of TRANSLATED_LANGUAGES) {
      const translated = translations[language];
      if (!translated) continue;
      try {
        await upsertLocalization(auth, {
          templateId,
          languageCode: language,
          subjectTemplate: translated.subject_template,
          bodyTemplate: translated.body_template,
        });
        await insertVersion(auth, {
          templateId,
          languageCode: language,
          subjectTemplate: translated.subject_template,
          bodyTemplate: translated.body_template,
          macros,
        });
      } catch (error) {
        translationWarning = (error as Error).message;
      }
    }
  }

  try {
    const templates = await fetchTemplatesWithLocalizations(auth);
    const created = templates.find((item) => item.template_id === templateId);
    return NextResponse.json({
      template: created ?? null,
      warning: translationWarning,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
