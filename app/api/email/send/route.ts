import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { renderTemplate, stripHtml } from "@/lib/email-templates";
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
      ? Object.entries(payload.variables as Record<string, unknown>).reduce<
          Record<string, string>
        >((acc, [key, value]) => {
          acc[key] = String(value ?? "");
          return acc;
        }, {})
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
    .select("template_id,name,subject_template,body_template")
    .eq("template_id", templateId)
    .maybeSingle();

  if (templateError) {
    return NextResponse.json({ error: templateError.message }, { status: 500 });
  }
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const renderedSubject = manualSubject || renderTemplate(template.subject_template || "", variables);
  const renderedBody = renderTemplate(template.body_template || "", variables);

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

  try {
    responsePayload = await sendEmailViaSmtp({
      subject: renderedSubject,
      html: renderedBody,
      text: stripHtml(renderedBody),
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
    rendered_body: renderedBody,
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

  return NextResponse.json({ ok: true, response: responsePayload });
}
