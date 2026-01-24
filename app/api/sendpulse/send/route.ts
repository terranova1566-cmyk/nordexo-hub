import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { appendSendLog, sendTemplateEmail } from "@/lib/sendpulse";

export const runtime = "nodejs";

function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const toValue = String(body?.to ?? "").trim();
  const subject = String(body?.subject ?? "").trim();
  const templateId = String(body?.templateId ?? "").trim();
  const senderEmail = String(body?.senderEmail ?? "").trim();
  const senderName = body?.senderName ? String(body.senderName).trim() : null;
  const variables = (body?.variables ?? {}) as Record<string, string>;

  if (!toValue || !subject || !templateId || !senderEmail) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 }
    );
  }

  const recipients = parseRecipients(toValue);
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No valid recipient emails provided." },
      { status: 400 }
    );
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  let status: "success" | "failed" = "success";
  let responsePayload: unknown = null;
  let errorMessage: string | null = null;

  try {
    responsePayload = await sendTemplateEmail({
      subject,
      senderEmail,
      senderName,
      recipients,
      templateId,
      variables,
    });
  } catch (error) {
    status = "failed";
    errorMessage = (error as Error).message;
  }

  const logEntry = {
    user_id: user.id,
    sender_email: senderEmail,
    sender_name: senderName,
    template_id: templateId,
    subject,
    to_emails: recipients.map((recipient) => recipient.email),
    variables,
    status,
    response: responsePayload,
    error: errorMessage,
  };

  try {
    await adminClient.from("sendpulse_email_logs").insert(logEntry);
  } catch {
    await appendSendLog({
      ...logEntry,
      created_at: new Date().toISOString(),
    });
  }

  if (status === "failed") {
    return NextResponse.json(
      { error: errorMessage ?? "SendPulse request failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, response: responsePayload });
}
