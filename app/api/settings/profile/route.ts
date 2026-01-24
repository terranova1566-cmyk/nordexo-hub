import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const isLocale = (value: unknown): value is "en" | "sv" | "zh-Hans" =>
  value === "en" || value === "sv" || value === "zh-Hans";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("partner_user_settings")
    .select(
      "full_name, company_name, job_title, avatar_url, preferred_locale, is_admin"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    email: user.email ?? null,
    full_name: profile?.full_name ?? "",
    company_name: profile?.company_name ?? "",
    job_title: profile?.job_title ?? "",
    avatar_url: profile?.avatar_url ?? "",
    preferred_locale: profile?.preferred_locale ?? null,
    is_admin: Boolean(profile?.is_admin),
  });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: {
    full_name?: unknown;
    company_name?: unknown;
    job_title?: unknown;
    avatar_url?: unknown;
    preferred_locale?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const updates: Record<string, string | null> = {
    user_id: user.id,
  };

  if (typeof payload.full_name === "string") {
    updates.full_name = payload.full_name.trim() || null;
  }
  if (typeof payload.company_name === "string") {
    updates.company_name = payload.company_name.trim() || null;
  }
  if (typeof payload.job_title === "string") {
    updates.job_title = payload.job_title.trim() || null;
  }
  if (typeof payload.avatar_url === "string" || payload.avatar_url === null) {
    updates.avatar_url =
      typeof payload.avatar_url === "string" ? payload.avatar_url : null;
  }
  if (isLocale(payload.preferred_locale)) {
    updates.preferred_locale = payload.preferred_locale;
  }

  const { error } = await supabase
    .from("partner_user_settings")
    .upsert(updates, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
