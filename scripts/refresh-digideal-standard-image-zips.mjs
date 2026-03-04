#!/usr/bin/env node

import path from "node:path";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const IMAGE_ROOT = "/srv/resources/media/images";
const CATALOG_ROOT =
  process.env.CATALOG_IMAGE_ROOT || "/srv/resources/media/images/catalog";
const PUBLIC_FILES_ROOT =
  process.env.PARTNER_PUBLIC_FILES_ROOT || "/srv/node-files/exports/public";

const asPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const PUBLIC_LINK_EXPIRY_DAYS = asPositiveInteger(
  process.env.PARTNER_PUBLIC_LINK_EXPIRY_DAYS || "30",
  30
);
const PUBLIC_FILE_RETENTION_DAYS = asPositiveInteger(
  process.env.PARTNER_PUBLIC_FILE_RETENTION_DAYS || "90",
  90
);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parsePayloadPath = () => {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--payload") {
      return String(args[i + 1] || "").trim();
    }
  }
  return "";
};

const ensureInsideRoot = (candidatePath) => {
  const root = path.resolve(PUBLIC_FILES_ROOT);
  const absolute = path.resolve(candidatePath);
  return absolute === root || absolute.startsWith(`${root}${path.sep}`);
};

const resolveImageFolder = (imageFolder, spu) => {
  if (typeof imageFolder === "string" && imageFolder.trim()) {
    const folder = imageFolder.trim();
    if (path.isAbsolute(folder)) return folder;
    return path.join(IMAGE_ROOT, folder);
  }
  const normalizedSpu = String(spu || "").trim();
  if (!normalizedSpu) return null;
  return path.join(CATALOG_ROOT, normalizedSpu);
};

const resolveStandardSourceDir = async (folderPath) => {
  if (!folderPath) return null;
  try {
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }

  const originalDir = path.join(folderPath, "original");
  try {
    const stat = await fs.stat(originalDir);
    if (stat.isDirectory()) return originalDir;
  } catch {
    // fall back to root folder
  }
  return folderPath;
};

const runZipRefresh = (jobs) => {
  if (!jobs.length) return;
  const script = [
    "import json, os, sys, zipfile",
    "jobs = json.load(sys.stdin)",
    "img_exts = {'.jpg', '.jpeg', '.png', '.webp'}",
    "for job in jobs:",
    "  source_dir = str(job.get('source_dir') or '')",
    "  zip_path = str(job.get('zip_path') or '')",
    "  if not source_dir or not zip_path:",
    "    continue",
    "  if not os.path.isdir(source_dir):",
    "    continue",
    "  os.makedirs(os.path.dirname(zip_path), exist_ok=True)",
    "  tmp_zip_path = f'{zip_path}.tmp'",
    "  with zipfile.ZipFile(tmp_zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:",
    "    for name in sorted(os.listdir(source_dir)):",
    "      full_path = os.path.join(source_dir, name)",
    "      if os.path.isdir(full_path):",
    "        continue",
    "      if name == 'media-manifest.json':",
    "        continue",
    "      ext = os.path.splitext(name)[1].lower()",
    "      if ext in img_exts:",
    "        zf.write(full_path, arcname=name)",
    "  os.replace(tmp_zip_path, zip_path)",
  ].join("\n");

  spawnSync("python", ["-c", script], {
    input: JSON.stringify(jobs),
    encoding: "utf8",
  });
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const main = async () => {
  const payloadPath = parsePayloadPath();
  if (!payloadPath) return;

  let rawPayload = "";
  try {
    rawPayload = await fs.readFile(payloadPath, "utf8");
  } catch {
    return;
  } finally {
    try {
      await fs.unlink(payloadPath);
    } catch {
      // ignore cleanup errors
    }
  }

  let payload = { entries: [] };
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return;
  }

  const entriesRaw = Array.isArray(payload?.entries) ? payload.entries : [];
  const uniqueEntries = [];
  const seenTokens = new Set();

  for (const row of entriesRaw) {
    const spu = String(row?.spu || "").trim().toUpperCase();
    const token = String(row?.token || "").trim();
    const relativePath = String(row?.relativePath || "").trim();
    if (!spu || !token || !relativePath || seenTokens.has(token)) continue;
    seenTokens.add(token);
    uniqueEntries.push({
      spu,
      token,
      relativePath,
      imageFolder:
        typeof row?.imageFolder === "string" && row.imageFolder.trim()
          ? row.imageFolder.trim()
          : null,
      originalName:
        typeof row?.originalName === "string" && row.originalName.trim()
          ? row.originalName.trim()
          : `${spu}-standard-images.zip`,
      createdBy:
        typeof row?.createdBy === "string" && UUID_REGEX.test(row.createdBy.trim())
          ? row.createdBy.trim()
          : null,
    });
  }

  if (!uniqueEntries.length) return;

  const zipJobs = [];
  for (const entry of uniqueEntries) {
    const imageFolder = resolveImageFolder(entry.imageFolder, entry.spu);
    const sourceDir = await resolveStandardSourceDir(imageFolder);
    if (!sourceDir) continue;
    const zipAbsolutePath = path.resolve(PUBLIC_FILES_ROOT, entry.relativePath);
    if (!ensureInsideRoot(zipAbsolutePath)) continue;
    await fs.mkdir(path.dirname(zipAbsolutePath), { recursive: true });
    zipJobs.push({
      source_dir: sourceDir,
      zip_path: zipAbsolutePath,
    });
  }

  runZipRefresh(zipJobs);

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + PUBLIC_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );
  const retainUntil = new Date(
    now.getTime() + PUBLIC_FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  const upsertRows = [];
  for (const entry of uniqueEntries) {
    const absolutePath = path.resolve(PUBLIC_FILES_ROOT, entry.relativePath);
    if (!ensureInsideRoot(absolutePath)) continue;
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }

    upsertRows.push({
      token: entry.token,
      file_path: entry.relativePath,
      original_name: entry.originalName,
      content_type: "application/zip",
      expires_at: expiresAt.toISOString(),
      retain_until: retainUntil.toISOString(),
      created_by: entry.createdBy,
      disabled: false,
    });
  }

  if (!upsertRows.length) return;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const chunk of chunkArray(upsertRows, 200)) {
    await admin
      .from("partner_public_file_links")
      .upsert(chunk, { onConflict: "token" });
  }
};

await main();
