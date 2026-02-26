import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { renderTemplate, stripHtml } from "@/lib/email-templates";
import { sanitizeEmailHtml } from "@/lib/email-html";
import {
  appendSignatureToEmailHtml,
  appendSignatureToEmailText,
  listEmailSenderSignatures,
} from "@/lib/email-sender-signatures";
import {
  listEmailMacroDefinitions,
  resolveTemplateMacros,
} from "@/lib/email-macro-registry";
import { getEnvSmtpConfig, sendEmailViaSmtp } from "@/lib/email-smtp";
import {
  getEmailSmtpAccountById,
  listEmailSmtpAccounts,
  smtpConfigFromAccount,
} from "@/lib/email-smtp-accounts";

export const runtime = "nodejs";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRecipients(value: string) {
  return value
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => emailRegex.test(entry))
    .map((email) => ({
      email,
      name: email.split("@")[0],
    }));
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

  const toRaw = String(payload.to ?? "").trim();
  const templateId = String(payload.templateId ?? "").trim();
  const senderId = String(payload.senderId ?? "").trim();
  const senderEmail = String(payload.senderEmail ?? "").trim();
  const senderName = String(payload.senderName ?? "").trim() || null;
  const replyTo = String(payload.replyTo ?? "").trim() || undefined;
  const manualSubject = String(payload.subject ?? "").trim();

  const variables =
    payload.variables && typeof payload.variables === "object"
      ? (payload.variables as Record<string, unknown>)
      : {};
  const macroContext =
    payload.context && typeof payload.context === "object"
      ? (payload.context as Record<string, unknown>)
      : {};

  if (!toRaw || !templateId) {
    return NextResponse.json(
      { error: "Missing required fields: to, templateId." },
      { status: 400 }
    );
  }

  const recipients = parseRecipients(toRaw);
  if (!recipients.length) {
    return NextResponse.json(
      { error: "No valid recipient emails provided." },
      { status: 400 }
    );
  }

  const { data: template, error: templateError } = await auth.supabase
    .from("partner_email_templates")
    .select("template_id,name,subject_template,body_template,macros")
    .eq("template_id", templateId)
    .maybeSingle();

  if (templateError) {
    return NextResponse.json({ error: templateError.message }, { status: 500 });
  }
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const { macros: macroDefinitions } = await listEmailMacroDefinitions(auth.supabase, {
    includeInactive: true,
    includeDeprecated: true,
  });

  const macroResolution = resolveTemplateMacros({
    subjectTemplate: manualSubject ? "" : String(template.subject_template ?? ""),
    bodyTemplate: String(template.body_template ?? ""),
    definitions: macroDefinitions,
    variables,
    context: macroContext,
  });

  if (macroResolution.missingRequiredMacros.length > 0) {
    return NextResponse.json(
      {
        error: "Missing required macro values.",
        missing_macros: macroResolution.missingRequiredMacros,
        unknown_macros: macroResolution.unknownMacros,
        deprecated_macros: macroResolution.deprecatedMacros,
      },
      { status: 400 }
    );
  }

  const renderVariables: Record<string, string> = {};
  Object.entries(variables).forEach(([key, value]) => {
    renderVariables[key] = String(value ?? "");
  });
  Object.entries(macroResolution.values).forEach(([key, value]) => {
    renderVariables[key] = String(value ?? "");
  });

  const renderedSubject =
    manualSubject || renderTemplate(template.subject_template || "", renderVariables);
  const renderedBodyRaw = renderTemplate(template.body_template || "", renderVariables);
  const renderedBody = sanitizeEmailHtml(renderedBodyRaw);

  if (!renderedSubject) {
    return NextResponse.json(
      { error: "Rendered subject is empty. Provide subject or subject macro values." },
      { status: 400 }
    );
  }

  let status: "success" | "failed" = "success";
  let responsePayload: unknown = null;
  let errorMessage: string | null = null;

  let senderConfig: ReturnType<typeof getEnvSmtpConfig> = null;
  let resolvedSenderEmail = senderEmail || null;
  let resolvedSenderName = senderName;
  try {
    if (senderId && senderId !== "env-default") {
      const { account, missingTable } = await getEmailSmtpAccountById(
        auth.supabase,
        senderId,
        { includeSecret: true }
      );
      if (missingTable) {
        return NextResponse.json(
          {
            error:
              "SMTP settings table is missing. Run the latest Supabase migration before sending.",
          },
          { status: 500 }
        );
      }
      if (!account || !account.isActive) {
        return NextResponse.json({ error: "Selected sender was not found." }, { status: 404 });
      }
      senderConfig = smtpConfigFromAccount(account);
      resolvedSenderEmail = account.fromEmail;
      resolvedSenderName = account.fromName || account.name;
    } else if (senderEmail) {
      const { accounts, missingTable } = await listEmailSmtpAccounts(auth.supabase, {
        activeOnly: true,
        includeSecret: true,
      });
      if (!missingTable) {
        const matched = accounts.find(
          (entry) => entry.fromEmail.toLowerCase() === senderEmail.toLowerCase()
        );
        if (matched) {
          senderConfig = smtpConfigFromAccount(matched);
          resolvedSenderEmail = matched.fromEmail;
          resolvedSenderName = matched.fromName || matched.name;
        }
      }
    }

    if (!senderConfig) {
      senderConfig = getEnvSmtpConfig();
    }

    if (!senderConfig) {
      return NextResponse.json(
        {
          error:
            "No SMTP sender is configured. Add an SMTP account under Email > Email settings.",
        },
        { status: 400 }
      );
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  let senderSignatureText = "";
  try {
    if (resolvedSenderEmail) {
      const { signatures } = await listEmailSenderSignatures(auth.supabase, {
        emails: [resolvedSenderEmail],
      });
      senderSignatureText = signatures[0]?.signatureText ?? "";
    }
  } catch {
    senderSignatureText = "";
  }

  const renderedBodyWithSignature = sanitizeEmailHtml(
    appendSignatureToEmailHtml(renderedBody, senderSignatureText)
  );
  const renderedTextWithSignature = appendSignatureToEmailText(
    stripHtml(renderedBody),
    senderSignatureText
  );

  try {
    responsePayload = await sendEmailViaSmtp({
      subject: renderedSubject,
      html: renderedBodyWithSignature,
      text: renderedTextWithSignature,
      to: recipients,
      fromEmail: resolvedSenderEmail || undefined,
      fromName: resolvedSenderName || undefined,
      replyTo,
    }, senderConfig);
  } catch (error) {
    status = "failed";
    errorMessage = (error as Error).message;
  }

  const logEntry = {
    user_id: auth.userId,
    sender_email: resolvedSenderEmail,
    sender_name: resolvedSenderName,
    template_id: templateId,
    subject: manualSubject || template.subject_template || null,
    to_emails: recipients.map((recipient) => recipient.email),
    variables,
    rendered_subject: renderedSubject,
    rendered_body: renderedBodyWithSignature,
    status,
    response: responsePayload,
    error: errorMessage,
  };

  await auth.supabase.from("partner_email_send_logs").insert(logEntry);

  if (status === "failed") {
    return NextResponse.json(
      { error: errorMessage ?? "SMTP send failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    response: responsePayload,
    unknown_macros: macroResolution.unknownMacros,
    deprecated_macros: macroResolution.deprecatedMacros,
  });
}
