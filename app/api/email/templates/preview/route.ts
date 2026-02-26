import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { renderTemplate } from "@/lib/email-templates";
import { sanitizeEmailHtml } from "@/lib/email-html";
import { appendSignatureToEmailHtml } from "@/lib/email-sender-signatures";
import {
  listEmailMacroDefinitions,
  resolveTemplateMacros,
} from "@/lib/email-macro-registry";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const subjectTemplate = String(payload.subject_template ?? payload.subjectTemplate ?? "");
  const bodyTemplate = sanitizeEmailHtml(
    String(payload.body_template ?? payload.bodyTemplate ?? "")
  );
  const senderSignature = String(
    payload.sender_signature ?? payload.senderSignature ?? ""
  );
  const providedMacros = Array.isArray(payload.macros)
    ? payload.macros.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];

  if (!subjectTemplate && !bodyTemplate) {
    return NextResponse.json(
      { error: "subject_template or body_template is required." },
      { status: 400 }
    );
  }

  const variables =
    payload.variables && typeof payload.variables === "object"
      ? (payload.variables as Record<string, unknown>)
      : {};
  const context =
    payload.context && typeof payload.context === "object"
      ? (payload.context as Record<string, unknown>)
      : {};

  const { macros: macroDefinitions } = await listEmailMacroDefinitions(auth.supabase, {
    includeInactive: true,
    includeDeprecated: true,
  });

  const macroResolution = resolveTemplateMacros({
    subjectTemplate,
    bodyTemplate,
    existingMacros: providedMacros,
    definitions: macroDefinitions,
    variables,
    context,
  });

  const renderVariables: Record<string, string> = {};
  Object.entries(variables).forEach(([key, value]) => {
    renderVariables[key] = String(value ?? "");
  });
  Object.entries(macroResolution.values).forEach(([key, value]) => {
    renderVariables[key] = String(value ?? "");
  });

  const renderedSubject = renderTemplate(subjectTemplate, renderVariables);
  const renderedBody = sanitizeEmailHtml(renderTemplate(bodyTemplate, renderVariables));
  const renderedBodyWithSignature = sanitizeEmailHtml(
    appendSignatureToEmailHtml(renderedBody, senderSignature)
  );

  return NextResponse.json({
    rendered_subject: renderedSubject,
    rendered_body: renderedBodyWithSignature,
    macro_resolution: macroResolution,
  });
}
