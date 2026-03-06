import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { listEmailSenderSignatures } from "@/lib/email-sender-signatures";
import { listSenders } from "@/lib/sendpulse";

export const runtime = "nodejs";

const DEFAULT_SENDPULSE_SENDER_EMAIL = "support@nodexo.se";

const normalizeToken = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const isExcludedSender = (sender: { email?: unknown; name?: unknown }) => {
  const name = normalizeToken(sender.name);
  return name === "thomas at gadget bay";
};

export async function GET() {
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

  try {
    const senders = await listSenders();
    const activeSenders = senders.filter(
      (sender) => sender.status?.toLowerCase() !== "inactive"
    );
    const prioritizedSenders = activeSenders
      .filter((sender) => !isExcludedSender(sender))
      .sort((left, right) => {
        const leftEmail = normalizeToken(left.email);
        const rightEmail = normalizeToken(right.email);
        const leftIsDefault = leftEmail === DEFAULT_SENDPULSE_SENDER_EMAIL;
        const rightIsDefault = rightEmail === DEFAULT_SENDPULSE_SENDER_EMAIL;
        if (leftIsDefault !== rightIsDefault) {
          return leftIsDefault ? -1 : 1;
        }
        return leftEmail.localeCompare(rightEmail);
      });
    const { signatures } = await listEmailSenderSignatures(supabase, {
      emails: prioritizedSenders.map((sender) => sender.email),
    });
    const signatureBySenderEmail = new Map(
      signatures.map((signature) => [signature.senderEmail, signature])
    );
    return NextResponse.json({
      senders: prioritizedSenders.map((sender) => {
        const signature = signatureBySenderEmail.get(
          String(sender.email ?? "").trim().toLowerCase()
        );
        return {
          ...sender,
          signature: signature?.signatureText ?? null,
          signatureUpdatedAt: signature?.updatedAt ?? null,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
