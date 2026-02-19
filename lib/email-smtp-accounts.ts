import type { SupabaseClient } from "@supabase/supabase-js";
import type { SmtpConfig } from "@/lib/email-smtp";

const SMTP_ACCOUNTS_TABLE = "partner_email_smtp_accounts";

type SmtpAccountRow = {
  id: string;
  name: string;
  from_email: string;
  from_name: string | null;
  smtp_host: string;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_user: string;
  smtp_pass?: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type EmailSmtpAccount = {
  id: string;
  name: string;
  fromEmail: string;
  fromName: string | null;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass?: string;
  hasPassword: boolean;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export function isMissingSmtpAccountsTableError(error: unknown) {
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  if (!message.includes(SMTP_ACCOUNTS_TABLE)) return false;
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
}

function normalizeRow(row: SmtpAccountRow): EmailSmtpAccount {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    fromEmail: String(row.from_email ?? "").trim(),
    fromName: row.from_name ? String(row.from_name) : null,
    host: String(row.smtp_host ?? "").trim(),
    port: Number(row.smtp_port ?? 587),
    secure: Boolean(row.smtp_secure),
    user: String(row.smtp_user ?? "").trim(),
    pass: row.smtp_pass ? String(row.smtp_pass) : undefined,
    hasPassword: Boolean(row.smtp_pass),
    isActive: row.is_active !== false,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function listEmailSmtpAccounts(
  supabase: SupabaseClient,
  options?: {
    activeOnly?: boolean;
    includeSecret?: boolean;
  }
) {
  const includeSecret = Boolean(options?.includeSecret);
  const activeOnly = Boolean(options?.activeOnly);
  let query = supabase
    .from(SMTP_ACCOUNTS_TABLE)
    .select(
      includeSecret
        ? "id,name,from_email,from_name,smtp_host,smtp_port,smtp_secure,smtp_user,smtp_pass,is_active,created_at,updated_at"
        : "id,name,from_email,from_name,smtp_host,smtp_port,smtp_secure,smtp_user,is_active,created_at,updated_at"
    )
    .order("updated_at", { ascending: false, nullsFirst: false });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingSmtpAccountsTableError(error)) {
      return { missingTable: true, accounts: [] as EmailSmtpAccount[] };
    }
    throw error;
  }

  const rows = ((data as unknown) as SmtpAccountRow[] | null) ?? [];
  return {
    missingTable: false,
    accounts: rows.map((row) => normalizeRow(row)),
  };
}

export async function getEmailSmtpAccountById(
  supabase: SupabaseClient,
  id: string,
  options?: { includeSecret?: boolean }
) {
  const includeSecret = Boolean(options?.includeSecret);
  const { data, error } = await supabase
    .from(SMTP_ACCOUNTS_TABLE)
    .select(
      includeSecret
        ? "id,name,from_email,from_name,smtp_host,smtp_port,smtp_secure,smtp_user,smtp_pass,is_active,created_at,updated_at"
        : "id,name,from_email,from_name,smtp_host,smtp_port,smtp_secure,smtp_user,is_active,created_at,updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingSmtpAccountsTableError(error)) {
      return { missingTable: true, account: null as EmailSmtpAccount | null };
    }
    throw error;
  }

  return {
    missingTable: false,
    account: data ? normalizeRow((data as unknown) as SmtpAccountRow) : null,
  };
}

export function smtpConfigFromAccount(account: EmailSmtpAccount): SmtpConfig {
  if (!account.pass) {
    throw new Error("SMTP account is missing a password.");
  }
  return {
    host: account.host,
    port: account.port,
    secure: account.secure,
    user: account.user,
    pass: account.pass,
    defaultFromEmail: account.fromEmail,
    defaultFromName: account.fromName || account.fromEmail,
  };
}
