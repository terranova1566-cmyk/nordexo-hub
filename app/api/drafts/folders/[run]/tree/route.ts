import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";

export const runtime = "nodejs";

type FolderTreeNode = {
  name: string;
  path: string;
  modifiedAt: string;
  fileCount: number;
  children: FolderTreeNode[];
};

const buildTree = (absolutePath: string): FolderTreeNode => {
  const stat = fs.statSync(absolutePath);
  const entries = fs
    .readdirSync(absolutePath, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."));
  const children = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(absolutePath, entry.name))
    .filter((child) => child.startsWith(`${DRAFT_ROOT}${path.sep}`))
    .map((child) => buildTree(child))
    .sort((a, b) => a.name.localeCompare(b.name));
  const directFileCount = entries.filter((entry) => entry.isFile()).length;

  return {
    name: path.basename(absolutePath),
    path: toRelativePath(absolutePath),
    modifiedAt: stat.mtime.toISOString(),
    fileCount: directFileCount,
    children,
  };
};

export async function GET(
  request: Request,
  context: { params: Promise<{ run: string }> }
) {
  const { run } = await context.params;
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

  const url = new URL(request.url);
  const subPath = url.searchParams.get("path") ?? "";
  const relativePath = [run, subPath].filter(Boolean).join("/");
  const absolutePath = resolveDraftPath(relativePath);

  if (!absolutePath || !absolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  if (!fs.existsSync(absolutePath)) {
    return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isDirectory()) {
    return NextResponse.json({ error: "Not a folder." }, { status: 400 });
  }

  return NextResponse.json({
    root: buildTree(absolutePath),
  });
}
