import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { listEmailSenderSignatures } from "@/lib/email-sender-signatures";
import { listSenders } from "@/lib/sendpulse";

export const runtime = "nodejs";

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
    const { signatures } = await listEmailSenderSignatures(supabase, {
      emails: activeSenders.map((sender) => sender.email),
    });
    const signatureBySenderEmail = new Map(
      signatures.map((signature) => [signature.senderEmail, signature])
    );
    return NextResponse.json({
      senders: activeSenders.map((sender) => {
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
