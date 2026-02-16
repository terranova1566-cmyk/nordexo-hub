import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath } from "@/lib/drafts";

export const runtime = "nodejs";

const getAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) return null;

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const isSafeRunName = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes(".."))
    return false;
  return true;
};

const formatTimestamp = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
};

const listTopLevelDirs = (absoluteRunPath: string) => {
  if (!fs.existsSync(absoluteRunPath)) return [];
  const entries = fs.readdirSync(absoluteRunPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name && !name.startsWith("."));
};

const copyDirRecursive = (src: string, dest: string) => {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(from, to);
      continue;
    }
    if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
};

const ensureUniqueFilePath = (destDir: string, fileName: string) => {
  const ext = path.extname(fileName);
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  let candidate = fileName;
  let n = 2;
  while (fs.existsSync(path.join(destDir, candidate))) {
    candidate = `${base}-${n}${ext}`;
    n += 1;
  }
  return path.join(destDir, candidate);
};

const rewriteDraftFolderValue = (
  value: string,
  fromRun: string,
  toRun: string
) => {
  const raw = String(value || "");
  if (!raw) return raw;
  const normalized = raw.replace(/^\/+/, "");
  const marker = "images/draft_products/";
  const idx = normalized.indexOf(marker);
  if (idx >= 0) {
    const relative = normalized.slice(idx + marker.length);
    if (relative === fromRun) return normalized.replace(relative, toRun);
    if (relative.startsWith(`${fromRun}/`)) {
      return normalized.replace(
        `${marker}${fromRun}/`,
        `${marker}${toRun}/`
      );
    }
    return raw;
  }
  if (normalized === fromRun) return toRun;
  if (normalized.startsWith(`${fromRun}/`)) {
    return `${toRun}/${normalized.slice(fromRun.length + 1)}`;
  }
  return raw;
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

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  let payload: { runs?: string[] };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const runs = Array.isArray(payload?.runs)
    ? Array.from(
        new Set(payload.runs.map((value) => String(value ?? "").trim()).filter(Boolean))
      )
    : [];

  if (runs.length < 2) {
    return NextResponse.json(
      { error: "Select at least two batches to merge." },
      { status: 400 }
    );
  }

  for (const run of runs) {
    if (!isSafeRunName(run)) {
      return NextResponse.json({ error: `Invalid folder: ${run}` }, { status: 400 });
    }
    const abs = resolveDraftPath(run);
    if (!abs || !abs.startsWith(`${DRAFT_ROOT}${path.sep}`)) {
      return NextResponse.json({ error: `Invalid folder: ${run}` }, { status: 400 });
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      return NextResponse.json({ error: `Folder not found: ${run}` }, { status: 404 });
    }
  }

  const spuFoldersByRun = new Map<string, string[]>();
  const allSpus = new Set<string>();
  const collisions: string[] = [];

  for (const run of runs) {
    const abs = resolveDraftPath(run)!;
    const topDirs = listTopLevelDirs(abs);
    const spus = topDirs.filter((name) => name.toLowerCase() !== "_chunks");
    spuFoldersByRun.set(run, spus);
    for (const spu of spus) {
      const key = spu.toLowerCase();
      if (allSpus.has(key)) collisions.push(spu);
      allSpus.add(key);
    }
  }

  if (collisions.length > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot merge batches that contain the same SPU folder name in multiple batches.",
        collisions: Array.from(new Set(collisions)).sort(),
      },
      { status: 409 }
    );
  }

  const totalSpus = Array.from(allSpus).length;
  const mergedRunName = `Draft Products-${totalSpus}-SPU-merged-${formatTimestamp(
    new Date()
  )}`;

  const mergedAbs = resolveDraftPath(mergedRunName);
  if (!mergedAbs) {
    return NextResponse.json({ error: "Invalid merged folder name." }, { status: 500 });
  }
  if (fs.existsSync(mergedAbs)) {
    return NextResponse.json(
      { error: "Merged folder already exists. Try again." },
      { status: 409 }
    );
  }

  fs.mkdirSync(mergedAbs, { recursive: true });

  // Copy content into the merged run folder.
  // SPU folders must not collide (validated above). _chunks is merged with conflict-safe file names.
  try {
    const chunksDest = path.join(mergedAbs, "_chunks");
    fs.mkdirSync(chunksDest, { recursive: true });

    for (const run of runs) {
      const runAbs = resolveDraftPath(run)!;
      const entries = fs.readdirSync(runAbs, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const src = path.join(runAbs, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.toLowerCase() === "_chunks") {
            const runChunks = src;
            if (!fs.existsSync(runChunks)) continue;
            const chunkEntries = fs.readdirSync(runChunks, { withFileTypes: true });
            for (const chunkEntry of chunkEntries) {
              if (chunkEntry.name.startsWith(".")) continue;
              const from = path.join(runChunks, chunkEntry.name);
              if (chunkEntry.isDirectory()) {
                const subDest = path.join(chunksDest, `${run}-${chunkEntry.name}`);
                copyDirRecursive(from, subDest);
                continue;
              }
              if (chunkEntry.isFile()) {
                const targetPath = ensureUniqueFilePath(
                  chunksDest,
                  `${run}-${chunkEntry.name}`
                );
                fs.copyFileSync(from, targetPath);
              }
            }
            continue;
          }

          const dest = path.join(mergedAbs, entry.name);
          if (fs.existsSync(dest)) {
            throw new Error(`Destination already exists: ${entry.name}`);
          }
          copyDirRecursive(src, dest);
          continue;
        }

        if (entry.isFile()) {
          const targetPath = ensureUniqueFilePath(mergedAbs, `${run}-${entry.name}`);
          fs.copyFileSync(src, targetPath);
        }
      }
    }
  } catch (err) {
    // Roll back merged folder on copy failure to avoid partial merges.
    try {
      fs.rmSync(mergedAbs, { recursive: true, force: true });
    } catch {
      // ignore
    }
    return NextResponse.json(
      { error: (err as Error).message || "Failed to merge folders." },
      { status: 500 }
    );
  }

  // Update draft_products folder pointers so publish/push uses the merged folder.
  let updatedRows = 0;
  for (const run of runs) {
    const prefix = `images/draft_products/${run}/`;
    const altPrefix = `${run}/`;
    const escapedPrefix = prefix.replace(/[%_]/g, "\\$&");
    const escapedAlt = altPrefix.replace(/[%_]/g, "\\$&");
    const folderFilter = `draft_image_folder.like.${escapedPrefix}%,draft_image_folder.like.${escapedAlt}%`;

    const { data: rows, error } = await adminClient
      .from("draft_products")
      .select("id,draft_image_folder")
      .or(folderFilter);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items =
      (rows ?? []) as { id: string; draft_image_folder: string | null }[];

    const updates = items
      .map((row) => {
        const current = row.draft_image_folder ?? "";
        const next = rewriteDraftFolderValue(current, run, mergedRunName);
        if (!row.id || !current || next === current) return null;
        return { id: row.id, draft_image_folder: next };
      })
      .filter(Boolean) as { id: string; draft_image_folder: string }[];

    const chunkSize = 100;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      for (const update of chunk) {
        const { error: updateError } = await adminClient
          .from("draft_products")
          .update({ draft_image_folder: update.draft_image_folder })
          .eq("id", update.id);
        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
        updatedRows += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    merged_run: mergedRunName,
    total_spus: totalSpus,
    total_sbus: totalSpus,
    updated_rows: updatedRows,
  });
}
