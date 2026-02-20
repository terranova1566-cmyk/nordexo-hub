import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import {
  CHATWOOT_TEMPLATE_LANGUAGES,
  isChatwootTemplateLanguage,
} from "@/lib/chatwoot-templates";

export const runtime = "nodejs";

const TABLE = "chatwoot_reply_template_versions";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const templateId = String(url.searchParams.get("template_id") || "").trim();
  if (!templateId) {
    return NextResponse.json({ error: "template_id is required." }, { status: 400 });
  }

  const languageCodeRaw = String(url.searchParams.get("language_code") || "").trim();
  const hasLanguage = Boolean(languageCodeRaw);
  if (hasLanguage && !isChatwootTemplateLanguage(languageCodeRaw)) {
    return NextResponse.json(
      {
        error: `language_code must be one of: ${CHATWOOT_TEMPLATE_LANGUAGES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  let query = auth.supabase
    .from(TABLE)
    .select(
      "id,template_id,language_code,subject_template,body_template,macros,created_at"
    )
    .eq("template_id", templateId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (hasLanguage) {
    query = query.eq("language_code", languageCodeRaw);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ versions: data ?? [] });
}
