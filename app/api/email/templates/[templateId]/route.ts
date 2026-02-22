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
const TEMPLATE_SELECT_WITH_METADATA =
  "template_id,name,description,category,tags,owner_user_id,owner_team,subject_template,body_template,macros,created_at,updated_at";
const TEMPLATE_SELECT_LEGACY =
  "template_id,name,description,subject_template,body_template,macros,created_at,updated_at";

type RouteContext = {
  params: Promise<{ templateId: string }>;
};

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

function isMissingTemplateMetadataColumnError(error: unknown) {
  const code = String((error as { code?: string })?.code ?? "");
  if (code === "42703") return true;

  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  if (!message.includes(TABLE)) return false;
  const hasMetadataColumn = ["category", "tags", "owner_user_id", "owner_team"].some((column) =>
    message.includes(column)
  );
  if (!hasMetadataColumn) return false;
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find") ||
    message.includes("column")
  );
}

function normalizeTemplateRow<T extends Record<string, unknown>>(row: T) {
  return {
    ...row,
    category: Object.prototype.hasOwnProperty.call(row, "category")
      ? row.category ?? null
      : null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    owner_user_id: Object.prototype.hasOwnProperty.call(row, "owner_user_id")
      ? row.owner_user_id ?? null
      : null,
    owner_team: Object.prototype.hasOwnProperty.call(row, "owner_team")
      ? row.owner_team ?? null
      : null,
  };
}

export async function GET(_: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { templateId } = await context.params;
  const id = String(templateId || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Template ID is required." }, { status: 400 });
  }

  const withMetadata = await auth.supabase
    .from(TABLE)
    .select(TEMPLATE_SELECT_WITH_METADATA)
    .eq("template_id", id)
    .maybeSingle();

  if (withMetadata.error && !isMissingTemplateMetadataColumnError(withMetadata.error)) {
    return NextResponse.json({ error: withMetadata.error.message }, { status: 500 });
  }
  if (!withMetadata.error && withMetadata.data) {
    return NextResponse.json(normalizeTemplateRow(withMetadata.data));
  }
  if (!withMetadata.error && !withMetadata.data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const legacy = await auth.supabase
    .from(TABLE)
    .select(TEMPLATE_SELECT_LEGACY)
    .eq("template_id", id)
    .maybeSingle();
  if (legacy.error) {
    return NextResponse.json({ error: legacy.error.message }, { status: 500 });
  }
  if (!legacy.data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(normalizeTemplateRow(legacy.data));
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { templateId } = await context.params;
  const id = String(templateId || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Template ID is required." }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_by: auth.userId, updated_at: new Date().toISOString() };

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

  if (Object.prototype.hasOwnProperty.call(payload, "category")) {
    const value = String(payload.category ?? "").trim();
    updates.category = value || null;
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, "owner_user_id") ||
    Object.prototype.hasOwnProperty.call(payload, "ownerUserId")
  ) {
    const value = String(payload.owner_user_id ?? payload.ownerUserId ?? "").trim();
    updates.owner_user_id = value || null;
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, "owner_team") ||
    Object.prototype.hasOwnProperty.call(payload, "ownerTeam")
  ) {
    const value = String(payload.owner_team ?? payload.ownerTeam ?? "").trim();
    updates.owner_team = value || null;
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, "tags") ||
    Object.prototype.hasOwnProperty.call(payload, "tag_list") ||
    Object.prototype.hasOwnProperty.call(payload, "tagList")
  ) {
    updates.tags = parseTags(payload.tags ?? payload.tag_list ?? payload.tagList);
  }

  if (typeof payload.subject_template === "string") {
    updates.subject_template = payload.subject_template;
  }

  if (typeof payload.body_template === "string") {
    updates.body_template = sanitizeEmailHtml(payload.body_template);
  }

  const hasSubjectUpdate = Object.prototype.hasOwnProperty.call(updates, "subject_template");
  const hasBodyUpdate = Object.prototype.hasOwnProperty.call(updates, "body_template");
  const needsMacroRecalc =
    typeof payload.macros === "object" || hasSubjectUpdate || hasBodyUpdate;

  let existingTemplateBody: { subject_template: string; body_template: string } | null = null;
  if (needsMacroRecalc) {
    const { data: existingData, error: existingError } = await auth.supabase
      .from(TABLE)
      .select("subject_template,body_template")
      .eq("template_id", id)
      .maybeSingle();
    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (!existingData) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    existingTemplateBody = {
      subject_template: String(existingData.subject_template ?? ""),
      body_template: String(existingData.body_template ?? ""),
    };
  }

  const subjectTemplate = hasSubjectUpdate
    ? String(updates.subject_template ?? "")
    : String(existingTemplateBody?.subject_template ?? "");
  const bodyTemplate = hasBodyUpdate
    ? String(updates.body_template ?? "")
    : String(existingTemplateBody?.body_template ?? "");

  if (typeof payload.macros === "object") {
    const provided = Array.isArray(payload.macros)
      ? payload.macros.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : [];
    const inferred = collectMacros(`${subjectTemplate}\n${bodyTemplate}`);
    updates.macros = Array.from(new Set([...provided, ...inferred]));
  } else if (
    Object.prototype.hasOwnProperty.call(updates, "subject_template") ||
    Object.prototype.hasOwnProperty.call(updates, "body_template")
  ) {
    const inferred = collectMacros(`${subjectTemplate}\n${bodyTemplate}`);
    updates.macros = inferred;
  }

  const hasRealUpdates = Object.keys(updates).some(
    (key) => key !== "updated_by" && key !== "updated_at"
  );
  if (!hasRealUpdates) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  let data: Record<string, unknown> | null = null;
  const withMetadataUpdate = await auth.supabase
    .from(TABLE)
    .update(updates)
    .eq("template_id", id)
    .select(TEMPLATE_SELECT_WITH_METADATA)
    .maybeSingle();
  if (withMetadataUpdate.error && !isMissingTemplateMetadataColumnError(withMetadataUpdate.error)) {
    return NextResponse.json({ error: withMetadataUpdate.error.message }, { status: 500 });
  }
  if (!withMetadataUpdate.error) {
    data = withMetadataUpdate.data as Record<string, unknown> | null;
  } else {
    const metadataKeys = new Set(["category", "tags", "owner_user_id", "owner_team"]);
    const legacyUpdates: Record<string, unknown> = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (metadataKeys.has(key)) return;
      legacyUpdates[key] = value;
    });
    const legacyUpdate = await auth.supabase
      .from(TABLE)
      .update(legacyUpdates)
      .eq("template_id", id)
      .select(TEMPLATE_SELECT_LEGACY)
      .maybeSingle();
    if (legacyUpdate.error) {
      return NextResponse.json({ error: legacyUpdate.error.message }, { status: 500 });
    }
    data = legacyUpdate.data as Record<string, unknown> | null;
  }

  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (
    Object.prototype.hasOwnProperty.call(updates, "subject_template") ||
    Object.prototype.hasOwnProperty.call(updates, "body_template") ||
    Object.prototype.hasOwnProperty.call(updates, "macros")
  ) {
    const { error: versionError } = await auth.supabase
      .from("partner_email_template_versions")
      .insert({
        template_id: id,
        subject_template: String(data.subject_template ?? ""),
        body_template: String(data.body_template ?? ""),
        macros: Array.isArray(data.macros) ? data.macros : [],
        created_by: auth.userId,
      });

    if (versionError) {
      return NextResponse.json({ error: versionError.message }, { status: 500 });
    }
  }

  const { macros: macroDefinitions } = await listEmailMacroDefinitions(auth.supabase, {
    includeInactive: true,
    includeDeprecated: true,
  });
  const macroValidation = validateTemplateMacroUsage({
    subjectTemplate: String(data.subject_template ?? ""),
    bodyTemplate: String(data.body_template ?? ""),
    existingMacros: Array.isArray(data.macros) ? data.macros : [],
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

  return NextResponse.json({
    ...normalizeTemplateRow(data),
    macro_validation: macroValidation,
    warnings,
  });
}

export async function DELETE(_: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { templateId } = await context.params;
  const id = String(templateId || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Template ID is required." }, { status: 400 });
  }

  const { error } = await auth.supabase.from(TABLE).delete().eq("template_id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
