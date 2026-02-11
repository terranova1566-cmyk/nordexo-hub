import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";

export const runtime = "nodejs";

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const };
};

const zipWithPython = (zipPath: string, relativePaths: string[]) => {
  const script = [
    "import os, zipfile",
    `root = ${JSON.stringify(DRAFT_ROOT)}`,
    `zip_path = ${JSON.stringify(zipPath)}`,
    `paths = ${JSON.stringify(relativePaths)}`,
    "with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:",
    "  for rel in paths:",
    "    abs_path = os.path.join(root, rel)",
    "    if os.path.isdir(abs_path):",
    "      for dirpath, _, filenames in os.walk(abs_path):",
    "        for name in filenames:",
    "          full = os.path.join(dirpath, name)",
    "          zf.write(full, os.path.relpath(full, root))",
    "    else:",
    "      zf.write(abs_path, rel)",
  ].join("\n");
  const res = spawnSync("python", ["-c", script], { stdio: "ignore" });
  return res.status === 0;
};

const toSafeZipStem = (value: string) =>
  String(value || "")
    .replace(/[^\x20-\x7E]+/g, "_")
    .replace(/["\\/]/g, "_")
    .trim() || "drafts";

const buildZipName = (inputPaths: string[]) => {
  if (inputPaths.length !== 1) {
    return `drafts-${Date.now()}.zip`;
  }
  const normalized = String(inputPaths[0] || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  const base = toSafeZipStem(path.basename(normalized));
  return `${base}-${Date.now()}.zip`;
};

const resolveRelativePaths = (inputPaths: string[]) => {
  const absolutePaths = inputPaths
    .map((entry) => resolveDraftPath(String(entry)))
    .filter((entry): entry is string => Boolean(entry));

  if (absolutePaths.length === 0) {
    return [];
  }

  return Array.from(
    new Set(
      absolutePaths
        .filter((absolute) => absolute.startsWith(`${DRAFT_ROOT}${path.sep}`))
        .map((absolute) => toRelativePath(absolute))
    )
  );
};

const zipAndStream = (relativePaths: string[], zipName: string) => {
  const zipPath = path.join("/tmp", zipName);

  const zipResult = spawnSync(
    "zip",
    ["-r", zipPath, ...relativePaths],
    { cwd: DRAFT_ROOT }
  );

  if (zipResult.status !== 0) {
    const ok = zipWithPython(zipPath, relativePaths);
    if (!ok) {
      return NextResponse.json({ error: "Unable to zip files." }, { status: 500 });
    }
  }

  const stream = fs.createReadStream(zipPath);
  stream.on("close", () => {
    try {
      fs.unlinkSync(zipPath);
    } catch {}
  });

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
    },
  });
};

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { searchParams } = new URL(request.url);
  const inputPaths = searchParams
    .getAll("path")
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  if (inputPaths.length === 0) {
    return NextResponse.json({ error: "No files selected." }, { status: 400 });
  }

  const relativePaths = resolveRelativePaths(inputPaths);
  if (relativePaths.length === 0) {
    return NextResponse.json({ error: "No valid paths." }, { status: 400 });
  }

  const zipName = buildZipName(inputPaths);
  return zipAndStream(relativePaths, zipName);
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  let payload: { paths?: string[] };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const inputPaths = Array.isArray(payload?.paths) ? payload.paths : [];
  if (inputPaths.length === 0) {
    return NextResponse.json({ error: "No files selected." }, { status: 400 });
  }

  const relativePaths = resolveRelativePaths(inputPaths);
  if (relativePaths.length === 0) {
    return NextResponse.json({ error: "No valid paths." }, { status: 400 });
  }

  const zipName = buildZipName(inputPaths);
  return zipAndStream(relativePaths, zipName);
}
