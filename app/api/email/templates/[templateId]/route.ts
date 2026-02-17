import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { collectMacros } from "@/lib/email-templates";

export const runtime = "nodejs";

const TABLE = "partner_email_templates";

type RouteContext = {
  params: Promise<{ templateId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { templateId } = await context.params;
  const id = String(templateId || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Template ID is required." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from(TABLE)
    .select(
      "template_id,name,description,subject_template,body_template,macros,created_at,updated_at"
    )
    .eq("template_id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(data);
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

  if (typeof payload.subject_template === "string") {
    updates.subject_template = payload.subject_template;
  }

  if (typeof payload.body_template === "string") {
    updates.body_template = payload.body_template;
  }

  const subjectTemplate =
    typeof updates.subject_template === "string"
      ? String(updates.subject_template)
      : typeof payload.subject_template === "string"
        ? payload.subject_template
        : "";
  const bodyTemplate =
    typeof updates.body_template === "string"
      ? String(updates.body_template)
      : typeof payload.body_template === "string"
        ? payload.body_template
        : "";

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

  const { data, error } = await auth.supabase
    .from(TABLE)
    .update(updates)
    .eq("template_id", id)
    .select(
      "template_id,name,description,subject_template,body_template,macros,created_at,updated_at"
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  return NextResponse.json(data);
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
