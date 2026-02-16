import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export type InternalAuthResult =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createServerSupabase>>;
      user: { id: string; email?: string | null };
      isAdmin: boolean;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export const requireB2BInternal = async (): Promise<InternalAuthResult> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
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
      response: NextResponse.json(
        { error: settingsError.message },
        { status: 500 }
      ),
    };
  }

  const isAdmin = Boolean(settings?.is_admin);

  if (isAdmin) {
    return { ok: true, supabase, user, isAdmin: true };
  }

  // Optional B2B roles table (allows future worker access without global admin).
  const { data: roleRow } = await supabase
    .from("b2b_user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = typeof roleRow?.role === "string" ? roleRow.role : "";
  const isInternal = role === "admin" || role === "worker";

  if (!isInternal) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, supabase, user, isAdmin: false };
};

