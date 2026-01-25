import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

const HISTORY_PATH = "/srv/incoming-scripts/uploads/pricing-exports-history.json";

type ExportHistory = {
  id: string;
  file_name: string;
  stored_path: string;
  row_count: number;
  created_at: string;
};

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, user };
};

const readHistory = async (): Promise<ExportHistory[]> => {
  try {
    const raw = await fs.readFile(HISTORY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExportHistory[]) : [];
  } catch {
    return [];
  }
};

const writeHistory = async (entries: ExportHistory[]) => {
  await fs.mkdir(path.dirname(HISTORY_PATH), { recursive: true });
  await fs.writeFile(HISTORY_PATH, JSON.stringify(entries, null, 2));
};

export async function DELETE(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing export id." }, { status: 400 });
  }

  const history = await readHistory();
  const entry = history.find((item) => item.id === id);
  if (!entry) {
    return NextResponse.json({ error: "Export not found." }, { status: 404 });
  }

  if (entry.stored_path) {
    try {
      await fs.unlink(entry.stored_path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return NextResponse.json(
          { error: "Failed to remove export file." },
          { status: 500 }
        );
      }
    }
  }

  const next = history.filter((item) => item.id !== id);
  await writeHistory(next);

  return NextResponse.json({ ok: true });
}
