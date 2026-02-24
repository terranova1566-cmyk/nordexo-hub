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

const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const formatErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const writeImageOrderWithRetry = async (
  folderAbsolutePath: string,
  nextOrder: string[]
) => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (!fs.existsSync(folderAbsolutePath) || !fs.statSync(folderAbsolutePath).isDirectory()) {
        throw new Error("Folder not found.");
      }
      writeDraftImageOrderSync(folderAbsolutePath, nextOrder);
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= 2) break;
      await wait(120 * (attempt + 1));
    }
  }
  throw lastError ?? new Error("Unable to save image order.");
};

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

  try {
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
      if (name.startsWith(".")) return;
      if (!isImageFile(name)) return;
      const key = name.toLowerCase();
      if (seenProvided.has(key)) return;
      seenProvided.add(key);
      providedNames.push(name);
    });

    const filesInFolder = fs.readdirSync(folderAbsolutePath, { withFileTypes: true });
    const availableImageNames = filesInFolder
      .filter(
        (entry) =>
          entry.isFile() && !entry.name.startsWith(".") && isImageFile(entry.name)
      )
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

    await writeImageOrderWithRetry(folderAbsolutePath, nextOrder);

    return NextResponse.json({
      ok: true,
      count: nextOrder.length,
      order: nextOrder,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Unable to save image order: ${formatErrorMessage(
          error,
          "Unexpected filesystem error."
        )}`,
      },
      { status: 500 }
    );
  }
}
