import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEFAULT_LENS_SERVICE_URLS = [
  "http://127.0.0.1:3400",
  "http://localhost:3400",
  "http://127.0.0.1:3100",
  "http://localhost:3100",
];

const toServiceUrls = () => {
  const configuredRaw = String(
    process.env.GOOGLE_LENS_SERVICE_URL || process.env.GOOGLE_REVERSE_IMAGE_SERVICE_URL || ""
  ).trim();
  const configured = configuredRaw
    .split(",")
    .map((value) => String(value || "").trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const defaults = DEFAULT_LENS_SERVICE_URLS.map((value) =>
    value.replace(/\/+$/, "")
  );
  return Array.from(new Set([...configured, ...defaults]));
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
    };
  }

  if (!settings?.is_admin) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const };
};

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const requestUrl = new URL(request.url);
  const limitRaw = Number.parseInt(requestUrl.searchParams.get("limit") || "20", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 20;

  let selectedResponse: Response | null = null;
  let selectedParsed: unknown = null;
  const attemptErrors: string[] = [];

  for (const serviceBaseUrl of toServiceUrls()) {
    const historyUrl = `${serviceBaseUrl}/api/google-lens/history?limit=${limit}`;
    try {
      const response = await fetch(historyUrl, {
        method: "GET",
        cache: "no-store",
      });
      const rawText = await response.text();
      const parsed = safeJsonParse(rawText);
      if (response.status === 404) {
        attemptErrors.push(`${historyUrl}: endpoint not found (HTTP 404)`);
        continue;
      }
      selectedResponse = response;
      selectedParsed = parsed;
      break;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "request failed";
      attemptErrors.push(`${historyUrl}: ${message}`);
    }
  }

  if (!selectedResponse) {
    return NextResponse.json(
      {
        error:
          "Google Lens history service is unavailable. The local Lens service is not reachable.",
        details: attemptErrors.slice(0, 8),
      },
      { status: 502 }
    );
  }

  if (!selectedResponse.ok) {
    const error =
      selectedParsed && typeof selectedParsed === "object" && "error" in selectedParsed
        ? String((selectedParsed as { error?: unknown }).error || "")
        : "Google Lens history lookup failed.";
    return NextResponse.json(
      { error: error || "Google Lens history lookup failed.", details: selectedParsed },
      { status: selectedResponse.status }
    );
  }

  if (selectedParsed && typeof selectedParsed === "object") {
    return NextResponse.json(selectedParsed);
  }

  return NextResponse.json({ items: [] });
}
