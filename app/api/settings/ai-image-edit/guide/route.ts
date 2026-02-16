import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
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
      ok: false as const,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
      supabase,
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
    };
  }

  return { ok: true as const, supabase };
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const filePath = path.join(process.cwd(), "docs", "ai-prompts.md");
    const content = await fs.readFile(filePath, "utf8");
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to load guide." },
      { status: 500 }
    );
  }
}

