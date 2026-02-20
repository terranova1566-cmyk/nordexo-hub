import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { collectMacros } from "@/lib/email-templates";
import { sanitizeEmailHtml } from "@/lib/email-html";
import {
  listEmailMacroDefinitions,
  validateTemplateMacroUsage,
} from "@/lib/email-macro-registry";

export const runtime = "nodejs";

const TABLE = "partner_email_templates";

function normalizeTemplateId(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return raw.replace(/\s+/g, "_");
}

function validateTemplateId(value: string): string | null {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{1,63}$/.test(value)) {
    return "Template ID must be 2-64 chars and use letters, numbers, _ or -.";
  }
  return null;
}

function parseTags(value: unknown) {
  const rawList = Array.isArray(value)
    ? value.map((entry) => String(entry ?? ""))
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(rawList.map((entry) => entry.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from(TABLE)
    .select(
      "template_id,name,description,category,tags,owner_user_id,owner_team,subject_template,body_template,macros,created_at,updated_at"
    )
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: data ?? [] });
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
  const category = String(payload.category ?? "").trim() || null;
  const ownerUserId =
    String(payload.owner_user_id ?? payload.ownerUserId ?? "").trim() || null;
  const ownerTeam = String(payload.owner_team ?? payload.ownerTeam ?? "").trim() || null;
  const tags = parseTags(payload.tags ?? payload.tag_list ?? payload.tagList);
  const subjectTemplate = String(payload.subject_template ?? "");
  const bodyTemplate = sanitizeEmailHtml(String(payload.body_template ?? ""));

  const suppliedMacros = Array.isArray(payload.macros)
    ? payload.macros
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
    : [];

  const inferredMacros = collectMacros(`${subjectTemplate}\n${bodyTemplate}`);
  const macros = Array.from(new Set([...suppliedMacros, ...inferredMacros]));
  const { macros: macroDefinitions } = await listEmailMacroDefinitions(auth.supabase, {
    includeInactive: true,
    includeDeprecated: true,
  });
  const macroValidation = validateTemplateMacroUsage({
    subjectTemplate,
    bodyTemplate,
    existingMacros: macros,
    definitions: macroDefinitions,
  });
  const warnings: string[] = [];
  if (macroValidation.unknownMacros.length > 0) {
    warnings.push(
      `Unknown macros: ${macroValidation.unknownMacros
        .map((key) => `{{${key}}}`)
        .join(", ")}`
    );
  }
  if (macroValidation.deprecatedMacros.length > 0) {
    warnings.push(
      `Deprecated macros: ${macroValidation.deprecatedMacros
        .map((key) => `{{${key}}}`)
        .join(", ")}`
    );
  }

  const { data, error } = await auth.supabase
    .from(TABLE)
    .insert({
      template_id: templateId,
      name,
      description,
      category,
      tags,
      owner_user_id: ownerUserId,
      owner_team: ownerTeam,
      subject_template: subjectTemplate,
      body_template: bodyTemplate,
      macros,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(
      "template_id,name,description,category,tags,owner_user_id,owner_team,subject_template,body_template,macros,created_at,updated_at"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: versionError } = await auth.supabase
    .from("partner_email_template_versions")
    .insert({
      template_id: templateId,
      subject_template: subjectTemplate,
      body_template: bodyTemplate,
      macros,
      created_by: auth.userId,
    });

  if (versionError) {
    return NextResponse.json({ error: versionError.message }, { status: 500 });
  }

  return NextResponse.json({
    ...data,
    macro_validation: macroValidation,
    warnings,
  });
}
