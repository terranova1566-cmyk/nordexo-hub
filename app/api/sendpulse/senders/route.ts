import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
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
    return NextResponse.json({ senders: activeSenders });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
