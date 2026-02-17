import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export type AdminAuthResult =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createServerSupabase>>;
      userId: string;
    }
  | {
      ok: false;
      response: NextResponse;
      supabase: Awaited<ReturnType<typeof createServerSupabase>>;
    };

export async function requireAdmin(): Promise<AdminAuthResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase,
    };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
      supabase,
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
    };
  }

  return { ok: true, supabase, userId: user.id };
}
