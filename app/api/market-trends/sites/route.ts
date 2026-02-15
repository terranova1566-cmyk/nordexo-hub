import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("market_trend_sites")
    .select("provider, name, base_url, enabled, updated_at")
    .eq("enabled", true)
    .order("provider", { ascending: true });

  if (error) {
    return NextResponse.json(
      { sites: [], error: "Unable to load sites.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ sites: data ?? [] });
}

