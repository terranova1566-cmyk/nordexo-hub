import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import {
  deleteEmailSenderSignature,
  isMissingEmailSenderSignaturesTableError,
  isValidEmail,
  normalizeSenderEmail,
  normalizeSignatureText,
  upsertEmailSenderSignature,
} from "@/lib/email-sender-signatures";

export const runtime = "nodejs";

type SignaturePayload = {
  senderEmail?: string;
  signature?: string;
};

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: SignaturePayload;
  try {
    payload = (await request.json()) as SignaturePayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const senderEmail = normalizeSenderEmail(payload.senderEmail);
  if (!isValidEmail(senderEmail)) {
    return NextResponse.json({ error: "A valid sender email is required." }, { status: 400 });
  }

  const signatureText = normalizeSignatureText(payload.signature);

  try {
    if (!signatureText) {
      await deleteEmailSenderSignature(auth.supabase, senderEmail);
      return NextResponse.json({
        ok: true,
        signature: null,
        senderEmail,
      });
    }

    const signature = await upsertEmailSenderSignature(auth.supabase, {
      senderEmail,
      signatureText,
      userId: auth.userId,
    });
    return NextResponse.json({
      ok: true,
      signature: signature
        ? {
            senderEmail: signature.senderEmail,
            signatureText: signature.signatureText,
            updatedAt: signature.updatedAt,
          }
        : null,
    });
  } catch (error) {
    if (isMissingEmailSenderSignaturesTableError(error)) {
      return NextResponse.json(
        {
          error:
            "Signature settings table is missing. Run migration 0069_partner_email_sender_signatures.sql first.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: (error as Error).message || "Unable to save signature." },
      { status: 500 }
    );
  }
}
