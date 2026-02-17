import path from "node:path";
import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import {
  PUBLIC_FILE_RETENTION_DAYS,
  PUBLIC_FILES_ROOT,
  PUBLIC_LINK_EXPIRY_DAYS,
  buildPublicUrl,
  ensureInsideRoot,
  randomToken,
  sanitizeFilename,
} from "@/lib/public-files";

export const runtime = "nodejs";

const LOCAL_EXPORT_ROOT = "/srv/nordexo-hub/exports";

function contentTypeForExtension(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".csv") return "text/csv; charset=utf-8";
  if (ext === ".xlsx")
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".xls") return "application/vnd.ms-excel";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".zip") return "application/zip";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function resolveSourcePath(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error("sourcePath is required.");
  const absolute = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(LOCAL_EXPORT_ROOT, raw);
  const allowedRoots = [path.resolve(LOCAL_EXPORT_ROOT), path.resolve(PUBLIC_FILES_ROOT)];
  const isAllowed = allowedRoots.some(
    (root) => absolute === root || absolute.startsWith(`${root}${path.sep}`)
  );
  if (!isAllowed) {
    throw new Error("sourcePath must be inside /srv/nordexo-hub/exports or public files root.");
  }
  return absolute;
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const sourcePathRaw = String(payload.sourcePath ?? "");

  let sourceAbsolute = "";
  try {
    sourceAbsolute = resolveSourcePath(sourcePathRaw);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  try {
    const stat = await fs.stat(sourceAbsolute);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "sourcePath is not a file." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Source file not found." }, { status: 404 });
  }

  const preferredName = String(payload.fileName ?? "").trim();
  const originalName = sanitizeFilename(preferredName || path.basename(sourceAbsolute));

  const now = new Date();
  const expiresAt = new Date(now.getTime() + PUBLIC_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const retainUntil = new Date(now.getTime() + PUBLIC_FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const token = randomToken(48);
  const destinationDir = path.join(PUBLIC_FILES_ROOT, "partner-updates", yyyy, mm, dd);
  const destinationPath = path.join(destinationDir, `${token}-${originalName}`);

  if (!ensureInsideRoot(destinationPath)) {
    return NextResponse.json({ error: "Invalid destination path." }, { status: 400 });
  }

  await fs.mkdir(destinationDir, { recursive: true });
  await fs.copyFile(sourceAbsolute, destinationPath);

  const relativePath = path.relative(PUBLIC_FILES_ROOT, destinationPath);
  const contentType = contentTypeForExtension(originalName);

  const { error } = await auth.supabase.from("partner_public_file_links").insert({
    token,
    file_path: relativePath,
    original_name: originalName,
    content_type: contentType,
    expires_at: expiresAt.toISOString(),
    retain_until: retainUntil.toISOString(),
    created_by: auth.userId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    token,
    url: buildPublicUrl(token),
    expiresAt: expiresAt.toISOString(),
    retainUntil: retainUntil.toISOString(),
    filePath: relativePath,
  });
}
