import type { SupabaseClient } from "@supabase/supabase-js";

const EMAIL_SIGNATURES_TABLE = "partner_email_sender_signatures";
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmailSenderSignatureRow = {
  sender_email: string | null;
  signature_text: string | null;
  updated_at: string | null;
};

export type EmailSenderSignature = {
  senderEmail: string;
  signatureText: string;
  updatedAt: string | null;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function normalizeSenderEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(value: unknown) {
  const email = normalizeSenderEmail(value);
  return emailRegex.test(email);
}

export function normalizeSignatureText(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

export function isMissingEmailSenderSignaturesTableError(error: unknown) {
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  if (!message.includes(EMAIL_SIGNATURES_TABLE)) return false;
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
}

function normalizeRow(row: EmailSenderSignatureRow): EmailSenderSignature | null {
  const senderEmail = normalizeSenderEmail(row.sender_email);
  if (!senderEmail) return null;
  return {
    senderEmail,
    signatureText: normalizeSignatureText(row.signature_text),
    updatedAt: row.updated_at ?? null,
  };
}

export async function listEmailSenderSignatures(
  supabase: SupabaseClient,
  options?: { emails?: string[] }
) {
  const normalizedEmails = Array.from(
    new Set(
      (options?.emails ?? [])
        .map((entry) => normalizeSenderEmail(entry))
        .filter(Boolean)
    )
  );

  let query = supabase
    .from(EMAIL_SIGNATURES_TABLE)
    .select("sender_email,signature_text,updated_at")
    .order("sender_email", { ascending: true });

  if (normalizedEmails.length > 0) {
    query = query.in("sender_email", normalizedEmails);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingEmailSenderSignaturesTableError(error)) {
      return {
        missingTable: true,
        signatures: [] as EmailSenderSignature[],
      };
    }
    throw error;
  }

  const rows = ((data as unknown) as EmailSenderSignatureRow[] | null) ?? [];
  return {
    missingTable: false,
    signatures: rows
      .map(normalizeRow)
      .filter((row): row is EmailSenderSignature => Boolean(row)),
  };
}

export async function upsertEmailSenderSignature(
  supabase: SupabaseClient,
  input: {
    senderEmail: string;
    signatureText: string;
    userId?: string | null;
  }
) {
  const senderEmail = normalizeSenderEmail(input.senderEmail);
  const signatureText = normalizeSignatureText(input.signatureText);

  const rowToSave: Record<string, unknown> = {
    sender_email: senderEmail,
    signature_text: signatureText,
    updated_at: new Date().toISOString(),
    updated_by: input.userId ?? null,
  };
  if (input.userId) {
    rowToSave.created_by = input.userId;
  }

  const { data, error } = await supabase
    .from(EMAIL_SIGNATURES_TABLE)
    .upsert(rowToSave, { onConflict: "sender_email" })
    .select("sender_email,signature_text,updated_at")
    .maybeSingle();

  if (error) throw error;
  const normalized = normalizeRow(
    ((data as unknown) as EmailSenderSignatureRow | null) ?? {
      sender_email: senderEmail,
      signature_text: signatureText,
      updated_at: null,
    }
  );
  return normalized;
}

export async function deleteEmailSenderSignature(
  supabase: SupabaseClient,
  senderEmailInput: string
) {
  const senderEmail = normalizeSenderEmail(senderEmailInput);
  const { error } = await supabase
    .from(EMAIL_SIGNATURES_TABLE)
    .delete()
    .eq("sender_email", senderEmail);
  if (error) throw error;
}

export function renderEmailSignatureHtml(signatureText: unknown) {
  const normalized = normalizeSignatureText(signatureText);
  if (!normalized) return "";
  return normalized
    .split("\n")
    .map((line) => escapeHtml(line))
    .join("<br />");
}

export function appendSignatureToEmailHtml(bodyHtml: unknown, signatureText: unknown) {
  const normalizedBody = String(bodyHtml ?? "");
  const signatureHtml = renderEmailSignatureHtml(signatureText);
  if (!signatureHtml) return normalizedBody;
  const bodyWithoutTrailingBreaks = normalizedBody
    .replace(/(?:\s|&nbsp;)*(?:<br\s*\/?>\s*)+$/gi, "")
    .trimEnd();
  if (!bodyWithoutTrailingBreaks.trim()) return signatureHtml;
  return `${bodyWithoutTrailingBreaks}<br /><br />${signatureHtml}`;
}

export function appendSignatureToEmailText(bodyText: unknown, signatureText: unknown) {
  const normalizedSignature = normalizeSignatureText(signatureText);
  const normalizedBody = String(bodyText ?? "");
  if (!normalizedSignature) return normalizedBody;
  if (!normalizedBody.trim()) return normalizedSignature;
  return `${normalizedBody.replace(/\s+$/, "")}\n\n${normalizedSignature}`;
}
