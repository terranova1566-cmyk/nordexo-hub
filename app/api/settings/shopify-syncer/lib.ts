import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

export const SYNCER_API_BASE_URL = (
  process.env.SHOPIFY_SYNCER_BASE_URL ||
  process.env.SHOPIFY_SYNC_API_URL ||
  "http://127.0.0.1:3000"
).replace(/\/+$/, "");

export const SYNCER_EVENT_LOG_FILE =
  process.env.SHOPIFY_SYNC_EVENT_LOG_FILE ||
  process.env.SYNC_EVENT_LOG_FILE ||
  "/srv/logs/shopify-syncer-events.ndjson";

export type AdminAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function requireAdminSettingsUser(): Promise<AdminAuthResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, userId: user.id };
}

export const EVENT_LEVELS = ["info", "warn", "error", "critical"] as const;
export type EventLevel = (typeof EVENT_LEVELS)[number];

export function normalizeEventLevel(input: string | null | undefined): EventLevel | null {
  const value = String(input || "").trim().toLowerCase();
  if (value === "info" || value === "warn" || value === "error" || value === "critical") {
    return value;
  }
  return null;
}

export function parsePositiveInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function parseDateCursor(input: string | null): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs = 2500
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error) {
    const err = error as Error;
    if (err?.name === "AbortError") {
      return { ok: false, error: "Timeout" };
    }
    return { ok: false, error: err?.message || "Request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

export function isMissingTableError(message: string): boolean {
  const text = String(message || "");
  return (
    /Could not find the table/i.test(text) ||
    /relation .* does not exist/i.test(text) ||
    /schema cache/i.test(text)
  );
}
