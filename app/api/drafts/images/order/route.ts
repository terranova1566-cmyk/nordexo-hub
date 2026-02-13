import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath } from "@/lib/drafts";
import { writeDraftImageOrderSync } from "@/lib/draft-image-order";

export const runtime = "nodejs";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".tif",
  ".tiff",
]);

const isImageFile = (name: string) =>
  IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase());

const normalizePathValue = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}));
  const folderPath = normalizePathValue(body?.folderPath);
  const folderAbsolutePath = resolveDraftPath(folderPath);

  if (
    !folderPath ||
    !folderAbsolutePath ||
    (!folderAbsolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`) &&
      folderAbsolutePath !== DRAFT_ROOT)
  ) {
    return NextResponse.json({ error: "Invalid folder path." }, { status: 400 });
  }

  if (!fs.existsSync(folderAbsolutePath) || !fs.statSync(folderAbsolutePath).isDirectory()) {
    return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  }

  const providedPaths: unknown[] = Array.isArray(body?.orderedPaths)
    ? body.orderedPaths
    : [];
  const providedNames: string[] = [];
  const seenProvided = new Set<string>();
  providedPaths.forEach((value: unknown) => {
    const relativePath = normalizePathValue(value);
    if (!relativePath) return;
    const absolutePath = resolveDraftPath(relativePath);
    if (!absolutePath) return;
    if (!absolutePath.startsWith(`${folderAbsolutePath}${path.sep}`)) return;
    if (path.dirname(absolutePath) !== folderAbsolutePath) return;
    const name = path.basename(absolutePath);
    if (!isImageFile(name)) return;
    const key = name.toLowerCase();
    if (seenProvided.has(key)) return;
    seenProvided.add(key);
    providedNames.push(name);
  });

  const filesInFolder = fs.readdirSync(folderAbsolutePath, { withFileTypes: true });
  const availableImageNames = filesInFolder
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => entry.name);

  const availableByLower = new Map<string, string>();
  availableImageNames.forEach((name) => {
    availableByLower.set(name.toLowerCase(), name);
  });

  const requestedOrder = providedNames
    .map((name) => availableByLower.get(name.toLowerCase()) ?? null)
    .filter((name): name is string => Boolean(name));
  const requestedSet = new Set(requestedOrder.map((name) => name.toLowerCase()));
  const remaining = availableImageNames
    .filter((name) => !requestedSet.has(name.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  const nextOrder = [...requestedOrder, ...remaining];

  writeDraftImageOrderSync(folderAbsolutePath, nextOrder);

  return NextResponse.json({
    ok: true,
    count: nextOrder.length,
    order: nextOrder,
  });
}
