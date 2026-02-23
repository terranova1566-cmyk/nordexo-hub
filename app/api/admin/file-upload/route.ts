import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";

const DEFAULT_UPLOAD_DIR = path.join(process.cwd(), "tmp", "admin-upload-staging");
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

type UploadItem = {
  storedName: string;
  originalName: string;
  mimeType: string | null;
  size: number;
  uploadedAt: string;
};

const resolveUploadDir = () => {
  const configured = (process.env.ADMIN_UPLOAD_DIR || "").trim();
  if (!configured) return DEFAULT_UPLOAD_DIR;

  return path.isAbsolute(configured)
    ? configured
    : path.join(process.cwd(), configured);
};

const sanitizeFileName = (value: string) => {
  const parsed = path.parse(path.basename(value || "upload.bin"));
  const safeBase =
    parsed.name
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "upload";
  const safeExt = parsed.ext.replace(/[^a-zA-Z0-9.]+/g, "");
  return `${safeBase}${safeExt}`;
};

const toUploadItem = async (directory: string, storedName: string): Promise<UploadItem> => {
  const fullPath = path.join(directory, storedName);
  const stats = await fs.stat(fullPath);
  const originalNameMatch = storedName.match(/^\d+-[a-z0-9]+-(.+)$/i);

  return {
    storedName,
    originalName: originalNameMatch?.[1] || storedName,
    mimeType: null,
    size: stats.size,
    uploadedAt: stats.mtime.toISOString(),
  };
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const targetDirectory = resolveUploadDir();
  await fs.mkdir(targetDirectory, { recursive: true });

  const entries = await fs.readdir(targetDirectory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => toUploadItem(targetDirectory, entry.name))
  );

  files.sort(
    (left, right) =>
      new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime()
  );

  return NextResponse.json({
    targetDirectory,
    files: files.slice(0, 200),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const candidateEntries = [formData.get("file"), ...formData.getAll("files")];
  const files = candidateEntries.filter((entry): entry is File => entry instanceof File);

  if (!files.length) {
    return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
  }

  const targetDirectory = resolveUploadDir();
  await fs.mkdir(targetDirectory, { recursive: true });

  const uploaded: UploadItem[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `File too large: ${file.name}. Max size is ${Math.round(
            MAX_FILE_SIZE_BYTES / (1024 * 1024)
          )}MB.`,
        },
        { status: 400 }
      );
    }

    const safeOriginalName = sanitizeFileName(file.name || "upload.bin");
    const timestamp = Date.now();
    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
    const storedName = `${timestamp}-${uniqueSuffix}-${safeOriginalName}`;
    const destination = path.join(targetDirectory, storedName);
    const bytes = Buffer.from(await file.arrayBuffer());

    await fs.writeFile(destination, bytes);

    uploaded.push({
      storedName,
      originalName: file.name || safeOriginalName,
      mimeType: file.type || null,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    targetDirectory,
    uploadedCount: uploaded.length,
    files: uploaded,
  });
}
