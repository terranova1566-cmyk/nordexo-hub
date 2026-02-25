import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { getEnvSmtpConfig } from "@/lib/email-smtp";
import {
  isMissingSmtpAccountsTableError,
  listEmailSmtpAccounts,
} from "@/lib/email-smtp-accounts";
import { listSenders as listSendpulseSenders } from "@/lib/sendpulse";

export const runtime = "nodejs";

const SMTP_ACCOUNTS_TABLE = "partner_email_smtp_accounts";

type SmtpAccountResponse = {
  id: string;
  name: string;
  fromEmail: string;
  fromName: string | null;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPassword: boolean;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type SendpulseSenderResponse = {
  email: string;
  name: string | null;
  status: string | null;
};

type CreateOrUpdatePayload = {
  id?: string;
  name?: string;
  fromEmail?: string;
  fromName?: string | null;
  host?: string;
  port?: number | string;
  secure?: boolean;
  user?: string;
  password?: string;
  isActive?: boolean;
};

const trimText = (value: unknown) => String(value ?? "").trim();

const toOptionalText = (value: unknown) => {
  const next = String(value ?? "").trim();
  return next || null;
};

const toPort = (value: unknown) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const rounded = Math.trunc(number);
  if (rounded < 1 || rounded > 65535) return null;
  return rounded;
};

const normalizeSendpulseError = (error: unknown) => {
  const message = String((error as Error)?.message ?? "").trim();
  const lowered = message.toLowerCase();
  if (lowered.includes("missing sendpulse client credentials")) {
    return "SendPulse credentials are missing on the server.";
  }
  return message || "Unable to load SendPulse senders.";
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let smtpAccounts: SmtpAccountResponse[] = [];
  let smtpSettingsTableMissing = false;
  try {
    const result = await listEmailSmtpAccounts(auth.supabase, {
      includeSecret: false,
    });
    smtpAccounts = result.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      fromEmail: account.fromEmail,
      fromName: account.fromName,
      host: account.host,
      port: account.port,
      secure: account.secure,
      user: account.user,
      hasPassword: account.hasPassword,
      isActive: account.isActive,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }));
    smtpSettingsTableMissing = result.missingTable;
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Unable to load SMTP settings." },
      { status: 500 }
    );
  }

  const envConfig = getEnvSmtpConfig();
  const envSender = envConfig
    ? {
        email: envConfig.defaultFromEmail,
        name: envConfig.defaultFromName || envConfig.defaultFromEmail,
        host: envConfig.host,
        port: envConfig.port,
        secure: envConfig.secure,
        user: envConfig.user,
      }
    : null;

  let sendpulseSenders: SendpulseSenderResponse[] = [];
  let sendpulseError: string | null = null;
  try {
    const list = await listSendpulseSenders();
    sendpulseSenders = list.map((sender) => ({
      email: sender.email,
      name: sender.name ?? null,
      status: sender.status ?? null,
    }));
  } catch (error) {
    sendpulseError = normalizeSendpulseError(error);
  }

  const smtpActiveCount = smtpAccounts.filter((account) => account.isActive).length;
  const smtpConfigured = smtpActiveCount > 0 || Boolean(envSender);
  const sendpulseConfigured =
    !sendpulseError &&
    sendpulseSenders.some(
      (sender) => String(sender.status ?? "").trim().toLowerCase() !== "inactive"
    );

  return NextResponse.json({
    smtpAccounts,
    smtpSettingsTableMissing,
    smtpActiveCount,
    smtpConfigured,
    envSender,
    sendpulseSenders,
    sendpulseError,
    sendpulseConfigured,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: CreateOrUpdatePayload;
  try {
    payload = (await request.json()) as CreateOrUpdatePayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const name = trimText(payload.name);
  const fromEmail = trimText(payload.fromEmail);
  const host = trimText(payload.host);
  const user = trimText(payload.user);
  const password = trimText(payload.password);
  const port = toPort(payload.port ?? 587);
  const secure = Boolean(payload.secure);
  const fromName = toOptionalText(payload.fromName);
  const isActive = payload.isActive !== false;

  if (!name || !fromEmail || !host || !user || !password || !port) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: name, fromEmail, host, port, user, password.",
      },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from(SMTP_ACCOUNTS_TABLE)
    .insert({
      name,
      from_email: fromEmail,
      from_name: fromName,
      smtp_host: host,
      smtp_port: port,
      smtp_secure: secure,
      smtp_user: user,
      smtp_pass: password,
      is_active: isActive,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(
      "id,name,from_email,from_name,smtp_host,smtp_port,smtp_secure,smtp_user,is_active,created_at,updated_at"
    )
    .single();

  if (error) {
    if (isMissingSmtpAccountsTableError(error)) {
      return NextResponse.json(
        {
          error:
            "SMTP settings table is missing. Run the latest Supabase migration first.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    account: {
      id: data.id,
      name: data.name,
      fromEmail: data.from_email,
      fromName: data.from_name,
      host: data.smtp_host,
      port: data.smtp_port,
      secure: data.smtp_secure,
      user: data.smtp_user,
      hasPassword: true,
      isActive: data.is_active !== false,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: CreateOrUpdatePayload;
  try {
    payload = (await request.json()) as CreateOrUpdatePayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const id = trimText(payload.id);
  if (!id) {
    return NextResponse.json({ error: "Missing account id." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  if (payload.name !== undefined) updates.name = trimText(payload.name);
  if (payload.fromEmail !== undefined) updates.from_email = trimText(payload.fromEmail);
  if (payload.fromName !== undefined) updates.from_name = toOptionalText(payload.fromName);
  if (payload.host !== undefined) updates.smtp_host = trimText(payload.host);
  if (payload.port !== undefined) {
    const port = toPort(payload.port);
    if (!port) {
      return NextResponse.json({ error: "SMTP port must be between 1 and 65535." }, { status: 400 });
    }
    updates.smtp_port = port;
  }
  if (payload.secure !== undefined) updates.smtp_secure = Boolean(payload.secure);
  if (payload.user !== undefined) updates.smtp_user = trimText(payload.user);
  if (payload.password !== undefined) {
    const nextPassword = trimText(payload.password);
    if (nextPassword) {
      updates.smtp_pass = nextPassword;
    }
  }
  if (payload.isActive !== undefined) updates.is_active = Boolean(payload.isActive);

  const requiredTextKeys = ["name", "from_email", "smtp_host", "smtp_user"] as const;
  for (const key of requiredTextKeys) {
    if (key in updates && !String(updates[key] ?? "").trim()) {
      return NextResponse.json({ error: `${key} cannot be empty.` }, { status: 400 });
    }
  }

  const { data, error } = await auth.supabase
    .from(SMTP_ACCOUNTS_TABLE)
    .update(updates)
    .eq("id", id)
    .select(
      "id,name,from_email,from_name,smtp_host,smtp_port,smtp_secure,smtp_user,is_active,created_at,updated_at"
    )
    .single();

  if (error) {
    if (isMissingSmtpAccountsTableError(error)) {
      return NextResponse.json(
        {
          error:
            "SMTP settings table is missing. Run the latest Supabase migration first.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    account: {
      id: data.id,
      name: data.name,
      fromEmail: data.from_email,
      fromName: data.from_name,
      host: data.smtp_host,
      port: data.smtp_port,
      secure: data.smtp_secure,
      user: data.smtp_user,
      hasPassword: true,
      isActive: data.is_active !== false,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: { id?: string };
  try {
    payload = (await request.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const id = trimText(payload.id);
  if (!id) {
    return NextResponse.json({ error: "Missing account id." }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from(SMTP_ACCOUNTS_TABLE)
    .delete()
    .eq("id", id);

  if (error) {
    if (isMissingSmtpAccountsTableError(error)) {
      return NextResponse.json(
        {
          error:
            "SMTP settings table is missing. Run the latest Supabase migration first.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
