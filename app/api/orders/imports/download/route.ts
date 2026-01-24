import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { promises as fs } from "fs";
import path from "path";

const HISTORY_PATH = "/srv/incoming-scripts/uploads/orders-import-history.json";
const UPLOAD_ROOT = "/srv/incoming-scripts/uploads/orders-imports";

type ImportHistory = {
  id: string;
  file_name: string;
  stored_name: string;
  stored_path: string;
  row_count: number;
  created_at: string;
};

async function readHistory(): Promise<ImportHistory[]> {
  try {
    const raw = await fs.readFile(HISTORY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ImportHistory[]) : [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const history = await readHistory();
  const entry = history.find((item) => item.id === id);
  if (!entry) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const resolvedPath = path.resolve(entry.stored_path);
  const rootPath = path.resolve(UPLOAD_ROOT);
  if (!resolvedPath.startsWith(rootPath)) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  try {
    const buffer = await fs.readFile(resolvedPath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${entry.file_name || entry.stored_name}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
