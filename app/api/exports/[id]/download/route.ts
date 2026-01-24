import path from "path";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const EXPORT_BASE = path.join(process.cwd(), "exports");

export async function GET(
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
    .select("file_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!exportRow?.file_path) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const requestedPath = path.resolve(EXPORT_BASE, exportRow.file_path);
  if (!requestedPath.startsWith(`${EXPORT_BASE}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(requestedPath);
  } catch (readError) {
    const message =
      readError instanceof Error ? readError.message : "File not found.";
    return NextResponse.json({ error: message }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${path.basename(
        exportRow.file_path
      )}"`,
    },
  });
}
