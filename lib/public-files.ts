import crypto from "node:crypto";
import path from "node:path";

export const PUBLIC_FILES_ROOT =
  process.env.PARTNER_PUBLIC_FILES_ROOT ||
  "/srv/node-files/exports/public";

export const PUBLIC_FILES_BASE_URL =
  process.env.PARTNER_PUBLIC_FILES_BASE_URL || "https://hub.nordexo.se";

export const PUBLIC_LINK_EXPIRY_DAYS = Number(
  process.env.PARTNER_PUBLIC_LINK_EXPIRY_DAYS || "30"
);

export const PUBLIC_FILE_RETENTION_DAYS = Number(
  process.env.PARTNER_PUBLIC_FILE_RETENTION_DAYS || "90"
);

export function buildPublicUrl(token: string): string {
  const base = PUBLIC_FILES_BASE_URL.replace(/\/$/, "");
  return `${base}/api/public/files/${encodeURIComponent(token)}`;
}

export function randomToken(length = 48): string {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

export function sanitizeFilename(name: string): string {
  const normalized = name.trim().replace(/\s+/g, "-");
  const cleaned = normalized.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned || "file";
}

export function ensureInsideRoot(resolvedPath: string): boolean {
  const root = path.resolve(PUBLIC_FILES_ROOT);
  const absolute = path.resolve(resolvedPath);
  return absolute === root || absolute.startsWith(`${root}${path.sep}`);
}
