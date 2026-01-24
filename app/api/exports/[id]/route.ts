import path from "path";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const EXPORT_BASE = path.join(process.cwd(), "exports");

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: exportRow, error } = await supabase
    .from("partner_exports")
    .select("id, file_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!exportRow) {
    return NextResponse.json({ error: "Export not found." }, { status: 404 });
  }

  let fileDeleteError: string | null = null;
  if (exportRow.file_path) {
    const resolvedPath = path.isAbsolute(exportRow.file_path)
      ? path.normalize(exportRow.file_path)
      : path.resolve(EXPORT_BASE, exportRow.file_path);
    if (!resolvedPath.startsWith(`${EXPORT_BASE}${path.sep}`)) {
      fileDeleteError = "Invalid file path.";
    } else {
      try {
        await fs.unlink(resolvedPath);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") {
          fileDeleteError =
            unlinkError instanceof Error
              ? unlinkError.message
              : "Unable to delete file.";
        }
      }
    }
  }

  const { error: deleteError } = await supabase
    .from("partner_exports")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    fileDeleted: !fileDeleteError,
    fileError: fileDeleteError,
  });
}
