import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { promises as fs } from "fs";

const HISTORY_PATH = "/srv/incoming-scripts/uploads/pricing-exports-history.json";

type ExportHistory = {
  id: string;
  file_name: string;
  stored_path: string;
  row_count: number;
  created_at: string;
};

async function readHistory(): Promise<ExportHistory[]> {
  try {
    const raw = await fs.readFile(HISTORY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExportHistory[]) : [];
  } catch {
    return [];
  }
}

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

  const history = await readHistory();
  history.sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
  );

  return NextResponse.json({ items: history });
}
