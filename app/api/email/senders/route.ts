import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { getEnvSmtpConfig } from "@/lib/email-smtp";
import { listEmailSmtpAccounts } from "@/lib/email-smtp-accounts";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { accounts, missingTable } = await listEmailSmtpAccounts(auth.supabase, {
      activeOnly: true,
    });

    const senders = accounts.map((account) => ({
      id: account.id,
      email: account.fromEmail,
      name: account.fromName || account.name || account.fromEmail,
      status: account.isActive ? "active" : "inactive",
      channel: "smtp",
      source: "database",
    }));

    const envConfig = getEnvSmtpConfig();
    if (envConfig) {
      const alreadyPresent = senders.some(
        (sender) => sender.email.toLowerCase() === envConfig.defaultFromEmail.toLowerCase()
      );
      if (!alreadyPresent) {
        senders.push({
          id: "env-default",
          email: envConfig.defaultFromEmail,
          name: envConfig.defaultFromName || envConfig.defaultFromEmail,
          status: "active",
          channel: "smtp",
          source: "env",
        });
      }
    }

    return NextResponse.json({
      senders,
      smtpConfigured: senders.length > 0,
      smtpSettingsTableMissing: missingTable,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Unable to load sender identities." },
      { status: 500 }
    );
  }
}
