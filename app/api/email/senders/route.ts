import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { listConfiguredSenders } from "@/lib/email-smtp";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const senders = listConfiguredSenders().map((sender) => ({
      ...sender,
      status: "active",
    }));
    return NextResponse.json({ senders });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Unable to load sender identities." },
      { status: 500 }
    );
  }
}
