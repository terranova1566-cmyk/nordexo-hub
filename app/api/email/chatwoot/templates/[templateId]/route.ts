import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import {
  collectChatwootMacros,
  extractJsonObject,
  isChatwootTemplateLanguage,
  type ChatwootTemplateLanguage,
  validateTemplateId,
} from "@/lib/chatwoot-templates";

export const runtime = "nodejs";

const TABLE_TEMPLATES = "chatwoot_reply_templates";
const TABLE_LOCALIZATIONS = "chatwoot_reply_template_localizations";
const TABLE_VERSIONS = "chatwoot_reply_template_versions";
const DEFAULT_LANGUAGE: ChatwootTemplateLanguage = "sv";
const TRANSLATED_LANGUAGES: ChatwootTemplateLanguage[] = ["no", "fi", "en"];

type RouteContext = {
  params: Promise<{ templateId: string }>;
};

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

const fetchTemplateBundle = async (
  auth: Extract<Awaited<ReturnType<typeof requireAdmin>>, { ok: true }>,
  templateId: string
) => {
  const { data: template, error: templateError } = await auth.supabase
    .from(TABLE_TEMPLATES)
    .select("template_id,name,description,macros,created_at,updated_at")
    .eq("template_id", templateId)
    .maybeSingle();

  if (templateError) throw new Error(templateError.message);
  if (!template) return null;

  const { data: localizations, error: localizationError } = await auth.supabase
    .from(TABLE_LOCALIZATIONS)
    .select(
      "template_id,language_code,subject_template,body_template,created_at,updated_at"
    )
    .eq("template_id", templateId)
    .order("updated_at", { ascending: false });

  if (localizationError) throw new Error(localizationError.message);

  return {
    ...template,
    localizations: localizations ?? [],
  };
};

export async function GET(_: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { templateId } = await context.params;
  const id = String(templateId || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Template ID is required." }, { status: 400 });
  }
  const templateIdError = validateTemplateId(id);
  if (templateIdError) {
    return NextResponse.json({ error: templateIdError }, { status: 400 });
  }

  try {
    const template = await fetchTemplateBundle(auth, id);
    if (!template) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { templateId } = await context.params;
  const id = String(templateId || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Template ID is required." }, { status: 400 });
  }
  const templateIdError = validateTemplateId(id);
  if (templateIdError) {
    return NextResponse.json({ error: templateIdError }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await auth.supabase
    .from(TABLE_TEMPLATES)
    .select("template_id,name,description,macros")
    .eq("template_id", id)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const languageCode = normalizeLanguage(payload.language_code);
  const autoTranslate = Boolean(payload.auto_translate);
  const wantsSubject = typeof payload.subject_template === "string";
  const wantsBody = typeof payload.body_template === "string";
  const wantsLocalizationUpdate = wantsSubject || wantsBody;

  let localizationSubject = "";
  let localizationBody = "";

  if (wantsLocalizationUpdate) {
    const { data: existingLocalization, error: localizationError } = await auth.supabase
      .from(TABLE_LOCALIZATIONS)
      .select("subject_template,body_template")
      .eq("template_id", id)
      .eq("language_code", languageCode)
      .maybeSingle();
    if (localizationError) {
      return NextResponse.json({ error: localizationError.message }, { status: 500 });
    }

    localizationSubject = wantsSubject
      ? String(payload.subject_template ?? "")
      : String(existingLocalization?.subject_template ?? "");
    localizationBody = wantsBody
      ? String(payload.body_template ?? "")
      : String(existingLocalization?.body_template ?? "");
  }

  const providedMacros = parseProvidedMacros(payload);
  const inferredMacros = wantsLocalizationUpdate
    ? collectChatwootMacros(`${localizationSubject}\n${localizationBody}`)
    : [];
  const nextMacros = uniqueMacros([
    ...(Array.isArray(existing.macros) ? existing.macros : []),
    ...providedMacros,
    ...inferredMacros,
  ]);

  const updates: Record<string, unknown> = {
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };
  if (typeof payload.name === "string") {
    const value = payload.name.trim();
    if (!value) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    }
    updates.name = value;
  }
  if (typeof payload.description === "string") {
    const value = payload.description.trim();
    updates.description = value || null;
  }
  if (
    providedMacros.length > 0 ||
    wantsLocalizationUpdate ||
    (Array.isArray(payload.macros) && payload.macros.length === 0)
  ) {
    updates.macros = nextMacros;
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await auth.supabase
      .from(TABLE_TEMPLATES)
      .update(updates)
      .eq("template_id", id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  if (wantsLocalizationUpdate) {
    try {
      await upsertLocalization(auth, {
        templateId: id,
        languageCode,
        subjectTemplate: localizationSubject,
        bodyTemplate: localizationBody,
      });
      await insertVersion(auth, {
        templateId: id,
        languageCode,
        subjectTemplate: localizationSubject,
        bodyTemplate: localizationBody,
        macros: nextMacros,
      });
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
  }

  let translationWarning: string | null = null;
  if (languageCode === "sv" && autoTranslate && wantsLocalizationUpdate) {
    const { translations, warning } = await translateFromSwedish({
      subjectTemplate: localizationSubject,
      bodyTemplate: localizationBody,
    });
    if (warning) translationWarning = warning;

    for (const language of TRANSLATED_LANGUAGES) {
      const translated = translations[language];
      if (!translated) continue;
      try {
        await upsertLocalization(auth, {
          templateId: id,
          languageCode: language,
          subjectTemplate: translated.subject_template,
          bodyTemplate: translated.body_template,
        });
        await insertVersion(auth, {
          templateId: id,
          languageCode: language,
          subjectTemplate: translated.subject_template,
          bodyTemplate: translated.body_template,
          macros: nextMacros,
        });
      } catch (error) {
        translationWarning = (error as Error).message;
      }
    }
  }

  try {
    const template = await fetchTemplateBundle(auth, id);
    if (!template) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    return NextResponse.json({
      template,
      warning: translationWarning,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { templateId } = await context.params;
  const id = String(templateId || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Template ID is required." }, { status: 400 });
  }
  const templateIdError = validateTemplateId(id);
  if (templateIdError) {
    return NextResponse.json({ error: templateIdError }, { status: 400 });
  }

  const { error } = await auth.supabase.from(TABLE_TEMPLATES).delete().eq("template_id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
